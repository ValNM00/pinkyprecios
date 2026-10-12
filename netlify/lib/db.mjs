// Acceso a Supabase (API REST de PostgREST) con la clave de servicio.
// La clave vive solo en las variables de entorno de Netlify, nunca en el navegador.
const base = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const clave = () => process.env.SUPABASE_SERVICE_KEY || '';
export const hayDB = () => Boolean(base() && clave());

export async function rest(ruta, { metodo = 'GET', cuerpo, prefer, contar = false } = {}) {
  if (!hayDB()) throw new Error('Supabase no está configurado');
  // Funciona con la clave nueva (sb_secret_…) y con la antigua service_role (un JWT que empieza con eyJ)
  const headers = { apikey: clave(), 'Content-Type': 'application/json' };
  if (clave().startsWith('eyJ')) headers.Authorization = 'Bearer ' + clave();
  if (prefer || contar) headers.Prefer = [prefer, contar && 'count=exact'].filter(Boolean).join(',');
  const r = await fetch(`${base()}/rest/v1/${ruta}`, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const txt = await r.text();
  const datos = txt ? JSON.parse(txt) : null;
  if (contar) return { datos, total: Number((r.headers.get('content-range') || '').split('/')[1]) || 0 };
  return datos;
}

export const lista = (vals) => `(${vals.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(',')})`;
export const hoyCR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

const filaOferta = (o) => ({
  id: o.id, tienda_id: o.tienda, sku: o.sku, ref: o.ref, nombre: o.nombre, marca: o.marca || null, modelo: o.modelo || null,
  ean: o.ean || null, categoria: o.categoria || null, url: o.url, imagen: o.imagen || null, vendedor: o.vendedor || null,
  precio: o.precio, antes: o.antes || null, precio_original: o.precioOriginal ?? null, moneda: o.moneda || 'CRC',
  disponible: o.disponible !== false, cuotas: o.cuotas || null, actualizado: new Date().toISOString()
});

export const filaAOfertaDB = (f) => ({
  id: f.id, tienda: f.tienda_id, sku: f.sku, ref: f.ref, nombre: f.nombre, marca: f.marca || '', modelo: f.modelo || '', ean: f.ean || '',
  categoria: f.categoria || '', url: f.url, imagen: f.imagen || '', vendedor: f.vendedor || '', precio: f.precio, antes: f.antes,
  precioOriginal: f.precio_original, moneda: f.moneda, disponible: f.disponible, cuotas: f.cuotas, actualizado: f.actualizado
});

// Guarda el precio actual y agrega (o actualiza) el punto de hoy en el historial
export async function guardarOfertas(ofertas) {
  if (!hayDB() || !ofertas.length) return;
  const unicas = [...new Map(ofertas.map((o) => [o.id, o])).values()];
  for (let i = 0; i < unicas.length; i += 400) {
    const lote = unicas.slice(i, i + 400);
    await rest('ofertas?on_conflict=id', { metodo: 'POST', cuerpo: lote.map(filaOferta), prefer: 'resolution=merge-duplicates,return=minimal' });
    const hoy = hoyCR();
    const hist = lote.filter((o) => o.disponible !== false).map((o) => ({ oferta_id: o.id, fecha: hoy, precio: o.precio }));
    if (hist.length) await rest('historial_precios?on_conflict=oferta_id,fecha', { metodo: 'POST', cuerpo: hist, prefer: 'resolution=merge-duplicates,return=minimal' });
  }
}

export async function guardarPaginas(filas) {
  if (!hayDB() || !filas.length) return;
  // Algunos mapas del sitio repiten la misma página: se deja una sola por id
  filas = [...new Map(filas.map((f) => [f.id, f])).values()];
  for (let i = 0; i < filas.length; i += 800) {
    await rest('paginas?on_conflict=id', { metodo: 'POST', cuerpo: filas.slice(i, i + 800), prefer: 'resolution=merge-duplicates,return=minimal' });
  }
}

export async function tiendasDB() {
  if (!hayDB()) return [];
  try { return await rest('tiendas?select=*'); } catch (e) { return []; }
}

export async function guardarTienda(fila) {
  if (!hayDB()) return;
  await rest('tiendas?on_conflict=id', { metodo: 'POST', cuerpo: [{ ...fila, revisado: new Date().toISOString() }], prefer: 'resolution=merge-duplicates,return=minimal' });
}
