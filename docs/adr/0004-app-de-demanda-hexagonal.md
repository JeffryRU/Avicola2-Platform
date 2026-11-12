# ADR 0004 — App de planificación de demanda (vendedores) como módulo hexagonal

- **Estado:** aceptado
- **Fecha:** 2026-10-30

## Contexto

El equipo validó con el negocio un mockup HTML ("Noraves · Planificación de Demanda") en el que los vendedores proyectan unidades por producto y por día, y Comercial y Producción revisan dashboards semanales (resumen, proyección vs. venta y estado de envíos). Había que convertirlo en una app real dentro de esta plataforma, con dos condiciones:

- **La base de datos puede cambiar.** Hoy es Supabase (Postgres, [ADR 0002](0002-supabase-como-base-de-datos.md)), pero se evalúa **Azure SQL**. Las pruebas y las demos no deberían depender de ninguna base.
- **La venta real viene del ERP**, que todavía no tiene integración.

Además, el resto del backend (ingesta, lakehouse, ML) debe poder rehacerse sin tocar esta app, y viceversa (CLAUDE.md: "mantener independientes ingesta, ML y app").

## Decisión

1. **Un contexto acotado propio, `backend/app/demand/`, con arquitectura hexagonal:**
   - `domain/`: modelo y reglas puras (hora de cierre, días pasados bloqueados, máximos de días y unidades, estado de cada día). Sin FastAPI ni SQLAlchemy.
   - `application/`: casos de uso y **puertos** (`ports.py`): unidad de trabajo y repositorios, reloj, hasher, tokens y proveedor de ventas.
   - `adapters/`: implementaciones concretas (`sqlalchemy`, `memory`, `http`, `security`, `clock`, `sales`).
   - `bootstrap.py` arma el contenedor según la configuración, y `cli.py` ofrece `seed`.
2. **Persistencia intercambiable** con `DEMAND_STORAGE`:
   - `sql`: adaptador SQLAlchemy sobre `DATABASE_URL`, tablas en el esquema `app` y migraciones de Alembic. El SQL es portable: sirve para Postgres/Supabase y para Azure SQL (`mssql+pyodbc`, grupo de dependencias `mssql`).
   - `memory`: adaptador en memoria con datos de ejemplo, para demos sin base y para los tests.
3. **Autenticación JWT propia de los vendedores** (`POST /api/auth/login`, `AUTH_SECRET_KEY`, `AUTH_TOKEN_HOURS`), separada por ahora de `app.users`. Las claves se guardan con scrypt.
4. **Unicidad de la proyección:** una por vendedor + fecha + categoría (BRASA / BROASTER). Reenviar el mismo día la reemplaza mientras no pase la hora de cierre (`DEMAND_CUTOFF_TIME`, 10:00 en `TZ`).
5. **Ventas del ERP detrás de un puerto** (`ActualSalesProvider`). Mientras no haya integración, `SimulatedSalesProvider` genera la venta real de los días pasados confirmados (90–102 % de lo proyectado, con ruido estable).
6. **Frontend:** React 19 + Vite + TypeScript estricto, TanStack Router, Query y Table, Tailwind v4 y shadcn/ui, responsive (móvil primero). En producción **FastAPI sirve el build** (`FRONTEND_DIST_DIR`): el Dockerfile del backend compila el frontend en una etapa `node:22-alpine`, sin un contenedor más. En desarrollo, Vite hace de proxy de `/api` hacia `:8000`.

## Alternativas consideradas

- **Escribir la app en capas sobre los modelos de `app/db`** (como la ingesta): más rápido al inicio, pero ata las reglas a SQLAlchemy y a Postgres, y complica el cambio a Azure SQL y las pruebas sin base.
- **Supabase Auth o reutilizar `app.users`:** se descarta por ahora (ADR 0002). Unificar usuarios queda pendiente.
- **Servir el frontend con un contenedor nginx aparte:** suma memoria al perfil `lite` sin necesidad.
- **Leer la venta real del lakehouse (gold):** el lakehouse aún tiene datos sintéticos y otra granularidad (kg por canal). Se conectará con un adaptador nuevo del mismo puerto.

## Consecuencias

**Positivas**
- Las reglas del negocio se prueban sin base ni HTTP. Cambiar de Supabase a Azure SQL es cambiar `DATABASE_URL`.
- Demo sin infraestructura: `DEMAND_STORAGE=memory`.
- Una sola imagen sirve la API y la UI.

**Negativas / a tener en cuenta**
- **Dos tablas de usuarios** (`app.users` y los vendedores) hasta unificarlas.
- **La dimensión cliente / canal no está en el mockup.** El backlog la pide (E3·HU1: proyección por cliente; E1·HU3: acceso filtrado por canal), así que queda pendiente agregarla al dominio y a la UI.
- **Azure SQL:** el usuario necesita el esquema `app` y el permiso `REFERENCES` para crear las claves foráneas, y la imagen debe incluir el ODBC Driver 18 (hoy no lo trae).
- **Migraciones anteriores ajustadas para ser portables:** `server_default` con `sa.func.now()` en lugar de SQL propio de Postgres. No cambia el esquema ya creado en Supabase.
- **El build de la imagen necesita el contexto en la raíz del repo** (`docker-compose.yml` → `build.context: .`), con un `.dockerignore` en la raíz para mantenerla liviana.
- **Las ventas son simuladas:** los dashboards de proyección vs. venta no reflejan datos reales hasta integrar el ERP.
