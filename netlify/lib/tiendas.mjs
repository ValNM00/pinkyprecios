// Tiendas que consulta PinkyPrecios.
//
// plataforma:
//   'vtex'        → búsqueda en vivo con la API pública de catálogo de VTEX.
//   'woocommerce' → búsqueda en vivo con la API pública de tiendas WooCommerce.
//   'shopify'     → se indexa el catálogo público /products.json y se busca en ese índice.
//   'sitemap'     → se indexan las URLs del mapa del sitio y se lee el precio de cada página.
//   'auto'        → se detecta sola (prueba VTEX, Shopify, WooCommerce y mapa del sitio, en ese orden).
//
// Las tiendas que no se pueden leer (bloquean robots o no publican precios) se ocultan solas en la página
// y aparecen en el panel "Tiendas" como "en evaluación". Para agregar una tienda, sumá una línea aquí.
const T = 'Tecnología y hogar', S = 'Supermercado', F = 'Ferretería y construcción';

export const TIENDAS = [
  // Verificadas
  { id: 'walmart',     nombre: 'Walmart',       rubro: T, url: 'https://www.walmart.co.cr',                plataforma: 'vtex',    moneda: 'CRC' },
  { id: 'siman',       nombre: 'Simán',         rubro: T, url: 'https://cr.siman.com',                     plataforma: 'vtex',    moneda: 'CRC' },
  { id: 'monge',       nombre: 'Monge',         rubro: T, url: 'https://www.tiendamonge.com',              plataforma: 'sitemap', moneda: 'CRC' },
  { id: 'gollo',       nombre: 'Gollo',         rubro: T, url: 'https://www.gollo.com',                    plataforma: 'auto',    moneda: 'CRC' },
  { id: 'curacao',     nombre: 'La Curacao',    rubro: T, url: 'https://www.lacuracaonline.com/costarica', plataforma: 'auto',    moneda: 'CRC' },
  { id: 'icon',        nombre: 'iCon',          rubro: T, url: 'https://icon.co.cr',                       plataforma: 'shopify', moneda: 'auto' },
  { id: 'maxipali',    nombre: 'Maxi Palí',     rubro: S, url: 'https://www.maxipali.co.cr',               plataforma: 'vtex',    moneda: 'CRC' },
  { id: 'masxmenos',   nombre: 'Más x Menos',   rubro: S, url: 'https://www.masxmenos.cr',                 plataforma: 'vtex',    moneda: 'CRC' },

  // Candidatas: se detectan solas y aparecen solo si funcionan
  { id: 'pali',        nombre: 'Palí',          rubro: S, url: 'https://www.pali.co.cr',                   plataforma: 'auto',    moneda: 'CRC' },
  { id: 'automercado', nombre: 'Auto Mercado',  rubro: S, url: 'https://www.automercado.cr',               plataforma: 'auto',    moneda: 'CRC' },
  { id: 'pequenomundo',nombre: 'Pequeño Mundo', rubro: T, url: 'https://www.pequenomundo.com',             plataforma: 'auto',    moneda: 'CRC' },
  { id: 'steren',      nombre: 'Steren',        rubro: T, url: 'https://www.steren.cr',                    plataforma: 'auto',    moneda: 'CRC' },
  { id: 'credix',      nombre: 'Tienda Credix', rubro: T, url: 'https://www.tiendacredix.com',             plataforma: 'auto',    moneda: 'CRC' },
  { id: 'officedepot', nombre: 'Office Depot',  rubro: T, url: 'https://www.officedepot.cr',               plataforma: 'auto',    moneda: 'CRC' },
  { id: 'extremetech', nombre: 'Extreme Tech',  rubro: T, url: 'https://www.extremetechcr.com',            plataforma: 'auto',    moneda: 'auto' },
  { id: 'adn',         nombre: 'ADN Tienda',    rubro: T, url: 'https://www.adntienda.com',                plataforma: 'auto',    moneda: 'auto' },
  { id: 'unimart',     nombre: 'Unimart',       rubro: T, url: 'https://www.unimart.com',                  plataforma: 'auto',    moneda: 'auto' },
  { id: 'intelec',     nombre: 'Intelec',       rubro: T, url: 'https://www.intelec.co.cr',                plataforma: 'auto',    moneda: 'CRC' },
  { id: 'kolbi',       nombre: 'Kölbi',         rubro: T, url: 'https://tienda.kolbi.cr',                  plataforma: 'auto',    moneda: 'CRC' },
  { id: 'pacifiko',    nombre: 'Pacifiko',      rubro: T, url: 'https://www.pacifiko.cr',                  plataforma: 'auto',    moneda: 'CRC' },
  { id: 'epa',         nombre: 'EPA',           rubro: F, url: 'https://www.epa.cr',                       plataforma: 'auto',    moneda: 'CRC' },
  { id: 'ellagar',     nombre: 'El Lagar',      rubro: F, url: 'https://www.ellagar.com',                  plataforma: 'auto',    moneda: 'CRC' }
];

// Evaluadas y descartadas (no aparecen en la página):
//   Ekono      (https://www.ekono.cr)             → rechaza la conexión del robot; vende sobre todo ropa y hogar.
//   iShop      (https://www.ishopcr.com)          → rechaza la conexión del robot.
//   PriceSmart (https://www.pricesmart.com/es-cr) → las páginas de producto no entregan el precio a un robot.

export const tiendaPorId = (id) => TIENDAS.find((t) => t.id === id);
