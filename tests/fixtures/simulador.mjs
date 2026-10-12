// SOLO PARA PRUEBAS AUTOMÁTICAS. Imita las respuestas de las tiendas con la misma estructura que
// devuelven sus APIs reales, para poder probar el código sin conexión. La página nunca usa este archivo.
const cuota = (precio, meses, tarjeta) => ({ Value: Math.round(precio / meses), InterestRate: 0, TotalValuePlusInterestRate: precio, NumberOfInstallments: meses, PaymentSystemName: tarjeta, Name: `${tarjeta} ${meses} vezes sem juros` });

function vtex({ id, sku, nombre, marca, ref, ean, link, cat, precio, lista, vendedor = 'Walmart Cr', cuotas = [], stock = 10 }) {
  return {
    productId: id, productName: nombre, brand: marca, productReference: ref, linkText: link.split('/').slice(-2)[0], link,
    categories: [cat, '/' + cat.split('/')[1] + '/'],
    items: [{
      itemId: sku, name: nombre, nameComplete: nombre, ean, referenceId: [{ Key: 'RefId', Value: ref }],
      images: [{ imageUrl: `https://img.example/${sku}.jpg` }],
      sellers: [{ sellerId: '1', sellerName: vendedor, sellerDefault: true, commertialOffer: {
        Price: precio, ListPrice: lista ?? precio, PriceWithoutDiscount: lista ?? precio, AvailableQuantity: stock, IsAvailable: stock > 0,
        Installments: [{ Value: precio, InterestRate: 0, TotalValuePlusInterestRate: precio, NumberOfInstallments: 1, PaymentSystemName: 'Visa' }, ...cuotas]
      } }]
    }]
  };
}

const WALMART = [
  vtex({ id: '1', sku: '117159', nombre: 'Televisor Lg Fhdsmart 43 43lm6370psb', marca: 'LG', ref: '000000000075494715-UN', ean: '0195174099599', link: 'https://www.walmart.co.cr/televisor-lg-fhdsmart-43-43lm6370psb-3353-6-0/p', cat: '/Electrónica/Televisores/Pantallas/', precio: 161910, lista: 179900, cuotas: [cuota(161910, 12, 'American Express'), cuota(161910, 12, 'Visa')] }),
  vtex({ id: '2', sku: '127349', nombre: 'Televisor JVC 50 Google TV', marca: 'JVC', ref: '046838507441', ean: '046838507441', link: 'https://www.walmart.co.cr/jvc-televisor-50-google-tv-4135901/p', cat: '/Electrónica/Televisores/Pantallas/', precio: 144050, vendedor: 'Memoris Forever' }),
  vtex({ id: '3', sku: '200001', nombre: 'Freidora de AireOster 6 L', marca: 'Oster', ref: '053891175920', ean: '0053891175920', link: 'https://www.walmart.co.cr/oster-freidora-aire-6-l-7/p', cat: '/Electrodomésticos/Cocina/', precio: 69900 }),
  vtex({ id: '4', sku: '200002', nombre: 'Funda para control de televisor', marca: 'Genérico', ref: 'X1', ean: '', link: 'https://www.walmart.co.cr/funda/p', cat: '/Electrónica/Accesorios/', precio: 3500 })
];
const SIMAN = [
  vtex({ id: '9', sku: '555', nombre: 'Pantalla LG 43 pulgadas Full HD Smart 43LM6370PSB', marca: 'LG', ref: '103', ean: '', link: 'https://cr.siman.com/pantalla-lg-43/p', cat: '/Tecnología/Televisores/', precio: 169900, vendedor: 'Simán' }),
  vtex({ id: '8', sku: '556', nombre: 'Freidora de aire 21 litros', marca: 'Oster', ref: '103247361', ean: '', link: 'https://cr.siman.com/freidora-de-aire-21-litros-9-funciones-103247361/p', cat: '/Electrodomésticos/Cocina/', precio: 203310, lista: 225900, vendedor: 'Simán' })
];

const MAXIPALI = [
  vtex({ id: '31', sku: '8001', nombre: 'Arroz Tio Pelon 99% grano entero 1800 g', marca: 'Tio Pelon', ref: '7441001600106', ean: '7441001600106', link: 'https://www.maxipali.co.cr/arroz-tio-pelon-99-1800-g/p', cat: '/Abarrotes/Granos/', precio: 2350, vendedor: 'Maxi Palí' }),
  vtex({ id: '33', sku: '8003', nombre: 'Frijol negro Don Pedro 800 g', marca: 'Don Pedro', ref: '7441001200001', ean: '7441001200001', link: 'https://www.maxipali.co.cr/frijol/p', cat: '/Abarrotes/Granos/', precio: 1450, vendedor: 'Maxi Palí' }),
  vtex({ id: '34', sku: '8004', nombre: 'Aceite vegetal Clover 1 L', marca: 'Clover', ref: '7441001300001', ean: '7441001300001', link: 'https://www.maxipali.co.cr/aceite/p', cat: '/Abarrotes/Aceites/', precio: 1890, vendedor: 'Maxi Palí' }),
  vtex({ id: '35', sku: '8005', nombre: 'Aceite de oliva extra virgen 500 ml', marca: 'Borges', ref: 'x', ean: '', link: 'https://www.maxipali.co.cr/oliva/p', cat: '/Abarrotes/Aceites/', precio: 4990, vendedor: 'Maxi Palí' }),
  vtex({ id: '36', sku: '8006', nombre: 'Azúcar blanca Doña María 2 kg', marca: 'Doña María', ref: '7441001400001', ean: '7441001400001', link: 'https://www.maxipali.co.cr/azucar/p', cat: '/Abarrotes/Azúcar/', precio: 1795, vendedor: 'Maxi Palí' }),
  vtex({ id: '37', sku: '8007', nombre: 'Leche entera Dos Pinos 1000 ml', marca: 'Dos Pinos', ref: '7441001500001', ean: '7441001500001', link: 'https://www.maxipali.co.cr/leche/p', cat: '/Lácteos/Leche/', precio: 895, vendedor: 'Maxi Palí' }),
  vtex({ id: '38', sku: '8008', nombre: 'Atún Sardimar en agua 3 x 140 g', marca: 'Sardimar', ref: '7441001600001', ean: '7441001600001', link: 'https://www.maxipali.co.cr/atun/p', cat: '/Abarrotes/Enlatados/', precio: 2990, vendedor: 'Maxi Palí' }),
  vtex({ id: '32', sku: '8002', nombre: 'Café 1820 molido clásico 500 g', marca: '1820', ref: '7441001100156', ean: '7441001100156', link: 'https://www.maxipali.co.cr/cafe-1820-500-g/p', cat: '/Abarrotes/Café/', precio: 3990, lista: 4450, vendedor: 'Maxi Palí' })
];
const MASXMENOS = [
  vtex({ id: '41', sku: '9001', nombre: 'Arroz Tío Pelón 99% 1.8 kg', marca: 'Tio Pelon', ref: '7441001600106', ean: '7441001600106', link: 'https://www.masxmenos.cr/arroz-tio-pelon-1-8-kg/p', cat: '/Abarrotes/Arroz/', precio: 2595, vendedor: 'Más x Menos' })
];

function filtrar(lista, url) {
  const ft = decodeURIComponent((url.match(/ft=([^&]*)/) || [])[1] || '').toLowerCase();
  const sku = (url.match(/skuId:([^&]*)/) || [])[1];
  if (sku) return lista.filter((p) => p.items[0].itemId === sku);
  if (!ft) return lista.slice(0, 1);
  const pal = ft.split(/\s+/).filter((w) => !['de', 'en', 'vegetal', 'entera', 'molido', 'hojuelas', 'trigo'].includes(w));
  const sin = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return lista.filter((p) => pal.some((w) => sin(p.productName + ' ' + p.categories[0]).includes(sin(w).replace(/s$/, '')) || (w === 'pantalla' && /televisor/i.test(p.productName)) || (w === 'televisor' && /pantalla/i.test(p.productName))));
}

export default function simulador(url) {
  if (url === 'https://www.multi.example/robots.txt') return { body: 'User-agent: *\nSitemap: https://www.multi.example/sitemap1.xml', tipo: 'text/plain' };
  if (url === 'https://www.multi.example/sitemap1.xml') return { tipo: 'application/xml', body: ['/costarica_es/pantalla-tcl-50.html', '/crema-dental-colgate.html', '/guatemala/pantalla-tcl-50.html', '/cr/refrigeradora-lg.html'].map((p) => `<url><loc>https://www.multi.example${p}</loc></url>`).join('').replace(/^/, '<urlset>') + '</urlset>' };
  if (url === 'https://www.lacuracaonline.com/robots.txt') return { body: 'User-agent: *\nDisallow: /checkout/\nSitemap: https://www.lacuracaonline.com/sitemap_index.xml', tipo: 'text/plain' };
  if (url.endsWith('/robots.txt')) {
    if (url.includes('bloqueada')) return { body: 'User-agent: *\nDisallow: /', tipo: 'text/plain' };
    if (url.includes('tiendamonge')) return { body: 'User-agent: *\nDisallow: /*?\nDisallow: /catalogsearch/\nSitemap: https://www.tiendamonge.com/media/sitemap.xml', tipo: 'text/plain' };
    return { body: 'User-agent: *\nDisallow: /checkout/', tipo: 'text/plain' };
  }
  if (url.includes('api.hacienda.go.cr')) return { body: { venta: { fecha: '2026-10-08', valor: 457.03 }, compra: { fecha: '2026-10-08', valor: 450.81 } } };
  if (url.startsWith('https://www.walmart.co.cr/api/')) return { body: filtrar(WALMART, url) };
  if (url.startsWith('https://cr.siman.com/api/')) return { body: filtrar(SIMAN, url) };
  if (url.startsWith('https://www.maxipali.co.cr/api/')) return { body: filtrar(MAXIPALI, url) };
  if (url.startsWith('https://www.masxmenos.cr/api/')) return { body: filtrar(MASXMENOS, url) };
  if (url === 'https://www.lacuracaonline.com/sitemap_index.xml') return { tipo: 'application/xml', body: '<sitemapindex><sitemap><loc>https://www.lacuracaonline.com/guatemala/sitemap.xml</loc></sitemap><sitemap><loc>https://www.lacuracaonline.com/costarica/sitemap.xml</loc></sitemap></sitemapindex>' };
  if (url === 'https://www.lacuracaonline.com/costarica/sitemap.xml') return { tipo: 'application/xml', body: '<urlset><url><loc>https://lacuracaonline.com/costarica/pantalla-lg-43-smart.html</loc></url><url><loc>https://www.lacuracaonline.com/refrigeradora-mabe-14-pies.html</loc></url></urlset>' };
  if (url === 'https://www.lacuracaonline.com/guatemala/sitemap.xml') return { tipo: 'application/xml', body: '<urlset><url><loc>https://www.lacuracaonline.com/guatemala/refri-lg.html</loc></url></urlset>' };
  if (url.startsWith('https://www.tiendamonge.com/media/sitemap.xml')) {
    return { tipo: 'application/xml', body: `<?xml version="1.0"?><urlset><url><loc>https://www.tiendamonge.com/pantalla-lg-43-pulgadas-fhd-smart-43lm6370psb.html</loc></url><url><loc>https://www.tiendamonge.com/politica-de-privacidad.html</loc></url><url><loc>https://www.tiendamonge.com/freidora-de-aire-oster-6-litros.html</loc></url></urlset>` };
  }
  if (url === 'https://www.tiendamonge.com/pantalla-lg-43-pulgadas-fhd-smart-43lm6370psb.html') {
    return { tipo: 'text/html', body: `<html><script type="application/ld+json">{"@type":"Product","name":"Pantalla LG 43\\" FHD Smart 43LM6370PSB","sku":"43LM6370PSB","brand":{"name":"LG"},"image":"https://img.example/monge.jpg","offers":{"@type":"Offer","price":"159900","priceCurrency":"CRC","availability":"https://schema.org/InStock"}}</script></html>` };
  }
  if (url.startsWith('https://icon.co.cr/products.json')) {
    const pagina = Number((url.match(/page=(\d+)/) || [])[1] || 1);
    return { body: { products: pagina > 1 ? [] : [{ id: 1, title: 'Parlante Marshall Emberton III', handle: 'parlante-marshall-emberton-iii', vendor: 'Marshall', product_type: 'Parlantes', tags: ['audio'], images: [{ src: 'https://img.example/m.jpg' }], variants: [{ id: 777, title: 'Crema', price: '239.99', compare_at_price: '269.99', sku: 'T02494', available: true }] }] } };
  }
  if (url.startsWith('https://icon.co.cr/products/parlante-marshall-emberton-iii.js')) {
    return { body: { variants: [{ id: 777, price: 21999, compare_at_price: 26999, available: true }] } };
  }
  if (url.startsWith('https://www.extremetechcr.com/wp-json/wc/store/v1/products')) {
    return { body: [{ id: 901, name: 'Monitor Samsung 27&#8243; Odyssey G5 LS27CG550', permalink: 'https://www.extremetechcr.com/producto/monitor-samsung-odyssey-g5/', sku: 'LS27CG550ENXZA',
      prices: { price: '18990000', regular_price: '21990000', sale_price: '18990000', currency_code: 'CRC', currency_minor_unit: 2 },
      is_in_stock: true, is_purchasable: true, images: [{ src: 'https://img.example/odyssey.jpg' }], categories: [{ name: 'Monitores' }], brands: [{ name: 'Samsung' }] }] };
  }
  if (url.includes('/products.json')) return { status: 404, body: 'no' };
  if (url.includes('/api/catalog_system')) return { status: 404, body: 'no' };
  return { status: 404, body: 'no' };
}
