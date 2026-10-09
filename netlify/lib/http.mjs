// Peticiones a las tiendas: respeta robots.txt, se identifica, limita el tiempo de espera
// y no hace más de 3 pedidos a la vez por tienda.
import { gunzipSync } from 'node:zlib';
import { AGENTE, parsearRobots, rutaPermitida } from './robots.mjs';

const UA = `Mozilla/5.0 (compatible; ${AGENTE}/1.0; comparador de precios estudiantil de Costa Rica)`;
const cacheRobots = new Map();   // origen -> { robots, vence }
const enCurso = new Map();       // origen -> número de pedidos activos

// Solo para pruebas automáticas: PINKY_FIXTURES apunta a un módulo que responde URLs con datos guardados.
let simulador = null;
async function simular(url) {
  if (!process.env.PINKY_FIXTURES) return null;
  if (!simulador) simulador = (await import(process.env.PINKY_FIXTURES)).default;
  return simulador(url);
}

async function crudo(url, { timeout = 8000, metodo = 'GET', cuerpo, encabezados = {} } = {}) {
  const sim = await simular(url);
  if (sim) {
    const body = typeof sim.body === 'string' ? sim.body : JSON.stringify(sim.body);
    return new Response(body, { status: sim.status || 200, headers: { 'content-type': sim.tipo || 'application/json' } });
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    return await fetch(url, {
      method: metodo, body: cuerpo, signal: ctl.signal, redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept-Language': 'es-CR,es;q=0.9', Accept: '*/*', ...encabezados }
    });
  } finally { clearTimeout(t); }
}

export async function robotsDe(origen) {
  const c = cacheRobots.get(origen);
  if (c && c.vence > Date.now()) return c.robots;
  let robots = { grupos: [], sitemaps: [] }, bloqueoTotal = false;
  try {
    const r = await crudo(origen + '/robots.txt', { timeout: 6000 });
    if (r.ok) robots = parsearRobots(await r.text());
    else if (r.status >= 500) bloqueoTotal = true; // el servidor falla: no insistimos
  } catch (e) { bloqueoTotal = true; }
  if (bloqueoTotal) robots = { grupos: [{ agentes: ['*'], reglas: [{ permitir: false, patron: '/' }] }], sitemaps: [], caido: true };
  cacheRobots.set(origen, { robots, vence: Date.now() + (bloqueoTotal ? 5 * 60e3 : 6 * 3600e3) });
  return robots;
}

export async function permitido(url) {
  const u = new URL(url);
  const robots = await robotsDe(u.origin);
  return rutaPermitida(robots, u.pathname + u.search);
}

async function turno(origen) {
  while ((enCurso.get(origen) || 0) >= 3) await new Promise((r) => setTimeout(r, 60));
  enCurso.set(origen, (enCurso.get(origen) || 0) + 1);
}
const liberar = (origen) => enCurso.set(origen, Math.max(0, (enCurso.get(origen) || 1) - 1));

export class Bloqueado extends Error { constructor(url) { super('robots.txt no permite ' + url); this.bloqueado = true; } }

// tipo: 'json' | 'texto' | 'bytes'
export async function pedir(url, { tipo = 'json', timeout = 8000, robots = true, metodo, cuerpo, encabezados } = {}) {
  if (robots && !(await permitido(url))) throw new Bloqueado(url);
  const origen = new URL(url).origin;
  await turno(origen);
  try {
    const r = await crudo(url, { timeout, metodo, cuerpo, encabezados });
    if (!r.ok) { const e = new Error(`HTTP ${r.status} en ${url}`); e.status = r.status; throw e; }
    if (tipo === 'json') return await r.json();
    if (tipo === 'bytes') {
      const buf = Buffer.from(await r.arrayBuffer());
      return url.endsWith('.gz') || (buf[0] === 0x1f && buf[1] === 0x8b) ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
    }
    return await r.text();
  } finally { liberar(origen); }
}

// Ejecuta tareas con un máximo de "n" al mismo tiempo
export async function enLotes(items, n, fn) {
  const res = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { res[k] = await fn(items[k], k); } catch (e) { res[k] = { error: e }; } }
  }));
  return res;
}

export const conLimite = (promesa, ms, mensaje = 'Tiempo de espera agotado') =>
  Promise.race([promesa, new Promise((_, rej) => setTimeout(() => rej(new Error(mensaje)), ms))]);
