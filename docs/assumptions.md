# Supuestos y preguntas por validar

Mientras un punto no se confirme con el equipo o con Avícola 2, se elige la opción más simple, se deja configurable y se registra aquí o en un ADR.

## Datos
- **Columnas, formato y granularidad reales** de los Excel de cada área. Mientras tanto se usan datos sintéticos (declarado como limitación).
- **Catálogo real** de productos y canales, y la unidad de medida (kg o aves).
- **Cuánta historia real existe** y con qué granularidad.
- **Archivos sin columna `tipo`:** se tratan como pedidos, salvo que un mapeo confirmado fije `=type` (ADR 0003).
- **Archivos semanales** (como el resumen de Tiendas): quedan pendientes de mapeo hasta saber si los datos reales son diarios o semanales.
- **Qué es la "demanda real" para entrenar: pedidos, despachos o ventas.
  - Los días con **recorte** (F5) registran menos de lo que se pidió: la demanda está *censurada*.
  - Supuesto inicial: entrenar con pedidos e incluir un indicador de recorte como feature, o excluir esos días si se marcan.

## Dominio
- **`yield_factor`:** rendimiento de pollo vivo a producto beneficiado. Valor de referencia `YIELD_FACTOR=0.75`, configurable.
- **`avg_live_weight_kg`:** peso vivo promedio por ave. Valor de referencia `AVG_LIVE_WEIGHT_KG=2.6`, configurable.
- **Catálogo de canales y productos** (`backend/config/catalog.yaml`) y **niveles de los datos sintéticos** (unas 15 t/día de producto): inventados y plausibles, por validar.
- **Margen de seguridad** de la saca sugerida (qué percentil del intervalo usar).
- Si **"Distribución"** (pollo vivo a planta) y **"despacho"** (producto terminado) son áreas distintas.
- **A quién se pide la recarga** (granja o proveedor).

- **App de vendedores (mockup Noraves):** catálogo, pesos por unidad y vendedores de `planning_seed.yaml` salen de la tabla maestra de Avícola 2 ("TABLAS MAESTRAS PARA APP.xlsx"): una categoría BRASA con Brasa 1 a 10, agrupadas en las subcategorías Brasa chica, mediana y grande (solo agrupan la tabla; la proyección sigue siendo por categoría). SUPUESTO: «Peso» es kg por unidad; el nombre de U0002 se tomó tal cual («Hebert Días») y el supervisor de prueba no es de la tabla. La **venta real es simulada** (90–102 % de lo proyectado) hasta tener el ERP. La **hora límite** de confirmación (10:00 a. m.) es solo un mensaje.
- **Vendedores vs. usuarios de la plataforma:** los vendedores (y los supervisores, con `role`) tienen su propia tabla (`np_sellers`). Si luego se unifican con `users` (rol `canal`), se migra en un ADR.
- **Integración con ARIS:** la app será un módulo de ARIS (registra clientes y ventas). Hoy las cuentas se administran aquí (supervisor); cuando se integre, un adaptador de ARIS implementará `SellerRepository` / `AccountsGateway`, y probablemente `SalesSource` para la venta real ([ADR 0005](adr/0005-seguridad-de-sesion-y-cuentas.md)).
- **Recuperación de contraseña:** por ahora la restablece el supervisor (contraseña temporal). Recuperación por correo o Telegram vía n8n, solo si se pide más adelante.
- **Visibilidad:** cada vendedor ve solo sus proyecciones y ventas; el supervisor ve a todos y no registra proyecciones.
- **Recordatorio de proyección:** lun–sáb a las 9:00 (workflow `02_recordatorio_proyeccion` de n8n). La hora límite real del negocio está por confirmar ([ADR 0006](adr/0006-notificaciones-y-tiempo-real.md)).

## Proceso
- **El flujo As-Is** ([architecture.md §1](architecture.md)) y el flujo de datos (quién registra qué y cada cuánto) son preliminares.
- **Estados del plan de saca:** se arranca con `draft → proposed → approved | rejected`, configurables.

## Infraestructura
- **Especificaciones de la laptop antigua**, si se usa. El perfil `lite` apunta a menos de unos 2.5 GB de RAM.
- **Proyecto, región, presupuesto y créditos de GCP** disponibles para el despliegue.
- **Proyecto de Supabase:** región (cerca de la VM de GCP) y si el plan gratuito alcanza (500 MB, pausa por inactividad).
- **Destino del despliegue: por decidir.** El ADR 0001 pide una VM de GCP; también se evalúa un VPS propio (unos 26 GB de RAM) con Dokploy (recomendado) o Coolify. `deploy/` sirve para los tres caminos ([docs/deploy.md](deploy.md)). Cuando se elija, se registra en un ADR.
- **Dominio para HTTPS:** por ahora sslip.io (`app.<ip>.sslip.io`); un dominio propio solo cambia `APP_DOMAIN` y `N8N_DOMAIN`.
- **Lakehouse en producción:** en un VPS, el disco del servidor (volumen `lakehouse`); en GCP, el bucket (ADR 0001).
- **Qué warehouse o lakehouse tiene un compañero del grupo.** Si se usa el suyo, solo cambian los adaptadores del lakehouse (`backend/app/shared/infrastructure/lakehouse.py` y `backend/app/ingest/infrastructure/lakehouse.py`).
- **Azure SQL en producción:** queda configurado (driver opcional y perfil de motor) pero **no se probó contra un SQL Server real**; probarlo antes de usarlo ([ADR 0004](adr/0004-arquitectura-hexagonal-y-base-de-datos-intercambiable.md)).
- **Si la rúbrica del curso exige** almacenamiento de objetos o lakehouse. GCS lo cubre en el despliegue ([ADR 0001](adr/0001-almacenamiento-gcs-y-despliegue-en-vm.md)).
