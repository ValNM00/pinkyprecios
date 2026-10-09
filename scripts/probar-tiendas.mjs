// Prueba rápida desde tu compu: revisa cada tienda y hace una búsqueda real.
// Uso: npm run probar            → diagnóstico + búsqueda "freidora de aire"
//      npm run probar -- iphone  → diagnóstico + búsqueda "iphone"
import { diagnostico, buscar } from '../netlify/lib/servicios.mjs';

const q = process.argv.slice(2).join(' ') || 'freidora de aire';
const colones = (n) => (n == null ? '—' : '₡' + n.toLocaleString('es-CR'));

console.log('\nRevisando tiendas…\n');
const d = await diagnostico();
console.log(`Tipo de cambio: ₡${d.tipoCambio.venta} (${d.tipoCambio.fuente})\n`);
for (const t of d.tiendas) console.log(`${t.estado === 'ok' ? '✔' : '✖'} ${t.nombre.padEnd(12)} ${String(t.plataforma).padEnd(8)} ${t.estado.padEnd(14)} ${t.detalle}`);

console.log(`\nBuscando "${q}"…\n`);
const r = await buscar(q);
for (const t of r.tiendas) console.log(`  ${t.nombre.padEnd(12)} ${String(t.estado).padEnd(14)} ${t.n ?? ''} ${t.detalle || ''}`);
console.log(`\n${r.grupos.length} productos en ${r.ms} ms. Los primeros 10:\n`);
for (const g of r.grupos.slice(0, 10)) {
  console.log(`• ${g.nombre}  —  desde ${colones(g.desde)} (${g.tiendas} ${g.tiendas === 1 ? 'tienda' : 'tiendas'})`);
  for (const o of g.ofertas) console.log(`     ${o.tienda.padEnd(10)} ${colones(o.precio).padStart(12)}${o.antes ? `  antes ${colones(o.antes)}` : ''}${o.disponible ? '' : '  (agotado)'}`);
}
process.exit(0);
