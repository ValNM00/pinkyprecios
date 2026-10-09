(() => {
  'use strict';

  const CFG = Object.assign({ nombre: 'PinkyPrecios', logo: '', mostrarNombre: true, api: '/api' }, window.APP_CONFIG || {});

  // ---------- Utilidades ----------
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const guardar = {
    get(k, d) { try { const v = localStorage.getItem('pp_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pp_' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  };
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
  const fechaCorta = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${Number(d)} ${MESES[Number(m) - 1]}${y !== String(new Date().getFullYear()) ? ' ' + y : ''}`; };
  const hace = (iso) => {
    if (!iso) return '';
    const min = Math.round((Date.now() - new Date(iso)) / 60000);
    if (min < 2) return 'hace un momento';
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${plural(h, 'hora', 'horas')}`;
    return `hace ${plural(Math.round(h / 24), 'día', 'días')}`;
  };

  async function api(ruta, opciones) {
    let r;
    try { r = await fetch(CFG.api + ruta, opciones); }
    catch (e) { const err = new Error('No se pudo conectar con el buscador. Revisá tu conexión.'); err.red = true; throw err; }
    let datos = null;
    try { datos = await r.json(); } catch (e) { /* respuesta vacía */ }
    if (!r.ok) {
      const err = new Error((datos && datos.error) || (r.status === 404 ? 'El buscador no está disponible en esta dirección.' : `El servidor respondió con error ${r.status}.`));
      err.status = r.status; err.datos = datos; throw err;
    }
    return datos;
  }

  // ---------- Estado ----------
  const S = {
    inicio: null, errorInicio: null,
    tc: { venta: null },
    moneda: guardar.get('moneda', 'CRC'),
    tema: guardar.get('tema', 'auto'),
    lista: guardar.get('lista', []),        // [{id, ids, nombre, imagen, marca, precio, tienda, fecha}]
    alertas: guardar.get('alertas', []),    // [{id, remoto, ids, nombre, objetivo, correo, creada, cumplida}]
    vistos: guardar.get('vistos', []),      // [{id, ids, nombre, imagen, precio, tienda}]
    comparar: [],                           // grupos
    grupos: new Map(),                      // id -> grupo (de búsquedas)
    busqueda: null,                         // { q, cargando, resultado, error }
    f: { cat: 'Todas', tiendas: [], precioMax: null, soloVarias: false, soloRebaja: false, agotados: false, abiertos: false },
    orden: 'relevancia',
    vista: 'inicio', detalle: null, modoPago: 'contado', panel: null
  };

  // ---------- Dinero ----------
  const nf = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 0 });
  const nfUsd = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const enDolares = () => S.moneda === 'USD' && S.tc.venta;
  function dinero(n) {
    if (n == null || !isFinite(n)) return '—';
    return enDolares() ? 'US$' + nfUsd.format(n / S.tc.venta) : '₡' + nf.format(Math.round(n));
  }
  function dineroCorto(n) {
    if (enDolares()) { const u = n / S.tc.venta; return '$' + (u >= 1000 ? (u / 1000).toFixed(u >= 10000 ? 0 : 1) + 'k' : Math.round(u)); }
    return n >= 1e6 ? '₡' + (n / 1e6).toFixed(2) + 'M' : '₡' + Math.round(n / 1000) + 'k';
  }

  // ---------- Íconos ----------
  const I = {
    corazon: '<svg class="i corazon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    cmp: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v16M15 4v16M4 8h5M15 16h5"/></svg>',
    campana: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
    x: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    filtro: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    compartir: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/></svg>',
    lupa: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    sol: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    luna: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
    auto: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
    chispa: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
    reloj: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    tienda: '<svg viewBox="0 0 24 24"><path d="M4 10h16l-1.5-5h-13zM5 10v9h14v-9M10 19v-5h4v5"/></svg>',
    bolsa: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    caja: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M4 10h16"/></svg>'
  };

  const RESPALDO = `<span class="ico">${I.bolsa}</span>`.replace(/"/g, '&quot;');
  function img(src, clase = '') {
    if (!src) return `<span class="ico ${clase}">${I.bolsa}</span>`;
    return `<img${clase ? ` class="${clase}"` : ''} src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='${RESPALDO}'">`;
  }
  const foto = (src) => img(src);

  // ---------- Grupos ----------
  const tiendaNombre = (id) => (S.inicio?.tiendas || []).find((t) => t.id === id)?.nombre || (S.busqueda?.resultado?.tiendas || []).find((t) => t.id === id)?.nombre || id;
  const idsDe = (g) => g.ofertas.map((o) => o.id);
  const disponibles = (g) => g.ofertas.filter((o) => o.disponible);
  const mejor = (g) => disponibles(g).sort((a, b) => a.precio - b.precio)[0];
  const tiendasDe = (g) => [...new Set(disponibles(g).map((o) => o.tienda))];
  const tieneRebaja = (g) => disponibles(g).some((o) => o.antes && o.antes > o.precio);

  function recordar(g) { S.grupos.set(g.id, g); return g; }
  function instantanea(g) {
    const m = mejor(g);
    return { id: g.id, ids: idsDe(g), nombre: g.nombre, imagen: g.imagen, marca: g.marca, precio: m ? m.precio : null, tienda: m ? m.tienda : null, fecha: new Date().toISOString() };
  }

  // ---------- Navegación (URL compartible) ----------
  function irA(params, reemplazar = false) {
    const u = new URL(location.href);
    u.search = '';
    for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
    try { history[reemplazar ? 'replaceState' : 'pushState']({}, '', u); } catch (e) { /* vista previa sin historial */ }
    leerUrl();
  }

  function leerUrl() {
    const p = new URL(location.href).searchParams;
    const q = p.get('q'), ids = p.get('p');
    if (ids) abrirProducto(ids.split(','));
    else if (q) iniciarBusqueda(q);
    else { S.vista = 'inicio'; render(); }
  }

  // ---------- Búsqueda ----------
  async function iniciarBusqueda(q) {
    q = String(q).trim();
    S.vista = 'resultados';
    $('#q').value = q;
    if (S.busqueda && S.busqueda.q === q && (S.busqueda.resultado || S.busqueda.cargando)) { render(); return; }
    S.busqueda = { q, cargando: true, resultado: null, error: null };
    S.f = { cat: 'Todas', tiendas: [], precioMax: null, soloVarias: false, soloRebaja: false, agotados: false, abiertos: false };
    render();
    window.scrollTo(0, 0);
    try {
      const r = await api('/buscar?q=' + encodeURIComponent(q));
      if (S.busqueda.q !== q) return;
      if (r.tipoCambio) S.tc.venta = r.tipoCambio;
      r.grupos.forEach(recordar);
      S.busqueda = { q, cargando: false, resultado: r, error: null };
    } catch (e) {
      if (S.busqueda.q !== q) return;
      S.busqueda = { q, cargando: false, resultado: null, error: e };
    }
    if (S.vista === 'resultados') render();
  }

  function filtrados() {
    const r = S.busqueda?.resultado;
    if (!r) return [];
    const f = S.f;
    let l = r.grupos.map((g) => {
      if (!f.tiendas.length) return g;
      const ofs = g.ofertas.filter((o) => f.tiendas.includes(o.tienda));
      return ofs.length ? { ...g, ofertas: ofs, vistaFiltrada: true } : null;
    }).filter(Boolean);
    l = l.filter((g) => {
      if (f.cat !== 'Todas' && g.categoria !== f.cat) return false;
      const m = mejor(g);
      if (!f.agotados && !m) return false;
      if (f.precioMax != null && (!m || m.precio > f.precioMax)) return false;
      if (f.soloVarias && tiendasDe(g).length < 2) return false;
      if (f.soloRebaja && !tieneRebaja(g)) return false;
      return true;
    });
    const precio = (g) => mejor(g)?.precio ?? Infinity;
    const ahorro = (g) => { const d = disponibles(g); return d.length > 1 ? Math.max(...d.map((o) => o.precio)) - Math.min(...d.map((o) => o.precio)) : 0; };
    if (S.orden === 'precio') l.sort((a, b) => precio(a) - precio(b));
    if (S.orden === 'precio-desc') l.sort((a, b) => precio(b) - precio(a));
    if (S.orden === 'ahorro') l.sort((a, b) => ahorro(b) - ahorro(a));
    if (S.orden === 'tiendas') l.sort((a, b) => tiendasDe(b).length - tiendasDe(a).length || precio(a) - precio(b));
    return l;
  }

  const filtrosActivos = () => S.f.tiendas.length + (S.f.precioMax != null) + S.f.soloVarias + S.f.soloRebaja + S.f.agotados;

  // ---------- Vista: inicio ----------
  const SUGERENCIAS = ['freidora de aire', 'pantalla 55', 'iphone 16', 'refrigeradora', 'lavadora', 'audífonos', 'laptop', 'microondas'];

  function vistaInicio() {
    const ini = S.inicio;
    const populares = ini?.populares?.length ? ini.populares.map((p) => p.termino) : SUGERENCIAS;
    return `
      <section class="hero">
        <h1>Compará precios reales y <em>ahorrá de verdad</em><span class="brillo" aria-hidden="true">✦</span></h1>
        <p>Buscamos en vivo en las tiendas de Costa Rica, guardamos el historial de cada precio y te avisamos cuando un descuento no es real.</p>
        <form class="buscador" id="form-hero" role="search">
          ${I.lupa}
          <label class="sr-only" for="q-hero">¿Qué querés comparar?</label>
          <input id="q-hero" type="search" placeholder="¿Qué querés comparar?" autocomplete="off" enterkeyhint="search">
          <button type="submit" class="btn primario">${I.chispa}<span class="lbl">Comparar</span></button>
        </form>
        <div class="sugerencias"><span>${ini?.populares?.length ? 'Lo más buscado:' : 'Probá con:'}</span>${populares.slice(0, 8).map((t) => `<button type="button" class="chip" data-action="buscar" data-q="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        ${estadoTiendasInicio()}
      </section>
      ${seccionRebajas()}
      ${seccionVistos()}
      <section class="seccion" aria-labelledby="t-como">
        <div class="sec-head"><h2 id="t-como">Cómo <em>funciona</em></h2></div>
        <div class="pasos">
          <div class="paso"><span class="ico cel">${I.tienda}</span><b>Buscamos en vivo</b><p>Cada búsqueda consulta los catálogos públicos de las tiendas en ese momento. Nada de precios inventados.</p></div>
          <div class="paso"><span class="ico tv">${I.reloj}</span><b>Guardamos el historial</b><p>Cada precio encontrado se guarda y se vuelve a revisar cada 6 horas, así sabés si de verdad bajó.</p></div>
          <div class="paso"><span class="ico coc">${I.campana}</span><b>Te avisamos</b><p>Poné tu precio objetivo y te avisamos cuando alguna tienda llegue a ese precio.</p></div>
        </div>
        ${ini?.stats ? `<p class="nota">${nf.format(ini.stats.ofertas)} precios guardados · ${nf.format(ini.stats.registros)} registros de historial${ini.stats.desde ? ` desde el ${fechaCorta(ini.stats.desde)}` : ''}.</p>` : ''}
      </section>`;
  }

  function estadoTiendasInicio() {
    if (S.errorInicio) return `<p class="aviso">No pudimos conectar con el buscador: ${esc(S.errorInicio.message)}</p>`;
    if (!S.inicio) return '<div class="tiendas-estado"><span class="t-chip apagada">Revisando tiendas…</span></div>';
    const ts = S.inicio.tiendas;
    const activas = ts.filter((t) => ['vtex', 'shopify', 'sitemap'].includes(t.plataforma) && !['bloqueado', 'error', 'no_disponible'].includes(t.estado));
    return `<div class="tiendas-estado" aria-label="Tiendas">
      ${ts.map((t) => `<span class="t-chip ${activas.includes(t) ? '' : 'apagada'}" title="${esc(t.detalle || '')}"><i class="dot ${esc(t.estado || (activas.includes(t) ? 'ok' : 'pendiente'))}"></i>${esc(t.nombre)}</span>`).join('')}
      <button type="button" class="limpiar" data-action="panel" data-p="tiendas">Ver estado de las tiendas</button>
    </div>`;
  }

  function seccionRebajas() {
    const rs = S.inicio?.rebajas || [];
    if (!rs.length) return '';
    return `
      <section class="seccion" aria-labelledby="t-rebajas">
        <div class="sec-head"><h2 id="t-rebajas">Rebajas <em>de hoy</em></h2><p>Precios rebajados que encontramos en las tiendas. Revisamos el historial para descartar descuentos inflados.</p></div>
        <div class="tira">${rs.map((o) => `
          <button type="button" class="oferta" data-action="ver" data-ids="${esc(o.id)}">
            <span class="pct">-${Math.round((1 - o.precio / o.antes) * 100)}%</span>
            ${img(o.imagen, 'of-img')}
            <span class="t">${esc(o.nombre)}</span>
            <span class="s">en ${esc(tiendaNombre(o.tienda))} · ${o.confirmada ? 'rebaja confirmada' : 'según la tienda'}</span>
            <span class="p">${dinero(o.precio)}<s>${dinero(o.antes)}</s></span>
          </button>`).join('')}
        </div>
      </section>`;
  }

  function seccionVistos() {
    const vs = S.vistos.slice(0, 6);
    if (!vs.length) return '';
    return `
      <section class="seccion" aria-labelledby="t-vistos">
        <div class="sec-head"><h2 id="t-vistos">Vistos <em>recientemente</em></h2><button type="button" class="limpiar" data-action="borrar-vistos">Borrar historial</button></div>
        <div class="minis">${vs.map((v) => `<button type="button" class="mini-card" data-action="ver" data-ids="${esc(v.ids.join(','))}">${img(v.imagen)}<b>${esc(v.nombre)}</b><span>${v.precio ? `<strong>${dinero(v.precio)}</strong> en ${esc(tiendaNombre(v.tienda))}` : 'Sin precio'}</span></button>`).join('')}</div>
      </section>`;
  }

  // ---------- Vista: resultados ----------
  function vistaResultados() {
    const b = S.busqueda;
    if (!b) return '';
    const r = b.resultado;
    const cab = `<section class="res-head">
      <button type="button" class="volver" data-action="inicio" style="padding:0">← Inicio</button>
      <h1>Resultados para <em>${esc(b.q)}</em></h1>
      ${b.cargando ? `<p>Buscando en ${S.inicio ? plural(S.inicio.tiendas.length, 'tienda', 'tiendas') : 'las tiendas'}… puede tardar unos segundos.</p>` : ''}
      ${r ? `<p>${plural(r.grupos.length, 'producto encontrado', 'productos encontrados')} en ${(r.ms / 1000).toFixed(1)} s · tocá una tienda para filtrar</p>${chipsTiendas(r)}` : ''}
    </section>`;
    if (b.cargando) return cab + `<div class="grid">${Array.from({ length: 8 }, () => '<div class="esqueleto" aria-hidden="true"><i></i><i></i><i></i><i></i></div>').join('')}</div>`;
    if (b.error) return cab + `<div class="grid"><div class="aviso-caja"><b>No pudimos buscar</b>${esc(b.error.message)}<br><button type="button" class="btn primario" data-action="reintentar">Intentar de nuevo</button></div></div>`;
    if (!r.grupos.length) return cab + `<div class="grid"><div class="aviso-caja"><b>Ninguna tienda tiene “${esc(b.q)}”</b>Probá con menos palabras o con el nombre más común del producto, por ejemplo “pantalla 55” o “freidora de aire”.</div></div>`;

    const cats = {};
    for (const g of r.grupos) if (g.categoria) cats[g.categoria] = (cats[g.categoria] || 0) + 1;
    const topCats = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([c]) => c);
    const l = filtrados();
    return cab + `
      <div class="filtros">
        <div class="chips" role="group" aria-label="Categorías">
          ${['Todas', ...topCats].map((c) => `<button type="button" class="chip" data-action="cat" data-c="${esc(c)}" aria-pressed="${S.f.cat === c}">${esc(c)}</button>`).join('')}
        </div>
        <div class="filtros-der">
          <button type="button" class="chip suave" data-action="filtros" aria-expanded="${S.f.abiertos}" aria-pressed="${S.f.abiertos || filtrosActivos() > 0}">${I.filtro}Más filtros${filtrosActivos() ? ` <span class="count on">${filtrosActivos()}</span>` : ''}</button>
          <label class="orden">Ordenar
            <select id="orden">
              ${[['relevancia', 'Más parecidos a tu búsqueda'], ['precio', 'Menor precio'], ['precio-desc', 'Mayor precio'], ['ahorro', 'Mayor diferencia entre tiendas'], ['tiendas', 'En más tiendas']]
                .map(([v, t]) => `<option value="${v}" ${S.orden === v ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </label>
        </div>
      </div>
      ${S.f.abiertos ? panelFiltros(r) : ''}
      <p class="resultado">${plural(l.length, 'producto', 'productos')}${filtrosActivos() || S.f.cat !== 'Todas' ? ' con los filtros elegidos' : ''}</p>
      <div class="grid" aria-label="Productos">
        ${l.length ? l.map(tarjeta).join('') : `<div class="aviso-caja"><b>Nada con esos filtros</b>Quitá algún filtro para ver más resultados.<br><button type="button" class="btn" data-action="limpiar-filtros">Quitar filtros</button></div>`}
      </div>`;
  }

  function chipsTiendas(r) {
    const nombres = { ok: '', sin_resultados: 'sin resultados', pendiente: 'pendiente', bloqueado: 'no permite', error: 'falló', no_disponible: 'no disponible', lento: 'muy lenta' };
    return `<div class="tiendas-estado">${r.tiendas.map((t) => t.estado === 'ok'
      ? `<button type="button" class="t-chip" data-action="tienda-f" data-t="${esc(t.id)}" aria-pressed="${S.f.tiendas.includes(t.id)}"><i class="dot ok"></i>${esc(t.nombre)} <span class="n">${t.n}</span></button>`
      : `<span class="t-chip apagada" title="${esc(t.detalle || '')}"><i class="dot ${esc(t.estado)}"></i>${esc(t.nombre)} <span class="n">${nombres[t.estado] || ''}</span></span>`).join('')}</div>`;
  }

  function panelFiltros(r) {
    const precios = r.grupos.map((g) => mejor(g)?.precio).filter(Boolean);
    const tope = Math.max(10000, Math.ceil(Math.max(...precios, 0) / 10000) * 10000);
    const piso = Math.max(0, Math.floor(Math.min(...precios, tope) / 10000) * 10000);
    const val = S.f.precioMax ?? tope;
    return `
      <div class="mas-filtros">
        <div class="grupo">
          <label class="grupo-t" for="precio-max">Precio máximo <output id="precio-max-v">${S.f.precioMax == null ? 'Sin límite' : 'Hasta ' + dinero(val)}</output></label>
          <input type="range" id="precio-max" min="${piso}" max="${tope}" step="${tope > 500000 ? 10000 : 5000}" value="${val}">
          <div class="rango-lim"><span>${dinero(piso)}</span><span>${dinero(tope)}</span></div>
        </div>
        <div class="grupo">
          <span class="grupo-t">Mostrar solo</span>
          <label class="switch"><input type="checkbox" id="f-varias" ${S.f.soloVarias ? 'checked' : ''}><span>En 2 o más tiendas<small>Para comparar de verdad</small></span></label>
          <label class="switch"><input type="checkbox" id="f-rebaja" ${S.f.soloRebaja ? 'checked' : ''}><span>Con rebaja<small>La tienda muestra precio anterior</small></span></label>
        </div>
        <div class="grupo">
          <span class="grupo-t">Además</span>
          <label class="switch"><input type="checkbox" id="f-agotados" ${S.f.agotados ? 'checked' : ''}><span>Incluir agotados<small>Productos sin existencias</small></span></label>
          ${filtrosActivos() ? '<button type="button" class="limpiar" data-action="limpiar-filtros">Quitar todos los filtros</button>' : ''}
        </div>
      </div>`;
  }

  function tarjeta(g) {
    const m = mejor(g);
    const ts = tiendasDe(g);
    const d = disponibles(g);
    const ahorro = d.length > 1 ? Math.max(...d.map((o) => o.precio)) - m.precio : 0;
    const rebaja = m && m.antes && m.antes > m.precio ? Math.round((1 - m.precio / m.antes) * 100) : 0;
    const enLista = S.lista.some((x) => x.id === g.id), enCmp = S.comparar.some((x) => x.id === g.id);
    return `
      <article class="card real">
        <div class="foto">${foto(g.imagen)}
          <div class="badges">
            ${ts.length > 1 ? `<span class="badge b-rosa">En ${ts.length} tiendas</span>` : ''}
            ${rebaja >= 3 ? `<span class="badge b-bueno">-${rebaja}%</span>` : ''}
            ${!m ? '<span class="badge b-normal">Agotado</span>' : ''}
          </div>
        </div>
        <div>
          <p class="marca">${esc(g.marca || g.categoria || '')}</p>
          <h3><button type="button" data-action="ver" data-ids="${esc(idsDe(g).join(','))}" data-g="${esc(g.id)}">${esc(g.nombre)}</button></h3>
        </div>
        <div style="display:grid;gap:9px;align-content:start">
          ${m ? `<span class="tag"><small>${ts.length > 1 ? 'Desde' : 'Precio'}</small><strong>${dinero(m.precio)}</strong></span>
          <p class="donde">en <b>${esc(tiendaNombre(m.tienda))}</b>${ts.length > 1 ? ` · ${ts.length} tiendas` : ''}</p>` : '<p class="donde">Agotado en todas las tiendas</p>'}
        </div>
        ${ahorro > 0 ? `<p class="ahorro">${I.chispa}Ahorrás ${dinero(ahorro)} comparando</p>` : '<p class="ahorro" aria-hidden="true"></p>'}
        <div class="card-actions">
          <button type="button" class="mini" data-action="lista" data-g="${esc(g.id)}" aria-pressed="${enLista}">${I.corazon}${enLista ? 'Guardado' : 'Guardar'}</button>
          <button type="button" class="mini" data-action="comparar" data-g="${esc(g.id)}" aria-pressed="${enCmp}">${I.cmp}Comparar</button>
        </div>
      </article>`;
  }

  // ---------- Vista: detalle ----------
  async function abrirProducto(ids, grupoLocal) {
    ids = [...new Set(ids)].filter(Boolean);
    const llave = [...ids].sort().join(',');
    const local = grupoLocal || S.grupos.get(llave) || [...S.grupos.values()].find((g) => ids.every((id) => idsDe(g).includes(id)));
    S.vista = 'detalle';
    S.modoPago = 'contado';
    S.detalle = { llave, ids, grupo: local || null, historial: null, analisis: null, cargando: true, error: null, sinDB: false };
    if (local) registrarVisto(local);
    render();
    window.scrollTo(0, 0);
    try {
      const r = await api('/producto?ids=' + encodeURIComponent(ids.join(',')));
      if (S.detalle?.llave !== llave) return;
      if (r.sinDB) S.detalle = { ...S.detalle, cargando: false, sinDB: true };
      else {
        S.detalle = { ...S.detalle, grupo: r.grupo, historial: r.historial, analisis: r.analisis, cargando: false };
        registrarVisto(r.grupo);
      }
    } catch (e) {
      if (S.detalle?.llave !== llave) return;
      S.detalle = { ...S.detalle, cargando: false, error: e };
    }
    if (S.vista === 'detalle') render();
  }

  function vistaDetalle() {
    const D = S.detalle;
    const g = D.grupo;
    if (!g) {
      if (D.cargando) return `<button type="button" class="volver" data-action="atras">← Volver</button><div class="grid"><div class="esqueleto" aria-hidden="true"><i></i><i></i><i></i><i></i></div></div>`;
      return `<button type="button" class="volver" data-action="inicio">← Inicio</button><div class="aviso-caja"><b>No encontramos ese producto</b>${esc(D.error?.message || (D.sinDB ? 'Este enlace necesita la base de datos para abrirse. Buscá el producto de nuevo.' : ''))}</div>`;
    }
    const os = [...g.ofertas].sort((a, b) => (b.disponible - a.disponible) || a.precio - b.precio);
    const m = mejor(g);
    const d = disponibles(g);
    const max = d.length ? Math.max(...d.map((o) => o.precio)) : null;
    const enLista = S.lista.some((x) => x.id === g.id), enCmp = S.comparar.some((x) => x.id === g.id);
    const mo = D.analisis?.momento;
    const sugerido = m ? Math.round((m.precio * 0.93) / 1000) * 1000 : '';
    const similares = (S.busqueda?.resultado?.grupos || []).filter((x) => x.id !== g.id && x.categoria && x.categoria === g.categoria).slice(0, 4);
    const vuelta = S.busqueda?.q ? `← Resultados de “${esc(S.busqueda.q)}”` : '← Inicio';
    return `
      <button type="button" class="volver" data-action="${S.busqueda?.q ? 'volver-res' : 'inicio'}">${vuelta}</button>
      <section class="det-top">
        <div class="foto">${foto(g.imagen)}</div>
        <div class="det-info">
          <p class="marca">${esc([g.marca, g.categoria].filter(Boolean).join(' · '))}</p>
          <h1>${esc(g.nombre)}</h1>
          ${g.modelo || g.ean ? `<p class="codigos">${g.modelo ? `Modelo ${esc(g.modelo.toUpperCase())}` : ''}${g.modelo && g.ean ? ' · ' : ''}${g.ean ? `Código de barras ${esc(g.ean)}` : ''}</p>` : ''}
          <div class="precio-linea">
            ${m ? `<span class="tag grande"><small>Mejor precio hoy</small><strong>${dinero(m.precio)}</strong></span>
            <p>en <b>${esc(tiendaNombre(m.tienda))}</b>${max > m.precio ? `<br>la más cara cobra ${dinero(max)}` : ''}</p>` : '<p>Agotado en todas las tiendas</p>'}
          </div>
          <div class="acciones">
            <button type="button" class="btn" data-action="lista" data-g="${esc(g.id)}" aria-pressed="${enLista}">${I.corazon}${enLista ? 'En mi lista' : 'Agregar a mi lista'}</button>
            <button type="button" class="btn" data-action="comparar" data-g="${esc(g.id)}" aria-pressed="${enCmp}">${I.cmp}Comparar</button>
            <button type="button" class="btn" data-action="compartir">${I.compartir}Compartir</button>
          </div>
        </div>
      </section>

      ${mo ? `<div class="momento m-${esc(mo.nivel)}"><span class="dial" aria-hidden="true">${{ bueno: '✓', esperar: '!', normal: '≈', registrando: '…', agotado: '×' }[mo.nivel] || '·'}</span><strong>${esc(mo.titulo)}</strong><p>${esc(mo.texto)}</p></div>`
        : D.cargando ? '<div class="momento m-registrando"><span class="dial" aria-hidden="true">…</span><strong>Revisando el historial</strong><p>Un momento.</p></div>'
        : D.sinDB ? '<div class="momento m-registrando"><span class="dial" aria-hidden="true">…</span><strong>Historial desactivado</strong><p>Conectá la base de datos (Supabase) para guardar el historial de precios.</p></div>' : ''}

      <div class="det-grid">
        <section class="bloque span2" aria-labelledby="t-precios">
          <div class="bloque-head">
            <div>
              <h2 id="t-precios">Precios por tienda</h2>
              <p class="sub">${S.modoPago === 'contado' ? `${plural(os.length, 'opción', 'opciones')}, de menor a mayor precio.` : 'Cuotas que anuncia cada tienda (con tarjeta).'}${g.ofertas[0]?.actualizado ? ` Actualizado ${hace(g.ofertas.map((o) => o.actualizado).filter(Boolean).sort().pop())}.` : ''}</p>
            </div>
            <div class="tabs" role="tablist" aria-label="Forma de pago">
              <button type="button" role="tab" data-action="pago" data-m="contado" aria-selected="${S.modoPago === 'contado'}">Contado</button>
              <button type="button" role="tab" data-action="pago" data-m="credito" aria-selected="${S.modoPago === 'credito'}">Cuotas</button>
            </div>
          </div>
          <div class="tabla-wrap">${S.modoPago === 'contado' ? tablaContado(os) : tablaCuotas(os)}</div>
        </section>

        <section class="bloque" aria-labelledby="t-hist">
          <div class="bloque-head"><div><h2 id="t-hist">Historial de precios</h2><p class="sub">${D.analisis?.desde ? `Registrado desde el ${fechaCorta(D.analisis.desde)} (${plural(D.analisis.dias, 'día', 'días')}).` : 'Se llena solo, un punto por día.'}</p></div></div>
          <div class="chart-wrap" id="chart">${D.cargando ? '<p class="sub">Cargando historial…</p>' : ''}</div>
        </section>

        <section class="bloque" aria-labelledby="t-alerta">
          <div class="bloque-head"><div><h2 id="t-alerta">Avisame si baja</h2><p class="sub">Revisamos los precios cada 6 horas.</p></div></div>
          <form class="alerta" id="form-alerta" novalidate>
            <label class="campo" for="a-precio">Precio objetivo (${enDolares() ? 'US$' : '₡'})
              <input id="a-precio" name="precio" inputmode="numeric" value="${sugerido ? (enDolares() ? Math.round(sugerido / S.tc.venta) : sugerido) : ''}" required>
              <span class="ayuda">Sugerido: 7% menos que el mejor precio de hoy.</span>
            </label>
            <label class="campo" for="a-correo">Correo para avisarte (opcional)
              <input id="a-correo" name="correo" type="email" placeholder="tucorreo@ejemplo.com" autocomplete="email">
            </label>
            <p class="error" id="a-error" hidden></p>
            <button type="submit" class="btn primario">${I.campana}Crear alerta</button>
          </form>
        </section>
      </div>
      ${similares.length ? `<section class="seccion" aria-labelledby="t-similares">
        <div class="sec-head"><h2 id="t-similares">También en <em>${esc(g.categoria)}</em></h2></div>
        <div class="minis">${similares.map((x) => { const mm = mejor(x); return `<button type="button" class="mini-card" data-action="ver" data-ids="${esc(idsDe(x).join(','))}" data-g="${esc(x.id)}">${img(x.imagen)}<b>${esc(x.nombre)}</b><span>${mm ? `<strong>${dinero(mm.precio)}</strong> en ${esc(tiendaNombre(mm.tienda))}` : 'Agotado'}</span></button>`; }).join('')}</div>
      </section>` : ''}`;
  }

  function avisoOferta(o) {
    if (!o.disponible) return '<span class="badge b-normal">Agotado</span>';
    if (!o.antes || o.antes <= o.precio) return '';
    const pct = Math.round((1 - o.precio / o.antes) * 100);
    const inf = S.detalle?.analisis?.inflados?.[o.id];
    if (inf === true) return '<span class="badge b-falsa" title="Hace más de 25 días ya costaba esto o menos">Descuento inflado</span>';
    if (inf === false) return `<span class="badge b-bueno">Rebaja confirmada ${pct}%</span>`;
    return `<span class="badge b-rosa" title="Todavía no tenemos historial suficiente para confirmarla">Rebaja ${pct}% según la tienda</span>`;
  }

  function tablaContado(os) {
    const primero = os.find((o) => o.disponible);
    return `<table>
      <thead><tr><th>Tienda</th><th class="n">Precio</th><th>Aviso</th><th></th></tr></thead>
      <tbody>${os.map((o) => `
        <tr class="${o === primero ? 'top' : ''} ${o.disponible ? '' : 'agotado'}">
          <td><span class="tienda-nom">${esc(tiendaNombre(o.tienda))}</span>${o === primero && os.filter((x) => x.disponible).length > 1 ? ' <span class="badge b-rosa">Más barato</span>' : ''}
            <span class="vendedor">${esc(o.vendedor ? 'Vendido por ' + o.vendedor : o.nombre)}</span></td>
          <td class="n">${o.antes && o.antes > o.precio ? `<span class="antes">${dinero(o.antes)}</span>` : ''}${dinero(o.precio)}${o.moneda === 'USD' && o.precioOriginal ? `<span class="vendedor">US$${Number(o.precioOriginal).toFixed(2)}</span>` : ''}</td>
          <td>${avisoOferta(o)}</td>
          <td><a class="lnk" href="${esc(o.url)}" target="_blank" rel="noopener">Ver en la tienda ↗</a></td>
        </tr>`).join('')}
      </tbody></table>
      ${os.some((o) => S.detalle?.analisis?.inflados?.[o.id] === true) ? '<p class="nota"><b>Descuento inflado:</b> la tienda muestra un precio “antes”, pero según nuestro historial el producto ya costaba lo mismo o menos hace más de 25 días.</p>' : ''}
      <p class="nota">Los precios son los que publica cada tienda en su sitio. El envío y los impuestos pueden variar.</p>`;
  }

  function tablaCuotas(os) {
    const con = os.filter((o) => o.disponible && o.cuotas && (o.cuotas.sinInteres || o.cuotas.conInteres));
    const sin = os.filter((o) => o.disponible && !(o.cuotas && (o.cuotas.sinInteres || o.cuotas.conInteres))).map((o) => tiendaNombre(o.tienda));
    if (!con.length) return `<p class="sub">Ninguna tienda publica cuotas para este producto en su sitio. ${sin.length ? 'Consultá directamente en ' + esc([...new Set(sin)].join(', ')) + '.' : ''}</p>`;
    const minContado = Math.min(...os.filter((o) => o.disponible).map((o) => o.precio));
    return `<table>
      <thead><tr><th>Tienda</th><th class="n">Cuota mensual</th><th class="n">Plazo</th><th class="n">Total</th><th>Condición</th></tr></thead>
      <tbody>${con.map((o) => {
        const c = o.cuotas.sinInteres || o.cuotas.conInteres;
        const total = o.cuotas.sinInteres ? c.cuota * c.meses : c.total;
        return `<tr>
          <td><span class="tienda-nom">${esc(tiendaNombre(o.tienda))}</span></td>
          <td class="n">${dinero(c.cuota)}</td>
          <td class="n">${c.meses} meses</td>
          <td class="n">${dinero(total)}${total > minContado * 1.005 ? `<span class="vendedor extra">+${dinero(total - minContado)} vs. mejor contado</span>` : ''}</td>
          <td class="cuotas-celda">${o.cuotas.sinInteres ? '<span class="badge b-bueno">Tasa cero</span>' : `<span class="badge b-esperar">Con interés</span>`}<small>${esc((c.tarjetas || []).join(', '))}</small></td>
        </tr>`;
      }).join('')}</tbody></table>
      ${sin.length ? `<p class="nota">Sin cuotas publicadas en línea: ${esc([...new Set(sin)].join(', '))}. Algunas tiendas dan crédito propio en sus sucursales.</p>` : ''}`;
  }

  // ---------- Gráfico de historial ----------
  function pasoBonito(rangoV, n) {
    const bruto = rangoV / n || 1, mag = Math.pow(10, Math.floor(Math.log10(bruto))), f = bruto / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }

  function dibujarGrafico() {
    const cont = $('#chart');
    const D = S.detalle;
    if (!cont || !D || D.cargando) return;
    if (D.sinDB) { cont.innerHTML = '<p class="sub">El historial necesita la base de datos (Supabase). Ver README.</p>'; return; }
    const g = D.grupo;
    const porOferta = {};
    for (const h of D.historial || []) (porOferta[h.oferta_id] ||= []).push(h);
    const tiendas = [...new Set(g.ofertas.map((o) => o.tienda))];
    // Una línea por tienda (precio mínimo del día entre sus ofertas)
    const series = tiendas.map((tid, i) => {
      const dia = new Map();
      for (const o of g.ofertas.filter((x) => x.tienda === tid)) for (const h of porOferta[o.id] || []) dia.set(h.fecha, Math.min(dia.get(h.fecha) ?? Infinity, h.precio));
      return { nombre: tiendaNombre(tid), color: `var(--c${(i % 6) + 1})`, puntos: [...dia.entries()].sort().map(([fecha, precio]) => ({ fecha, precio })) };
    }).filter((s) => s.puntos.length);
    const fechas = [...new Set(series.flatMap((s) => s.puntos.map((x) => x.fecha)))].sort();
    if (fechas.length < 2) {
      cont.innerHTML = `<p class="sub">${fechas.length ? `Hoy empezamos a registrar este precio. Cada día se agrega un punto y aquí vas a ver cómo cambia.` : 'Todavía no hay historial. Se guarda automáticamente desde la primera búsqueda.'}</p>`;
      return;
    }
    const idx = new Map(fechas.map((f, i) => [f, i]));
    let lo = Infinity, hi = -Infinity;
    for (const s of series) for (const x of s.puntos) { lo = Math.min(lo, x.precio); hi = Math.max(hi, x.precio); }
    const pad = (hi - lo) * 0.12 || hi * 0.05; lo -= pad; hi += pad;
    const paso = pasoBonito(hi - lo, 4);
    const ticks = []; for (let v = Math.ceil(lo / paso) * paso; v <= hi; v += paso) ticks.push(v);
    const angosto = cont.clientWidth < 480;
    const W = angosto ? 420 : 640, H = angosto ? 260 : 250, m = { l: 56, r: 12, t: 12, b: 28 };
    const n = fechas.length - 1;
    const X = (i) => m.l + (i * (W - m.l - m.r)) / n;
    const Y = (v) => m.t + ((hi - v) * (H - m.t - m.b)) / (hi - lo);
    const xs = [...new Set([0, Math.floor(n / 2), n])];
    cont.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Historial de precios de ${esc(g.nombre)}">
        ${ticks.map((v) => `<line class="grid-l" x1="${m.l}" x2="${W - m.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="axis-t" x="${m.l - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${dineroCorto(v)}</text>`).join('')}
        ${xs.map((i, k) => `<text class="axis-t" x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : i === n ? 'end' : 'middle'}">${fechaCorta(fechas[i])}</text>`).join('')}
        ${series.map((s) => {
          const d = s.puntos.map((x, j) => `${j ? 'L' : 'M'}${X(idx.get(x.fecha)).toFixed(1)} ${Y(x.precio).toFixed(1)}`).join('');
          const u = s.puntos[s.puntos.length - 1];
          return `<path class="serie" d="${d}" style="stroke:${s.color}"/><circle cx="${X(idx.get(u.fecha)).toFixed(1)}" cy="${Y(u.precio).toFixed(1)}" r="4" style="fill:${s.color};stroke:var(--surface);stroke-width:2"/>`;
        }).join('')}
        <line class="cursor" id="cursor" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/>
        <rect id="hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/>
      </svg>
      <div class="leyenda">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.nombre)}</span>`).join('')}</div>
      <div class="tip" id="tip" hidden></div>`;
    const svg = cont.querySelector('svg'), hit = $('#hit', cont), cur = $('#cursor', cont), tip = $('#tip', cont);
    const mapas = series.map((s) => new Map(s.puntos.map((x) => [x.fecha, x.precio])));
    const mover = (ev) => {
      const rect = svg.getBoundingClientRect();
      const sx = ((ev.clientX - rect.left) / rect.width) * W;
      const i = Math.max(0, Math.min(n, Math.round(((sx - m.l) / (W - m.l - m.r)) * n)));
      const f = fechas[i];
      cur.setAttribute('x1', X(i)); cur.setAttribute('x2', X(i)); cur.setAttribute('visibility', 'visible');
      tip.innerHTML = `<b>${fechaCorta(f)}</b>` + series.map((s, k) => mapas[k].has(f) ? `<div><span><span style="color:${s.color}">●</span> ${esc(s.nombre)}</span><span>${dinero(mapas[k].get(f))}</span></div>` : '').join('');
      tip.hidden = false;
      const px = (X(i) / W) * rect.width, tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(rect.width - tw, px + (px > rect.width / 2 ? -tw - 12 : 12))) + 'px';
      tip.style.top = '6px';
    };
    hit.addEventListener('pointermove', mover);
    hit.addEventListener('pointerdown', mover);
    hit.addEventListener('pointerleave', () => { tip.hidden = true; cur.setAttribute('visibility', 'hidden'); });
  }

  // ---------- Paneles ----------
  const cabeceraPanel = (titulo, sub) => `<div class="panel-head"><div><h2 id="panel-title">${esc(titulo)}</h2><p class="sub">${esc(sub)}</p></div><button type="button" class="cerrar" data-action="cerrar" aria-label="Cerrar">${I.x}</button></div>`;

  function panelLista() {
    const items = S.lista;
    if (!items.length) return cabeceraPanel('Mi lista', '0 productos') + '<div class="panel-vacio"><b>Tu lista está vacía</b><p>Tocá “Guardar” en cualquier producto para seguirlo de cerca y ver cuánto cuesta todo junto.</p></div>';
    const total = items.reduce((s, x) => s + (x.precio || 0), 0);
    const porTienda = {};
    for (const x of items) if (x.tienda) porTienda[x.tienda] = (porTienda[x.tienda] || 0) + 1;
    return cabeceraPanel('Mi lista', plural(items.length, 'producto', 'productos')) + `
      <div style="display:grid;gap:8px">${items.map((x) => `
        <div class="item">
          <h3><button type="button" data-action="ver" data-ids="${esc(x.ids.join(','))}">${esc(x.nombre)}</button></h3>
          <p>${x.tienda ? `Más barato en ${esc(tiendaNombre(x.tienda))}` : 'Agotado'} · revisado ${hace(x.fecha)}</p>
          <div class="der"><span class="precio">${x.precio ? dinero(x.precio) : '—'}</span><button type="button" class="quitar" data-action="quitar-lista" data-g="${esc(x.id)}">Quitar</button></div>
        </div>`).join('')}
      </div>
      <div class="resumen">
        <div class="resumen-fila mejor"><span>Comprando cada producto donde está más barato<small>${Object.entries(porTienda).map(([t, n]) => `${tiendaNombre(t)} (${n})`).join(', ')}</small></span><strong>${dinero(total)}</strong></div>
        <button type="button" class="btn" data-action="refrescar-lista" id="btn-refrescar">Actualizar precios de mi lista</button>
      </div>`;
  }

  function panelAlertas() {
    const items = S.alertas;
    const cuerpo = items.length ? `<div style="display:grid;gap:8px">${items.map((a) => `
      <div class="item">
        <h3><button type="button" data-action="ver" data-ids="${esc(a.ids.join(','))}">${esc(a.nombre)}</button></h3>
        <p>${a.cumplida ? `<span class="estado-ok">¡Llegó a ${dinero(a.cumplida.precio)} en ${esc(tiendaNombre(a.cumplida.tienda))}!</span>` : `Esperando que baje${a.correo ? ` · aviso a ${esc(a.correo)}` : ''}`}${a.remoto ? '' : ' · guardada solo en este navegador'}</p>
        <div class="der"><span class="precio">${dinero(a.objetivo)}</span><button type="button" class="quitar" data-action="quitar-alerta" data-id="${esc(a.id)}">Eliminar</button></div>
      </div>`).join('')}</div>
      <p class="nota">Revisamos los precios cada 6 horas. Si dejaste tu correo, te escribimos cuando se cumpla.</p>`
      : '<div class="panel-vacio"><b>No tenés alertas</b><p>Abrí un producto y usá “Avisame si baja” para elegir tu precio objetivo.</p></div>';
    return cabeceraPanel('Alertas de precio', plural(items.length, 'alerta', 'alertas')) + cuerpo;
  }

  function panelTiendas() {
    const ini = S.inicio;
    if (!ini) return cabeceraPanel('Tiendas', 'Cargando…') + `<div class="panel-vacio">${S.errorInicio ? esc(S.errorInicio.message) : 'Revisando tiendas…'}</div>`;
    const etiquetas = { ok: 'Funcionando', pendiente: 'Pendiente', bloqueado: 'No permite robots', error: 'Con errores', no_disponible: 'Sin datos públicos', sin_resultados: 'Sin productos' };
    const formas = { vtex: 'Búsqueda en vivo', shopify: 'Catálogo indexado', sitemap: 'Páginas de producto', auto: 'Detectando…', ninguna: '—' };
    const rk = ini.ranking || [];
    const maxG = Math.max(1, ...rk.map((r) => r.gana));
    return cabeceraPanel('Tiendas', `Tipo de cambio: ₡${ini.tipoCambio?.venta ?? '—'} por dólar (${ini.tipoCambio?.fuente || ''})`) + `
      ${rk.length ? `<div class="sec-head" style="margin:0"><h2 style="font-size:20px">¿Quién es más <em>barata</em>?</h2></div>
      <div class="rank">${rk.map((r, i) => `
        <div class="rank-fila">
          <span class="rank-pos">${i + 1}</span>
          <b>${esc(tiendaNombre(r.tienda))}</b>
          <p>${plural(r.productos, 'producto comparable', 'productos comparables')} · ${r.promedioSobre < 0.005 ? 'casi siempre al mejor precio' : `en promedio ${(r.promedioSobre * 100).toFixed(1)}% más cara que la mejor`}</p>
          <div class="der"><strong>${r.gana}</strong><span>${r.gana === 1 ? 'vez la más barata' : 'veces la más barata'}</span></div>
          <div class="barra"><i style="width:${(r.gana / maxG) * 100}%"></i></div>
        </div>`).join('')}</div>
      <p class="nota">Con productos que venden 2 o más tiendas (mismo código de barras o modelo), según los precios de los últimos 7 días.</p>`
      : '<div class="panel-vacio"><b>Ranking en construcción</b><p>Se arma con los productos que aparecen en 2 o más tiendas a medida que la gente busca.</p></div>'}
      <div class="sec-head" style="margin:0"><h2 style="font-size:20px">Estado de <em>cada tienda</em></h2></div>
      <div class="estado-tiendas-lista">${ini.tiendas.map((t) => `
        <div class="item">
          <h3><span class="dot ${esc(t.estado || 'pendiente')}" style="display:inline-block;margin-right:8px"></span>${esc(t.nombre)}</h3>
          <p>${esc(formas[t.plataforma] || t.plataforma || '')}${t.detalle ? ' · ' + esc(t.detalle) : ''}${t.revisado ? ` · revisada ${hace(t.revisado)}` : ''}</p>
          <div class="der"><span class="badge ${t.estado === 'ok' ? 'b-bueno' : ['bloqueado', 'error', 'no_disponible'].includes(t.estado) ? 'b-falsa' : 'b-normal'}">${esc(etiquetas[t.estado] || 'Sin revisar')}</span></div>
        </div>`).join('')}</div>
      <p class="nota">Solo leemos lo que cada tienda permite a los robots en su archivo robots.txt. Para revisar todas de nuevo, abrí <a class="lnk" href="${esc(CFG.api)}/diagnostico" target="_blank" rel="noopener">el diagnóstico</a>.</p>`;
  }

  function panelComparar() {
    const ps = S.comparar;
    const precios = ps.map((g) => mejor(g)?.precio ?? Infinity);
    const minP = Math.min(...precios);
    const fila = (titulo, celdas) => `<tr><td>${esc(titulo)}</td>${celdas.join('')}</tr>`;
    return cabeceraPanel('Comparar productos', `${ps.length} de 3`) + `
      <div class="bloque" style="padding:0 20px"><div class="tabla-wrap"><table class="cmp">
        <thead><tr><th></th>${ps.map((g) => `<th>${esc(g.nombre)}</th>`).join('')}</tr></thead>
        <tbody>
          ${fila('Foto', ps.map((g) => `<td><div class="foto" style="max-width:160px">${foto(g.imagen)}</div></td>`))}
          ${fila('Mejor precio', ps.map((g, i) => `<td class="num ${precios[i] === minP && ps.length > 1 ? 'gana' : ''}">${dinero(precios[i])}</td>`))}
          ${fila('Dónde', ps.map((g) => `<td>${esc(mejor(g) ? tiendaNombre(mejor(g).tienda) : 'Agotado')}</td>`))}
          ${fila('Tiendas', ps.map((g) => `<td>${tiendasDe(g).map(tiendaNombre).map(esc).join(', ') || '—'}</td>`))}
          ${fila('Marca', ps.map((g) => `<td>${esc(g.marca || '—')}</td>`))}
          ${fila('Categoría', ps.map((g) => `<td>${esc(g.categoria || '—')}</td>`))}
          ${fila('Modelo', ps.map((g) => `<td>${esc(g.modelo ? g.modelo.toUpperCase() : '—')}</td>`))}
          ${fila('Cuotas sin interés', ps.map((g) => { const c = disponibles(g).map((o) => o.cuotas?.sinInteres).filter(Boolean).sort((a, b) => b.meses - a.meses)[0]; return `<td>${c ? `Hasta ${c.meses} meses` : '—'}</td>`; }))}
          ${fila('', ps.map((g) => `<td><button type="button" class="quitar" data-action="comparar" data-g="${esc(g.id)}">Quitar</button></td>`))}
        </tbody></table></div></div>`;
  }

  // ---------- Render ----------
  function render() {
    const app = $('#app');
    if (S.vista === 'detalle' && S.detalle) {
      app.innerHTML = vistaDetalle();
      document.title = (S.detalle.grupo?.nombre ? S.detalle.grupo.nombre + ' · ' : '') + CFG.nombre;
      dibujarGrafico();
    } else if (S.vista === 'resultados' && S.busqueda) {
      app.innerHTML = vistaResultados();
      document.title = `${S.busqueda.q} · ${CFG.nombre}`;
    } else {
      app.innerHTML = vistaInicio();
      document.title = CFG.nombre;
    }
    renderBarra();
    renderTray();
    renderPanel();
  }

  function renderBarra() {
    const nl = $('#n-lista'), na = $('#n-alertas');
    nl.textContent = S.lista.length; nl.classList.toggle('on', S.lista.length > 0);
    const cumplidas = S.alertas.filter((a) => a.cumplida).length;
    na.textContent = cumplidas ? `${cumplidas}!` : S.alertas.length; na.classList.toggle('on', S.alertas.length > 0);
    $('#m-crc').setAttribute('aria-pressed', S.moneda === 'CRC');
    $('#m-usd').setAttribute('aria-pressed', S.moneda === 'USD');
    const bt = $('#btn-tema');
    const nombres = { auto: 'automático', light: 'claro', dark: 'oscuro' };
    bt.innerHTML = S.tema === 'dark' ? I.luna : S.tema === 'light' ? I.sol : I.auto;
    bt.setAttribute('aria-label', 'Tema: ' + nombres[S.tema] + '. Tocá para cambiar.');
    bt.title = 'Tema ' + nombres[S.tema];
  }

  function renderTray() {
    const t = $('#tray');
    if (!S.comparar.length || S.panel === 'comparar') { t.hidden = true; return; }
    t.innerHTML = `<p><b>${S.comparar.length}/3</b> · ${esc(S.comparar.map((g) => g.nombre).join(', '))}</p>
      <button type="button" class="btn primario" data-action="panel" data-p="comparar" ${S.comparar.length < 2 ? 'disabled' : ''}>${S.comparar.length < 2 ? 'Elegí 1 más' : 'Comparar'}</button>
      <button type="button" class="btn x" data-action="limpiar-cmp" aria-label="Quitar todos">${I.x}</button>`;
    t.hidden = false;
  }

  let ultimoFoco = null;
  function renderPanel() {
    const pn = $('#panel'), ov = $('#overlay');
    if (!S.panel) { pn.hidden = true; ov.hidden = true; return; }
    pn.classList.toggle('ancho', S.panel === 'comparar');
    pn.innerHTML = { lista: panelLista, alertas: panelAlertas, comparar: panelComparar, tiendas: panelTiendas }[S.panel]();
    const abierto = !pn.hidden;
    pn.hidden = false; ov.hidden = false;
    if (!abierto) $('.cerrar', pn)?.focus();
  }

  let toastT;
  function aviso(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2800);
  }

  function aplicarTema() {
    if (S.tema === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', S.tema);
  }

  // ---------- Acciones ----------
  const grupoPorId = (id) => S.grupos.get(id) || (S.detalle?.grupo?.id === id ? S.detalle.grupo : null) || S.comparar.find((g) => g.id === id);

  function alternarLista(id) {
    const i = S.lista.findIndex((x) => x.id === id);
    if (i >= 0) { S.lista.splice(i, 1); aviso('Quitado de tu lista'); }
    else { const g = grupoPorId(id); if (!g) return; S.lista.unshift(instantanea(g)); aviso('Agregado a tu lista ♡'); }
    guardar.set('lista', S.lista);
  }
  function alternarComparar(id) {
    const i = S.comparar.findIndex((x) => x.id === id);
    if (i >= 0) S.comparar.splice(i, 1);
    else if (S.comparar.length >= 3) { aviso('Podés comparar hasta 3 productos'); return; }
    else { const g = grupoPorId(id); if (g) S.comparar.push(g); }
    if (S.panel === 'comparar' && S.comparar.length < 2) S.panel = null;
  }
  function registrarVisto(g) {
    S.vistos = [instantanea(g), ...S.vistos.filter((x) => x.id !== g.id && x.ids.join() !== idsDe(g).join())].slice(0, 12);
    guardar.set('vistos', S.vistos);
  }
  async function compartir() {
    const g = S.detalle?.grupo; if (!g) return;
    const m = mejor(g);
    const url = new URL(location.href); url.search = ''; url.searchParams.set('p', idsDe(g).join(','));
    const texto = `${g.nombre}: ${m ? `${dinero(m.precio)} en ${tiendaNombre(m.tienda)}` : 'agotado'} · ${url.href}`;
    try { await navigator.clipboard.writeText(texto); aviso('Enlace copiado: pegalo en WhatsApp o donde quieras'); }
    catch (e) { aviso(texto); }
  }
  async function refrescarLista() {
    const b = $('#btn-refrescar'); if (b) { b.disabled = true; b.textContent = 'Actualizando…'; }
    let ok = 0;
    for (const x of S.lista) {
      try {
        const r = await api('/producto?expandir=0&ids=' + encodeURIComponent(x.ids.join(',')));
        if (r.grupo) { Object.assign(x, instantanea(r.grupo), { id: x.id }); ok++; }
      } catch (e) { /* se deja el precio anterior */ }
    }
    guardar.set('lista', S.lista);
    aviso(ok ? `Precios actualizados (${ok})` : 'No se pudieron actualizar los precios ahora');
    render();
  }
  async function revisarAlertas() {
    const remotas = S.alertas.filter((a) => a.remoto && !a.cumplida);
    if (!remotas.length) return;
    try {
      const r = await api('/alertas?ids=' + remotas.map((a) => a.remoto).join(','));
      let nuevas = 0;
      for (const f of r.alertas || []) {
        const a = S.alertas.find((x) => x.remoto === f.id);
        if (a && f.cumplida_en && !a.cumplida) { a.cumplida = { precio: f.precio_encontrado, tienda: f.tienda_encontrada, fecha: f.cumplida_en }; nuevas++; }
      }
      if (nuevas) { guardar.set('alertas', S.alertas); renderBarra(); aviso(`¡${plural(nuevas, 'alerta se cumplió', 'alertas se cumplieron')}! Revisá tus alertas.`); }
    } catch (e) { /* se reintenta en la próxima visita */ }
  }
  function cerrarPanel() {
    S.panel = null; render();
    if (ultimoFoco && document.contains(ultimoFoco)) ultimoFoco.focus();
  }

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    switch (a) {
      case 'inicio': ev.preventDefault(); S.panel = null; irA({}); window.scrollTo(0, 0); break;
      case 'atras': history.back(); break;
      case 'volver-res': irA({ q: S.busqueda.q }); break;
      case 'buscar': irA({ q: b.dataset.q }); break;
      case 'reintentar': { const q = S.busqueda.q; S.busqueda = null; iniciarBusqueda(q); break; }
      case 'ver': {
        S.panel = null;
        const g = b.dataset.g && S.grupos.get(b.dataset.g);
        const ids = g ? idsDe(g) : b.dataset.ids.split(',');
        try { const u = new URL(location.href); u.search = ''; u.searchParams.set('p', ids.join(',')); history.pushState({}, '', u); } catch (e) { /* sin historial */ }
        abrirProducto(ids, g);
        break;
      }
      case 'cat': S.f.cat = b.dataset.c; render(); break;
      case 'filtros': S.f.abiertos = !S.f.abiertos; render(); break;
      case 'tienda-f': { const t = b.dataset.t; S.f.tiendas = S.f.tiendas.includes(t) ? S.f.tiendas.filter((x) => x !== t) : [...S.f.tiendas, t]; render(); break; }
      case 'limpiar-filtros': Object.assign(S.f, { tiendas: [], precioMax: null, soloVarias: false, soloRebaja: false, agotados: false, cat: 'Todas' }); render(); break;
      case 'moneda':
        if (b.dataset.m === 'USD' && !S.tc.venta) { aviso('Todavía no tenemos el tipo de cambio'); break; }
        S.moneda = b.dataset.m; guardar.set('moneda', S.moneda); render(); break;
      case 'tema': S.tema = { auto: 'light', light: 'dark', dark: 'auto' }[S.tema]; guardar.set('tema', S.tema); aplicarTema(); renderBarra(); dibujarGrafico(); break;
      case 'pago': S.modoPago = b.dataset.m; render(); break;
      case 'lista': alternarLista(b.dataset.g); render(); break;
      case 'quitar-lista': S.lista = S.lista.filter((x) => x.id !== b.dataset.g); guardar.set('lista', S.lista); render(); break;
      case 'refrescar-lista': refrescarLista(); break;
      case 'comparar': alternarComparar(b.dataset.g); render(); break;
      case 'limpiar-cmp': S.comparar = []; render(); break;
      case 'compartir': compartir(); break;
      case 'borrar-vistos': S.vistos = []; guardar.set('vistos', []); render(); break;
      case 'panel': ultimoFoco = b; S.panel = b.dataset.p; render(); break;
      case 'cerrar': cerrarPanel(); break;
      case 'quitar-alerta': S.alertas = S.alertas.filter((x) => x.id !== b.dataset.id); guardar.set('alertas', S.alertas); aviso('Alerta eliminada'); render(); break;
    }
  });

  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'orden') { S.orden = t.value; render(); }
    if (t.id === 'f-varias') { S.f.soloVarias = t.checked; render(); }
    if (t.id === 'f-rebaja') { S.f.soloRebaja = t.checked; render(); }
    if (t.id === 'f-agotados') { S.f.agotados = t.checked; render(); }
    if (t.id === 'precio-max') render();
  });

  document.addEventListener('input', (ev) => {
    if (ev.target.id !== 'precio-max') return;
    const v = Number(ev.target.value);
    S.f.precioMax = v >= Number(ev.target.max) ? null : v;
    $('#precio-max-v').textContent = S.f.precioMax == null ? 'Sin límite' : 'Hasta ' + dinero(v);
  });

  document.addEventListener('submit', async (ev) => {
    const f = ev.target;
    if (f.id === 'form-top' || f.id === 'form-hero') {
      ev.preventDefault();
      const q = (f.id === 'form-top' ? $('#q') : $('#q-hero')).value.trim();
      if (q.length < 2) { aviso('Escribí al menos 2 letras'); return; }
      S.panel = null;
      irA({ q });
      document.activeElement?.blur?.();
      return;
    }
    if (f.id !== 'form-alerta') return;
    ev.preventDefault();
    const g = S.detalle?.grupo; if (!g) return;
    const err = $('#a-error');
    const bruto = Number(String(f.precio.value).replace(/[^\d.]/g, ''));
    const objetivo = Math.round(enDolares() ? bruto * S.tc.venta : bruto);
    const correo = f.correo.value.trim();
    err.hidden = true;
    if (!objetivo || objetivo < 100) { err.textContent = 'Escribí un precio objetivo válido, por ejemplo 150000.'; err.hidden = false; f.precio.focus(); return; }
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { err.textContent = 'Revisá el correo: falta la @ o el dominio.'; err.hidden = false; f.correo.focus(); return; }
    const boton = f.querySelector('button[type=submit]'); boton.disabled = true;
    const alerta = { id: Date.now().toString(36), remoto: null, ids: idsDe(g), nombre: g.nombre, objetivo, correo, creada: new Date().toISOString(), cumplida: null };
    try { const r = await api('/alertas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: alerta.ids, nombre: g.nombre, correo, objetivo }) }); alerta.remoto = r.id; }
    catch (e) { /* queda guardada solo en el navegador */ }
    S.alertas.unshift(alerta); guardar.set('alertas', S.alertas);
    boton.disabled = false;
    renderBarra();
    aviso(alerta.remoto ? `Alerta creada: te avisamos cuando llegue a ${dinero(objetivo)}` : 'Alerta guardada en este navegador (la base de datos no respondió)');
    f.reset();
  });

  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && S.panel) cerrarPanel(); });
  window.addEventListener('popstate', leerUrl);

  let anchoPrevio = window.innerWidth;
  window.addEventListener('resize', () => {
    if (S.vista !== 'detalle' || Math.abs(window.innerWidth - anchoPrevio) < 60) return;
    anchoPrevio = window.innerWidth;
    dibujarGrafico();
  });

  // ---------- Arranque ----------
  function pintarLogo() {
    const l = $('#logo');
    const partes = CFG.nombre.match(/^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)([A-ZÁÉÍÓÚÑ].*)$/);
    const texto = partes ? `${esc(partes[1])}<i>${esc(partes[2])}</i>` : esc(CFG.nombre);
    l.innerHTML = (CFG.logo
      ? `<img class="logo-img" src="${esc(CFG.logo)}" alt="${CFG.mostrarNombre ? '' : esc(CFG.nombre)}" onerror="this.outerHTML='<span class=&quot;logo-mark&quot; aria-hidden=&quot;true&quot;>₡</span>'">`
      : '<span class="logo-mark" aria-hidden="true">₡</span>')
      + (CFG.mostrarNombre || !CFG.logo ? `<span class="logo-name">${texto}</span>` : '');
  }

  aplicarTema();
  pintarLogo();
  leerUrl();
  api('/inicio').then((r) => {
    S.inicio = r;
    if (r.tipoCambio?.venta) S.tc.venta = r.tipoCambio.venta;
    $('#pie-fuente').textContent = `Tipo de cambio de referencia: ₡${r.tipoCambio?.venta ?? '—'} por dólar (${r.tipoCambio?.fuente || ''}).`;
    revisarAlertas();
  }).catch((e) => { S.errorInicio = e; }).finally(() => { if (S.vista === 'inicio' || S.panel === 'tiendas') render(); });
})();
