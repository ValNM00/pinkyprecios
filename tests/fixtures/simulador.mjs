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

function filtrar(lista, url) {
  const ft = decodeURIComponent((url.match(/ft=([^&]*)/) || [])[1] || '').toLowerCase();
  const sku = (url.match(/skuId:([^&]*)/) || [])[1];
  if (sku) return lista.filter((p) => p.items[0].itemId === sku);
  if (!ft) return lista.slice(0, 1);
  const pal = ft.split(/\s+/);
  const sin = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return lista.filter((p) => pal.some((w) => sin(p.productName + ' ' + p.categories[0]).includes(sin(w).replace(/s$/, '')) || (w === 'pantalla' && /televisor/i.test(p.productName)) || (w === 'televisor' && /pantalla/i.test(p.productName))));
}

export default function simulador(url) {
  if (url.endsWith('/robots.txt')) {
    if (url.includes('bloqueada')) return { body: 'User-agent: *\nDisallow: /', tipo: 'text/plain' };
    if (url.includes('tiendamonge')) return { body: 'User-agent: *\nDisallow: /*?\nDisallow: /catalogsearch/\nSitemap: https://www.tiendamonge.com/media/sitemap.xml', tipo: 'text/plain' };
    return { body: 'User-agent: *\nDisallow: /checkout/', tipo: 'text/plain' };
  }
  if (url.includes('api.hacienda.go.cr')) return { body: { venta: { fecha: '2026-10-08', valor: 457.03 }, compra: { fecha: '2026-10-08', valor: 450.81 } } };
  if (url.startsWith('https://www.walmart.co.cr/api/')) return { body: filtrar(WALMART, url) };
  if (url.startsWith('https://cr.siman.com/api/')) return { body: filtrar(SIMAN, url) };
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
  if (url.includes('/products.json')) return { status: 404, body: 'no' };
  if (url.includes('/api/catalog_system')) return { status: 404, body: 'no' };
  return { status: 404, body: 'no' };
}
