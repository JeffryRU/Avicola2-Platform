# ADR 0014: caché de lecturas frecuentes, en memoria o en Redis

## Contexto

El 12-11 el backend de develop se quedó sin conexiones a la base: al entrar un supervisor el frontend lanza unas 8 peticiones en paralelo, cada una tardaba de 2 a 3 s y el pool (5 + 2) se agotaba. Las peticiones esperaban 30 s y fallaban con 500.

La medición mostró que no hay consultas N+1 (de 1 a 11 por endpoint). El costo está en el viaje a la base: unos 90 ms por consulta y 1.8 s por conexión nueva hacia el pooler de Supabase de develop (`us-west-2`), y unos 30 ms hacia el de producción (`us-east-2`). El pooler en modo sesión admite 15 conexiones por usuario+base en el plan Nano, compartidas con n8n.

Parte de esas consultas se repiten en casi cada petición y cambian poco: la configuración (`np_settings`, que `/api/editing` leía 3 veces), el catálogo y la lista de vendedores activos.

## Decisión

1. **Caché con TTL para esas tres lecturas**, como decorador de los repositorios en la raíz de composición (`planning/bootstrap.py`). Los casos de uso no cambian.
2. **Dos implementaciones del mismo puerto** (`shared/infrastructure/cache.py`), elegidas con `CACHE_BACKEND`:
   - `memory`: un diccionario por proceso. Es el valor por defecto de la app, sin servicios extra (tests, CLI, demo).
   - `redis`: compartida por todos los procesos. Es el valor por defecto en Docker Compose (local y producción), con un contenedor `redis:7.4-alpine` de 48 MB, LRU, sin disco ni puertos publicados.
3. **Invalidación al escribir.** Toda escritura que pasa por los repositorios con caché borra su parte. La CLI la limpia al terminar: con Redis la API lo ve al instante; en memoria, al vencer el TTL (`CACHE_TTL_SECONDS`, 60 s).
4. **No se cachea la cuenta de la sesión.** Desactivar una cuenta o cerrar sus sesiones debe valer al instante.
5. **Redis nunca es requisito para responder.** Si no contesta (timeouts de 0.5 s), se lee de la base y se registra un aviso como mucho una vez por minuto.
6. **JSON, no pickle.** Cada valor declara cómo serializarse (`Codec`), así un Redis comprometido no puede ejecutar código en la API. Las claves llevan el prefijo `avicola2:<APP_ENV>:`, así develop y producción pueden compartir un Redis.

## Consecuencias

- El lote de peticiones del login de un supervisor baja de 28 a 18 consultas con la caché caliente (`/api/saca` de 11 a 6 y `/api/editing` de 4 a 1).
- Con `UVICORN_WORKERS=1` las dos opciones rinden casi igual. Redis empieza a valer más con varios workers o réplicas, que comparten caché e invalidación.
- Es un servicio más en el VPS (unos 64 MB en total), dentro del límite del perfil `lite`.
- Los tests corren con la caché activa, para que cubran también la invalidación. La suite completa pasa con `memory` y con un Redis real.
- **Pendiente si se escala:** el bus de eventos del SSE y el límite de intentos de login siguen en memoria del proceso. Con varias réplicas deberían pasar a Redis (pub/sub y contadores).

- **Fecha:** 2026-11-12.
