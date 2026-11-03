# ADR 0007 — Frontend en Vercel con proxy de /api al backend

- **Estado:** aceptado
- **Fecha:** 2026-11-03

## Contexto

- El backend (API, n8n y respaldo) se despliega en un VPS con Coolify, con un entorno por rama: `avicola.<ip>.sslip.io` (`main`) y `avicola-dev.<ip>.sslip.io` (`develop`).
- El frontend (PWA) se publica en Vercel.
- La sesión vive en una cookie `HttpOnly; SameSite=Strict` ([ADR 0005](0005-seguridad-de-sesion-y-cuentas.md)). Si la PWA en `*.vercel.app` llamara directamente a `*.sslip.io`, esa cookie sería de terceros:
  - Safari la bloquea siempre y Chrome en varios casos, así que el login no funcionaría.
  - Además haría falta CORS con credenciales.

## Decisión

- **Vercel reenvía `/api/*` al backend** con una *rewrite* a un origen externo (`frontend/vercel.json`). Para el navegador, la app y la API están en el mismo dominio de Vercel:
  - La cookie sigue siendo de primera parte, con `SameSite=Strict`.
  - No hace falta CORS.
  - El frontend no cambia: sigue llamando a `/api`.
- **`TRUSTED_ORIGINS` en el backend.** El backend recibe el `Origin` de Vercel con el `Host` del VPS, y su protección CSRF solo aceptaba su propio host. Ahora también acepta los orígenes de esta lista (separados por coma; admiten comodín para las vistas previas, p. ej. `https://avicola2-*.vercel.app`). Cualquier otro sitio sigue bloqueado.
- **`vercel.json` también define:**
  - Una ruta de respaldo a `index.html`, para que las rutas de la SPA no den 404 al recargar.
  - Las cabeceras de seguridad que antes ponía FastAPI: CSP, HSTS, `X-Frame-Options`, etc.
  - Caché larga en `/assets` y sin caché en el service worker.
- **El canal SSE se reconecta solo.** Vercel corta las conexiones que reenvía a los 120 s. `EventSource` reconecta solo, y en cada reapertura la app vuelve a pedir las notificaciones y los datos de la ventana, para no perder lo ocurrido en el intervalo.

## Alternativas consideradas

- **Llamar a la API directo desde Vercel (CORS + `SameSite=None`):** la cookie sería de terceros, y Safari y otros navegadores la bloquean.
- **Dominio propio (`app.midominio.com` en Vercel + `api.midominio.com` en el VPS):** mismo sitio, sin proxy y sin el corte de 120 s. Requiere comprar un dominio, y con sslip.io no es posible. Es el siguiente paso si se compra uno.
- **Middleware de Vercel que lea `BACKEND_URL` de las variables del proyecto:** evita escribir la URL en `vercel.json`, pero agrega una función edge. Por ahora las URLs van en el archivo: una regla `missing` por host manda a develop todo lo que no sea un dominio de producción (ver `docs/deploy.md`).

## Consecuencias

- **Cambiar la IP o el dominio del backend exige editar `frontend/vercel.json`** y redesplegar en Vercel.
- **El backend sigue accesible directamente en su dominio `sslip.io`,** que también sirve la PWA. Si se quiere que solo responda a Vercel, se puede agregar un secreto que Vercel envíe en cada reenvío; Vercel lo permite con `routes` y `transforms`.
- **El canal en vivo se renueva cada ~2 minutos** cuando pasa por Vercel. Es invisible para el usuario.
