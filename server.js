/* =============================================================
   Noraves · Planificación de Demanda — servidor
   Sirve el HTML y expone una API pequeña para guardar en Azure SQL.
   Uso:  npm start   →  http://localhost:3000
   ============================================================= */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const http = require('http');
const fs = require('fs');
const { repo } = require('./db');

const PORT = +(process.env.PORT || 3000);
const HTML = path.join(__dirname, 'noraves-planificacion.html');

function send(res, status, body, type = 'application/json; charset=utf-8'){
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
function readBody(req){
  return new Promise((ok, bad) => {
    let data = ''; req.on('data', c => { data += c; if (data.length > 1e6){ bad(Object.assign(new Error('Petición demasiado grande.'), { status: 413 })); req.destroy(); } });
    req.on('end', () => { try { ok(data ? JSON.parse(data) : {}); } catch { bad(Object.assign(new Error('JSON inválido.'), { status: 400 })); } });
  });
}
const isoDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

const routes = {
  'GET /api/health': async () => {
    try { return await repo.salud(); }
    catch (e){ return { db: false, tablas: false, error: e.message }; }
  },
  'POST /api/login': async (req) => {
    const { usuario, clave } = await readBody(req);
    if (!usuario || !clave) throw Object.assign(new Error('Ingresa tu usuario y contraseña.'), { status: 400 });
    const v = await repo.login(String(usuario).trim(), String(clave));
    if (!v) throw Object.assign(new Error('Usuario o contraseña incorrectos.'), { status: 401 });
    return { vendedor: v };
  },
  'GET /api/catalogo': () => repo.catalogo(),
  'GET /api/vendedores': () => repo.vendedores(),
  'GET /api/proyecciones': (req, url) => {
    const desde = url.searchParams.get('desde'), hasta = url.searchParams.get('hasta');
    if (!isoDate(desde) || !isoDate(hasta)) throw Object.assign(new Error('Parámetros desde/hasta inválidos (AAAA-MM-DD).'), { status: 400 });
    return repo.listar(desde, hasta, url.searchParams.get('usuario') || null);
  },
  'POST /api/proyecciones': async (req) => {
    const body = await readBody(req);
    if (body.tipo === 'ping') return { ok: true, pong: true };
    return repo.guardar(body);
  }
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/noraves-planificacion.html')){
      return send(res, 200, fs.readFileSync(HTML), 'text/html; charset=utf-8');
    }
    const h = routes[`${req.method} ${url.pathname}`];
    if (!h) return send(res, 404, { error: 'No encontrado.' });
    const out = await h(req, url);
    send(res, 200, out);
  } catch (e){
    const status = e.status || 500;
    if (status >= 500) console.error(`[${new Date().toISOString()}] ${req.method} ${url.pathname}:`, e.message);
    send(res, status, { error: status >= 500 ? 'Error en el servidor: ' + e.message : e.message });
  }
}).listen(PORT, () => {
  console.log(`Noraves listo en http://localhost:${PORT}`);
  repo.salud().then(s => {
    if (!s.tablas) console.log('⚠ Conectado, pero faltan las tablas. Ejecuta: npm run db:init');
    else console.log(`✔ Base de datos: ${s.base} (${s.modo})`);
  }).catch(e => console.log('⚠ Sin conexión a la base de datos: ' + e.message + '\n  La app funcionará solo en el navegador hasta que se corrija el .env.'));
});
