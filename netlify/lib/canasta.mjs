// Índice de la canasta básica: una vez al día se busca cada producto en los supermercados conectados,
// se elige el más barato que cumple la descripción y se guarda su precio llevado a una presentación fija.
import { hayDB, rest, hoyCR } from './db.mjs';
import { normalizar, cantidadBase } from './texto.mjs';
import { tipoCambio, buscarVtex, buscarWoo } from './adaptadores.mjs';
import { tiendasEfectivas } from './servicios.mjs';
import { conLimite } from './http.mjs';

// debe: palabras obligatorias ("a|b" = cualquiera de las dos). evitar: palabras que descartan el producto.
// base: presentación de referencia (en kg o litros) para que todos los precios sean comparables.
export const CANASTA = [
  { id: 'arroz',    nombre: 'Arroz',            q: 'arroz',            debe: ['arroz'],    evitar: ['integral', 'harina', 'cereal', 'galleta', 'bebida', 'leche', 'pollo', 'mezcla', 'precocido', 'instantaneo'], base: 1.8, u: 'kg', ref: '1,8 kg' },
  { id: 'frijoles', nombre: 'Frijoles',         q: 'frijoles',         debe: ['frijol'],   evitar: ['molido', 'refrito', 'lata', 'sopa', 'salsa', 'tostado', 'bolsita', 'snack'], base: 0.8, u: 'kg', ref: '800 g' },
  { id: 'aceite',   nombre: 'Aceite vegetal',   q: 'aceite vegetal',   debe: ['aceite'],   evitar: ['oliva', 'motor', 'bebe', 'corporal', 'aerosol', 'coco', 'esencial', 'sesamo', 'aguacate', 'spray', 'cabello'], base: 1, u: 'l', ref: '1 litro' },
  { id: 'azucar',   nombre: 'Azúcar',           q: 'azucar',           debe: ['azucar'],   evitar: ['morena', 'glass', 'sin azucar', 'light', 'sustituto', 'stevia', 'splenda', 'sobres', 'galleta', 'cereal'], base: 2, u: 'kg', ref: '2 kg' },
  { id: 'cafe',     nombre: 'Café molido',      q: 'cafe molido',      debe: ['cafe'],     evitar: ['grano', 'soluble', 'instantaneo', 'capsula', 'frappe', 'licor', 'galleta', 'crema', 'cafetera', 'filtro', 'taza'], base: 0.5, u: 'kg', ref: '500 g' },
  { id: 'leche',    nombre: 'Leche',            q: 'leche entera',     debe: ['leche'],    evitar: ['polvo', 'condensada', 'evaporada', 'almendra', 'soya', 'coco', 'chocolate', 'avena', 'arroz', 'fresa', 'dulce', 'formula', 'bebe', 'cabra', 'semilla', 'galleta', 'corporal'], base: 1, u: 'l', ref: '1 litro' },
  { id: 'pasta',    nombre: 'Pasta espagueti',  q: 'spaghetti',        debe: ['spaghetti|espagueti|espaguetti|spagetti'], evitar: ['salsa', 'lata', 'integral', 'sin gluten'], base: 0.25, u: 'kg', ref: '250 g' },
  { id: 'atun',     nombre: 'Atún en lata',     q: 'atun',             debe: ['atun'],     evitar: ['galleta', 'gato', 'perro', 'mascota', 'pasta', 'ensalada lista', 'paté', 'pate'], base: 0.14, u: 'kg', ref: '140 g' },
  { id: 'harina',   nombre: 'Harina de trigo',  q: 'harina de trigo',  debe: ['harina'],   evitar: ['maiz', 'arroz', 'avena', 'integral', 'pancake', 'hotcake', 'galleta', 'almendra', 'coco', 'tempura', 'empanizar', 'pizza'], base: 1, u: 'kg', ref: '1 kg' },
  { id: 'avena',    nombre: 'Avena en hojuelas', q: 'avena hojuelas',  debe: ['avena'],    evitar: ['leche', 'bebida', 'galleta', 'barra', 'granola', 'cereal', 'liquida', 'colada', 'molida', 'integral con'], base: 0.4, u: 'kg', ref: '400 g' }
];

function cumple(item, oferta) {
  const t = ' ' + normalizar(`${oferta.nombre} ${oferta.categoria}`) + ' ';
  if (!item.debe.every((d) => d.split('|').some((x) => t.includes(normalizar(x))))) return false;
  if (item.evitar.some((x) => t.includes(' ' + normalizar(x)))) return false;
  const c = cantidadBase(oferta.nombre);
  return Boolean(c && c.u === item.u && c.cant >= item.base * 0.25 && c.cant <= item.base * 8);
}

export async function supermercados() {
  return (await tiendasEfectivas(true)).filter((t) => t.rubro === 'Supermercado' && ['vtex', 'woocommerce'].includes(t.plataformaReal));
}

// Busca la canasta del día y la guarda. Devuelve un resumen.
export async function actualizarCanasta({ tiempo = 24000 } = {}) {
  if (!hayDB()) return { error: 'Supabase no está configurado' };
  const ini = Date.now();
  const tc = (await tipoCambio()).venta;
  const supers = await supermercados();
  const filas = [];
  const fecha = hoyCR();
  await Promise.all(CANASTA.map(async (item) => {
    await Promise.all(supers.map(async (t) => {
      if (Date.now() - ini > tiempo) return;
      try {
        const tt = { ...t, moneda: t.monedaReal };
        const ofs = await conLimite(t.plataformaReal === 'vtex' ? buscarVtex(tt, item.q, tc, 40) : buscarWoo(tt, item.q, tc, 30), 9000);
        const candidatas = ofs.filter((o) => o.disponible && cumple(item, o))
          .map((o) => ({ o, norm: Math.round((o.precio / cantidadBase(o.nombre).cant) * item.base) }))
          .sort((a, b) => a.norm - b.norm);
        const mejor = candidatas[0];
        if (mejor) filas.push({ fecha, item: item.id, tienda_id: t.id, precio: mejor.norm, precio_real: mejor.o.precio, nombre: mejor.o.nombre.slice(0, 200), url: mejor.o.url });
      } catch (e) { /* esa tienda queda sin dato hoy */ }
    }));
  }));
  if (filas.length) await rest('canasta_historial?on_conflict=fecha,item,tienda_id', { metodo: 'POST', cuerpo: filas, prefer: 'resolution=merge-duplicates,return=minimal' });
  cacheSerie = null;
  return { fecha, supermercados: supers.map((t) => t.id), datos: filas.length, ms: Date.now() - ini };
}

let cacheSerie = null;
export async function serieCanasta() {
  if (!hayDB()) return { baseDeDatos: false, items: [], serie: [], tiendas: [] };
  if (cacheSerie && cacheSerie.vence > Date.now()) return cacheSerie.datos;
  const desde = new Date(Date.now() - 180 * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
  const filas = await rest(`canasta_historial?select=*&fecha=gte.${desde}&order=fecha.asc&limit=20000`);
  const dias = [...new Set(filas.map((f) => f.fecha))].sort();
  // Precio mínimo de cada producto por día (entre todos los supermercados)
  const minimo = new Map();
  for (const f of filas) {
    const k = f.fecha + '|' + f.item;
    if (!minimo.has(k) || f.precio < minimo.get(k).precio) minimo.set(k, f);
  }
  const primero = {};
  const serie = dias.map((d) => {
    let total = 0, n = 0, suma = 0;
    for (const it of CANASTA) {
      const m = minimo.get(d + '|' + it.id);
      if (!m) continue;
      primero[it.id] ??= m.precio;
      total += m.precio; n++;
      suma += m.precio / primero[it.id];
    }
    return { fecha: d, total, productos: n, indice: n ? Math.round((suma / n) * 1000) / 10 : null };
  }).filter((x) => x.productos >= Math.ceil(CANASTA.length / 2));
  const hoy = dias[dias.length - 1];
  const haceSemana = dias.filter((d) => d <= new Date(new Date(hoy || Date.now()).getTime() - 6 * 864e5).toISOString().slice(0, 10)).pop();
  const items = CANASTA.map((it) => {
    const h = hoy && minimo.get(hoy + '|' + it.id);
    const s = haceSemana && minimo.get(haceSemana + '|' + it.id);
    return { id: it.id, nombre: it.nombre, ref: it.ref, precio: h?.precio ?? null, tienda: h?.tienda_id ?? null, producto: h?.nombre ?? null, url: h?.url ?? null, semanaPasada: s?.precio ?? null };
  });
  // Total de la canasta hoy en cada supermercado (con los productos que tiene)
  const porTienda = {};
  for (const f of filas.filter((x) => x.fecha === hoy)) {
    const t = (porTienda[f.tienda_id] ||= { tienda: f.tienda_id, total: 0, productos: 0 });
    t.total += f.precio; t.productos++;
  }
  const datos = {
    baseDeDatos: true, hoy, dias: dias.length, items, serie,
    tiendas: Object.values(porTienda).sort((a, b) => b.productos - a.productos || a.total - b.total),
    totalProductos: CANASTA.length
  };
  cacheSerie = { datos, vence: Date.now() + 20 * 60e3 };
  return datos;
}
