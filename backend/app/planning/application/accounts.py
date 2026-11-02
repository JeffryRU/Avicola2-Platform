"""Casos de uso de cuentas: login, sesión, cambio de contraseña y administración (supervisor)."""

import logging
from dataclasses import dataclass, replace

from app.planning.application.ports import (
    Clock,
    PasswordHasher,
    SellerRepository,
    TemporaryPasswords,
    TokenService,
)
from app.planning.domain.accounts import LockoutPolicy, check_new_password, check_username
from app.planning.domain.models import ROLES, SELLER, Seller, SellerAccount
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
    if not actor.seller.is_supervisor:
        raise ForbiddenError("Solo un supervisor puede hacer esto.")


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
                replace(account, failed_logins=failed, locked_until=locked_until)
            )
            if locked_until:
                logger.warning("Cuenta %s bloqueada por intentos fallidos", username)
                raise AuthenticationError(self._locked_message())
            logger.warning("Login rechazado para %r (contraseña incorrecta)", username)
            raise AuthenticationError(INVALID_CREDENTIALS)

        if account.failed_logins or account.locked_until:
            account = replace(account, failed_logins=0, locked_until=None)
            self.sellers.save_security(account)
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
        self.sellers.save_security(updated)
        logger.info("%s cambió su contraseña", account.seller.username)
        return Session(self.tokens.issue(account.seller.username, updated.token_version), updated)


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
        username, name = username.strip().lower(), name.strip()
        check_username(username)
        if not name:
            raise DomainError("Ingresa el nombre.")
        if role not in ROLES:
            raise DomainError(f"Rol inválido: {role}.")
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
    def __init__(self, sellers: SellerRepository):
        self.sellers = sellers

    def _target(self, actor: SellerAccount, username: str) -> SellerAccount:
        require_supervisor(actor)
        if username == actor.seller.username:
            raise DomainError("No puedes hacer esto con tu propia cuenta; usa Cambiar contraseña.")
        target = self.sellers.get_account(username, active_only=False)
        if target is None:
            raise NotFoundError(f"El usuario {username} no existe.")
        return target


class ResetPassword(_ManageAccount):
    """Recuperación de contraseña: el supervisor entrega una temporal y desbloquea la cuenta."""

    def __init__(
        self, sellers: SellerRepository, hasher: PasswordHasher, passwords: TemporaryPasswords
    ):
        super().__init__(sellers)
        self.hasher, self.passwords = hasher, passwords

    def __call__(self, actor: SellerAccount, username: str) -> NewCredentials:
        target = self._target(actor, username)
        temporary = self.passwords.generate()
        updated = replace(
            target,
            password_hash=self.hasher.hash(temporary),
            must_change_password=True,
            failed_logins=0,
            locked_until=None,
            token_version=target.token_version + 1,
        )
        self.sellers.save_security(updated)
        logger.info("%s restableció la contraseña de %s", actor.seller.username, username)
        return NewCredentials(updated, temporary)


class SetAccountActive(_ManageAccount):
    def __call__(self, actor: SellerAccount, username: str, active: bool) -> SellerAccount:
        target = self._target(actor, username)
        updated = replace(
            target,
            is_active=active,
            token_version=target.token_version + (0 if active else 1),
        )
        self.sellers.save_security(updated)
        logger.info(
            "%s %s la cuenta %s",
            actor.seller.username,
            "activó" if active else "desactivó",
            username,
        )
        return updated
