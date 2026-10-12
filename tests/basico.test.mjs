// Pruebas automáticas: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.PINKY_FIXTURES = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'simulador.mjs')).href;
delete process.env.SUPABASE_URL;

const { parsearRobots, rutaPermitida } = await import('../netlify/lib/robots.mjs');
const { extraerModelo, eanValido, relevancia, agrupar } = await import('../netlify/lib/texto.mjs');
const { ofertaDePagina, textoDeUrl, urlsDeSitemap, buscarWoo, detectar } = await import('../netlify/lib/adaptadores.mjs');
const { buscar, analizar } = await import('../netlify/lib/servicios.mjs');

test('robots.txt: respeta Disallow, Allow y comodines', () => {
  const r = parsearRobots('User-agent: *\nDisallow: /*?\nDisallow: /catalogsearch/\nAllow: /catalogsearch/ok\n\nUser-agent: GPTBot\nDisallow: /');
  assert.equal(rutaPermitida(r, '/pantalla-lg.html'), true);
  assert.equal(rutaPermitida(r, '/catalogsearch/result'), false);
  assert.equal(rutaPermitida(r, '/catalogsearch/ok'), true);
  assert.equal(rutaPermitida(r, '/producto?id=3'), false);
  assert.equal(rutaPermitida(r, '/x', 'GPTBot'), false);
});

test('modelo y código de barras', () => {
  assert.equal(extraerModelo('Televisor Lg Fhdsmart 43 43lm6370psb'), '43lm6370psb');
  assert.equal(extraerModelo('Samsung Galaxy A56 128GB 5G'), '');
  assert.equal(extraerModelo('Audífonos Sony WH-1000XM5'), 'wh1000xm5');
  assert.equal(eanValido('0195174099599'), '195174099599');
  assert.equal(eanValido('000'), '');
});

test('relevancia con sinónimos ticos', () => {
  assert.equal(relevancia('pantalla 43', 'Televisor Lg Fhdsmart 43 43lm6370psb'), 1);
  assert.equal(relevancia('refri', 'Refrigeradora Whirlpool 14 pies'), 1);
  assert.ok(relevancia('iphone 16', 'iPhone 15 128 GB') < 1);
});

test('agrupa el mismo producto por modelo aunque una tienda no tenga código de barras', () => {
  const g = agrupar([
    { id: 'walmart:1', tienda: 'walmart', nombre: 'Televisor Lg Fhdsmart 43 43lm6370psb', marca: 'LG', ean: '195174099599', modelo: '43lm6370psb', precio: 161910, disponible: true },
    { id: 'siman:2', tienda: 'siman', nombre: 'Pantalla LG 43 pulgadas 43LM6370PSB', marca: 'LG', ean: '', modelo: '43lm6370psb', precio: 169900, disponible: true },
    { id: 'siman:3', tienda: 'siman', nombre: 'Freidora de aire 21 litros', marca: 'Oster', ean: '', modelo: '', precio: 203310, disponible: true }
  ]);
  assert.equal(g.length, 2);
  const tv = g.find((x) => x.ofertas.length === 2);
  assert.equal(tv.desde, 161910);
  assert.equal(tv.tiendas, 2);
});

test('no mezcla productos de distinto tamaño', () => {
  const g = agrupar([
    { id: 'a:1', tienda: 'a', nombre: 'Pantalla Samsung 55 Crystal UHD', marca: 'Samsung', precio: 1, disponible: true },
    { id: 'b:1', tienda: 'b', nombre: 'Pantalla Samsung 65 Crystal UHD', marca: 'Samsung', precio: 1, disponible: true }
  ]);
  assert.equal(g.length, 2);
});

test('lee el precio de una página con JSON-LD (tiendas con mapa del sitio)', () => {
  const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Pantalla Samsung 55\\" UN55DU7000","sku":"UN55DU7000","gtin13":"8806095567921","brand":{"@type":"Brand","name":"Samsung"},"image":["https://x/img.jpg"],"offers":{"@type":"Offer","price":"319900","priceCurrency":"CRC","availability":"https://schema.org/InStock"}}</script></head></html>`;
  const o = ofertaDePagina({ id: 'monge' }, 'https://www.tiendamonge.com/pantalla-samsung-55.html', html, 457);
  assert.equal(o.precio, 319900);
  assert.equal(o.marca, 'Samsung');
  assert.equal(o.ean, '8806095567921');
  assert.equal(o.modelo, 'un55du7000');
  assert.equal(textoDeUrl('https://www.tiendamonge.com/electronica/pantalla-samsung-55-crystal.html'), 'electronica pantalla samsung 55 crystal');
});

test('convierte dólares con el tipo de cambio', () => {
  const html = `<script type="application/ld+json">{"@type":"Product","name":"Parlante Marshall Emberton III","offers":{"price":"239.99","priceCurrency":"USD"}}</script>`;
  const o = ofertaDePagina({ id: 'x' }, 'https://x/p', html, 457.03);
  assert.equal(o.precio, Math.round(239.99 * 457.03));
  assert.equal(o.moneda, 'USD');
});

test('búsqueda completa: Walmart + Simán, filtra accesorios y agrupa', async () => {
  const r = await buscar('pantalla lg 43');
  const ok = Object.fromEntries(r.tiendas.map((t) => [t.id, t.estado]));
  assert.equal(ok.walmart, 'ok');
  assert.equal(ok.siman, 'ok');
  assert.equal(ok.icon, 'pendiente');              // sin base de datos no hay índice
  const tv = r.grupos[0];
  assert.equal(tv.tiendas, 2, 'el mismo TV en dos tiendas queda en un solo grupo');
  assert.equal(tv.desde, 161910);
  const lg = tv.ofertas.find((o) => o.tienda === 'walmart');
  assert.equal(lg.antes, 179900);
  assert.equal(lg.cuotas.sinInteres.meses, 12);
  assert.ok(!r.grupos.some((g) => /funda/i.test(g.nombre)), 'no muestra accesorios que no coinciden');
  assert.equal(r.tipoCambio, 457.03);
});

test('análisis del historial: registrando, buen momento y descuento inflado', () => {
  const hoy = new Date();
  const f = (d) => new Date(hoy - d * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
  const pocos = analizar([{ id: 'a', precio: 100, disponible: true }], [{ oferta_id: 'a', fecha: f(1), precio: 100 }]);
  assert.equal(pocos.momento.nivel, 'registrando');
  const hist = [];
  for (let d = 60; d >= 0; d--) hist.push({ oferta_id: 'a', fecha: f(d), precio: d > 10 ? 1000 : d > 3 ? 1300 : 1000 });
  const r = analizar([{ id: 'a', precio: 1000, antes: 1300, disponible: true }], hist);
  assert.equal(r.inflados.a, true, 'antes costaba lo mismo: el descuento es inflado');
  assert.equal(r.momento.nivel, 'bueno');
});

test('tiendas con varios países: solo guarda páginas y precios de Costa Rica', async () => {
  const { urls, notas } = await urlsDeSitemap({ id: 'curacao', url: 'https://www.lacuracaonline.com/costarica' }, { tiempo: 5000 });
  // Solo lee el mapa de Costa Rica (no el de Guatemala) y acepta sus páginas aunque cambie el dominio o la ruta
  assert.deepEqual(urls.map((u) => u.url), ['https://lacuracaonline.com/costarica/pantalla-lg-43-smart.html', 'https://www.lacuracaonline.com/refrigeradora-mabe-14-pies.html']);
  assert.ok(notas[0].startsWith('2 mapas'));
  const html = `<script type="application/ld+json">{"@type":"Product","name":"Pantalla LG 43","offers":{"price":"2499","priceCurrency":"GTQ"}}</script>`;
  assert.equal(ofertaDePagina({ id: 'curacao' }, 'https://x/p', html, 457), null, 'no acepta quetzales');
});

test('tiendas WooCommerce: detecta la plataforma y lee precio, rebaja y modelo', async () => {
  const t = { id: 'extremetech', url: 'https://www.extremetechcr.com', moneda: 'auto' };
  assert.equal((await detectar(t)).plataforma, 'woocommerce');
  const [o] = await buscarWoo(t, 'monitor', 457);
  assert.equal(o.nombre, 'Monitor Samsung 27" Odyssey G5 LS27CG550');
  assert.equal(o.precio, 189900);
  assert.equal(o.antes, 219900);
  assert.equal(o.marca, 'Samsung');
  assert.equal(o.modelo, 'ls27cg550');
});

test('mismo modelo con sufijo de región se agrupa', async () => {
  const g = agrupar([
    { id: 'a:1', tienda: 'a', nombre: 'Pantalla Samsung UN55DU7000', marca: 'Samsung', modelo: 'un55du7000', precio: 1, disponible: true },
    { id: 'b:1', tienda: 'b', nombre: 'Smart TV Samsung 55 UN55DU7000PXPA', marca: 'SAMSUNG', modelo: 'un55du7000pxpa', precio: 2, disponible: true },
    { id: 'c:1', tienda: 'c', nombre: 'Smart TV Samsung 65 UN65DU7000PXPA', marca: 'Samsung', modelo: 'un65du7000pxpa', precio: 3, disponible: true }
  ]);
  assert.equal(g.length, 2);
});

test('filtro de país: reconoce variantes de Costa Rica y no confunde palabras que empiezan con "cr"', async () => {
  const { urls } = await urlsDeSitemap({ id: 'multi', url: 'https://www.multi.example/costarica' }, { tiempo: 5000 });
  assert.deepEqual(urls.map((x) => new URL(x.url).pathname), ['/costarica_es/pantalla-tcl-50.html', '/cr/refrigeradora-lg.html']);
});
