# ADR 0010 — Roles y permisos en una sola fuente, con supervisor general

- **Estado:** aceptado
- **Fecha:** 2026-11-08

## Contexto

- Había dos roles (`seller` y `supervisor`) y el código preguntaba en unos 15 sitios "¿es supervisor?". Agregar un rol implicaba tocar backend, web y app móvil.
- Todos los supervisores eran iguales: uno podía restablecer la contraseña de otro (y entrar con la temporal) o desactivarlo.
- No se podía cambiar el rol de una cuenta ya creada.
- El router `/api/admin` solo exigía una sesión activa; el permiso se comprobaba solo dentro de cada caso de uso.

## Decisión

### Fuente única: `backend/app/planning/domain/permissions.py`

- **Roles:** `seller`, `supervisor` y `general_supervisor` (varchar validado por la app, no ENUM; no hace falta migración).
- **Permisos:** `view_team`, `manage_editing`, `manage_accounts` y `change_roles`. `ROLE_PERMISSIONS` dice cuáles tiene cada rol.
- **`MANAGEABLE_ROLES`:** qué cuentas crea y gestiona cada rol.

| Rol | Permisos | Crea y gestiona |
|---|---|---|
| Vendedor | ninguno | nadie |
| Jefe de despacho | ver y registrar el stock de despacho | nadie |
| Supervisor | ver equipo, edición, cuentas, ver el stock | solo vendedores |
| Supervisor general | todos, también cambiar roles y registrar el stock | todas las cuentas (también otros supervisores generales) |

**Actualización (2026-11-11):** permiso `view_saca` (cálculo de saca) para supervisor y supervisor general.

**Actualización (2026-11-10):** se agregó el rol `dispatch_chief` (jefe de despacho) con los permisos `view_stock` y `manage_stock`. No proyecta, no ve al equipo y no aparece como vendedor. El supervisor general tiene `manage_stock` porque nadie gestiona un rol con más permisos que el suyo. En la web y en la app móvil, el jefe de despacho entra directo a **Stock de despacho**. La app móvil ya lee `permissions` de la sesión para decidir las pestañas (antes trataba como supervisor a todo rol que no fuera vendedor).

- Los casos de uso preguntan por un permiso (`seller.can(Permission.X)`), nunca por el nombre del rol. "¿Es vendedor del equipo?" se pregunta con `is_seller`.
- Un rol desconocido no tiene permisos: nunca se abre por defecto. Gestionar una cuenta con un rol desconocido da 403, no 500.
- Nadie se gestiona a sí mismo desde Usuarios (ni contraseña, ni estado, ni rol). La comparación usa el usuario guardado en la base, no el de la ruta: en Azure SQL o MySQL, que no distinguen mayúsculas, `GENERAL` encuentra a `general`.
- **Siempre queda al menos un supervisor general activo** (`GUARDIAN_ROLE`). Ni la app ni la consola pueden degradar ni desactivar al último.

### Dos barreras

1. **Router:** `requires(permission)` en `/api/admin` (`manage_accounts`) y en las rutas de edición (`manage_editing`). Un endpoint nuevo en esos grupos nace protegido.
2. **Caso de uso:** vuelve a comprobar el permiso y las reglas sobre la cuenta destino (`can_manage`, `assignable_roles`).

### Cambios atómicos (concurrencia)

- Restablecer, activar o desactivar y cambiar de rol pasan por `SellerRepository.apply(AccountChange)`.
- El caso de uso decide con lo que leyó. `apply` vuelve a comprobar todo en una sola transacción, con las filas bloqueadas (`SELECT … FOR UPDATE`, en orden fijo):
  - el actor sigue activo, con el mismo rol y la misma versión de sesión;
  - la cuenta destino sigue con el rol que se podía gestionar;
  - el cambio no deja cero supervisores generales activos.
- Solo escribe las columnas que cambian (nunca una "foto" vieja de la cuenta).
- Sin esto, la revisión adversarial demostró tres problemas:
  - un supervisor podía restablecer la contraseña de un vendedor justo cuando lo ascendían, y quedarse con la contraseña de un supervisor;
  - dos generales podían degradarse a la vez y dejar cero;
  - un cambio de rol podía reactivar una cuenta recién desactivada.
- `save_security` (login y cambio de la propia contraseña) solo escribe si la versión de sesión no cambió, y nunca toca el rol ni el estado.

### Cambio de rol

- `PUT /api/admin/accounts/{username}/role` con `{"role": "..."}`. Solo el supervisor general.
- Sube `token_version` y avisa por SSE (`session.revoked`): la persona vuelve a entrar y ve la app según su nuevo rol.
- Borra sus avisos: eran de su rol anterior (un ex supervisor no debe seguir viendo los del equipo).
- **Tiempo real:** los eventos del equipo se envían a los usuarios que tienen el permiso al momento de publicar, no según el rol con que se abrió cada conexión. Además, el SSE revalida la sesión en cada heartbeat (20 s). Así también se corta un cambio hecho desde la consola, que corre en otro proceso.
- Por consola, para quien administra el servidor: `cli rol <usuario> <rol>`. El primer supervisor se crea con `cli supervisor <usuario> "<nombre>" --general`.

### Los clientes no repiten las reglas

- La sesión (`/auth/me`, login) trae `permissions` y `manageable_roles`.
- Cada cuenta de `GET /api/admin/accounts` trae `can_manage` y `assignable_roles`, calculados para quien consulta.
- La web solo muestra lo que el backend permite. Los textos de cada rol están en `frontend/src/features/auth/types/roles.ts`.
- La web decide por permiso la vista de supervisión (`view_team`) y los menús Usuarios (`manage_accounts`) y Habilitaciones (`manage_editing`). Un perfil guardado antes de este cambio, que no trae permisos, usa el rol hasta que `/auth/me` lo refresca.
- La app móvil, por ahora, usa la vista de supervisión para todo rol que no es vendedor.
- Una cuenta con un rol que el cliente no conoce se muestra tal cual en Usuarios, sin romper la pantalla.

## Pruebas

- `tests/test_roles_api.py`: casos de la especificación.
- `tests/test_roles_properties.py` (Hypothesis):
  - propiedades de la tabla, para cualquier rol, incluso inventado (nadie asigna un rol más fuerte que el suyo, etc.);
  - una máquina de estados que lanza secuencias aleatorias de altas, restablecimientos, activaciones y cambios de rol contra la API. Compara cada respuesta con un oráculo escrito a partir de la especificación, sin usar `permissions.py`.
- `tests/test_api_fuzz.py` (Schemathesis): fuzzing de la API a partir de su OpenAPI, con cada rol. Encontró dos errores 500 anteriores a este cambio: ids enormes en `/api/admin/editing/unlocks/{id}` y en `/api/notifications/read`. Ahora los ids se limitan al rango de la columna.
- `tests/adversarial/`: ataques de una revisión adversarial independiente (con el código, sin las conclusiones del autor). Los 14 que funcionaban quedaron como regresión.
- Las pruebas lentas llevan la marca `fuzz` y corren en un job aparte del CI. `FUZZ_EXAMPLES=200 uv run pytest -m fuzz` hace una pasada a fondo.

## Alternativas consideradas

- **Tabla de permisos en la base:** más flexible, pero nadie necesita editar permisos en caliente y complica las pruebas. Si se necesita, `permissions.py` puede pasar a leer de la base sin cambiar a quien lo usa.
- **Que el supervisor pueda ascender vendedores a supervisor:** se descartó. Todo lo relativo a supervisores lo hace el supervisor general.
- **Unificar con la tabla `users`** (roles `comercial`, `produccion`, etc. de `docs/architecture.md`): sigue pendiente y no forma parte de este ADR.

## Consecuencias

- Un rol nuevo es una línea en `ROLE_PERMISSIONS` y otra en `MANAGEABLE_ROLES`, más su texto en `roles.ts` y en la app móvil.
- **Despliegue:**
  - En un entorno que ya tiene supervisores, nadie es supervisor general hasta que se asigne por consola (`cli rol <usuario> general_supervisor`).
  - Conviene desplegar la app móvil nueva junto con el backend: una versión anterior mostraría al supervisor general la vista de vendedor (el backend igual le recorta lo que no puede hacer).
