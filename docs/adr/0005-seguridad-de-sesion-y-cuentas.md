# ADR 0005 — Seguridad de sesión y cuentas: cookie HttpOnly, supervisor y recuperación asistida

- **Estado:** aceptado
- **Fecha:** 2026-11-03

## Contexto

Una revisión de seguridad de la app de vendedores ([ADR 0004](0004-arquitectura-hexagonal-y-base-de-datos-intercambiable.md)) encontró:

- El token de sesión (JWT) se devolvía en el cuerpo del login y se guardaba en `localStorage`. Cualquier script inyectado (XSS) podía leerlo, y se veía en las herramientas del navegador.
- Al cerrar sesión, el token no se invalidaba en el servidor.
- No había límite de intentos de login, ni cambio ni recuperación de contraseña, ni forma de crear cuentas desde la app.
- Cualquier vendedor podía consultar las proyecciones y ventas de los demás.
- La API arrancaba con `AUTH_SECRET` por defecto o vacío, `/ingest` sin token, `/docs` público en producción y sin cabeceras de seguridad.
- El login mostraba los usuarios y la contraseña de prueba también en producción.

Además, la app será un **módulo de ARIS**, el sistema que registra a los clientes y sus ventas: más adelante las cuentas pueden venir de ARIS.

## Decisión

### Sesión

- **El token viaja solo en una cookie `nv_session`:** `HttpOnly` (el JavaScript no la lee), `SameSite=Strict`, `Path=/api`, y `Secure` fuera de local.
  - La respuesta del login trae solo el perfil (nombre, zona, rol), y el navegador guarda solo ese perfil.
  - "Recordarme" decide si la cookie persiste o se borra al cerrar el navegador.
- **Versión de sesión (`token_version`):** el JWT lleva `ver`. Al cambiar o restablecer la contraseña, o al desactivar la cuenta, la versión sube y los tokens anteriores dejan de valer en todos los dispositivos.
- **CSRF:** `SameSite=Strict`, y además el backend rechaza los `POST`, `PUT`, `PATCH` y `DELETE` a `/api` que vienen de otro sitio (`Sec-Fetch-Site: cross-site` o un `Origin` distinto).
- **Al cerrar sesión:** el servidor borra la cookie. El navegador olvida el perfil, el borrador, la caché de TanStack Query y las respuestas que guardó el service worker. La cola offline se conserva, porque es de cada vendedor y todavía no llegó al servidor.

### Cuentas

- **Roles `seller` y `supervisor`:** `varchar` validado por la app, no un ENUM. Se agregó `general_supervisor` y los permisos pasaron a una sola fuente ([ADR 0010](0010-roles-y-permisos.md)).
- **El supervisor crea las cuentas** (pantalla Usuarios). Nadie se registra solo, porque es una app interna. El primer supervisor se crea por consola (`cli supervisor --general`).
- **Recuperación de contraseña asistida:** el supervisor la restablece y obtiene una **contraseña temporal**, que se muestra una sola vez.
  - Con la contraseña temporal, la API solo permite cambiar la contraseña o cerrar sesión (`must_change_password`).
  - Restablecer también desbloquea la cuenta y cierra las sesiones abiertas.
- **Bloqueo por intentos:** tras 5 fallos seguidos, la cuenta se bloquea 15 minutos (`LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES`). El contador se guarda en la base, así que vale con varios procesos y sobrevive a reinicios.
- **Respuesta igual para "no existe" y "contraseña incorrecta"**, con el mismo tiempo de respuesta (se verifica un hash de relleno).
- **Política de contraseñas:** de 8 a 128 caracteres, con letras y números, sin el usuario y sin contraseñas comunes. Se valida en el backend (`domain/accounts.py`) y la misma regla, con zod, en el formulario.
- **Visibilidad:** un vendedor solo ve sus propias proyecciones y ventas; el backend ignora el filtro de vendedor que llegue en la petición. El supervisor ve a todos y no registra proyecciones.
- **ARIS:** la administración de cuentas pasa por el puerto `SellerRepository` (backend) y `AccountsGateway` (frontend). Un adaptador de ARIS podrá reemplazar los actuales sin tocar los casos de uso.

### Plataforma

- **Fuera de `APP_ENV=local` la API no arranca** si falta alguna de estas condiciones:
  - `AUTH_SECRET` con al menos 32 caracteres.
  - `INGEST_API_TOKEN`.
  - La cookie con `Secure`.
- **En local,** esos mismos problemas solo generan un aviso en los logs.
- `/docs`, `/redoc` y `/openapi.json` solo existen en local. `/api/status` exige sesión.
- **Cabeceras de seguridad:**
  - CSP (solo recursos propios, más Google Fonts).
  - `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` y `Permissions-Policy`.
  - HSTS cuando la cookie va con `Secure`.
  - `Cache-Control: no-store` en la API.
- Los usuarios de prueba solo los crea `cli init` con `APP_ENV=local`. El login los muestra solo en `pnpm dev`, o si el build define `VITE_SHOW_DEMO_USERS=true`.

## Qué no se puede ocultar (y por qué está bien)

- **En la pestaña Red de las DevTools, el usuario ve su propia contraseña en la petición de login**, y ve la cookie en las cabeceras. Es su navegador y lo que él mismo escribió; pasa igual en cualquier sitio (bancos, Google).
- **Cifrar o hashear la contraseña en el navegador no protege nada:** ese valor pasaría a ser la contraseña y serviría igual para entrar.
- **Lo que sí importa:**
  - Que nadie más pueda verla: HTTPS en tránsito (Caddy en GCP).
  - Que ningún script pueda leer la sesión: la cookie HttpOnly.
  - Que no quede guardada: ni en `localStorage`, ni en los logs, ni en las URL.
  - Que el backend solo guarde un hash scrypt.

## Cifrado de datos

- **En tránsito:**
  - Navegador ↔ API por HTTPS (Caddy en GCP).
  - API ↔ Supabase con `sslmode=require`.
  - Al GCS, por HTTPS.
- **En reposo:** Supabase cifra el disco (AES-256) y GCS cifra por defecto.
- **Contraseñas:** hash scrypt con sal por usuario (N=2^14, r=8, compatible con el mockup). Nunca se guardan en claro, tampoco las temporales.
- **En el dispositivo** quedan en claro el perfil, el borrador y la cola offline: datos de trabajo, no secretos. El borrador se borra al cerrar sesión.

## Alternativas consideradas

- **Token en `localStorage` con cabecera `Authorization`:** más simple, pero legible por cualquier script inyectado.
- **Registro abierto con código de invitación:** expone una pantalla pública de alta; la empresa ya sabe quiénes son sus vendedores.
- **Recuperación por correo o Telegram (vía n8n):** exige guardar el correo o el Telegram de cada vendedor y configurar SMTP o HTTPS público. Queda para cuando haga falta.
- **Lista de tokens revocados por sesión:** más fina que `token_version` (cerraría un solo dispositivo), pero necesita otra tabla y una consulta extra por petición. Hoy alcanza con la versión por cuenta.
- **Subir scrypt a N=2^17:** usa 128 MB por verificación, demasiado para el contenedor de 512 MB.

## Consecuencias

- Un cambio o restablecimiento de contraseña cierra las sesiones de esa cuenta en todos sus dispositivos.
- La app y la API deben servirse desde el mismo origen (ya es así: FastAPI sirve la PWA). Un frontend en otro dominio necesitaría CORS con credenciales.
- En producción, `APP_ENV` debe ser distinto de `local`, y se deben definir `AUTH_SECRET` e `INGEST_API_TOKEN`; si falta algo, la API no arranca y avisa qué falta.
