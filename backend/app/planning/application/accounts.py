"""Casos de uso de cuentas: login, sesión, cambio de contraseña y administración (supervisor)."""

import logging
from dataclasses import dataclass, replace

from app.planning.application.ports import (
    Clock,
    EventPublisher,
    NotificationRepository,
    PasswordHasher,
    SellerRepository,
    TemporaryPasswords,
    TokenService,
)
from app.planning.domain.accounts import (
    AccountChange,
    ChangeOutcome,
    LockoutPolicy,
    check_new_password,
    check_username,
    clean_name,
)
from app.planning.domain.models import SELLER, Seller, SellerAccount
from app.planning.domain.notifications import SESSION_REVOKED, Audience, Event
from app.planning.domain.permissions import (
    GUARDIAN_ROLE,
    ROLE_LABELS,
    ROLES,
    Permission,
    assignable_roles,
    can_manage,
    require,
)
from app.shared.domain.errors import (
    AuthenticationError,
    ConflictError,
    DomainError,
    ForbiddenError,
    NotFoundError,
)

logger = logging.getLogger(__name__)

INVALID_CREDENTIALS = "Usuario o contraseña incorrectos."
INVALID_SESSION = "Sesión inválida o vencida."


@dataclass(frozen=True)
class Session:
    token: str
    account: SellerAccount


@dataclass(frozen=True)
class NewCredentials:
    """Contraseña temporal: se muestra una sola vez al supervisor y no se guarda en claro."""

    account: SellerAccount
    temporary_password: str


def require_supervisor(actor: SellerAccount) -> None:
    require(actor.seller.role, Permission.MANAGE_ACCOUNTS, "Solo un supervisor puede hacer esto.")


def _check_role(role: str) -> None:
    if role not in ROLES:
        raise DomainError(f"Rol inválido: {role}.")


def _forbidden_role(role: str) -> ForbiddenError:
    # .get: un rol que no está en la tabla (dato antiguo, SQL manual) no debe dar un 500.
    return ForbiddenError(f"No puedes gestionar cuentas de {ROLE_LABELS.get(role, role)}.")


class Authenticate:
    def __init__(
        self,
        sellers: SellerRepository,
        hasher: PasswordHasher,
        tokens: TokenService,
        clock: Clock,
        policy: LockoutPolicy,
    ):
        self.sellers, self.hasher, self.tokens = sellers, hasher, tokens
        self.clock, self.policy = clock, policy

    def __call__(self, username: str, password: str) -> Session:
        username = username.strip().lower()
        account = self.sellers.get_account(username)
        if account is None:
            # Mismo costo que una cuenta real: el tiempo no revela qué usuarios existen.
            self.hasher.verify(password, self.hasher.dummy_hash)
            logger.warning("Login rechazado para %r (no existe o está inactivo)", username)
            raise AuthenticationError(INVALID_CREDENTIALS)

        now = self.clock.now()
        valid = self.hasher.verify(password, account.password_hash)
        if account.is_locked(now):
            logger.warning("Login de %s rechazado: cuenta bloqueada", username)
            raise AuthenticationError(self._locked_message())
        if not valid:
            failed, locked_until = self.policy.after_failure(account.failed_logins, now)
            self.sellers.save_security(
                replace(account, failed_logins=failed, locked_until=locked_until),
                expected_version=account.token_version,
            )
            if locked_until:
                logger.warning("Cuenta %s bloqueada por intentos fallidos", username)
                raise AuthenticationError(self._locked_message())
            logger.warning("Login rechazado para %r (contraseña incorrecta)", username)
            raise AuthenticationError(INVALID_CREDENTIALS)

        if account.failed_logins or account.locked_until:
            account = replace(account, failed_logins=0, locked_until=None)
            if not self.sellers.save_security(account, expected_version=account.token_version):
                raise AuthenticationError(INVALID_CREDENTIALS)  # la cambiaron justo ahora
        logger.info("Login de %s", username)
        return Session(self.tokens.issue(username, account.token_version), account)

    def _locked_message(self) -> str:
        return (
            "Cuenta bloqueada por varios intentos fallidos. Intenta de nuevo en "
            f"{self.policy.lock_minutes} minutos o pide a tu supervisor que la desbloquee."
        )


class CurrentAccount:
    """Resuelve la cuenta dueña de un token; un token de una versión anterior ya no vale."""

    def __init__(self, sellers: SellerRepository, tokens: TokenService):
        self.sellers, self.tokens = sellers, tokens

    def __call__(self, token: str | None) -> SellerAccount:
        claims = self.tokens.decode(token) if token else None
        account = self.sellers.get_account(claims.username) if claims else None
        if account is None or claims is None or claims.version != account.token_version:
            raise AuthenticationError(INVALID_SESSION)
        return account


class ChangePassword:
    def __init__(self, sellers: SellerRepository, hasher: PasswordHasher, tokens: TokenService):
        self.sellers, self.hasher, self.tokens = sellers, hasher, tokens

    def __call__(self, account: SellerAccount, current: str, new: str) -> Session:
        if not self.hasher.verify(current, account.password_hash):
            raise DomainError("La contraseña actual no es correcta.")
        if current == new:
            raise DomainError("La nueva contraseña debe ser distinta de la actual.")
        check_new_password(new, account.seller.username)
        # Nueva versión: las demás sesiones abiertas de esta cuenta se cierran.
        updated = replace(
            account,
            password_hash=self.hasher.hash(new),
            must_change_password=False,
            token_version=account.token_version + 1,
        )
        # Si mientras tanto la restablecieron o la desactivaron, no se pisa ese cambio.
        if not self.sellers.save_security(updated, expected_version=account.token_version):
            raise AuthenticationError(INVALID_SESSION)
        logger.info("%s cambió su contraseña", account.seller.username)
        return Session(self.tokens.issue(account.seller.username, updated.token_version), updated)


class UpdateProfile:
    """Cada persona edita su propio nombre. La zona la asigna el supervisor."""

    def __init__(self, sellers: SellerRepository):
        self.sellers = sellers

    def __call__(self, account: SellerAccount, name: str) -> SellerAccount:
        seller = replace(account.seller, name=clean_name(name))
        self.sellers.save_profile(seller)
        logger.info("%s actualizó su perfil", seller.username)
        return replace(account, seller=seller)


class ListAccounts:
    def __init__(self, sellers: SellerRepository):
        self.sellers = sellers

    def __call__(self, actor: SellerAccount) -> list[SellerAccount]:
        require_supervisor(actor)
        return self.sellers.list_accounts()


class CreateAccount:
    def __init__(
        self, sellers: SellerRepository, hasher: PasswordHasher, passwords: TemporaryPasswords
    ):
        self.sellers, self.hasher, self.passwords = sellers, hasher, passwords

    def __call__(
        self, actor: SellerAccount, username: str, name: str, zone: str | None, role: str = SELLER
    ) -> NewCredentials:
        require_supervisor(actor)
        _check_role(role)
        if not can_manage(actor.seller.role, role):
            raise _forbidden_role(role)
        username, name = username.strip().lower(), clean_name(name)
        check_username(username)
        if self.sellers.get_account(username, active_only=False):
            raise ConflictError(f"El usuario {username} ya existe.")
        temporary = self.passwords.generate()
        account = SellerAccount(
            Seller(username, name, (zone or "").strip() or None, role),
            self.hasher.hash(temporary),
            must_change_password=True,
        )
        self.sellers.create(account)
        logger.info("%s creó la cuenta %s (%s)", actor.seller.username, username, role)
        return NewCredentials(account, temporary)


class _ManageAccount:
    """Base de las acciones sobre otra cuenta (restablecer, activar, cambiar de rol).

    Decide con lo que lee y luego aplica el cambio con `SellerRepository.apply`, que vuelve a
    comprobar actor y cuenta destino en la misma transacción: si algo cambió entre medio (la
    ascendieron, degradaron al actor...), no se escribe nada.
    """

    def __init__(self, sellers: SellerRepository, events: EventPublisher):
        self.sellers, self.events = sellers, events

    def _revoke_sessions(self, username: str, reason: str) -> None:
        """Los navegadores abiertos de esa cuenta cierran la sesión al instante."""
        self.events.publish(Event(SESSION_REVOKED, Audience.users(username), {"reason": reason}))

    def _target(self, actor: SellerAccount, username: str) -> SellerAccount:
        require_supervisor(actor)
        target = self.sellers.get_account(username, active_only=False)
        if target is None:
            raise NotFoundError(f"El usuario {username} no existe.")
        # Con el usuario guardado, no con el de la ruta: en una base que no distingue
        # mayúsculas, "GENERAL" encuentra a "general" y no debe colarse como otra cuenta.
        if target.seller.username == actor.seller.username:
            raise DomainError("No puedes hacer esto con tu propia cuenta; usa Cambiar contraseña.")
        if not can_manage(actor.seller.role, target.seller.role):
            raise _forbidden_role(target.seller.role)
        return target

    def _apply(self, actor: SellerAccount, target: SellerAccount, **changes) -> SellerAccount:
        outcome = self.sellers.apply(
            AccountChange(
                target=target.seller.username,
                target_roles=frozenset({target.seller.role}),
                actor=actor.seller.username,
                actor_role=actor.seller.role,
                actor_version=actor.token_version,
                **changes,
            )
        )
        if outcome is ChangeOutcome.ACTOR_CHANGED:
            raise AuthenticationError(INVALID_SESSION)  # te cambiaron el rol o la sesión
        if outcome is ChangeOutcome.NOT_FOUND:
            raise NotFoundError(f"El usuario {target.seller.username} no existe.")
        if outcome is ChangeOutcome.TARGET_CHANGED:
            raise ConflictError("La cuenta cambió mientras tanto. Recarga e inténtalo de nuevo.")
        if outcome is ChangeOutcome.LAST_GUARDIAN:
            raise ConflictError(f"Debe quedar al menos un {ROLE_LABELS[GUARDIAN_ROLE]} activo.")
        updated = self.sellers.get_account(target.seller.username, active_only=False)
        if updated is None:  # no debería pasar: se acaba de escribir
            raise NotFoundError(f"El usuario {target.seller.username} no existe.")
        return updated


class ResetPassword(_ManageAccount):
    """Recuperación de contraseña: el supervisor entrega una temporal y desbloquea la cuenta."""

    def __init__(
        self,
        sellers: SellerRepository,
        hasher: PasswordHasher,
        passwords: TemporaryPasswords,
        events: EventPublisher,
    ):
        super().__init__(sellers, events)
        self.hasher, self.passwords = hasher, passwords

    def __call__(self, actor: SellerAccount, username: str) -> NewCredentials:
        target = self._target(actor, username)
        temporary = self.passwords.generate()
        updated = self._apply(
            actor, target, password_hash=self.hasher.hash(temporary), revoke_sessions=True
        )
        name = updated.seller.username
        self._revoke_sessions(name, "Tu supervisor restableció tu contraseña.")
        logger.info("%s restableció la contraseña de %s", actor.seller.username, name)
        return NewCredentials(updated, temporary)


class SetAccountActive(_ManageAccount):
    def __call__(self, actor: SellerAccount, username: str, active: bool) -> SellerAccount:
        target = self._target(actor, username)
        updated = self._apply(actor, target, active=active, revoke_sessions=not active)
        name = updated.seller.username
        if not active:
            self._revoke_sessions(name, "Tu cuenta fue desactivada.")
        logger.info(
            "%s %s la cuenta %s", actor.seller.username, "activó" if active else "desactivó", name
        )
        return updated


class ChangeRole(_ManageAccount):
    """Solo quien tiene CHANGE_ROLES (el supervisor general) y dentro de MANAGEABLE_ROLES.

    Cierra las sesiones de la cuenta (sus permisos cambian y debe volver a entrar) y borra sus
    avisos: eran de su rol anterior (un ex supervisor no debe seguir viendo los del equipo).
    """

    def __init__(
        self,
        sellers: SellerRepository,
        events: EventPublisher,
        notifications: NotificationRepository,
    ):
        super().__init__(sellers, events)
        self.notifications = notifications

    def __call__(self, actor: SellerAccount, username: str, role: str) -> SellerAccount:
        require(
            actor.seller.role,
            Permission.CHANGE_ROLES,
            "Solo el supervisor general puede cambiar roles.",
        )
        _check_role(role)
        target = self._target(actor, username)
        if role not in assignable_roles(actor.seller.role, target.seller.role):
            raise _forbidden_role(role)
        if role == target.seller.role:
            return target
        updated = self._apply(actor, target, role=role, revoke_sessions=True)
        name = updated.seller.username
        self.notifications.delete_for(name)
        self._revoke_sessions(name, "Tu rol cambió. Vuelve a iniciar sesión.")
        logger.info(
            "%s cambió el rol de %s: %s → %s",
            actor.seller.username,
            name,
            target.seller.role,
            role,
        )
        return updated
