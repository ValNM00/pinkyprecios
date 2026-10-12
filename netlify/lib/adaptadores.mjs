// Cómo leer los precios de cada tipo de tienda. Todas las funciones devuelven "ofertas" con la misma forma:
// { id, tienda, sku, ref, nombre, marca, modelo, ean, categoria, url, imagen, vendedor,
//   precio (colones), antes (colones o null), precioOriginal, moneda, disponible, cuotas }
import { pedir, robotsDe, Bloqueado } from './http.mjs';
import { normalizar, eanValido, extraerModelo } from './texto.mjs';

export const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const redondear = (n) => Math.round(Number(n) || 0);
const sinLargos = (s) => (/\d{9,}/.test(String(s || '')) ? '' : s);

function aColones(monto, moneda, tc) {
  if (moneda === 'USD') return tc ? Math.round(monto * tc) : null;
  return redondear(monto);
}

// ---------------- Tipo de cambio (Ministerio de Hacienda) ----------------
let tcCache = null;
export async function tipoCambio() {
  if (tcCache && tcCache.vence > Date.now()) return tcCache.dato;
  let dato;
  try {
    const d = await pedir('https://api.hacienda.go.cr/indicadores/tc/dolar', { timeout: 5000 });
    dato = { venta: Number(d.venta.valor), compra: Number(d.compra.valor), fecha: d.venta.fecha, fuente: 'Ministerio de Hacienda' };
  } catch (e) {
    dato = { venta: Number(process.env.TIPO_CAMBIO) || 460, compra: null, fecha: null, fuente: 'Valor de respaldo (Hacienda no respondió)', estimado: true };
  }
  tcCache = { dato, vence: Date.now() + 3 * 3600e3 };
  return dato;
}

// ---------------- VTEX (Walmart, Simán…) ----------------
function cuotasVtex(oferta) {
  const ins = oferta.Installments || [];
  let sin = null, con = null;
  for (const x of ins) {
    const n = x.NumberOfInstallments || 1;
    if (n < 2) continue;
    const tasa = Number(x.InterestRate) || 0;
    if (tasa === 0) {
      if (!sin || n > sin.meses) sin = { meses: n, cuota: redondear(x.Value), tarjetas: [x.PaymentSystemName] };
      else if (n === sin.meses && !sin.tarjetas.includes(x.PaymentSystemName)) sin.tarjetas.push(x.PaymentSystemName);
    } else if (!con || n > con.meses) {
      con = { meses: n, cuota: redondear(x.Value), total: redondear(x.TotalValuePlusInterestRate), tasa, tarjetas: [x.PaymentSystemName] };
    }
  }
  return sin || con ? { sinInteres: sin, conInteres: con } : null;
}

export function ofertasVtex(t, p, tc) {
  const cat = (p.categories?.[0] || '').split('/').filter(Boolean);
  const categoria = cat[1] || cat[0] || '';
  return (p.items || []).slice(0, 4).map((item) => {
    const vendedores = (item.sellers || []).map((s) => ({ s, o: s.commertialOffer || {} })).filter((x) => x.o.Price > 0);
    const disp = vendedores.filter((x) => x.o.IsAvailable !== false && (x.o.AvailableQuantity ?? 1) > 0);
    const mejor = (disp.length ? disp : vendedores).sort((a, b) => a.o.Price - b.o.Price)[0];
    if (!mejor) return null;
    const moneda = t.moneda === 'USD' ? 'USD' : 'CRC';
    const precio = aColones(mejor.o.Price, moneda, tc);
    const lista = Math.max(mejor.o.ListPrice || 0, mejor.o.PriceWithoutDiscount || 0);
    const antes = lista > mejor.o.Price * 1.01 ? aColones(lista, moneda, tc) : null;
    const nombre = (item.nameComplete && item.nameComplete.length > p.productName.length ? item.nameComplete : p.productName).trim();
    const propio = /walmart|siman|simán|default|principal/i.test(mejor.s.sellerName || '') || mejor.s.sellerDefault;
    return {
      id: `${t.id}:${item.itemId}`, tienda: t.id, sku: String(item.itemId), ref: String(item.itemId),
      nombre, marca: p.brand || '', categoria,
      modelo: extraerModelo(nombre, sinLargos(p.productReference), sinLargos(item.referenceId?.[0]?.Value)),
      ean: eanValido(item.ean),
      url: p.link || `${t.url}/${p.linkText}/p`,
      imagen: item.images?.[0]?.imageUrl || '',
      vendedor: propio ? '' : (mejor.s.sellerName || ''),
      precio, antes, precioOriginal: mejor.o.Price, moneda,
      disponible: disp.length > 0,
      cuotas: cuotasVtex(mejor.o)
    };
  }).filter((o) => o && o.precio);
}

export async function buscarVtex(t, q, tc, limite = 40) {
  const url = `${t.url}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(q)}&_from=0&_to=${limite - 1}`;
  const data = await pedir(url, { timeout: 7000 });
  if (!Array.isArray(data)) throw new Error('Respuesta inesperada de VTEX');
  return data.flatMap((p) => ofertasVtex(t, p, tc));
}

export async function refrescarVtex(t, sku, tc) {
  const data = await pedir(`${t.url}/api/catalog_system/pub/products/search?fq=skuId:${encodeURIComponent(sku)}`, { timeout: 7000 });
  if (!Array.isArray(data) || !data.length) return null;
  return ofertasVtex(t, data[0], tc).find((o) => o.sku === String(sku)) || null;
}

// ---------------- Shopify (iCon…) ----------------
export function filasShopify(t, p, moneda, tc) {
  return (p.variants || []).map((v) => {
    const monto = Number(v.price);
    const antesMonto = Number(v.compare_at_price) || 0;
    const nombre = p.title + (v.title && v.title !== 'Default Title' ? ' - ' + v.title : '');
    return {
      id: `${t.id}:${v.id}`, tienda_id: t.id, url: `${t.url}/products/${p.handle}?variant=${v.id}`,
      texto: normalizar(`${nombre} ${p.vendor} ${p.product_type} ${(p.tags || []).join(' ')}`).slice(0, 600),
      nombre, marca: p.vendor || '', sku: String(v.id), ref: p.handle,
      ean: eanValido(v.barcode), modelo: extraerModelo(nombre, sinLargos(v.sku)),
      imagen: (v.featured_image && v.featured_image.src) || p.images?.[0]?.src || '',
      categoria: p.product_type || '',
      precio: aColones(monto, moneda, tc), antes: antesMonto > monto ? aColones(antesMonto, moneda, tc) : null,
      precio_original: monto, moneda, disponible: v.available !== false,
      actualizado: new Date().toISOString()
    };
  }).filter((f) => f.precio);
}

export function monedaShopify(t, productos) {
  if (t.moneda && t.moneda !== 'auto') return t.moneda;
  const precios = productos.flatMap((p) => (p.variants || []).map((v) => Number(v.price))).filter((x) => x > 0).sort((a, b) => a - b);
  const mediana = precios[Math.floor(precios.length / 2)] || 0;
  return mediana && mediana < 4000 ? 'USD' : 'CRC';
}

export async function paginaShopify(t, pagina) {
  const d = await pedir(`${t.url}/products.json?limit=250&page=${pagina}`, { timeout: 9000 });
  return d.products || [];
}

export async function refrescarShopify(t, oferta, tc) {
  const p = await pedir(`${t.url}/products/${oferta.ref}.js`, { timeout: 7000 });
  const v = (p.variants || []).find((x) => String(x.id) === String(oferta.sku));
  if (!v) return null;
  const moneda = oferta.moneda || 'CRC';
  const monto = v.price / 100, antes = (v.compare_at_price || 0) / 100;
  return { ...oferta, precio: aColones(monto, moneda, tc), antes: antes > monto ? aColones(antes, moneda, tc) : null, precioOriginal: monto, disponible: v.available !== false };
}

export const filaAOferta = (f) => ({
  id: f.id, tienda: f.tienda_id, sku: f.sku, ref: f.ref || f.url, nombre: f.nombre, marca: f.marca || '', modelo: f.modelo || '', ean: f.ean || '',
  categoria: f.categoria || '', url: f.url, imagen: f.imagen || '', vendedor: '', precio: f.precio, antes: f.antes,
  precioOriginal: f.precio_original, moneda: f.moneda || 'CRC', disponible: f.disponible !== false, cuotas: null
});

// ---------------- Mapa del sitio + JSON-LD (Monge y tiendas Magento/WooCommerce) ----------------
const NO_PRODUCTO = /\/(blog|ayuda|help|politica|privacidad|terminos|condiciones|contacto|tiendas|sucursales|nosotros|about|careers|empleo|category|categoria|categorias|marcas|brand|promociones|cms|customer|account|checkout|cart|carrito|login|wishlist)(\/|$|\.)/i;

export function textoDeUrl(url) {
  try {
    const u = new URL(url);
    const partes = decodeURIComponent(u.pathname).replace(/\.(html?|php|aspx)$/i, '').split('/').filter(Boolean);
    return normalizar(partes.slice(-2).join(' '));
  } catch (e) { return ''; }
}

// Devuelve { urls, notas }: las notas explican qué pasó con cada mapa del sitio (para el diagnóstico)
export async function urlsDeSitemap(t, { limite = 40000, tiempo = 18000 } = {}) {
  const inicio = Date.now();
  const origen = new URL(t.url).origin;
  const robots = await robotsDe(origen);
  const cola = robots.sitemaps.length ? [...robots.sitemaps] : [origen + '/sitemap.xml'];
  const vistos = new Set();
  const urls = [];
  const notas = [];
  let leidos = 0;
  while (cola.length && urls.length < limite) {
    const resta = tiempo - (Date.now() - inicio);
    if (resta < 1500) { notas.push(`se acabó el tiempo con ${cola.length} mapas pendientes`); break; }
    const sm = cola.shift();
    let xml;
    try { xml = await pedir(sm, { tipo: 'bytes', timeout: Math.min(12000, resta) }); }
    catch (e) {
      const corto = sm.replace(/^https?:\/\/[^/]+/, '');
      notas.push(e.bloqueado ? `${corto}: bloqueado por robots.txt` : e.status ? `${corto}: HTTP ${e.status}` : `${corto}: ${/abort/i.test(e.message) ? 'tardó demasiado' : e.message.slice(0, 60)}`);
      continue;
    }
    leidos++;
    const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?\s*<\/loc>/g)].map((m) => m[1].trim().replace(/&amp;/g, '&'));
    if (/<sitemapindex/i.test(xml)) {
      const hijos = locs.filter((l) => /product|producto|catalog/i.test(l));
      cola.push(...(hijos.length ? hijos : locs).slice(0, 20));
      continue;
    }
    if (!locs.length) notas.push(`${sm.replace(/^https?:\/\/[^/]+/, '')}: no parece un mapa del sitio`);
    for (const u of locs) {
      if (urls.length >= limite) break;
      if (vistos.has(u) || NO_PRODUCTO.test(u) || u.includes('?')) continue;
      const texto = textoDeUrl(u);
      if (texto.split(' ').length < 2) continue;
      vistos.add(u);
      urls.push({ url: u, texto });
    }
  }
  notas.unshift(`${leidos} ${leidos === 1 ? 'mapa leído' : 'mapas leídos'}`);
  return { urls, notas };
}

function buscarProductoLd(nodo, salida = []) {
  if (!nodo || typeof nodo !== 'object') return salida;
  if (Array.isArray(nodo)) { nodo.forEach((n) => buscarProductoLd(n, salida)); return salida; }
  const tipo = [].concat(nodo['@type'] || []).map(String);
  if (tipo.some((x) => /^Product$/i.test(x))) salida.push(nodo);
  if (nodo['@graph']) buscarProductoLd(nodo['@graph'], salida);
  return salida;
}

const meta = (html, prop) => {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${prop}["'][^>]*>`, 'i');
  const m = html.match(re);
  return m ? (m[0].match(/content=["']([^"']*)["']/i) || [])[1] : undefined;
};

export function ofertaDePagina(t, url, html, tc) {
  const bloques = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  let prod = null;
  for (const b of bloques) {
    try { const encontrados = buscarProductoLd(JSON.parse(b.trim())); if (encontrados.length) { prod = encontrados[0]; break; } } catch (e) { /* bloque inválido */ }
  }
  let nombre, marca = '', sku = '', ean = '', imagen = '', precio, moneda = 'CRC', antes = null, disponible = true;
  if (prod) {
    nombre = prod.name;
    marca = typeof prod.brand === 'string' ? prod.brand : prod.brand?.name || '';
    sku = String(prod.sku || prod.mpn || '');
    ean = eanValido(prod.gtin13 || prod.gtin || prod.gtin12 || prod.gtin14 || prod.gtin8);
    const img = Array.isArray(prod.image) ? prod.image[0] : prod.image;
    imagen = typeof img === 'string' ? img : img?.url || '';
    const ofs = [].concat(prod.offers || []).flatMap((o) => (o.offers ? [].concat(o.offers) : [o]));
    const o = ofs.filter((x) => Number(x.price || x.lowPrice) > 0).sort((a, b) => Number(a.price || a.lowPrice) - Number(b.price || b.lowPrice))[0];
    if (o) {
      precio = Number(o.price || o.lowPrice);
      moneda = (o.priceCurrency || 'CRC').toUpperCase();
      disponible = !/OutOfStock|SoldOut|Discontinued/i.test(String(o.availability || ''));
      const alto = Number(o.priceSpecification?.price || o.highPrice || 0);
      if (alto > precio * 1.01) antes = alto;
    }
  }
  if (!precio) {
    precio = Number(meta(html, 'product:price:amount') || meta(html, 'og:price:amount') || meta(html, 'price'));
    moneda = (meta(html, 'product:price:currency') || meta(html, 'og:price:currency') || 'CRC').toUpperCase();
    nombre = nombre || meta(html, 'og:title');
    imagen = imagen || meta(html, 'og:image') || '';
  }
  if (!precio || !nombre) return null;
  if (moneda !== 'USD') moneda = 'CRC';
  const precioCol = aColones(precio, moneda, tc);
  return {
    id: `${t.id}:${sku ? normalizar(sku).replace(/ /g, '') : hash(url)}`, tienda: t.id, sku, ref: url,
    nombre: String(nombre).replace(/\s+/g, ' ').trim(), marca, modelo: extraerModelo(nombre, sinLargos(sku)), ean,
    categoria: '', url, imagen, vendedor: '', precio: precioCol, antes: antes ? aColones(antes, moneda, tc) : null,
    precioOriginal: precio, moneda, disponible, cuotas: null
  };
}

export async function leerPagina(t, url, tc) {
  const html = await pedir(url, { tipo: 'texto', timeout: 7000 });
  return ofertaDePagina(t, url, html, tc);
}

// ---------------- Detección automática de plataforma ----------------
export async function detectar(t) {
  const notas = [];
  try {
    const d = await pedir(`${t.url}/api/catalog_system/pub/products/search?_from=0&_to=0`, { timeout: 7000 });
    if (Array.isArray(d)) return { plataforma: 'vtex', detalle: 'API de catálogo VTEX disponible' };
  } catch (e) { notas.push(e.bloqueado ? 'VTEX: bloqueado por robots.txt' : 'VTEX: no'); }
  try {
    const d = await pedir(`${t.url}/products.json?limit=1`, { timeout: 7000 });
    if (d && Array.isArray(d.products) && d.products.length) return { plataforma: 'shopify', detalle: 'Catálogo público de Shopify disponible' };
  } catch (e) { notas.push(e.bloqueado ? 'Shopify: bloqueado por robots.txt' : 'Shopify: no'); }
  try {
    const robots = await robotsDe(new URL(t.url).origin);
    if (robots.caido) return { plataforma: 'ninguna', detalle: 'El sitio no respondió' };
    if (robots.sitemaps.length) return { plataforma: 'sitemap', detalle: 'Se usará el mapa del sitio' };
    await pedir(new URL(t.url).origin + '/sitemap.xml', { tipo: 'bytes', timeout: 7000 });
    return { plataforma: 'sitemap', detalle: 'Se usará el mapa del sitio' };
  } catch (e) { notas.push(e.bloqueado ? 'Mapa del sitio: bloqueado por robots.txt' : 'Mapa del sitio: no encontrado'); }
  return { plataforma: 'ninguna', detalle: notas.join(' · ') };
}

export { Bloqueado };
