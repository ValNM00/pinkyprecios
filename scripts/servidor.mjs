// Servidor local: sirve la página y las funciones /api/* igual que Netlify.
// Uso: npm start   (lee las variables de un archivo .env si existe)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Variables de entorno desde .env
const env = path.join(raiz, '.env');
if (fs.existsSync(env)) {
  for (const linea of fs.readFileSync(env, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// Cargar las funciones y sus rutas
const rutas = new Map();
const dirFn = path.join(raiz, 'netlify', 'functions');
for (const f of fs.readdirSync(dirFn).filter((x) => x.endsWith('.mjs'))) {
  const mod = await import(pathToFileURL(path.join(dirFn, f)).href);
  if (mod.config?.path) rutas.set(mod.config.path, mod.default);
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const fn = rutas.get(url.pathname);
  if (fn) {
    const cuerpo = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await new Promise((ok) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => ok(d)); }) : undefined;
    const pedido = new Request(url, { method: req.method, headers: req.headers, body: cuerpo });
    const pendientes = [];
    const respuesta = await fn(pedido, { waitUntil: (p) => pendientes.push(p) });
    res.writeHead(respuesta.status, Object.fromEntries(respuesta.headers));
    res.end(Buffer.from(await respuesta.arrayBuffer()));
    Promise.allSettled(pendientes);
    return;
  }
  const publico = path.join(raiz, 'public');
  let archivo = path.join(publico, decodeURIComponent(url.pathname));
  if (!archivo.startsWith(publico)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(archivo) && fs.statSync(archivo).isDirectory()) archivo = path.join(archivo, 'index.html');
  let estado = 200;
  if (!fs.existsSync(archivo)) { archivo = path.join(publico, '404.html'); estado = 404; } // igual que Netlify
  res.writeHead(estado, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
  fs.createReadStream(archivo).pipe(res);
});

const puerto = Number(process.env.PORT) || 8888;
servidor.listen(puerto, () => {
  console.log(`PinkyPrecios en http://localhost:${puerto}`);
  console.log(`Base de datos: ${process.env.SUPABASE_URL ? 'Supabase configurado' : 'sin configurar (solo búsqueda en vivo)'}`);
});
