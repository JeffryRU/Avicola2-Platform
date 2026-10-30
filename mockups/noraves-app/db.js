/* =============================================================
   Noraves · Planificación de Demanda — acceso a la base de datos
   - Conexión a Azure SQL con las credenciales del archivo .env
   - Repositorio usado por server.js
   - Comandos de consola:
       node db.js init      crea las tablas y carga productos y vendedores
       node db.js seed      (opcional) carga 3 semanas de proyecciones de ejemplo
       node db.js ver [n]   muestra lo que hay en la base (últimas n proyecciones)
       node db.js limpiar --si   borra todas las proyecciones (no toca productos ni vendedores)
   ============================================================= */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const crypto = require('crypto');

const MEMORIA = (process.env.DB_MODO || '').toLowerCase() === 'memoria';
const SCHEMA = (process.env.DB_SCHEMA || 'dbo').replace(/[^\w]/g, '');
const T = n => `[${SCHEMA}].[np_${n}]`;

/* ---------- datos maestros iniciales ---------- */
const PRODUCTOS = [
  ['B1','BRASA','Brasa 1',1.20],['B2','BRASA','Brasa 2',1.50],['B3','BRASA','Brasa 3',1.80],['B4','BRASA','Brasa 4',2.00],
  ['B5','BRASA','Brasa 5',1.50],['B6','BRASA','Brasa 6',1.80],['B7','BRASA','Brasa 7',2.20],['B8','BRASA','Brasa 8',2.50],
  ['B9','BRASA','Brasa 9',2.80],['B10','BRASA','Brasa 10',3.00],
  ['R1','BROASTER','Broaster 1',0.90],['R2','BROASTER','Broaster 2',1.05],['R3','BROASTER','Broaster 3',1.20],
  ['R4','BROASTER','Broaster 4',1.35],['R5','BROASTER','Broaster 5',1.50],['R6','BROASTER','Broaster 6',1.65]
];
const VENDEDORES = [ ['jperez','Juan Pérez','Zona Norte'], ['mrios','María Ríos','Zona Sur'], ['cleon','Carlos León','Zona Centro'] ];
const CLAVE_DEMO = 'demo1234';

/* ---------- contraseñas (scrypt, sin dependencias) ---------- */
function hashClave(clave){ const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(clave, salt, 32).toString('hex'); }
function verificarClave(clave, guardado){
  const [salt, h] = String(guardado || '').split(':'); if (!salt || !h) return false;
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(String(clave), salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* =============================================================
   Conexión a Azure SQL
   ============================================================= */
let sql = null, poolP = null;
function faltantes(){ return ['DB_SERVER','DB_NAME','DB_USER','DB_PASSWORD'].filter(k => !process.env[k]); }
function pool(){
  if (!sql) sql = require('mssql');
  const f = faltantes(); if (f.length) return Promise.reject(new Error('Faltan variables en .env: ' + f.join(', ')));
  if (!poolP){
    poolP = new sql.ConnectionPool({
      server: process.env.DB_SERVER, database: process.env.DB_NAME,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD,
      port: +(process.env.DB_PORT || 1433),
      options: { encrypt: (process.env.DB_ENCRYPT || 'true') !== 'false', trustServerCertificate: process.env.DB_TRUST_CERT === 'true' },
      pool: { max: 5, min: 0, idleTimeoutMillis: 30000 }, connectionTimeout: 15000, requestTimeout: 30000
    }).connect().catch(e => { poolP = null; throw e; });
  }
  return poolP;
}
async function q(text, params = {}, tx){
  const req = tx ? new sql.Request(tx) : (await pool()).request();
  for (const [k, [type, v]] of Object.entries(params)) req.input(k, type, v);
  return (await req.query(text)).recordset || [];
}

/* ---------- esquema (idempotente) ---------- */
const DDL = () => [
`IF OBJECT_ID(N'${SCHEMA}.np_vendedores','U') IS NULL
CREATE TABLE ${T('vendedores')} (
  id INT IDENTITY(1,1) PRIMARY KEY,
  usuario NVARCHAR(50) NOT NULL CONSTRAINT uq_np_vend_usuario UNIQUE,
  nombre NVARCHAR(100) NOT NULL,
  zona NVARCHAR(50) NULL,
  clave_hash NVARCHAR(200) NOT NULL,
  activo BIT NOT NULL CONSTRAINT df_np_vend_activo DEFAULT 1,
  creado_en DATETIME2 NOT NULL CONSTRAINT df_np_vend_creado DEFAULT SYSUTCDATETIME()
);`,
`IF OBJECT_ID(N'${SCHEMA}.np_productos','U') IS NULL
CREATE TABLE ${T('productos')} (
  id NVARCHAR(10) NOT NULL PRIMARY KEY,
  categoria NVARCHAR(30) NOT NULL,
  nombre NVARCHAR(60) NOT NULL,
  kg_por_unidad DECIMAL(6,2) NOT NULL,
  orden INT NOT NULL CONSTRAINT df_np_prod_orden DEFAULT 0,
  activo BIT NOT NULL CONSTRAINT df_np_prod_activo DEFAULT 1
);`,
`IF OBJECT_ID(N'${SCHEMA}.np_proyecciones','U') IS NULL
CREATE TABLE ${T('proyecciones')} (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  envio_id UNIQUEIDENTIFIER NOT NULL,
  vendedor_id INT NOT NULL CONSTRAINT fk_np_proy_vend REFERENCES ${T('vendedores')}(id),
  fecha DATE NOT NULL,
  categoria NVARCHAR(30) NOT NULL,
  estado NVARCHAR(15) NOT NULL CONSTRAINT df_np_proy_estado DEFAULT 'confirmada',
  total_unidades INT NOT NULL,
  total_kg DECIMAL(10,2) NOT NULL,
  enviado_en DATETIME2 NOT NULL CONSTRAINT df_np_proy_env DEFAULT SYSUTCDATETIME(),
  actualizado_en DATETIME2 NULL,
  CONSTRAINT uq_np_proy UNIQUE (vendedor_id, fecha, categoria)
);`,
`IF OBJECT_ID(N'${SCHEMA}.np_proyeccion_detalle','U') IS NULL
CREATE TABLE ${T('proyeccion_detalle')} (
  proyeccion_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_np_det_proy REFERENCES ${T('proyecciones')}(id) ON DELETE CASCADE,
  producto_id NVARCHAR(10) NOT NULL CONSTRAINT fk_np_det_prod REFERENCES ${T('productos')}(id),
  unidades INT NOT NULL CONSTRAINT ck_np_det_unid CHECK (unidades >= 0),
  kg DECIMAL(10,2) NOT NULL,
  CONSTRAINT pk_np_det PRIMARY KEY (proyeccion_id, producto_id)
);`
];

/* =============================================================
   Base en memoria (DB_MODO=memoria): solo para probar sin Azure SQL.
   Los datos se pierden al detener el servidor.
   ============================================================= */
const MEM = { vendedores: [], productos: [], proyecciones: [] };
function memInit(){
  if (MEM.productos.length) return;
  MEM.productos = PRODUCTOS.map(([id,categoria,nombre,kg],i) => ({ id, categoria, nombre, kg_por_unidad: kg, orden: i }));
  MEM.vendedores = VENDEDORES.map(([usuario,nombre,zona],i) => ({ id: i+1, usuario, nombre, zona, clave_hash: hashClave(CLAVE_DEMO) }));
}

/* =============================================================
   Repositorio (lo usa server.js)
   ============================================================= */
const repo = {
  async salud(){
    if (MEMORIA){ memInit(); return { db: true, tablas: true, modo: 'memoria', base: 'memoria (pruebas)', servidor: 'local' }; }
    const r = await q(`SELECT DB_NAME() AS base, @@SERVERNAME AS servidor,
      (SELECT COUNT(*) FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=@sch AND t.name IN ('np_vendedores','np_productos','np_proyecciones','np_proyeccion_detalle')) AS tablas`,
      { sch: [sql.NVarChar, SCHEMA] });
    return { db: true, tablas: r[0].tablas === 4, modo: 'azure-sql', base: r[0].base, servidor: process.env.DB_SERVER, esquema: SCHEMA };
  },
  async login(usuario, clave){
    let v;
    if (MEMORIA){ memInit(); v = MEM.vendedores.find(x => x.usuario === usuario); }
    else v = (await q(`SELECT id, usuario, nombre, zona, clave_hash FROM ${T('vendedores')} WHERE usuario=@u AND activo=1`, { u: [sql.NVarChar(50), usuario] }))[0];
    if (!v || !verificarClave(clave, v.clave_hash)) return null;
    return { usuario: v.usuario, nombre: v.nombre, zona: v.zona };
  },
  async catalogo(){
    if (MEMORIA){ memInit(); return MEM.productos; }
    return q(`SELECT id, categoria, nombre, kg_por_unidad, orden FROM ${T('productos')} WHERE activo=1 ORDER BY categoria, orden, id`);
  },
  async vendedores(){
    if (MEMORIA){ memInit(); return MEM.vendedores.map(({usuario,nombre,zona}) => ({usuario,nombre,zona})); }
    return q(`SELECT usuario, nombre, zona FROM ${T('vendedores')} WHERE activo=1 ORDER BY id`);
  },
  async listar(desde, hasta, usuario){
    let rows;
    if (MEMORIA){
      memInit();
      rows = MEM.proyecciones.filter(p => p.fecha >= desde && p.fecha <= hasta && (!usuario || p.usuario === usuario))
        .flatMap(p => p.detalle.map(d => ({ ...p, producto_id: d.producto_id, unidades: d.unidades })));
    } else {
      rows = await q(`SELECT CONVERT(varchar(36), p.id) AS id, CONVERT(varchar(36), p.envio_id) AS envio_id, CONVERT(varchar(10), p.fecha, 23) AS fecha,
          p.categoria, p.estado, p.enviado_en, p.total_unidades, p.total_kg, v.usuario, d.producto_id, d.unidades
        FROM ${T('proyecciones')} p
        JOIN ${T('vendedores')} v ON v.id = p.vendedor_id
        LEFT JOIN ${T('proyeccion_detalle')} d ON d.proyeccion_id = p.id
        WHERE p.fecha BETWEEN @desde AND @hasta ${usuario ? 'AND v.usuario = @u' : ''}
        ORDER BY p.fecha, v.usuario`,
        { desde: [sql.Date, desde], hasta: [sql.Date, hasta], ...(usuario ? { u: [sql.NVarChar(50), usuario] } : {}) });
    }
    const map = new Map();
    for (const r of rows){
      if (!map.has(r.id)) map.set(r.id, { id: r.id, envio_id: r.envio_id, fecha: r.fecha, categoria: r.categoria, estado: r.estado,
        enviado_en: r.enviado_en, total_unidades: r.total_unidades, total_kg: +r.total_kg, usuario: r.usuario, unidades: {} });
      if (r.producto_id) map.get(r.id).unidades[r.producto_id] = r.unidades;
    }
    return [...map.values()];
  },
  /* Guarda (o reemplaza) la proyección de cada día enviado, en una sola transacción. */
  async guardar(body){
    const usuario = String(body?.vendedor?.usuario || '').trim();
    const categoria = String(body?.categoria || '').trim();
    const dias = Array.isArray(body?.detalle) ? body.detalle : [];
    if (!usuario) throw httpErr(400, 'Falta el usuario del vendedor.');
    if (!categoria) throw httpErr(400, 'Falta la categoría.');
    if (!dias.length || dias.length > 7) throw httpErr(400, 'Debe enviar entre 1 y 7 días.');
    const envioId = /^[0-9a-f-]{36}$/i.test(body.id || '') ? body.id : crypto.randomUUID();

    const prods = (await repo.catalogo()).filter(p => p.categoria === categoria);
    if (!prods.length) throw httpErr(400, `La categoría ${categoria} no existe.`);
    const kgDe = Object.fromEntries(prods.map(p => [p.id, +p.kg_por_unidad]));
    const limpio = dias.map(d => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '')) throw httpErr(400, 'Fecha inválida: ' + d.fecha);
      const lineas = (d.productos || []).filter(p => kgDe[p.producto_id] != null)
        .map(p => { const u = Math.trunc(+p.unidades); if (!(u >= 0) || u > 99999) throw httpErr(400, `Unidades inválidas en ${p.producto_id}.`); return { producto_id: p.producto_id, unidades: u, kg: +(u * kgDe[p.producto_id]).toFixed(2) }; });
      const tu = lineas.reduce((s, l) => s + l.unidades, 0);
      if (!tu) throw httpErr(400, `El día ${d.fecha} no tiene unidades.`);
      return { fecha: d.fecha, lineas, tu, tk: +lineas.reduce((s, l) => s + l.kg, 0).toFixed(2) };
    });

    if (MEMORIA){
      memInit();
      if (!MEM.vendedores.find(v => v.usuario === usuario)) throw httpErr(400, 'El vendedor no existe.');
      for (const d of limpio){
        MEM.proyecciones = MEM.proyecciones.filter(p => !(p.usuario === usuario && p.fecha === d.fecha && p.categoria === categoria));
        MEM.proyecciones.push({ id: crypto.randomUUID(), envio_id: envioId, usuario, fecha: d.fecha, categoria, estado: 'confirmada',
          total_unidades: d.tu, total_kg: d.tk, enviado_en: new Date(), detalle: d.lineas });
      }
      return { ok: true, envio_id: envioId, dias: limpio.length };
    }

    const p = await pool();
    const tx = new sql.Transaction(p);
    await tx.begin();
    try {
      const v = (await q(`SELECT id FROM ${T('vendedores')} WHERE usuario=@u AND activo=1`, { u: [sql.NVarChar(50), usuario] }, tx))[0];
      if (!v) throw httpErr(400, 'El vendedor no existe.');
      for (const d of limpio){
        const prev = (await q(`SELECT CONVERT(varchar(36), id) AS id FROM ${T('proyecciones')} WITH (UPDLOCK, HOLDLOCK)
            WHERE vendedor_id=@v AND fecha=@f AND categoria=@c`,
          { v: [sql.Int, v.id], f: [sql.Date, d.fecha], c: [sql.NVarChar(30), categoria] }, tx))[0];
        let id;
        if (prev){
          id = prev.id;
          await q(`UPDATE ${T('proyecciones')} SET envio_id=@e, estado='confirmada', total_unidades=@tu, total_kg=@tk, actualizado_en=SYSUTCDATETIME() WHERE id=@id;
                   DELETE FROM ${T('proyeccion_detalle')} WHERE proyeccion_id=@id;`,
            { id: [sql.UniqueIdentifier, id], e: [sql.UniqueIdentifier, envioId], tu: [sql.Int, d.tu], tk: [sql.Decimal(10,2), d.tk] }, tx);
        } else {
          id = crypto.randomUUID();
          await q(`INSERT INTO ${T('proyecciones')} (id, envio_id, vendedor_id, fecha, categoria, estado, total_unidades, total_kg)
                   VALUES (@id, @e, @v, @f, @c, 'confirmada', @tu, @tk)`,
            { id: [sql.UniqueIdentifier, id], e: [sql.UniqueIdentifier, envioId], v: [sql.Int, v.id], f: [sql.Date, d.fecha],
              c: [sql.NVarChar(30), categoria], tu: [sql.Int, d.tu], tk: [sql.Decimal(10,2), d.tk] }, tx);
        }
        for (const l of d.lineas){
          await q(`INSERT INTO ${T('proyeccion_detalle')} (proyeccion_id, producto_id, unidades, kg) VALUES (@id, @p, @u, @k)`,
            { id: [sql.UniqueIdentifier, id], p: [sql.NVarChar(10), l.producto_id], u: [sql.Int, l.unidades], k: [sql.Decimal(10,2), l.kg] }, tx);
        }
      }
      await tx.commit();
      return { ok: true, envio_id: envioId, dias: limpio.length };
    } catch (e){
      try { await tx.rollback(); } catch (_) {}
      throw e;
    }
  }
};
function httpErr(status, msg){ const e = new Error(msg); e.status = status; return e; }

/* =============================================================
   Comandos de consola
   ============================================================= */
async function init(){
  for (const stmt of DDL()) await q(stmt);
  for (const [i, [id, cat, nom, kg]] of PRODUCTOS.entries()){
    await q(`MERGE ${T('productos')} AS t USING (SELECT @id AS id) AS s ON t.id = s.id
      WHEN MATCHED THEN UPDATE SET categoria=@c, nombre=@n, kg_por_unidad=@k, orden=@o
      WHEN NOT MATCHED THEN INSERT (id, categoria, nombre, kg_por_unidad, orden) VALUES (@id, @c, @n, @k, @o);`,
      { id: [sql.NVarChar(10), id], c: [sql.NVarChar(30), cat], n: [sql.NVarChar(60), nom], k: [sql.Decimal(6,2), kg], o: [sql.Int, i] });
  }
  for (const [u, n, z] of VENDEDORES){
    await q(`IF NOT EXISTS (SELECT 1 FROM ${T('vendedores')} WHERE usuario=@u)
      INSERT INTO ${T('vendedores')} (usuario, nombre, zona, clave_hash) VALUES (@u, @n, @z, @h)`,
      { u: [sql.NVarChar(50), u], n: [sql.NVarChar(100), n], z: [sql.NVarChar(50), z], h: [sql.NVarChar(200), hashClave(CLAVE_DEMO)] });
  }
  console.log(`✔ Tablas listas en ${process.env.DB_NAME}.${SCHEMA} (prefijo np_).`);
  console.log(`✔ ${PRODUCTOS.length} productos y ${VENDEDORES.length} vendedores cargados.`);
  console.log(`  Usuarios de prueba: ${VENDEDORES.map(v => v[0]).join(', ')}  ·  contraseña: ${CLAVE_DEMO}`);
}

async function seed(){
  const BASE = [[10,15,20,12,25,18,10,14,8,5],[8,12,18,10,20,15,8,12,6,4],[12,18,20,15,30,22,12,18,10,6],[10,15,18,14,28,20,10,16,8,6],[14,20,24,16,32,24,12,18,10,7],[16,22,26,18,35,26,14,20,12,8],[12,16,20,12,26,18,10,14,8,5]];
  const f = { jperez: 1, mrios: .82, cleon: 1.16 };
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  let n = 0;
  for (const [usuario] of VENDEDORES){
    for (let back = 21; back >= 1; back--){
      const d = new Date(hoy); d.setDate(d.getDate() - back);
      const w = (d.getDay() + 6) % 7;
      const productos = BASE[w].map((u, i) => ({ producto_id: 'B' + (i+1), unidades: Math.max(1, Math.round(u * f[usuario] * (0.92 + Math.random() * 0.16))) }));
      await repo.guardar({ vendedor: { usuario }, categoria: 'BRASA', detalle: [{ fecha: iso(d), productos }] }); n++;
    }
  }
  console.log(`✔ ${n} proyecciones de ejemplo cargadas (últimos 21 días, ${VENDEDORES.length} vendedores).`);
}

async function ver(limite = 20){
  const lim = Math.min(Math.max(+limite || 20, 1), 500);
  console.log(`\nBase: ${process.env.DB_NAME} · servidor: ${process.env.DB_SERVER}\n`);
  console.log('Vendedores');
  console.table(await q(`SELECT id, usuario, nombre, zona, activo FROM ${T('vendedores')} ORDER BY id`));
  console.log('Productos por categoría');
  console.table(await q(`SELECT categoria, COUNT(*) AS productos, MIN(kg_por_unidad) AS kg_min, MAX(kg_por_unidad) AS kg_max FROM ${T('productos')} GROUP BY categoria`));
  const tot = (await q(`SELECT COUNT(*) AS proyecciones, ISNULL(SUM(total_unidades),0) AS unidades, ISNULL(SUM(total_kg),0) AS kg FROM ${T('proyecciones')}`))[0];
  console.log(`Total guardado: ${tot.proyecciones} proyecciones · ${tot.unidades} unidades · ${tot.kg} kg\n`);
  console.log(`Últimas ${lim} proyecciones (más recientes primero)`);
  console.table(await q(`SELECT TOP (@lim) CONVERT(varchar(10), p.fecha, 23) AS fecha, v.usuario, p.categoria, p.estado,
      p.total_unidades AS unidades, p.total_kg AS kg, CONVERT(varchar(16), p.enviado_en, 120) AS enviado_utc, LEFT(CONVERT(varchar(36), p.envio_id), 8) AS envio
    FROM ${T('proyecciones')} p JOIN ${T('vendedores')} v ON v.id = p.vendedor_id
    ORDER BY p.enviado_en DESC, p.fecha`, { lim: [sql.Int, lim] }));
  const ult = (await q(`SELECT TOP 1 CONVERT(varchar(36), envio_id) AS envio_id FROM ${T('proyecciones')} ORDER BY enviado_en DESC`))[0];
  if (ult){
    console.log('Detalle del último envío (unidades por producto y día)');
    const det = await q(`SELECT CONVERT(varchar(10), p.fecha, 23) AS fecha, d.producto_id, d.unidades, d.kg
      FROM ${T('proyecciones')} p JOIN ${T('proyeccion_detalle')} d ON d.proyeccion_id = p.id
      WHERE p.envio_id = @e ORDER BY p.fecha, d.producto_id`, { e: [sql.UniqueIdentifier, ult.envio_id] });
    const piv = {};
    det.forEach(r => { (piv[r.producto_id] ||= { producto: r.producto_id })[r.fecha] = r.unidades; });
    console.table(Object.values(piv));
  }
}

async function limpiar(){
  if (!process.argv.includes('--si')){ console.log('Esto borra TODAS las proyecciones. Para confirmar: node db.js limpiar --si'); return; }
  await q(`DELETE FROM ${T('proyeccion_detalle')}; DELETE FROM ${T('proyecciones')};`);
  console.log('✔ Proyecciones borradas.');
}

if (require.main === module){
  const cmd = process.argv[2];
  const fn = { init, seed, ver: () => ver(process.argv[3]), limpiar }[cmd];
  if (!fn){ console.log('Uso: node db.js init | seed | ver [n] | limpiar --si'); process.exit(1); }
  if (MEMORIA){ console.log('DB_MODO=memoria: estos comandos solo funcionan con Azure SQL.'); process.exit(1); }
  pool().then(fn).then(() => process.exit(0)).catch(e => {
    console.error('✖ ' + e.message);
    if (/firewall|Client with IP address/i.test(e.message)) console.error('  Azure está bloqueando tu IP: pide que la agreguen al firewall del servidor SQL.');
    if (/Login failed/i.test(e.message)) console.error('  Revisa DB_USER y DB_PASSWORD en el .env.');
    process.exit(1);
  });
}

module.exports = { repo, pool };
