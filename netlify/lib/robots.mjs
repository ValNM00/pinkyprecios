// Lectura de robots.txt: PinkyPrecios solo pide páginas que la tienda permite a los robots.
export const AGENTE = 'PinkyPreciosBot';

export function parsearRobots(texto) {
  const grupos = [];
  const sitemaps = [];
  let actual = null;
  let ultimaFueAgente = false;
  for (const cruda of String(texto || '').split(/\r?\n/)) {
    const linea = cruda.replace(/#.*$/, '').trim();
    if (!linea) continue;
    const i = linea.indexOf(':');
    if (i < 0) continue;
    const campo = linea.slice(0, i).trim().toLowerCase();
    const valor = linea.slice(i + 1).trim();
    if (campo === 'sitemap') { if (valor) sitemaps.push(valor); continue; }
    if (campo === 'user-agent') {
      if (!actual || !ultimaFueAgente) { actual = { agentes: [], reglas: [] }; grupos.push(actual); }
      actual.agentes.push(valor.toLowerCase());
      ultimaFueAgente = true;
      continue;
    }
    ultimaFueAgente = false;
    if (!actual) continue;
    if (campo === 'allow' || campo === 'disallow') actual.reglas.push({ permitir: campo === 'allow', patron: valor });
  }
  return { grupos, sitemaps };
}

function reglasPara(robots, agente) {
  const a = agente.toLowerCase();
  const propios = robots.grupos.filter((g) => g.agentes.some((x) => x !== '*' && a.includes(x)));
  if (propios.length) return propios.flatMap((g) => g.reglas);
  return robots.grupos.filter((g) => g.agentes.includes('*')).flatMap((g) => g.reglas);
}

function aRegex(patron) {
  let p = patron.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  if (p.endsWith('\\$')) p = p.slice(0, -2) + '$';
  return new RegExp('^' + p);
}

// Gana la regla más larga; si empatan, gana "Allow".
export function rutaPermitida(robots, ruta, agente = AGENTE) {
  let mejor = null;
  for (const r of reglasPara(robots, agente)) {
    if (r.patron === '') { if (!r.permitir) continue; }
    if (!r.patron) continue;
    if (aRegex(r.patron).test(ruta)) {
      const largo = r.patron.length;
      if (!mejor || largo > mejor.largo || (largo === mejor.largo && r.permitir)) mejor = { largo, permitir: r.permitir };
    }
  }
  return mejor ? mejor.permitir : true;
}
