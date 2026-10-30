# Noraves · Planificación de Demanda (mockup funcional)

La interfaz es un solo HTML (`noraves-planificacion.html`). `server.js` lo sirve y guarda las proyecciones en Azure SQL.

## Requisitos
- Node.js 18 o superior
- Tu IP (o la del servidor) autorizada en el firewall de Azure SQL

## Pasos
```bash
npm install
cp .env.example .env        # en Windows: copy .env.example .env
# completa DB_SERVER y DB_PASSWORD en .env
npm run db:init             # crea las tablas np_* y carga productos y vendedores
npm start                   # abre http://localhost:3000
```
Usuarios de prueba: `jperez`, `mrios`, `cleon` · contraseña `demo1234`

## Ver qué hay en la base
```bash
npm run db:ver              # resumen + últimas 20 proyecciones + detalle del último envío
node db.js ver 100          # últimas 100
```
También puedes abrir `consultas.sql` en Azure Data Studio, SSMS, el editor de consultas del portal de Azure o la extensión SQL Server de VS Code.

## Otros comandos
| Comando | Qué hace |
|---|---|
| `npm run db:seed` | Carga 3 semanas de proyecciones de ejemplo (para ver los dashboards con datos) |
| `node db.js limpiar --si` | Borra todas las proyecciones (no toca productos ni vendedores) |
| `npm run demo` | Inicia sin Azure SQL, con una base en memoria (se borra al detener) |

## Tablas (esquema `dbo`)
- `np_vendedores` — usuario, nombre, zona, contraseña cifrada
- `np_productos` — id, categoría, nombre, kg por unidad
- `np_proyecciones` — una fila por vendedor, día y categoría (si se reenvía el mismo día, se reemplaza)
- `np_proyeccion_detalle` — unidades y kg por producto

Los kilos se calculan en el servidor con el peso de `np_productos`.

## API
| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/health` | Estado de la conexión |
| POST | `/api/login` | `{ usuario, clave }` |
| GET | `/api/catalogo` | Productos activos |
| GET | `/api/vendedores` | Vendedores activos |
| GET | `/api/proyecciones?desde=AAAA-MM-DD&hasta=AAAA-MM-DD[&usuario=]` | Proyecciones con detalle |
| POST | `/api/proyecciones` | Guarda una proyección (1 a 7 días) |

Si abres el HTML sin servidor, funciona en modo demo y guarda solo en el navegador.
La venta real (ERP) de los dashboards todavía es simulada.
