// Lógica principal: buscar, ver un producto, portada, actualizar precios, indexar catálogos, diagnóstico y alertas.
import { TIENDAS } from './tiendas.mjs';
import { enLotes, conLimite } from './http.mjs';
import { relevancia, terminos, agrupar, armarGrupo, normalizar, SINONIMOS } from './texto.mjs';
import {
  tipoCambio, buscarVtex, refrescarVtex, paginaShopify, filasShopify, monedaShopify, refrescarShopify,
  filaAOferta, urlsDeSitemap, leerPagina, detectar, hash
} from './adaptadores.mjs';
import { hayDB, rest, lista, guardarOfertas, guardarPaginas, tiendasDB, guardarTienda, filaAOfertaDB, hoyCR } from './db.mjs';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const haceDias = (d) => new Date(Date.now() - d * 864e5).toISOString();
const fechaHaceDias = (d) => new Date(Date.now() - d * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

// ---------------- Tiendas con su estado guardado ----------------
let cacheTiendas = null;
export async function tiendasEfectivas(forzar = false) {
  if (!forzar && cacheTiendas && cacheTiendas.vence > Date.now()) return cacheTiendas.lista;
  const filas = await tiendasDB();
  const m = new Map(filas.map((r) => [r.id, r]));
  const lista = TIENDAS.map((t) => {
    const r = m.get(t.id) || {};
    return {
      ...t,
      plataformaReal: t.plataforma === 'auto' ? (r.plataforma_detectada || 'auto') : t.plataforma,
      monedaReal: r.moneda_detectada || t.moneda,
      estado: r.estado || null, detalle: r.detalle || '', revisado: r.revisado || null,
      indexadoEn: r.indexado_en || null, indexados: r.productos_indexados || 0, cursor: r.cursor || null
    };
  });
  cacheTiendas = { lista, vence: Date.now() + 60e3 };
  return lista;
}

const resumenTienda = (t) => ({ id: t.id, nombre: t.nombre, url: t.url, plataforma: t.plataformaReal, estado: t.estado, detalle: t.detalle, revisado: t.revisado, indexados: t.indexados });

// ---------------- Búsqueda en vivo ----------------
function umbral(q) { const n = terminos(q).length; return n <= 3 ? 1 : 0.75; }

async function buscarEnIndice(tiendaId, q, limite) {
  const ts = terminos(q).slice(0, 6);
  if (!ts.length) return [];
  const condiciones = ts.map((t) => {
    const alts = [t, ...(SINONIMOS[t] || [])].map((x) => x.replace(/[^a-z0-9]/g, '')).filter(Boolean);
    return alts.length > 1 ? `or(${alts.map((a) => `texto.ilike.*${a}*`).join(',')})` : `texto.ilike.*${alts[0]}*`;
  });
  return rest(`paginas?select=*&tienda_id=eq.${tiendaId}&and=(${condiciones.join(',')})&order=disponible.desc.nullslast&limit=${limite}`);
}

const cacheBusquedas = new Map();

export async function buscar(q, alTerminar = (p) => p) {
  q = String(q || '').trim().slice(0, 80);
  if (normalizar(q).length < 2) return { error: 'Escribí al menos 2 letras' };
  const llave = normalizar(q);
  const c = cacheBusquedas.get(llave);
  if (c && c.vence > Date.now()) return c.resultado;

  const t0 = Date.now();
  const tc = (await tipoCambio()).venta;
  const tiendas = await tiendasEfectivas();
  const estados = {};
  const encontradas = [];

  const tareas = tiendas.map(async (t) => {
    const ini = Date.now();
    estados[t.id] = { estado: 'lento', detalle: 'La tienda tardó demasiado en responder' };
    try {
      let ofs = [];
      const tt = { ...t, moneda: t.monedaReal };
      if (t.plataformaReal === 'vtex') {
        ofs = await conLimite(buscarVtex(tt, q, tc), 8000);
      } else if (t.plataformaReal === 'shopify' || t.plataformaReal === 'sitemap') {
        if (!hayDB()) { estados[t.id] = { estado: 'pendiente', detalle: 'Necesita la base de datos para guardar su catálogo' }; return; }
        if (!t.indexados && !t.indexadoEn && !t.cursor) { estados[t.id] = { estado: 'pendiente', detalle: 'Su catálogo todavía no se ha indexado' }; return; }
        const filas = await buscarEnIndice(t.id, q, t.plataformaReal === 'sitemap' ? 6 : 40);
        if (t.plataformaReal === 'shopify') ofs = filas.map(filaAOferta);
        else ofs = (await enLotes(filas, 3, (f) => conLimite(leerPagina(tt, f.url, tc), 6500))).filter((o) => o && !o.error);
      } else {
        estados[t.id] = t.plataformaReal === 'auto'
          ? { estado: 'pendiente', detalle: 'Todavía no se detecta cómo leer esta tienda' }
          : { estado: 'no_disponible', detalle: t.detalle || 'La tienda no ofrece datos públicos que se puedan leer' };
        return;
      }
      const u = umbral(q);
      let buenas = ofs.filter((o) => relevancia(q, `${o.nombre} ${o.marca} ${o.categoria}`) >= u);
      if (!buenas.length && u === 1) buenas = ofs.filter((o) => relevancia(q, `${o.nombre} ${o.marca} ${o.categoria}`) >= 0.5);
      estados[t.id] = { estado: buenas.length ? 'ok' : 'sin_resultados', n: buenas.length, ms: Date.now() - ini };
      encontradas.push(...buenas);
    } catch (e) {
      estados[t.id] = e.bloqueado
        ? { estado: 'bloqueado', detalle: 'La tienda no permite que los robots lean esta sección (robots.txt)' }
        : { estado: 'error', detalle: String(e.message || e).slice(0, 160) };
    }
  });
  await Promise.race([Promise.all(tareas), dormir(9000)]);

  const grupos = agrupar(encontradas.map((o) => ({ ...o })))
    .map((g) => ({ ...g, relevancia: Math.max(...g.ofertas.map((o) => relevancia(q, `${o.nombre} ${o.marca} ${o.categoria}`))) }))
    .sort((a, b) => b.relevancia - a.relevancia || b.tiendas - a.tiendas || (a.desde ?? 1e12) - (b.desde ?? 1e12))
    .slice(0, 90);

  const resultado = {
    q, tipoCambio: tc, ms: Date.now() - t0, grupos,
    tiendas: tiendas.map((t) => ({ id: t.id, nombre: t.nombre, ...estados[t.id] }))
  };
  cacheBusquedas.set(llave, { resultado, vence: Date.now() + 10 * 60e3 });
  if (hayDB()) {
    alTerminar((async () => {
      await guardarOfertas(encontradas);
      if (grupos.length) await rest('rpc/registrar_busqueda', { metodo: 'POST', cuerpo: { t: llave } });
    })().catch((e) => console.error('No se pudo guardar la búsqueda:', e.message)));
  }
  return resultado;
}

// ---------------- Análisis del historial ----------------
export function analizar(ofertas, historial) {
  const porOferta = {};
  for (const h of historial) (porOferta[h.oferta_id] ||= []).push(h);
  const disp = ofertas.filter((o) => o.disponible);
  const actual = disp.length ? Math.min(...disp.map((o) => o.precio)) : null;

  const porDia = new Map();
  for (const h of historial) porDia.set(h.fecha, Math.min(porDia.get(h.fecha) ?? Infinity, h.precio));
  const dias = [...porDia.keys()].sort();
  const desde = dias[0] || null;

  const inflados = {};
  const limiteViejo = fechaHaceDias(25), limite90 = fechaHaceDias(90);
  for (const o of ofertas) {
    if (!o.antes || o.antes <= o.precio) continue;
    const viejos = (porOferta[o.id] || []).filter((h) => h.fecha <= limiteViejo && h.fecha >= limite90);
    inflados[o.id] = viejos.length ? Math.min(...viejos.map((h) => h.precio)) <= o.precio * 1.03 : null;
  }

  let momento;
  if (actual == null) momento = { nivel: 'agotado', titulo: 'Agotado', texto: 'Ninguna tienda lo tiene disponible en este momento.' };
  else if (dias.length < 7) momento = { nivel: 'registrando', titulo: 'Estamos registrando este precio', texto: desde ? `Guardamos su precio todos los días desde el ${desde}. Con una semana de datos te decimos si es buen momento para comprar.` : 'Desde hoy guardamos su precio todos los días. Con una semana de datos te decimos si es buen momento para comprar.' };
  else {
    const recientes = dias.filter((d) => d >= limite90).map((d) => porDia.get(d));
    const min = Math.min(...recientes, actual);
    const prom = Math.round(recientes.reduce((a, b) => a + b, 0) / recientes.length);
    if (actual <= min * 1.01) momento = { nivel: 'bueno', titulo: 'Buen momento para comprar', texto: `Es el precio más bajo que hemos registrado en ${recientes.length} días.` };
    else if (actual > prom * 1.02) momento = { nivel: 'esperar', titulo: 'Mejor esperar un poquito', texto: `Está ${Math.round((actual / prom - 1) * 100)}% por encima del promedio de ${recientes.length} días. Llegó a costar menos.`, min, prom };
    else momento = { nivel: 'normal', titulo: 'Precio normal', texto: `Está cerca del promedio de los últimos ${recientes.length} días.`, min, prom };
    momento.min = min; momento.prom = prom;
  }
  return { desde, dias: dias.length, momento, inflados };
}

// ---------------- Producto (por ids de ofertas) ----------------
export async function producto(ids, { expandir = true } = {}) {
  ids = [...new Set(ids)].filter(Boolean).slice(0, 40);
  if (!ids.length) return { error: 'Faltan productos' };
  if (!hayDB()) return { sinDB: true };
  let filas = await rest(`ofertas?select=*&id=in.${lista(ids)}`);
  let ofertas = filas.map(filaAOfertaDB);
  if (expandir && ofertas.length) {
    const eans = [...new Set(ofertas.map((o) => o.ean).filter(Boolean))];
    const modelos = [...new Set(ofertas.map((o) => o.modelo).filter((m) => m && m.length >= 6))];
    const ors = [eans.length && `ean.in.${lista(eans)}`, modelos.length && `modelo.in.${lista(modelos)}`].filter(Boolean);
    if (ors.length) {
      const extra = (await rest(`ofertas?select=*&or=(${ors.join(',')})&limit=40`)).map(filaAOfertaDB);
      const todos = [...new Map([...ofertas, ...extra].map((o) => [o.id, o])).values()];
      const grupos = agrupar(todos.map((o) => ({ ...o })));
      const propios = new Set(ids);
      ofertas = grupos.filter((g) => g.ofertas.some((o) => propios.has(o.id))).flatMap((g) => g.ofertas);
    }
  }
  if (!ofertas.length) return { error: 'No encontramos ese producto' };
  const todosIds = ofertas.map((o) => o.id);
  const historial = await rest(`historial_precios?select=oferta_id,fecha,precio&oferta_id=in.${lista(todosIds)}&fecha=gte.${fechaHaceDias(120)}&order=fecha.asc&limit=5000`);
  const grupo = armarGrupo(ofertas);
  return { grupo, historial, analisis: analizar(ofertas, historial) };
}

// ---------------- Portada ----------------
export async function inicio() {
  const tc = await tipoCambio();
  const tiendas = (await tiendasEfectivas()).map(resumenTienda);
  if (!hayDB()) return { tipoCambio: tc, tiendas, baseDeDatos: false, rebajas: [], populares: [], ranking: [], stats: null };

  const [conteo, hist, rebajasFilas, populares, paraRanking] = await Promise.all([
    rest('ofertas?select=id&limit=1', { contar: true }),
    rest('historial_precios?select=fecha&order=fecha.asc&limit=1', { contar: true }),
    rest(`ofertas?select=*&disponible=is.true&descuento=gte.0.08&actualizado=gte.${haceDias(3)}&order=descuento.desc&limit=40`),
    rest('busquedas?select=termino,veces&order=veces.desc,ultima.desc&limit=10'),
    rest(`ofertas?select=id,tienda_id,precio,ean,modelo,marca&disponible=is.true&actualizado=gte.${haceDias(7)}&limit=20000`)
  ]);

  // Rebajas: sin repetir producto y descartando las que el historial muestra como infladas
  const vistos = new Set();
  let rebajas = rebajasFilas.map(filaAOfertaDB).filter((o) => { const k = normalizar(o.nombre); if (vistos.has(k)) return false; vistos.add(k); return true; }).slice(0, 18);
  if (rebajas.length) {
    const h = await rest(`historial_precios?select=oferta_id,fecha,precio&oferta_id=in.${lista(rebajas.map((o) => o.id))}&fecha=gte.${fechaHaceDias(90)}&limit=5000`);
    const { inflados } = analizar(rebajas, h);
    rebajas = rebajas.filter((o) => inflados[o.id] !== true).map((o) => ({ ...o, confirmada: inflados[o.id] === false })).slice(0, 12);
  }

  // Ranking: cuántas veces cada tienda tiene el precio más bajo en productos que venden 2 o más tiendas
  // Une filas que comparten código de barras o modelo (como en la búsqueda)
  const filasR = (paraRanking.datos ?? paraRanking).filter((f) => f.ean || (f.modelo && f.modelo.length >= 6));
  const padre = filasR.map((_, i) => i);
  const raiz = (i) => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  const vistoK = new Map();
  filasR.forEach((f, i) => {
    for (const k of [f.ean && 'e:' + f.ean, f.modelo && f.modelo.length >= 6 && 'm:' + f.modelo].filter(Boolean)) {
      if (vistoK.has(k)) padre[raiz(i)] = raiz(vistoK.get(k)); else vistoK.set(k, i);
    }
  });
  const grupos = new Map();
  filasR.forEach((f, i) => {
    const k = raiz(i);
    if (!grupos.has(k)) grupos.set(k, new Map());
    const g = grupos.get(k);
    g.set(f.tienda_id, Math.min(g.get(f.tienda_id) ?? Infinity, f.precio));
  });
  const rank = {};
  let comparables = 0;
  for (const g of grupos.values()) {
    if (g.size < 2) continue;
    comparables++;
    const min = Math.min(...g.values());
    for (const [tid, p] of g) {
      const r = (rank[tid] ||= { tienda: tid, productos: 0, gana: 0, sobre: 0 });
      r.productos++; if (p === min) r.gana++; r.sobre += p / min - 1;
    }
  }
  const ranking = Object.values(rank).map((r) => ({ ...r, promedioSobre: r.productos ? r.sobre / r.productos : 0 }))
    .sort((a, b) => b.gana / b.productos - a.gana / a.productos || b.gana - a.gana);

  return {
    tipoCambio: tc, tiendas, baseDeDatos: true,
    stats: { ofertas: conteo.total, registros: hist.total, desde: hist.datos?.[0]?.fecha || null, comparables },
    rebajas, populares, ranking
  };
}

// ---------------- Actualización programada de precios ----------------
export async function actualizar({ tiempo = 22000, limite = 60 } = {}) {
  if (!hayDB()) return { error: 'Supabase no está configurado' };
  const ini = Date.now();
  const tc = (await tipoCambio()).venta;
  const tiendas = new Map((await tiendasEfectivas(true)).map((t) => [t.id, t]));
  const viejas = (await rest(`ofertas?select=*&actualizado=lt.${new Date(Date.now() - 5 * 3600e3).toISOString()}&order=actualizado.asc&limit=${limite}`)).map(filaAOfertaDB);
  const nuevas = [];
  let errores = 0;
  await enLotes(viejas, 4, async (o) => {
    if (Date.now() - ini > tiempo) return;
    const t = tiendas.get(o.tienda);
    if (!t) return;
    const tt = { ...t, moneda: o.moneda || t.monedaReal };
    try {
      let r = null;
      if (t.plataformaReal === 'vtex') r = await refrescarVtex(tt, o.sku, tc);
      else if (t.plataformaReal === 'shopify') r = await refrescarShopify(tt, o, tc);
      else r = await leerPagina(tt, o.url, tc);
      nuevas.push(r ? { ...o, ...r, id: o.id } : { ...o, disponible: false });
    } catch (e) {
      if (e.status === 404) nuevas.push({ ...o, disponible: false });
      else errores++;
    }
  });
  await guardarOfertas(nuevas);
  const alertas = await revisarAlertas();
  return { revisadas: viejas.length, actualizadas: nuevas.length, errores, alertasCumplidas: alertas, ms: Date.now() - ini };
}

export async function revisarAlertas() {
  const als = await rest('alertas?select=*&cumplida_en=is.null&limit=300');
  if (!als.length) return 0;
  const ids = [...new Set(als.flatMap((a) => a.oferta_ids || []))];
  const ofs = ids.length ? (await rest(`ofertas?select=id,tienda_id,precio,disponible,nombre,url&id=in.${lista(ids)}`)) : [];
  const m = new Map(ofs.map((o) => [o.id, o]));
  let cumplidas = 0;
  for (const a of als) {
    const disp = (a.oferta_ids || []).map((id) => m.get(id)).filter((o) => o && o.disponible);
    if (!disp.length) continue;
    const mejor = disp.sort((x, y) => x.precio - y.precio)[0];
    if (mejor.precio > a.precio_objetivo) continue;
    cumplidas++;
    let notificada = false;
    if (a.correo && process.env.RESEND_API_KEY) {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: process.env.CORREO_REMITENTE || 'PinkyPrecios <onboarding@resend.dev>',
            to: [a.correo],
            subject: `¡Bajó de precio! ${a.nombre}`,
            html: `<p>Hola,</p><p><b>${a.nombre}</b> llegó a <b>₡${mejor.precio.toLocaleString('es-CR')}</b> en ${mejor.tienda_id}. Tu precio objetivo era ₡${a.precio_objetivo.toLocaleString('es-CR')}.</p><p><a href="${mejor.url}">Ver en la tienda</a></p><p>— PinkyPrecios</p>`
          })
        });
        notificada = r.ok;
      } catch (e) { /* se intenta en la próxima corrida */ }
    }
    await rest(`alertas?id=eq.${a.id}`, { metodo: 'PATCH', cuerpo: { cumplida_en: new Date().toISOString(), precio_encontrado: mejor.precio, tienda_encontrada: mejor.tienda_id, notificada }, prefer: 'return=minimal' });
  }
  return cumplidas;
}

// ---------------- Indexación de catálogos (Shopify y mapas del sitio) ----------------
export async function indexar({ tiempo = 20000 } = {}) {
  if (!hayDB()) return { error: 'Supabase no está configurado' };
  const ini = Date.now();
  const tiendas = await tiendasEfectivas(true);
  const base = (t) => ({ id: t.id, nombre: t.nombre, url: t.url, plataforma: t.plataforma });

  // 1) Detectar tiendas nuevas en modo automático
  const sinDetectar = tiendas.find((t) => t.plataforma === 'auto' && t.plataformaReal === 'auto');
  if (sinDetectar) {
    const d = await detectar(sinDetectar);
    await guardarTienda({ ...base(sinDetectar), plataforma_detectada: d.plataforma, estado: d.plataforma === 'ninguna' ? 'no_disponible' : 'pendiente', detalle: d.detalle });
    cacheTiendas = null;
    return { tienda: sinDetectar.id, detectada: d };
  }

  // 2) Indexar la tienda con el índice más viejo (o continuar una que quedó a medias)
  const indexables = tiendas.filter((t) => ['shopify', 'sitemap'].includes(t.plataformaReal))
    .filter((t) => t.cursor || !t.indexadoEn || Date.now() - new Date(t.indexadoEn).getTime() > 20 * 3600e3)
    .sort((a, b) => (b.cursor ? 1 : 0) - (a.cursor ? 1 : 0) || new Date(a.indexadoEn || 0) - new Date(b.indexadoEn || 0));
  const t = indexables[0];
  if (!t) return { mensaje: 'Todos los catálogos están al día' };

  const tc = (await tipoCambio()).venta;
  try {
    if (t.plataformaReal === 'shopify') {
      let pagina = Number(t.cursor) || 1, total = 0, moneda = t.monedaReal, terminado = false;
      while (Date.now() - ini < tiempo) {
        const prods = await paginaShopify(t, pagina);
        if (moneda === 'auto') moneda = monedaShopify(t, prods);
        const filas = prods.flatMap((p) => filasShopify(t, p, moneda, tc));
        await guardarPaginas(filas);
        total += filas.length;
        if (prods.length < 250) { terminado = true; break; }
        pagina++;
      }
      await guardarTienda({
        ...base(t), moneda_detectada: moneda, estado: total || t.indexados ? 'ok' : 'sin_resultados', detalle: `Catálogo de Shopify (precios en ${moneda === 'USD' ? 'dólares, convertidos a colones' : 'colones'})`,
        cursor: terminado ? null : String(pagina), ...(terminado ? { indexado_en: new Date().toISOString() } : {}),
        productos_indexados: terminado ? (Number(t.cursor) > 1 ? t.indexados + total : total) : t.indexados + total
      });
      cacheTiendas = null;
      return { tienda: t.id, filas: total, terminado };
    }
    const urls = await urlsDeSitemap(t, { tiempo: Math.max(5000, tiempo - (Date.now() - ini) - 6000), limite: 15000 });
    const ahora = new Date().toISOString();
    await guardarPaginas(urls.map((u) => ({ id: `${t.id}:${hash(u.url)}`, tienda_id: t.id, url: u.url, texto: u.texto, actualizado: ahora })));
    await guardarTienda({
      ...base(t), estado: urls.length ? 'ok' : 'no_disponible',
      detalle: urls.length ? 'Mapa del sitio indexado; los precios se leen de cada página' : 'No se encontraron páginas de producto en el mapa del sitio',
      cursor: null, indexado_en: ahora, productos_indexados: urls.length
    });
    cacheTiendas = null;
    return { tienda: t.id, urls: urls.length };
  } catch (e) {
    await guardarTienda({ ...base(t), estado: e.bloqueado ? 'bloqueado' : 'error', detalle: String(e.message).slice(0, 200), indexado_en: new Date().toISOString(), cursor: null });
    cacheTiendas = null;
    return { tienda: t.id, error: e.message };
  }
}

// ---------------- Diagnóstico de tiendas ----------------
export async function diagnostico() {
  const tc = (await tipoCambio()).venta;
  const tiendas = await tiendasEfectivas(true);
  const resultados = await Promise.all(tiendas.map(async (t) => {
    const ini = Date.now();
    let r;
    try {
      let plataforma = t.plataformaReal, detalleDet = '';
      if (t.plataforma === 'auto') { const d = await conLimite(detectar(t), 8000); plataforma = d.plataforma; detalleDet = d.detalle; }
      if (plataforma === 'vtex') {
        const ofs = await conLimite(buscarVtex({ ...t, moneda: t.monedaReal }, 'televisor', tc, 5), 8000);
        const ej = ofs[0];
        r = { plataforma, estado: ofs.length ? 'ok' : 'sin_resultados', detalle: ej ? `Búsqueda en vivo OK. Ejemplo: ${ej.nombre} a ₡${ej.precio.toLocaleString('es-CR')}` : 'La API respondió pero sin productos' };
      } else if (plataforma === 'shopify') {
        const prods = await conLimite(paginaShopify(t, 1), 8000);
        r = { plataforma, estado: prods.length ? 'ok' : 'sin_resultados', detalle: prods.length ? `Catálogo público OK (${t.indexados} productos indexados)` : 'Catálogo vacío' };
      } else if (plataforma === 'sitemap') {
        r = { plataforma, estado: t.indexados ? 'ok' : 'pendiente', detalle: t.indexados ? `${t.indexados} páginas indexadas del mapa del sitio` : (detalleDet || 'Falta indexar el mapa del sitio') };
      } else {
        r = { plataforma, estado: plataforma === 'auto' ? 'pendiente' : 'no_disponible', detalle: detalleDet || t.detalle || 'Sin datos públicos legibles' };
      }
    } catch (e) {
      r = { plataforma: t.plataformaReal, estado: e.bloqueado ? 'bloqueado' : 'error', detalle: e.bloqueado ? 'robots.txt no permite leer esta tienda' : String(e.message).slice(0, 160) };
    }
    r.ms = Date.now() - ini;
    if (hayDB()) {
      await guardarTienda({ id: t.id, nombre: t.nombre, url: t.url, plataforma: t.plataforma, estado: r.estado, detalle: r.detalle, ...(t.plataforma === 'auto' && r.plataforma !== 'auto' ? { plataforma_detectada: r.plataforma } : {}) }).catch(() => {});
    }
    return { id: t.id, nombre: t.nombre, url: t.url, ...r };
  }));
  cacheTiendas = null;
  return { fecha: new Date().toISOString(), baseDeDatos: hayDB(), tipoCambio: await tipoCambio(), tiendas: resultados };
}

// ---------------- Alertas ----------------
export async function crearAlerta({ ids, nombre, correo, objetivo }) {
  ids = (Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string').slice(0, 40);
  objetivo = Math.round(Number(objetivo));
  correo = String(correo || '').trim().slice(0, 200);
  if (!ids.length || !objetivo || objetivo < 100) return { error: 'Datos de la alerta incompletos' };
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return { error: 'Correo inválido' };
  if (!hayDB()) return { error: 'La base de datos no está configurada; la alerta queda solo en este navegador' };
  const [fila] = await rest('alertas', { metodo: 'POST', cuerpo: { oferta_ids: ids, nombre: String(nombre || '').slice(0, 200), correo: correo || null, precio_objetivo: objetivo }, prefer: 'return=representation' });
  return { id: fila.id };
}

export async function estadoAlertas(idsAlertas) {
  const ids = (idsAlertas || []).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50);
  if (!ids.length || !hayDB()) return { alertas: [] };
  const filas = await rest(`alertas?select=id,cumplida_en,precio_encontrado,tienda_encontrada&id=in.${lista(ids)}`);
  return { alertas: filas };
}

export { hoyCR };
