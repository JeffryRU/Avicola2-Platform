"""Roles y permisos: la única fuente de quién puede hacer qué.

Los casos de uso preguntan por un permiso (`Seller.can`), nunca por el nombre del rol. Así, un
rol nuevo se agrega aquí (en `ROLE_PERMISSIONS` y `MANAGEABLE_ROLES`) sin tocar el resto.
La API envía al frontend y a la app móvil los permisos ya resueltos, para que no repitan reglas.
"""

from enum import StrEnum

from app.shared.domain.errors import ForbiddenError

# Roles: varchar validado por la app, no ENUM.
SELLER, SUPERVISOR, GENERAL_SUPERVISOR = "seller", "supervisor", "general_supervisor"
# Jefe de despacho: registra el stock que queda en despacho; no proyecta ni ve al equipo.
DISPATCH_CHIEF = "dispatch_chief"
ROLES = (SELLER, DISPATCH_CHIEF, SUPERVISOR, GENERAL_SUPERVISOR)

ROLE_LABELS = {
    SELLER: "vendedor",
    DISPATCH_CHIEF: "jefe de despacho",
    SUPERVISOR: "supervisor",
    GENERAL_SUPERVISOR: "supervisor general",
}


class Permission(StrEnum):
    # Ve los datos de todos los vendedores, registra por ellos y recibe los avisos del equipo.
    VIEW_TEAM = "view_team"
    # Hora de corte, habilitaciones y solicitudes de edición; edita sin pasar por el corte.
    MANAGE_EDITING = "manage_editing"
    # Pantalla Usuarios: crear, restablecer y activar las cuentas de MANAGEABLE_ROLES.
    MANAGE_ACCOUNTS = "manage_accounts"
    # Cambiar el rol de una cuenta existente (dentro de MANAGEABLE_ROLES).
    CHANGE_ROLES = "change_roles"
    # Ver el stock de despacho registrado por día.
    VIEW_STOCK = "view_stock"
    # Registrar o corregir el stock de despacho (unidades y kg por producto y día).
    MANAGE_STOCK = "manage_stock"
    # Ver el cálculo de saca: cuánto pedir a granja por día.
    VIEW_SACA = "view_saca"
    # Ver la producción diaria (lo pedido a granja y lo que llegó, por rango).
    VIEW_PRODUCTION = "view_production"
    # Registrar o corregir la producción diaria.
    MANAGE_PRODUCTION = "manage_production"


_SUPERVISION = frozenset(
    {
        Permission.VIEW_TEAM,
        Permission.MANAGE_EDITING,
        Permission.MANAGE_ACCOUNTS,
        Permission.VIEW_SACA,
        Permission.VIEW_PRODUCTION,
    }
)

ROLE_PERMISSIONS: dict[str, frozenset[Permission]] = {
    SELLER: frozenset(),
    DISPATCH_CHIEF: frozenset(
        {
            Permission.VIEW_STOCK,
            Permission.MANAGE_STOCK,
            Permission.VIEW_PRODUCTION,
            Permission.MANAGE_PRODUCTION,
        }
    ),
    # El supervisor consulta el stock (lo necesita para la saca) pero no lo registra.
    SUPERVISOR: _SUPERVISION | {Permission.VIEW_STOCK},
    # El supervisor general crea jefes de despacho, así que tiene también sus permisos
    # (nadie gestiona un rol con más permisos que el suyo).
    GENERAL_SUPERVISOR: _SUPERVISION
    | {
        Permission.CHANGE_ROLES,
        Permission.VIEW_STOCK,
        Permission.MANAGE_STOCK,
        Permission.MANAGE_PRODUCTION,
    },
}

# Cuentas que cada rol crea y gestiona: el supervisor, solo vendedores; el supervisor general,
# todas (también otros supervisores generales). Nadie se gestiona a sí mismo desde Usuarios.
MANAGEABLE_ROLES: dict[str, tuple[str, ...]] = {
    SELLER: (),
    DISPATCH_CHIEF: (),
    SUPERVISOR: (SELLER,),
    GENERAL_SUPERVISOR: ROLES,
}


def permissions_of(role: str) -> frozenset[Permission]:
    """Un rol desconocido no tiene permisos (nunca se abre por defecto)."""
    return ROLE_PERMISSIONS.get(role, frozenset())


def can(role: str, permission: Permission) -> bool:
    return permission in permissions_of(role)


def manageable_roles(role: str) -> tuple[str, ...]:
    """Roles de las cuentas que `role` puede crear y gestionar."""
    return MANAGEABLE_ROLES.get(role, ()) if can(role, Permission.MANAGE_ACCOUNTS) else ()


def can_manage(actor_role: str, target_role: str) -> bool:
    return target_role in manageable_roles(actor_role)


def assignable_roles(actor_role: str, target_role: str) -> tuple[str, ...]:
    """Roles a los que `actor_role` puede pasar una cuenta con `target_role` (vacío si no puede)."""
    if not can(actor_role, Permission.CHANGE_ROLES) or not can_manage(actor_role, target_role):
        return ()
    return manageable_roles(actor_role)


def roles_with(permission: Permission) -> tuple[str, ...]:
    """Roles que tienen un permiso (p. ej., a quién le llegan los avisos del equipo)."""
    return tuple(r for r in ROLES if can(r, permission))


def require(role: str, permission: Permission, message: str) -> None:
    if not can(role, permission):
        raise ForbiddenError(message)


# Siempre debe quedar al menos una cuenta ACTIVA con este rol: si no, nadie podría volver a
# gestionar supervisores ni cambiar roles desde la app.
GUARDIAN_ROLE = GENERAL_SUPERVISOR
