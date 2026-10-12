// Normalización de nombres, extracción de modelo y agrupación del mismo producto entre tiendas.

const VACIAS = new Set('de del la el los las para con sin y o en a al por un una unos unas su sus mas plus nuevo nueva original oferta color'.split(' '));
const UNIDAD = /^\d+(?:[.,]\d+)?(gb|tb|mb|mah|wh|w|kw|l|lt|lts|ml|kg|g|gr|hz|mhz|ghz|mp|pulg|pul|in|cm|mm|m|v|btu|pies|ft|k|p|oz|lb|qt|x|th|nd|rd|st|w)$/;

export function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/["”″]/g, ' pulg ').replace(/[^a-z0-9]+/g, ' ').trim();
}

export const terminos = (q) => normalizar(q).split(' ').filter((t) => t && !VACIAS.has(t));

// Palabras que en Costa Rica se usan para lo mismo
const GRUPOS_SINONIMOS = [
  ['pantalla', 'televisor', 'television', 'tv', 'tele'],
  ['celular', 'telefono', 'smartphone', 'movil'],
  ['refri', 'refrigeradora', 'refrigerador', 'nevera'],
  ['audifonos', 'auriculares', 'headphones', 'earbuds'],
  ['laptop', 'portatil', 'notebook'],
  ['compu', 'computadora', 'pc'],
  ['parlante', 'bocina', 'altavoz'],
  ['cocina', 'estufa'],
  ['microondas', 'micro'],
  ['licuadora', 'blender'],
  ['abanico', 'ventilador'],
  ['aire', 'aires'],
  ['reloj', 'smartwatch', 'watch'],
  ['tablet', 'tableta', 'ipad'],
  ['consola', 'playstation', 'ps5', 'xbox', 'nintendo']
];
export const SINONIMOS = {};
for (const g of GRUPOS_SINONIMOS) for (const p of g) SINONIMOS[p] = g.filter((x) => x !== p);

function aparece(t, n) {
  if (n.includes(' ' + t + ' ') || (t.length >= 4 && n.includes(t))) return true;
  if (t.endsWith('s') && t.length > 3 && n.includes(' ' + t.slice(0, -1))) return true; // plurales simples
  if (t.endsWith('es') && t.length > 4 && n.includes(' ' + t.slice(0, -2))) return true;
  return false;
}

// Qué fracción de los términos buscados aparece en el texto (0 a 1)
export function relevancia(q, texto) {
  const ts = terminos(q);
  if (!ts.length) return 0;
  const n = ' ' + normalizar(texto) + ' ';
  let ok = 0;
  for (const t of ts) if (aparece(t, n) || (SINONIMOS[t] || []).some((s) => aparece(s, n))) ok++;
  return ok / ts.length;
}

export function eanValido(e) {
  const d = String(e || '').replace(/\D/g, '');
  if (d.length < 8 || d.length > 14 || /^0+$/.test(d)) return '';
  return d.replace(/^0+/, '');
}

// Código de modelo: palabra con letras y números, de 5+ caracteres, que no sea una medida (128GB, 55pulg…)
// Código de modelo: palabra con letras y números, de 5+ caracteres, que no sea una medida (128GB, 55pulg…).
// Se prefiere el que aparece en el nombre; el SKU o la referencia se usan solo si el nombre no trae ninguno.
export function extraerModelo(...fuentes) {
  for (const f of fuentes) {
    const candidatos = [];
    for (const crudo of String(f || '').split(/[\s/,()|+]+/)) {
      const t = crudo.replace(/^[-.]+|[-.]+$/g, '');
      const limpio = t.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (limpio.length < 5 || limpio.length > 22) continue;
      if (!/\d/.test(limpio) || !/[a-z]/.test(limpio)) continue;
      if (UNIDAD.test(limpio)) continue;
      if (/^\d+(gb|tb)\d+(gb|tb)$/.test(limpio)) continue;      // 8gb256gb
      if (/^(i[3579]|ryzen|core|gen|rtx|gtx|ddr|usb|hdmi|wifi|bluetooth)/.test(limpio) && limpio.length < 9) continue;
      candidatos.push(limpio);
    }
    if (candidatos.length) return candidatos.sort((a, b) => b.length - a.length)[0];
  }
  return '';
}

// Mismo modelo aunque una tienda agregue el sufijo de región (UN55DU7000 = UN55DU7000PXPA)
export function mismoModelo(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  return corto.length >= 7 && largo.startsWith(corto) && largo.length - corto.length <= 6;
}

const numeros = (s) => (normalizar(s).match(/\d+(?:\s?\d+)?/g) || []).join(',');
const significativas = (s) => new Set(terminos(s).filter((t) => t.length > 1));

function parecidos(a, b) {
  if (!a.marcaNorm || a.marcaNorm !== b.marcaNorm) return false;
  if (numeros(a.nombre) !== numeros(b.nombre)) return false;
  const A = significativas(a.nombre), B = significativas(b.nombre);
  if (A.size < 2 || B.size < 2) return false;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter) >= 0.75;
}

// Agrupa ofertas que son el mismo producto: mismo código de barras, mismo modelo o nombre casi igual.
export function agrupar(ofertas) {
  const padre = ofertas.map((_, i) => i);
  const raiz = (i) => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  const unir = (a, b) => { const x = raiz(a), y = raiz(b); if (x !== y) padre[y] = x; };
  const porLlave = new Map();
  ofertas.forEach((o, i) => {
    o.marcaNorm = o.marcaNorm ?? normalizar(o.marca);
    const llaves = [];
    if (o.ean) llaves.push('e:' + o.ean);
    if (o.modelo && o.modelo.length >= 6) llaves.push('m:' + o.modelo);
    for (const k of llaves) {
      if (porLlave.has(k)) {
        const j = porLlave.get(k);
        const mj = ofertas[j].marcaNorm;
        if (k.startsWith('e:') || !mj || !o.marcaNorm || mj === o.marcaNorm) unir(j, i);
      } else porLlave.set(k, i);
    }
  });
  for (let i = 0; i < ofertas.length; i++) for (let j = i + 1; j < ofertas.length; j++) {
    if (raiz(i) === raiz(j)) continue;
    const a = ofertas[i], b = ofertas[j];
    const marcasOk = !a.marcaNorm || !b.marcaNorm || a.marcaNorm === b.marcaNorm;
    if ((marcasOk && a.modelo !== b.modelo && mismoModelo(a.modelo, b.modelo)) || (a.tienda !== b.tienda && parecidos(a, b))) unir(i, j);
  }
  const grupos = new Map();
  ofertas.forEach((o, i) => { const r = raiz(i); if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(o); });
  return [...grupos.values()].map(armarGrupo);
}

export function armarGrupo(lista) {
  const ofertas = [...lista].sort((a, b) => (b.disponible - a.disponible) || a.precio - b.precio);
  const disp = ofertas.filter((o) => o.disponible);
  const base = ofertas.find((o) => o.imagen) || ofertas[0];
  const nombre = [...ofertas].sort((a, b) => a.nombre.length - b.nombre.length)[Math.floor((ofertas.length - 1) / 2)].nombre;
  return {
    id: ofertas.map((o) => o.id).sort().join(','),
    nombre,
    marca: ofertas.find((o) => o.marca)?.marca || '',
    categoria: ofertas.find((o) => o.categoria)?.categoria || '',
    imagen: base.imagen || '',
    ean: ofertas.find((o) => o.ean)?.ean || '',
    modelo: ofertas.find((o) => o.modelo)?.modelo || '',
    tiendas: [...new Set(disp.map((o) => o.tienda))].length,
    desde: disp.length ? disp[0].precio : null,
    hasta: disp.length ? disp[disp.length - 1].precio : null,
    ofertas
  };
}

// Cantidad del producto en kilos o litros (para precio por unidad): "Arroz 1800 g" → { cant: 1.8, u: 'kg' }
export function cantidadBase(nombre) {
  const t = normalizar(nombre).replace(/(\d) (\d{3})\b/g, '$1$2');
  const r = String(nombre).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/,/g, '.')
    .match(/(\d+(?:\.\d+)?)\s*(kg|kilo|kilos|kilogramos|g|gr|grs|gramos|l|lt|lts|litro|litros|ml|cc)\b/);
  if (!r) return null;
  let cant = parseFloat(r[1]);
  const u = r[2];
  let unidad;
  if (['kg', 'kilo', 'kilos', 'kilogramos'].includes(u)) unidad = 'kg';
  else if (['g', 'gr', 'grs', 'gramos'].includes(u)) { cant /= 1000; unidad = 'kg'; }
  else if (['ml', 'cc'].includes(u)) { cant /= 1000; unidad = 'l'; }
  else unidad = 'l';
  const pack = t.match(/\b(\d{1,2}) ?(?:x|unidades|unid|pack|pzas?)\b/) || t.match(/\bx ?(\d{1,2})\b/) || t.match(/\bpack (?:de )?(\d{1,2})\b/);
  if (pack) cant *= Math.min(48, parseInt(pack[1], 10));
  return cant > 0 && cant < 200 ? { cant, u: unidad } : null;
}
