// Tiendas que consulta PinkyPrecios.
//
// plataforma:
//   'vtex'    → búsqueda en vivo con la API pública de catálogo de VTEX (verificado: Walmart y Simán).
//   'shopify' → se indexa el catálogo público /products.json y se busca en ese índice.
//   'sitemap' → se indexan las URLs del mapa del sitio y se lee el precio de cada página (datos JSON-LD).
//   'auto'    → se detecta sola la primera vez (prueba VTEX, luego Shopify, luego mapa del sitio).
//
// moneda: 'CRC', 'USD' o 'auto' (si los precios parecen estar en dólares se convierten con el tipo de cambio).
// Para agregar una tienda nueva basta con sumar una línea aquí.
export const TIENDAS = [
  { id: 'walmart',    nombre: 'Walmart',     url: 'https://www.walmart.co.cr',             plataforma: 'vtex',    moneda: 'CRC' },
  { id: 'siman',      nombre: 'Simán',       url: 'https://cr.siman.com',                  plataforma: 'vtex',    moneda: 'CRC' },
  { id: 'icon',       nombre: 'iCon',        url: 'https://icon.co.cr',                    plataforma: 'shopify', moneda: 'auto' },
  { id: 'monge',      nombre: 'Monge',       url: 'https://www.tiendamonge.com',           plataforma: 'sitemap', moneda: 'CRC' },
  { id: 'gollo',      nombre: 'Gollo',       url: 'https://www.gollo.com',                 plataforma: 'auto',    moneda: 'CRC' },
  { id: 'ekono',      nombre: 'Ekono',       url: 'https://www.ekono.cr',                  plataforma: 'auto',    moneda: 'CRC' },
  { id: 'ishop',      nombre: 'iShop',       url: 'https://www.ishopcr.com',               plataforma: 'auto',    moneda: 'auto' },
  { id: 'curacao',    nombre: 'La Curacao',  url: 'https://www.lacuracaonline.com/costarica', plataforma: 'auto', moneda: 'CRC' },
  { id: 'pricesmart', nombre: 'PriceSmart',  url: 'https://www.pricesmart.com/es-cr',      plataforma: 'auto',    moneda: 'CRC' }
];

export const tiendaPorId = (id) => TIENDAS.find((t) => t.id === id);
