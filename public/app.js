(() => {
  'use strict';

  const CFG = Object.assign({ nombre: 'PinkyPrecios', logo: '', mostrarNombre: true, api: '/api' }, window.APP_CONFIG || {});

  // ---------- Utilidades ----------
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const guardarLocal = (k, v) => { try { localStorage.setItem('pp_' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };
  const guardar = {
    get(k, d) { try { const v = localStorage.getItem('pp_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { guardarLocal(k, v); if (['lista', 'alertas', 'vistos', 'recientes', 'favoritas'].includes(k)) programarSubida(); }
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
    f: { cat: 'Todas', tiendas: [], precioMax: null, soloVarias: false, soloRebaja: false, agotados: false, soloFav: false, abiertos: false },
    orden: 'relevancia',
    vista: 'inicio', detalle: null, modoPago: 'contado', panel: null, canasta: null,
    favoritas: guardar.get('favoritas', []),   // ids de tiendas favoritas
    canastaB: null, admin: null, resenas: null, resenaTienda: null, resenaBorrador: null, resenaError: ''
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

  // Una tienda se muestra solo si de verdad se puede leer
  const EN_VIVO = ['vtex', 'woocommerce'], INDEXADAS = ['shopify', 'sitemap'];
  const activa = (t) => (EN_VIVO.includes(t.plataforma) && !['bloqueado', 'no_disponible', 'error'].includes(t.estado))
    || (INDEXADAS.includes(t.plataforma) && (t.estado === 'ok' || t.indexados > 0));
  const tiendasActivas = () => (S.inicio?.tiendas || []).filter(activa);

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

  // ---------- Categorías ----------
  const ICAT = {
    cel: '<svg viewBox="0 0 24 24"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>',
    tv: '<svg viewBox="0 0 24 24"><rect x="2.5" y="4" width="19" height="12.5" rx="1.5"/><path d="M8 20.5h8M12 16.5v4"/></svg>',
    lap: '<svg viewBox="0 0 24 24"><rect x="4" y="4.5" width="16" height="11" rx="1.5"/><path d="M2 19.5h20l-2-4H4z"/></svg>',
    aud: '<svg viewBox="0 0 24 24"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4.5" height="7" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="7" rx="1.5"/></svg>',
    refri: '<svg viewBox="0 0 24 24"><rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M5 9.5h14M8.5 5.5v2M8.5 12.5v3"/></svg>',
    cocina: '<svg viewBox="0 0 24 24"><path d="M6 10h12v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M4 10h16M9 6c0-1 1-1.5 1-2.5M13 6c0-1 1-1.5 1-2.5"/></svg>',
    super: '<svg viewBox="0 0 24 24"><path d="M3 4h2l2.2 10.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.2"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></svg>',
    ferre: '<svg viewBox="0 0 24 24"><path d="M14.5 6.5a4 4 0 0 0 5 5l-8.5 8.5a2 2 0 0 1-3-3z"/><path d="M14.5 6.5 17 4l3 3-2.5 2.5"/></svg>',
    game: '<svg viewBox="0 0 24 24"><path d="M7 8h10a4 4 0 0 1 4 4v1.5a3 3 0 0 1-5.4 1.8L14.5 14h-5l-1.1 1.3A3 3 0 0 1 3 13.5V12a4 4 0 0 1 4-4z"/><path d="M8 10.5v3M6.5 12h3M15.5 11h.01M17.5 13h.01"/></svg>',
    belleza: '<svg viewBox="0 0 24 24"><path d="M9 3h6v4l-1 2v11a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V9L9 7z"/><path d="M10 13h4"/></svg>'
  };
  const CATEGORIAS = [
    { nombre: 'Celulares', q: 'celular', ejemplo: 'iPhone, Samsung, Xiaomi', icono: ICAT.cel, fondo: 'bg-rosa' },
    { nombre: 'Pantallas', q: 'pantalla', ejemplo: 'Smart TV de 32" a 85"', icono: ICAT.tv, fondo: 'bg-lila' },
    { nombre: 'Computadoras', q: 'laptop', ejemplo: 'Laptops y monitores', icono: ICAT.lap, fondo: 'bg-cielo' },
    { nombre: 'Audio', q: 'audífonos', ejemplo: 'Audífonos y parlantes', icono: ICAT.aud, fondo: 'bg-mante' },
    { nombre: 'Línea blanca', q: 'refrigeradora', ejemplo: 'Refris, lavadoras, cocinas', icono: ICAT.refri, fondo: 'bg-menta' },
    { nombre: 'Cocina', q: 'freidora de aire', ejemplo: 'Freidoras, licuadoras', icono: ICAT.cocina, fondo: 'bg-durazno' },
    { nombre: 'Supermercado', q: 'café', ejemplo: 'Café, arroz, aceite', icono: ICAT.super, fondo: 'bg-rosa' },
    { nombre: 'Ferretería', q: 'taladro', ejemplo: 'Herramientas', icono: ICAT.ferre, fondo: 'bg-cielo' },
    { nombre: 'Gaming', q: 'consola', ejemplo: 'Consolas y juegos', icono: ICAT.game, fondo: 'bg-lila' },
    { nombre: 'Cuidado personal', q: 'secadora de pelo', ejemplo: 'Secadoras, planchas', icono: ICAT.belleza, fondo: 'bg-durazno' }
  ];

  // ---------- Precio por kilo o litro (supermercado) ----------
  function porUnidad(g) {
    const m = mejor(g);
    if (!m) return null;
    const t = norm(g.nombre).replace(/,/g, '.');
    const r = t.match(/(\d+(?:\.\d+)?)\s*(kg|kilo|kilos|g|gr|grs|gramos|l|lt|lts|litro|litros|ml|cc)\b/);
    if (!r) return null;
    let cant = parseFloat(r[1]);
    const u = r[2];
    const pack = t.match(/\b(\d{1,2})\s*(?:x|unidades|unid|pack)\b/) || t.match(/\bx\s*(\d{1,2})\b/);
    const veces = pack ? Math.min(48, parseInt(pack[1], 10)) : 1;
    let unidad;
    if (['kg', 'kilo', 'kilos'].includes(u)) unidad = 'kg';
    else if (['g', 'gr', 'grs', 'gramos'].includes(u)) { cant /= 1000; unidad = 'kg'; }
    else if (['ml', 'cc'].includes(u)) { cant /= 1000; unidad = 'litro'; }
    else unidad = 'litro';
    cant *= veces;
    if (!cant || cant > 200) return null;
    return { valor: m.precio / cant, unidad };
  }

  // ---------- Búsquedas recientes (solo en este navegador) ----------
  const recientes = () => guardar.get('recientes', []);
  function recordarBusqueda(q) {
    const l = [q, ...recientes().filter((x) => norm(x) !== norm(q))].slice(0, 8);
    guardar.set('recientes', l);
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
    const q = p.get('q'), ids = p.get('p'), ver = p.get('ver');
    if (ver === 'ofertas') { S.vista = 'ofertas'; if (!S.ofertas?.datos) cargarOfertas(); else render(); window.scrollTo(0, 0); }
    else if (ver === 'contacto') { S.vista = 'contacto'; render(); window.scrollTo(0, 0); }
    else if (ver === 'canasta') { S.vista = 'canasta'; if (!S.canastaB?.datos) cargarCanastaB(); else render(); window.scrollTo(0, 0); }
    else if (ver === 'admin') { S.vista = 'admin'; cargarAdmin(); window.scrollTo(0, 0); }
    else if (ver === 'proyecto') { S.vista = 'proyecto'; render(); window.scrollTo(0, 0); }
    else if (ids) abrirProducto(ids.split(','));
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
    recordarBusqueda(q);
    S.f = { cat: 'Todas', tiendas: [], precioMax: null, soloVarias: false, soloRebaja: false, agotados: false, soloFav: false, abiertos: false };
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
    const permite = (t) => (!f.tiendas.length || f.tiendas.includes(t)) && (!f.soloFav || S.favoritas.includes(t));
    let l = r.grupos.map((g) => {
      if (!f.tiendas.length && !f.soloFav) return g;
      const ofs = g.ofertas.filter((o) => permite(o.tienda));
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
    if (S.orden === 'unidad') l.sort((a, b) => (porUnidad(a)?.valor ?? Infinity) - (porUnidad(b)?.valor ?? Infinity));
    return l;
  }

  const filtrosActivos = () => S.f.tiendas.length + (S.f.precioMax != null) + S.f.soloVarias + S.f.soloRebaja + S.f.agotados + S.f.soloFav;

  // ---------- Vista: inicio ----------
  const SUGERENCIAS = ['freidora de aire', 'pantalla 55', 'iphone 16', 'refrigeradora', 'café', 'aceite', 'taladro', 'audífonos'];

  function vistaInicio() {
    const ini = S.inicio;
    const act = tiendasActivas();
    const populares = ini?.populares?.length ? ini.populares.map((p) => p.termino) : SUGERENCIAS;
    const rubros = [...new Set(act.map((t) => t.rubro).filter(Boolean))].map((r) => r.toLowerCase().replace(' y ', ', '));
    return `
      <section class="portada">
        <div class="portada-txt">
          <span class="ceja"><i>EN VIVO</i>Comparador de precios de Costa Rica</span>
          <h1>Compará precios reales y <em>ahorrá de verdad</em><span class="brillo" aria-hidden="true">✦</span></h1>
          <p>${act.length ? `Buscamos al instante en <b>${act.length} tiendas</b>${rubros.length ? ` de ${esc(rubros.join(', '))}` : ''}.` : 'Buscamos al instante en las tiendas de Costa Rica.'} Guardamos el historial de cada precio, te mostramos cuánto pagás a cuotas y te avisamos cuando un descuento no es real.</p>
          <form class="buscador" id="form-hero" role="search" autocomplete="off" style="position:relative">
            ${I.lupa}
            <label class="sr-only" for="q-hero">¿Qué querés comparar?</label>
            <input id="q-hero" type="search" placeholder="¿Qué querés comparar hoy?" enterkeyhint="search" aria-autocomplete="list" aria-controls="sugerir-hero" aria-expanded="false">
            ${micBtn('q-hero')}<button type="submit" class="btn primario">${I.chispa}<span class="lbl">Comparar</span></button>
            <div class="sugerir" id="sugerir-hero" role="listbox" hidden></div>
          </form>
          <div class="sugerencias"><span>${ini?.populares?.length ? 'Lo más buscado:' : 'Probá con:'}</span>${populares.slice(0, 7).map((t) => `<button type="button" class="chip" data-action="buscar" data-q="${esc(t)}">${esc(t)}</button>`).join('')}</div>
          ${S.errorInicio ? `<p class="aviso">No pudimos conectar con el buscador: ${esc(S.errorInicio.message)}</p>` : ''}
        </div>
        ${vitrina()}
      </section>
      ${cintaTiendas()}
      ${cifras()}
      <section class="seccion" aria-labelledby="t-cats">
        <div class="sec-head"><h2 id="t-cats">Explorá por <em>categoría</em></h2><p>Tocá una categoría y comparamos todas las tiendas a la vez.</p></div>
        <div class="mosaico">${CATEGORIAS.map((c) => `<button type="button" class="cat-tile ${c.fondo}" data-action="buscar" data-q="${esc(c.q)}">${c.icono}<span><b>${esc(c.nombre)}</b><small>${esc(c.ejemplo)}</small></span></button>`).join('')}</div>
      </section>
      ${seccionRebajas()}
      ${seccionCanastaHome()}
      ${seccionVistos()}
      <section class="seccion" aria-labelledby="t-difs">
        <div class="sec-head"><h2 id="t-difs">Más que un <em>comparador</em></h2><p>Lo que no vas a encontrar en otros comparadores.</p></div>
        <div class="difs">
          <div class="dif"><div class="muestra"><svg viewBox="0 0 200 64" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="M0 40 L30 38 L60 44 L90 30 L120 34 L150 18 L180 22 L200 12 L200 64 L0 64Z"/><path class="linea" d="M0 40 L30 38 L60 44 L90 30 L120 34 L150 18 L180 22 L200 12"/></svg></div><b>Historial de precios</b><p>Cada precio se guarda todos los días. Sabés si de verdad bajó o si es el de siempre.</p></div>
          <div class="dif"><div class="muestra"><div class="mini-fila"><span>Antes</span><s>₡389 900</s></div><div class="mini-fila"><span>Hace un mes</span><span>₡329 900</span></div><span class="badge b-falsa">Descuento inflado</span></div><b>Detector de descuentos falsos</b><p>Si subieron el precio para después “rebajarlo”, te lo decimos.</p></div>
          <div class="dif"><div class="muestra"><div class="mini-fila"><span>12 cuotas</span><b>₡13 493</b></div><div class="mini-fila"><span>Total</span><span>₡161 910</span></div><span class="badge b-bueno">Tasa cero</span></div><b>Cuotas reales</b><p>Las cuotas que publica cada tienda y cuánto terminás pagando.</p></div>
          <div class="dif"><div class="muestra"><div class="mini-fila"><span>Tu precio</span><b>₡150 000</b></div><div class="mini-fila"><span>Hoy</span><span>₡159 900</span></div><span class="badge b-rosa">Te avisamos</span></div><b>Alertas de precio</b><p>Elegí cuánto querés pagar y te escribimos cuando una tienda llegue.</p></div>
        </div>
      </section>
      <section class="seccion" aria-labelledby="t-como">
        <div class="sec-head"><h2 id="t-como">Cómo <em>funciona</em></h2></div>
        <div class="pasos-n">
          <div class="paso-n"><b>Buscás una vez</b><p>Escribís el producto y consultamos todas las tiendas conectadas al mismo tiempo, en vivo.</p></div>
          <div class="paso-n"><b>Juntamos el mismo producto</b><p>Lo reconocemos por su código de barras o su modelo, aunque cada tienda lo llame distinto.</p></div>
          <div class="paso-n"><b>Comprás donde conviene</b><p>Ves el precio de contado, las cuotas y el historial, y vas directo a la tienda.</p></div>
        </div>
      </section>`;
  }

  function vitrina() {
    const rs = (S.inicio?.rebajas || []).filter((o) => o.imagen).slice(0, 3);
    if (rs.length < 2) {
      return `<div class="vitrina" aria-hidden="true"><div class="vit-deco"><span><small>DESDE</small>₡69 900</span><span><small>ANTES</small><s>₡389 900</s></span><span><small>AHORRÁS</small>₡40 000</span></div></div>`;
    }
    return `<div class="vitrina"><div class="vitrina-fila">${rs.map((o) => `
      <button type="button" class="vit-card" data-action="ver" data-ids="${esc(o.id)}">
        <span class="vit-pct">-${Math.round((1 - o.precio / o.antes) * 100)}%</span>
        <span class="vit-img">${img(o.imagen)}</span>
        <span><b>${esc(o.nombre)}</b><span class="vit-tienda">${esc(tiendaNombre(o.tienda))}</span><span class="vit-precio"><strong>${dinero(o.precio)}</strong><s>${dinero(o.antes)}</s></span></span>
      </button>`).join('')}</div><p class="vit-nota">Rebajas reales encontradas hoy</p></div>`;
  }

  function cintaTiendas() {
    const act = tiendasActivas();
    if (!act.length) return '';
    const items = act.map((t) => `<span>${esc(t.nombre)}<i>${esc((t.rubro || '').split(' ')[0])}</i></span>`).join('');
    const mueve = act.length > 4;
    return `<section class="cinta" aria-label="Tiendas conectadas"><p class="cinta-t">Comparamos precios en</p>
      <div class="cinta-pista ${mueve ? 'mueve' : ''}" style="${mueve ? '' : 'margin:0 auto'}">${items}${mueve ? `<span aria-hidden="true" hidden></span>${items.replace(/<span>/g, '<span aria-hidden="true">')}` : ''}</div></section>`;
  }

  function cifras() {
    const st = S.inicio?.stats;
    const n = (x) => (x == null ? '—' : nf.format(x));
    return `<section class="cifras" aria-label="PinkyPrecios en números">
      <div class="cifra"><strong>${S.inicio ? tiendasActivas().length : '—'}</strong><span>tiendas conectadas</span></div>
      <div class="cifra"><strong>${n(st?.ofertas)}</strong><span>precios guardados</span></div>
      <div class="cifra"><strong>${n(st?.registros)}</strong><span>registros de historial${st?.desde ? ` desde el ${fechaCorta(st.desde)}` : ''}</span></div>
      <div class="cifra"><strong>${n(st?.busquedas)}</strong><span>productos distintos buscados</span></div>
    </section>`;
  }

  function seccionRebajas() {
    const rs = S.inicio?.rebajas || [];
    if (!rs.length) return '';
    return `
      <section class="seccion" aria-labelledby="t-rebajas">
        <div class="sec-head"><h2 id="t-rebajas">Rebajas <em>de hoy</em></h2><button type="button" class="limpiar" data-action="ir" data-ver="ofertas">Ver todas las ofertas de la semana →</button></div>
        <div class="tira">${rs.map((o) => `
          <button type="button" class="oferta" data-action="ver" data-ids="${esc(o.id)}">
            <span class="pct">-${Math.round((1 - o.precio / o.antes) * 100)}%</span>
            <span class="of-foto">${img(o.imagen)}</span>
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
      ${b.cargando ? `<p>Buscando en ${S.inicio ? plural(tiendasActivas().length, 'tienda', 'tiendas') : 'las tiendas'} al mismo tiempo… puede tardar unos segundos.</p>` : ''}
      ${r ? `<p>${plural(r.grupos.length, 'producto encontrado', 'productos encontrados')} en ${plural(r.tiendas.filter((t) => t.estado === 'ok').length, 'tienda', 'tiendas')} · ${(r.ms / 1000).toFixed(1)} s</p>` : ''}
    </section>`;
    if (b.cargando) return cab + `<div class="grid res">${Array.from({ length: 10 }, () => '<div class="esqueleto" aria-hidden="true"><i></i><i></i><i></i><i></i></div>').join('')}</div>`;
    if (b.error) return cab + `<div class="grid"><div class="aviso-caja"><b>No pudimos buscar</b>${esc(b.error.message)}<br><button type="button" class="btn primario" data-action="reintentar">Intentar de nuevo</button></div></div>`;
    if (!r.grupos.length) return cab + `<div class="grid"><div class="aviso-caja">${ILU.buscar}<b>Ninguna tienda tiene “${esc(b.q)}”</b>Probá con menos palabras o con el nombre más común del producto, por ejemplo “pantalla 55” o “freidora de aire”.<br>${CATEGORIAS.slice(0, 4).map((c) => `<button type="button" class="chip" data-action="buscar" data-q="${esc(c.q)}" style="margin:12px 4px 0">${esc(c.nombre)}</button>`).join('')}</div></div>`;
    const l = filtrados();
    const hayUnidad = r.grupos.some((g) => porUnidad(g));
    return cab + `
      <div class="res-layout">
        ${lateral(r)}
        <div>
          <div class="res-barra">
            <p class="resultado" style="margin:0">${plural(l.length, 'producto', 'productos')}${filtrosActivos() || S.f.cat !== 'Todas' ? ' con los filtros elegidos' : ''}</p>
            <div class="filtros-der">
              <button type="button" class="chip suave btn-filtros" data-action="filtros" aria-expanded="${S.f.abiertos}" aria-pressed="${S.f.abiertos || filtrosActivos() > 0}">${I.filtro}Filtros${filtrosActivos() ? ` <span class="count on">${filtrosActivos()}</span>` : ''}</button>
              <label class="orden">Ordenar
                <select id="orden">
                  ${[['relevancia', 'Más parecidos'], ['precio', 'Menor precio'], ['precio-desc', 'Mayor precio'], ['ahorro', 'Mayor diferencia entre tiendas'], ['tiendas', 'En más tiendas'], ...(hayUnidad ? [['unidad', 'Precio por kilo o litro']] : [])]
                    .map(([v, t]) => `<option value="${v}" ${S.orden === v ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
              </label>
            </div>
          </div>
          <div class="grid res" aria-label="Productos">
            ${l.length ? l.map(tarjeta).join('') : `<div class="aviso-caja">${ILU.buscar}<b>Nada con esos filtros</b>Quitá algún filtro para ver más resultados.<br><button type="button" class="btn" data-action="limpiar-filtros">Quitar filtros</button></div>`}
          </div>
        </div>
      </div>`;
  }

  function lateral(r) {
    const nombres = { sin_resultados: 'sin resultados', lento: 'muy lenta' };
    const conRes = r.tiendas.filter((t) => t.estado === 'ok').sort((a, b) => S.favoritas.includes(b.id) - S.favoritas.includes(a.id));
    const sinRes = r.tiendas.filter((t) => ['sin_resultados', 'lento'].includes(t.estado));
    const cats = {};
    for (const g of r.grupos) if (g.categoria) cats[g.categoria] = (cats[g.categoria] || 0) + 1;
    const topCats = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const precios = r.grupos.map((g) => mejor(g)?.precio).filter(Boolean);
    const tope = Math.max(10000, Math.ceil(Math.max(...precios, 0) / 10000) * 10000);
    const piso = Math.max(0, Math.floor(Math.min(...precios, tope) / 10000) * 10000);
    const val = S.f.precioMax ?? tope;
    return `<aside class="lateral ${S.f.abiertos ? 'abierta' : ''}" aria-label="Filtros">
      <div class="lat-sec">
        <span class="lat-t">Tiendas ${S.f.tiendas.length ? `<output>${S.f.tiendas.length} elegidas</output>` : ''}</span>
        ${conRes.map((t) => `<label class="check"><input type="checkbox" data-filtro="tienda" value="${esc(t.id)}" ${S.f.tiendas.includes(t.id) ? 'checked' : ''}>${esc(t.nombre)}${S.favoritas.includes(t.id) ? '<span class="fav-mini" title="Tienda favorita">★</span>' : ''}<span class="n">${t.n}</span></label>`).join('')}
        ${sinRes.map((t) => `<span class="check" style="opacity:.55;cursor:default" title="${esc(t.detalle || '')}"><input type="checkbox" disabled>${esc(t.nombre)}<span class="n">${nombres[t.estado]}</span></span>`).join('')}
        ${S.favoritas.length ? '' : '<button type="button" class="limpiar" data-action="panel" data-p="tiendas">★ Elegí tus tiendas favoritas</button>'}
      </div>
      ${topCats.length > 1 ? `<div class="lat-sec">
        <span class="lat-t">Categoría</span>
        <label class="check"><input type="radio" name="lcat" data-filtro="cat" value="Todas" ${S.f.cat === 'Todas' ? 'checked' : ''}>Todas<span class="n">${r.grupos.length}</span></label>
        ${topCats.map(([c, n]) => `<label class="check"><input type="radio" name="lcat" data-filtro="cat" value="${esc(c)}" ${S.f.cat === c ? 'checked' : ''}>${esc(c)}<span class="n">${n}</span></label>`).join('')}
      </div>` : ''}
      <div class="lat-sec">
        <label class="lat-t" for="precio-max">Precio máximo <output id="precio-max-v">${S.f.precioMax == null ? 'Sin límite' : 'Hasta ' + dinero(val)}</output></label>
        <input type="range" id="precio-max" min="${piso}" max="${tope}" step="${tope > 500000 ? 10000 : tope > 50000 ? 5000 : 500}" value="${val}">
        <div class="rango-lim"><span>${dinero(piso)}</span><span>${dinero(tope)}</span></div>
      </div>
      <div class="lat-sec">
        <span class="lat-t">Mostrar solo</span>
 ${S.favoritas.length ? `<label class="switch"><input type="checkbox" id="f-fav" ${S.f.soloFav ? 'checked' : ''}><span>Solo mis tiendas favoritas<small>${esc(S.favoritas.map(tiendaNombre).join(', '))}</small></span></label>` : ''}
        <label class="switch"><input type="checkbox" id="f-varias" ${S.f.soloVarias ? 'checked' : ''}><span>En 2 o más tiendas<small>Para comparar de verdad</small></span></label>
        <label class="switch"><input type="checkbox" id="f-rebaja" ${S.f.soloRebaja ? 'checked' : ''}><span>Con rebaja<small>La tienda muestra precio anterior</small></span></label>
        <label class="switch"><input type="checkbox" id="f-agotados" ${S.f.agotados ? 'checked' : ''}><span>Incluir agotados<small>Productos sin existencias</small></span></label>
        ${filtrosActivos() || S.f.cat !== 'Todas' ? '<button type="button" class="limpiar" data-action="limpiar-filtros">Quitar todos los filtros</button>' : ''}
      </div>
    </aside>`;
  }

  function tarjeta(g) {
    const m = mejor(g);
    const ts = tiendasDe(g);
    const d = disponibles(g);
    const max = d.length ? Math.max(...d.map((o) => o.precio)) : 0;
    const ahorro = d.length > 1 ? max - m.precio : 0;
    const rebaja = m && m.antes && m.antes > m.precio ? Math.round((1 - m.precio / m.antes) * 100) : 0;
    const pu = porUnidad(g);
    const enLista = S.lista.some((x) => x.id === g.id), enCmp = S.comparar.some((x) => x.id === g.id);
    return `
      <article class="card real">
        <div class="foto">${foto(g.imagen)}
          <div class="badges">
            ${ts.length > 1 ? `<span class="badge b-rosa">${ts.length} tiendas</span>` : ''}
            ${rebaja >= 3 ? `<span class="badge b-bueno">-${rebaja}%</span>` : ''}
            ${!m ? '<span class="badge b-normal">Agotado</span>' : ''}
          </div>
        </div>
        <div>
          <p class="marca">${esc(g.marca || g.categoria || '')}</p>
          <h3><button type="button" data-action="ver" data-ids="${esc(idsDe(g).join(','))}" data-g="${esc(g.id)}">${esc(g.nombre)}</button></h3>
        </div>
        <div style="display:grid;gap:8px;align-content:start">
          ${m ? `<span class="tag"><small>${ts.length > 1 ? 'Desde' : 'Precio'}</small><strong>${dinero(m.precio)}</strong></span>
          <p class="donde">en <b>${esc(tiendaNombre(m.tienda))}</b></p>` : '<p class="donde">Agotado en todas las tiendas</p>'}
          ${pu ? `<p class="por-unidad"><b>${dinero(pu.valor)}</b> por ${pu.unidad}</p>` : ''}
          ${g.hist ? `<div class="mini-hist" title="Precio más bajo de cada día (${plural(g.hist.dias, 'día', 'días')} de historial)">${sparkline(g.hist)}${insigniasHist(g).map(([c, t]) => `<span class="badge ${c}">${t}</span>`).join('') || `<small>${g.hist.dias} días de historial</small>`}</div>` : ''}
          ${ts.length > 1 ? `<div class="tiendas-mini">${ts.slice(0, 4).map((t) => `<span class="${t === m.tienda ? 'mejor' : ''}">${esc(tiendaNombre(t))}</span>`).join('')}${ts.length > 4 ? `<span>+${ts.length - 4}</span>` : ''}</div>` : ''}
        </div>
        ${ahorro > 0 ? `<div class="rango"><p class="ahorro" style="margin:0">${I.chispa}Ahorrás ${dinero(ahorro)}</p><div class="rango-barra" aria-hidden="true"><i style="left:0%"></i></div><small><span>${dineroCorto(m.precio)}</span><span>${dineroCorto(max)}</span></small></div>` : '<p class="ahorro" aria-hidden="true"></p>'}
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
          ${(() => { const ins = insigniasHist(g, histDeDetalle(D)); return ins.length ? `<div class="insignias">${ins.map(([c, t]) => `<span class="badge ${c}">${t}</span>`).join('')}</div>` : ''; })()}
          <div class="acciones">
            <button type="button" class="btn" data-action="lista" data-g="${esc(g.id)}" aria-pressed="${enLista}">${I.corazon}${enLista ? 'En mi lista' : 'Agregar a mi lista'}</button>
            <button type="button" class="btn" data-action="comparar" data-g="${esc(g.id)}" aria-pressed="${enCmp}">${I.cmp}Comparar</button>
            <button type="button" class="btn" data-action="panel" data-p="imagen">${I.compartir}Tarjeta para compartir</button>
            <button type="button" class="btn" data-action="compartir">Copiar enlace</button>
          </div>
        </div>
      </section>

      ${mo ? `<div class="momento m-${esc(mo.nivel)}"><span class="dial" aria-hidden="true">${{ bueno: '✓', esperar: '!', normal: '≈', registrando: '…', agotado: '×' }[mo.nivel] || '·'}</span><strong>${esc(mo.titulo)}</strong><p>${esc(mo.texto)}</p></div>`
        : D.cargando ? '<div class="momento m-registrando"><span class="dial" aria-hidden="true">…</span><strong>Revisando el historial</strong><p>Un momento.</p></div>'
        : D.sinDB ? '<div class="momento m-registrando"><span class="dial" aria-hidden="true">…</span><strong>Historial desactivado</strong><p>Conectá la base de datos (Supabase) para guardar el historial de precios.</p></div>' : ''}

      ${barrasComparativas(g)}
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

  function barrasComparativas(g) {
    const porTienda = new Map();
    for (const o of disponibles(g)) if (!porTienda.has(o.tienda) || o.precio < porTienda.get(o.tienda)) porTienda.set(o.tienda, o.precio);
    const filas = [...porTienda.entries()].sort((a, b) => a[1] - b[1]);
    if (filas.length < 2) return '';
    const max = filas[filas.length - 1][1], min = filas[0][1];
    return `<section class="bloque" aria-labelledby="t-barras" style="margin-bottom:16px">
      <div class="bloque-head"><div><h2 id="t-barras">¿Cuánto cobra cada tienda?</h2><p class="sub">Entre la más barata y la más cara hay ${dinero(max - min)} de diferencia.</p></div></div>
      <div class="barras">${filas.map(([t, p], i) => `<div class="barra-fila ${i === 0 ? 'mejor' : ''}"><b>${esc(tiendaNombre(t))}</b><div class="barra-pista"><i style="width:${Math.max(6, (p / max) * 100).toFixed(1)}%"></i></div><span>${dinero(p)}${i ? `<small>+${dinero(p - min)}</small>` : ''}</span></div>`).join('')}</div>
    </section>`;
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
          <td><span class="tienda-nom">${S.favoritas.includes(o.tienda) ? '<span class="fav-mini" title="Tienda favorita">★</span>' : ''}${esc(tiendaNombre(o.tienda))}</span>${estrellasMini(o.tienda)}${o === primero && os.filter((x) => x.disponible).length > 1 ? ' <span class="badge b-rosa">Más barato</span>' : ''}
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
    const minContado = Math.min(...os.filter((o) => o.disponible).map((o) => o.precio));
    const calc = calculadora(isFinite(minContado) ? minContado : 0);
    if (!con.length) return `<p class="sub">Ninguna tienda publica cuotas para este producto en su sitio. ${sin.length ? 'Consultá directamente en ' + esc([...new Set(sin)].join(', ')) + '.' : ''}</p>` + calc;
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
      ${sin.length ? `<p class="nota">Sin cuotas publicadas en línea: ${esc([...new Set(sin)].join(', '))}. Algunas tiendas dan crédito propio en sus sucursales.</p>` : ''}${calc}`;
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

  // ---------- Vista: ofertas de la semana ----------
  async function cargarOfertas() {
    S.ofertas = { cargando: true, datos: null, error: null, tab: S.ofertas?.tab || 'bajaron', rubro: 'Todos' };
    render();
    try { S.ofertas = { ...S.ofertas, cargando: false, datos: await api('/ofertas') }; }
    catch (e) { S.ofertas = { ...S.ofertas, cargando: false, error: e }; }
    if (S.vista === 'ofertas') render();
  }

  function vistaOfertas() {
    const O = S.ofertas || { cargando: true };
    const hoy = new Date(), hace7 = new Date(Date.now() - 7 * 864e5);
    const rango = `${hace7.getDate()} ${MESES[hace7.getMonth()]} – ${hoy.getDate()} ${MESES[hoy.getMonth()]}`;
    const cab = `<section class="of-head">
      <button type="button" class="volver" data-action="inicio" style="padding:0">← Inicio</button>
      <span class="ceja"><i>${esc(rango.toUpperCase())}</i>Se actualiza todos los días</span>
      <h1>Ofertas de <em>la semana</em></h1>
      <p>Productos que <b>de verdad</b> bajaron de precio en los últimos 7 días según nuestro historial, y rebajas que anuncian las tiendas sin descuentos inflados.</p>
      <div class="of-acciones">
        <a class="btn primario" href="https://wa.me/?text=${encodeURIComponent(textoCompartirOfertas())}" target="_blank" rel="noopener">${I.compartir}Compartir por WhatsApp</a>
        <button type="button" class="btn" data-action="copiar-ofertas">Copiar enlace</button>
      </div>
    </section>`;
    if (O.cargando) return cab + `<div class="of-grid">${Array.from({ length: 8 }, () => '<div class="esqueleto" aria-hidden="true"><i></i><i></i><i></i><i></i></div>').join('')}</div>`;
    if (O.error) return cab + `<div class="aviso-caja"><b>No pudimos cargar las ofertas</b>${esc(O.error.message)}<br><button type="button" class="btn primario" data-action="ir" data-ver="ofertas">Intentar de nuevo</button></div>`;
    const d = O.datos || { bajaron: [], rebajas: [] };
    const lista = O.tab === 'bajaron' ? d.bajaron : d.rebajas;
    const rubros = ['Todos', ...new Set([...d.bajaron, ...d.rebajas].map((o) => o.rubro).filter(Boolean))];
    const filtrada = lista.filter((o) => O.rubro === 'Todos' || o.rubro === O.rubro);
    const vacio = O.tab === 'bajaron'
      ? '<b>Todavía no hay bajas registradas esta semana</b>Para saber si un precio bajó necesitamos su historial de al menos 7 días. Cuanto más se usa la página, más productos seguimos.'
      : '<b>No hay rebajas anunciadas ahora</b>Volvé mañana: revisamos los precios cada 6 horas.';
    return cab + `
      <div class="res-barra">
        <div class="of-tabs" role="tablist" aria-label="Tipo de oferta">
          <button type="button" role="tab" data-action="of-tab" data-t="bajaron" aria-selected="${O.tab === 'bajaron'}">Bajaron esta semana (${d.bajaron.length})</button>
          <button type="button" role="tab" data-action="of-tab" data-t="rebajas" aria-selected="${O.tab === 'rebajas'}">Rebajas anunciadas (${d.rebajas.length})</button>
        </div>
        ${rubros.length > 2 ? `<div class="chips" role="group" aria-label="Rubro">${rubros.map((r) => `<button type="button" class="chip suave" data-action="of-rubro" data-r="${esc(r)}" aria-pressed="${O.rubro === r}">${esc(r)}</button>`).join('')}</div>` : ''}
      </div>
      ${filtrada.length ? `<div class="of-grid">${filtrada.map((o) => {
        const ref = O.tab === 'bajaron' ? o.precioSemanaPasada : o.antes;
        const pct = Math.round((1 - o.precio / ref) * 100);
        return `<button type="button" class="of-card" data-action="ver" data-ids="${esc(o.id)}">
          <span class="of-pct">-${pct}%</span>
          <span class="foto">${img(o.imagen)}</span>
          <b>${esc(o.nombre)}</b>
          <span class="of-tienda">${esc(tiendaNombre(o.tienda))}</span>
          <span class="of-precio"><strong>${dinero(o.precio)}</strong><s>${dinero(ref)}</s></span>
          <span class="of-nota">${O.tab === 'bajaron' ? `Bajó ${dinero(ref - o.precio)} en 7 días` : o.confirmada ? 'Rebaja confirmada con el historial' : 'Rebaja según la tienda'}</span>
        </button>`;
      }).join('')}</div>` : `<div class="aviso-caja" style="margin-top:16px">${ILU.ofertas}${vacio}</div>`}`;
  }

  function textoCompartirOfertas() {
    const d = S.ofertas?.datos;
    const top = d ? [...d.bajaron, ...d.rebajas].slice(0, 5) : [];
    const url = location.origin + location.pathname + '?ver=ofertas';
    return `🛍️ Ofertas de la semana en PinkyPrecios\n${top.map((o) => `• ${o.nombre}: ${dinero(o.precio)} en ${tiendaNombre(o.tienda)}`).join('\n')}${top.length ? '\n' : ''}Mirá todas aquí: ${url}`;
  }

  // ---------- Vista: contacto ----------
  const ICANAL = {
    wa: '<svg viewBox="0 0 24 24"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4A8 8 0 1 1 20 11.5z"/><path d="M9 8.5c0 3 2.5 6 5.5 6.5l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z"/></svg>',
    mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/></svg>'
  };
  function vistaContacto() {
    const wa = `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent('Hola, les escribo desde PinkyPrecios: ')}`;
    return `
      <section class="con-head">
        <button type="button" class="volver" data-action="inicio" style="padding:0">← Inicio</button>
        <h1>Hablemos <em>💗</em></h1>
        <p>¿Encontraste un precio que no cuadra, querés que agreguemos una tienda o tenés una idea? Escribinos por el medio que te quede más cómodo.</p>
      </section>
      <div class="con-grid">
        <div class="con-canales">
          <div class="canal"><span class="c-ico bg-menta">${ICANAL.wa}</span><b>WhatsApp</b><span class="c-dato">${esc(CFG.whatsappVisible)}</span>
            <div class="c-acc"><a class="btn primario" href="${esc(wa)}" target="_blank" rel="noopener">Escribir por WhatsApp</a><button type="button" class="btn" data-action="copiar" data-texto="${esc(CFG.whatsappVisible)}">Copiar número</button></div></div>
          <div class="canal"><span class="c-ico bg-rosa">${ICANAL.mail}</span><b>Correo</b><span class="c-dato">${esc(CFG.correo)}</span>
            <div class="c-acc"><a class="btn" href="mailto:${esc(CFG.correo)}?subject=${encodeURIComponent('Contacto PinkyPrecios')}">Abrir correo</a><button type="button" class="btn" data-action="copiar" data-texto="${esc(CFG.correo)}">Copiar correo</button></div></div>
          <div class="firma"><img src="img/logo.png" alt=""><span><b>${esc(CFG.autora)}</b>Creadora de PinkyPrecios · Proyecto final de programación, Costa Rica</span></div>
        </div>
        <form class="form-contacto" id="form-contacto" novalidate>
          <h2 style="font-size:24px">Mandanos un mensaje</h2>
          <div class="dos">
            <label class="campo" for="c-nombre">Tu nombre<input id="c-nombre" name="nombre" autocomplete="name" maxlength="80"></label>
            <label class="campo" for="c-correo">Tu correo (para responderte)<input id="c-correo" name="correo" type="email" autocomplete="email" maxlength="120"></label>
          </div>
          <label class="campo" for="c-asunto">Asunto<input id="c-asunto" name="asunto" maxlength="120" placeholder="Por ejemplo: agregar una tienda"></label>
          <label class="campo" for="c-mensaje">Mensaje<textarea id="c-mensaje" name="mensaje" maxlength="2000" required></textarea></label>
          <label class="trampa" aria-hidden="true">No llenar<input name="sitio" tabindex="-1" autocomplete="off"></label>
          <p class="error" id="c-error" hidden></p>
          <p class="ok-msg" id="c-ok" hidden>¡Gracias! Recibimos tu mensaje y te respondemos pronto.</p>
          <button type="submit" class="btn primario">Enviar mensaje</button>
        </form>
      </div>
      <section class="seccion" aria-labelledby="t-faq" style="margin-top:26px">
        <div class="sec-head"><h2 id="t-faq">Preguntas <em>frecuentes</em></h2></div>
        <div class="faq">
          ${FAQ.map(([p, r]) => `<details><summary>${esc(p)}</summary><p>${esc(r)}</p></details>`).join('')}
        </div>
      </section>`;
  }
  const FAQ = [
    ['¿Los precios son reales?', 'Sí. Cada búsqueda consulta en ese momento los sitios públicos de las tiendas. También guardamos el historial de cada precio y lo revisamos cada 6 horas.'],
    ['¿Las tiendas pagan por aparecer?', 'No. Ninguna tienda paga para salir primero: los resultados se ordenan por parecido con tu búsqueda o por precio.'],
    ['¿Qué es un descuento inflado?', 'Cuando una tienda muestra un precio “antes” más alto, pero según nuestro historial el producto ya costaba lo mismo o menos hace más de 25 días.'],
    ['¿Para qué sirve crear una cuenta?', 'Tu lista, tus alertas y tus búsquedas se guardan en la nube y las ves igual en el celular y en la compu.'],
    ['¿Por qué no aparece una tienda?', 'Solo mostramos tiendas que publican sus precios y permiten que un robot los lea. Las demás quedan “en evaluación” en el panel de Tiendas.'],
    ['¿Puedo instalarla como app?', 'Sí. En el celular abrí el menú del navegador y tocá “Agregar a pantalla de inicio”.']
  ];

  // ---------- Paneles ----------
  const cabeceraPanel = (titulo, sub) => `<div class="panel-head"><div><h2 id="panel-title">${esc(titulo)}</h2><p class="sub">${esc(sub)}</p></div><button type="button" class="cerrar" data-action="cerrar" aria-label="Cerrar">${I.x}</button></div>`;

  const cant = (x) => Math.max(1, Math.min(99, Number(x.cantidad) || 1));
  function panelLista() {
    const items = S.lista;
    if (!items.length) return cabeceraPanel('Mi lista', '0 productos') + `<div class="panel-vacio">${ILU.lista}<b>Tu lista está vacía</b><p>Tocá “Guardar” en cualquier producto para seguirlo de cerca y ver cuánto cuesta todo junto.</p></div>`;
    const unidades = items.reduce((s, x) => s + cant(x), 0);
    const total = items.reduce((s, x) => s + (x.precio || 0) * cant(x), 0);
    const porTienda = {};
    for (const x of items) if (x.tienda) porTienda[x.tienda] = (porTienda[x.tienda] || 0) + cant(x);
    return cabeceraPanel('Mi lista', `${plural(items.length, 'producto', 'productos')}${unidades > items.length ? ` · ${unidades} unidades` : ''}`) + `
      <div style="display:grid;gap:8px">${items.map((x) => `
        <div class="item item-lista">
          <h3><button type="button" data-action="ver" data-ids="${esc(x.ids.join(','))}">${esc(x.nombre)}</button></h3>
          <p>${x.tienda ? `Más barato en ${esc(tiendaNombre(x.tienda))}` : 'Agotado'} · revisado ${hace(x.fecha)}</p>
          <div class="der"><span class="precio">${x.precio ? dinero(x.precio * cant(x)) : '—'}</span>${cant(x) > 1 && x.precio ? `<small class="c-unidad">${cant(x)} × ${dinero(x.precio)}</small>` : ''}</div>
          <div class="item-pie">
            <div class="cant" role="group" aria-label="Cantidad de ${esc(x.nombre)}"><button type="button" data-action="cant" data-g="${esc(x.id)}" data-d="-1" aria-label="Uno menos" ${cant(x) <= 1 ? 'disabled' : ''}>−</button><output>${cant(x)}</output><button type="button" data-action="cant" data-g="${esc(x.id)}" data-d="1" aria-label="Uno más" ${cant(x) >= 99 ? 'disabled' : ''}>+</button></div>
            <button type="button" class="quitar" data-action="quitar-lista" data-g="${esc(x.id)}">Quitar</button>
          </div>
        </div>`).join('')}
      </div>
      <div class="resumen">
        <div class="resumen-fila mejor"><span>Comprando cada producto donde está más barato<small>${Object.entries(porTienda).map(([t, n]) => `${tiendaNombre(t)} (${n})`).join(', ')}</small></span><strong>${dinero(total)}</strong></div>
        <button type="button" class="btn" data-action="refrescar-lista" id="btn-refrescar">Actualizar precios de mi lista</button>
      </div>
      <div class="sec-head" style="margin:4px 0 0"><h2 style="font-size:20px">¿Dónde sale más <em>barata</em> tu lista?</h2><p>Si querés comprar todo en un solo lugar (con tus cantidades).</p></div>
      ${S.canasta ? (S.canasta.cargando ? '<p class="sub">Revisando cada tienda…</p>' : canastaHtml(S.canasta)) : `<button type="button" class="btn primario" data-action="canasta">Comparar mi lista por tienda</button>`}`;
  }

  async function calcularCanasta() {
    S.canasta = { cargando: true };
    render();
    const items = [];
    for (const x of S.lista) {
      let g = null;
      try { const r = await api('/producto?ids=' + encodeURIComponent(x.ids.join(','))); g = r.grupo || null; } catch (e) { /* se usa lo que haya */ }
      g = g || S.grupos.get(x.id) || null;
      const pt = {};
      if (g) for (const o of g.ofertas) if (o.disponible && (!(o.tienda in pt) || o.precio < pt[o.tienda])) pt[o.tienda] = o.precio;
      items.push({ id: x.id, pt });
    }
    S.canasta = { items, fecha: new Date().toISOString() };
    if (S.panel === 'lista') render();
  }
  function canastaHtml(c) {
    const enLista = S.lista.filter((x) => c.items.some((i) => i.id === x.id));
    const n = enLista.length;
    const tiendas = new Map();
    for (const x of enLista) {
      const it = c.items.find((i) => i.id === x.id);
      for (const [t, p] of Object.entries(it.pt)) { const f = tiendas.get(t) || { tienda: t, total: 0, tiene: 0 }; f.total += p * cant(x); f.tiene++; tiendas.set(t, f); }
    }
    const filas = [...tiendas.values()].sort((a, b) => (b.tiene === n) - (a.tiene === n) || b.tiene - a.tiene || a.total - b.total);
    const nuevos = S.lista.length - n;
    if (!filas.length) return '<p class="sub">No encontramos precios actuales para tu lista.</p><button type="button" class="limpiar" data-action="canasta">Volver a calcular</button>';
    const completas = filas.filter((f) => f.tiene === n);
    return `<div class="canasta">${filas.slice(0, 8).map((f, i) => `
      <div class="c-fila ${f.tiene === n && i === 0 ? 'mejor' : ''}"><b>${esc(tiendaNombre(f.tienda))}</b><strong>${f.tiene === n ? dinero(f.total) : '—'}</strong>
      <small>${f.tiene === n ? (i === 0 ? 'La más barata con toda tu lista' : `+${dinero(f.total - completas[0].total)} que la más barata`) : `Tiene ${f.tiene} de ${n} productos (${dinero(f.total)})`}</small></div>`).join('')}</div>
      ${completas.length ? '' : '<p class="nota">Ninguna tienda tiene todos los productos de tu lista.</p>'}
      ${nuevos > 0 ? `<p class="nota">Agregaste ${plural(nuevos, 'producto', 'productos')} después del cálculo: tocá “Volver a calcular”.</p>` : ''}
      <button type="button" class="limpiar" data-action="canasta">Volver a calcular</button>`;
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
      : '<div class="panel-vacio">' + ILU.alertas + '<b>No tenés alertas</b><p>Abrí un producto y usá “Avisame si baja” para elegir tu precio objetivo.</p></div>';
    return cabeceraPanel('Alertas de precio', plural(items.length, 'alerta', 'alertas')) + cuerpo;
  }

  function panelTiendas() {
    const ini = S.inicio;
    if (!ini) return cabeceraPanel('Tiendas', 'Cargando…') + `<div class="panel-vacio">${S.errorInicio ? esc(S.errorInicio.message) : 'Revisando tiendas…'}</div>`;
    const etiquetas = { ok: 'Funcionando', pendiente: 'Pendiente', bloqueado: 'No permite robots', error: 'Con errores', no_disponible: 'Sin datos públicos', sin_resultados: 'Sin productos' };
    const formas = { vtex: 'Búsqueda en vivo', woocommerce: 'Búsqueda en vivo', shopify: 'Catálogo indexado', sitemap: 'Páginas de producto', auto: 'Detectando…', ninguna: 'Sin datos legibles' };
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
      ${(() => {
        const act = ini.tiendas.filter(activa).sort((a, b) => S.favoritas.includes(b.id) - S.favoritas.includes(a.id)), resto = ini.tiendas.filter((t) => !activa(t));
        const rubros = [...new Set(act.map((t) => t.rubro || 'Otras'))];
        const fila = (t) => {
          const on = activa(t), fav = S.favoritas.includes(t.id), rs = S.resenas?.[t.id];
          return `
          <div class="item ${fav ? 'es-fav' : ''}">
            <h3><span class="dot ${esc(on ? 'ok' : (t.estado || 'pendiente'))}" style="display:inline-block;margin-right:8px"></span>${esc(t.nombre)}</h3>
            <p>${esc(t.detalle || formas[t.plataforma] || t.plataforma || '')}${t.revisado ? ` · revisada ${hace(t.revisado)}` : ''}</p>
            <div class="der">${on ? `<button type="button" class="fav-btn" data-action="fav" data-t="${esc(t.id)}" aria-pressed="${fav}" aria-label="${fav ? 'Quitar de' : 'Agregar a'} mis tiendas favoritas" title="${fav ? 'Favorita' : 'Marcar como favorita'}">${ISTAR}</button>` : ''}<span class="badge ${on ? 'b-bueno' : ['bloqueado', 'error', 'no_disponible'].includes(t.estado) ? 'b-falsa' : 'b-normal'}">${esc(on ? 'Conectada' : (etiquetas[t.estado] || 'Sin revisar'))}</span></div>
            ${on ? `<button type="button" class="opiniones" data-action="resenas" data-t="${esc(t.id)}">${rs?.n ? `${estrellas(promedio(rs))}<b>${decimal(promedio(rs))}</b><span>· ${plural(rs.n, 'opinión', 'opiniones')}</span>` : '<span>Sin opiniones todavía · ¡Dejá la primera!</span>'}</button>` : ''}
          </div>`;
        };
        return `
          <div class="sec-head" style="margin:0"><h2 style="font-size:20px">${act.length} tiendas <em>conectadas</em></h2><p>Tocá la ★ para marcar tus favoritas: salen primero y podés buscar solo en ellas.</p></div>
          ${rubros.map((r) => `<p class="grupo-t" style="margin:4px 0 0">${esc(r)}</p><div class="estado-tiendas-lista">${act.filter((t) => (t.rubro || 'Otras') === r).map(fila).join('')}</div>`).join('')}
          ${resto.length ? `<div class="sec-head" style="margin:8px 0 0"><h2 style="font-size:20px">En <em>evaluación</em></h2><p>Tiendas que probamos solas. Aparecen en la página cuando funcionan.</p></div>
          <div class="estado-tiendas-lista">${resto.map(fila).join('')}</div>` : ''}`;
      })()}
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

  // ---------- Ilustraciones para estados vacíos ----------
  const ILU = {
    lista: '<svg class="ilu" viewBox="0 0 120 120" aria-hidden="true"><circle class="ilu-f" cx="60" cy="60" r="52"/><path class="ilu-b" d="M34 46h52l-5 46H39z"/><path class="ilu-l" d="M47 46v-5a13 13 0 0 1 26 0v5"/><path class="ilu-c" d="M60 82s-13-7.5-13-16a7 7 0 0 1 13-3.6A7 7 0 0 1 73 66c0 8.5-13 16-13 16z"/><path class="ilu-s" d="M94 24l2.2 5.3 5.3 2.2-5.3 2.2L94 39l-2.2-5.3-5.3-2.2 5.3-2.2zM22 80l1.6 3.8 3.8 1.6-3.8 1.6L22 91l-1.6-4-3.8-1.6 3.8-1.6z"/></svg>',
    alertas: '<svg class="ilu" viewBox="0 0 120 120" aria-hidden="true"><circle class="ilu-f" cx="60" cy="60" r="52"/><path class="ilu-b" d="M36 78V58a24 24 0 0 1 48 0v20l7 9H29z"/><path class="ilu-l" d="M51 92a9 9 0 0 0 18 0"/><circle class="ilu-c" cx="60" cy="31" r="4.5"/><path class="ilu-s" d="M94 30l2.2 5.3 5.3 2.2-5.3 2.2L94 45l-2.2-5.3-5.3-2.2 5.3-2.2zM22 40l1.6 3.8 3.8 1.6-3.8 1.6L22 51l-1.6-4-3.8-1.6 3.8-1.6z"/></svg>',
    buscar: '<svg class="ilu" viewBox="0 0 120 120" aria-hidden="true"><circle class="ilu-f" cx="60" cy="60" r="52"/><circle class="ilu-b" cx="54" cy="53" r="24"/><path class="ilu-l grueso" d="M72 71l17 17"/><path class="ilu-l" d="M47 47a7 7 0 1 1 9.5 6.5c-1.6.7-2.5 1.8-2.5 3.5v2"/><circle class="ilu-c" cx="54" cy="66" r="2.6"/><path class="ilu-s" d="M95 26l2.2 5.3 5.3 2.2-5.3 2.2L95 41l-2.2-5.3-5.3-2.2 5.3-2.2z"/></svg>',
    ofertas: '<svg class="ilu" viewBox="0 0 120 120" aria-hidden="true"><circle class="ilu-f" cx="60" cy="60" r="52"/><path class="ilu-b" d="M30 60V36a5 5 0 0 1 5-5h24l33 33-29 29z"/><circle class="ilu-c" cx="45" cy="46" r="5.5"/><path class="ilu-l" d="M55 70l14-14M56 58h.01M68 70h.01"/><path class="ilu-s" d="M96 82l2.2 5.3 5.3 2.2-5.3 2.2L96 97l-2.2-5.3-5.3-2.2 5.3-2.2z"/></svg>',
    canasta: '<svg class="ilu" viewBox="0 0 120 120" aria-hidden="true"><circle class="ilu-f" cx="60" cy="60" r="52"/><path class="ilu-l" d="M22 34h10l9 40h42l8-28H36"/><path class="ilu-b" d="M38 46h53l-8 28H44z"/><circle class="ilu-c" cx="48" cy="86" r="5"/><circle class="ilu-c" cx="79" cy="86" r="5"/><path class="ilu-l" d="M56 54v12M68 54v12"/><path class="ilu-s" d="M94 18l2.2 5.3 5.3 2.2-5.3 2.2L94 33l-2.2-5.3-5.3-2.2 5.3-2.2z"/></svg>',
    candado: '<svg class="ilu" viewBox="0 0 120 120" aria-hidden="true"><circle class="ilu-f" cx="60" cy="60" r="52"/><rect class="ilu-b" x="36" y="54" width="48" height="38" rx="9"/><path class="ilu-l" d="M46 54v-9a14 14 0 0 1 28 0v9"/><circle class="ilu-c" cx="60" cy="71" r="5"/><path class="ilu-l" d="M60 76v6"/></svg>'
  };

  // ---------- Animaciones (respetan "reducir movimiento") ----------
  const sinMovimiento = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function confeti(origen) {
    if (sinMovimiento() || !document.body.animate) return;
    const colores = ['#f08bb0', '#b9406f', '#ffcadd', '#c9b3ff', '#ffd3a8', '#9fe3c8', '#ffe78f'];
    const r = origen && origen.getBoundingClientRect ? origen.getBoundingClientRect() : null;
    const x0 = r && r.width ? r.left + r.width / 2 : innerWidth / 2, y0 = r && r.width ? r.top + r.height / 2 : innerHeight / 3;
    const capa = document.createElement('div');
    capa.className = 'confeti'; capa.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 48; i++) {
      const p = document.createElement('i');
      p.style.background = colores[i % colores.length];
      p.style.left = x0 + 'px'; p.style.top = y0 + 'px';
      if (i % 3 === 0) p.style.borderRadius = '50%';
      if (i % 4 === 1) { p.style.width = '6px'; p.style.height = '12px'; }
      capa.appendChild(p);
      const ang = Math.random() * Math.PI * 2, vel = 110 + Math.random() * 230;
      const dx = Math.cos(ang) * vel, dy = Math.sin(ang) * vel - 170;
      const giro = Math.random() * 720 - 360;
      p.animate([
        { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx * 0.7}px), calc(-50% + ${dy * 0.7}px)) rotate(${giro / 2}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 300}px)) rotate(${giro}deg)`, opacity: 0 }
      ], { duration: 1200 + Math.random() * 700, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
    }
    document.body.appendChild(capa);
    setTimeout(() => capa.remove(), 2200);
  }
  function latir(id) {
    if (sinMovimiento()) return;
    const sel = window.CSS && CSS.escape ? CSS.escape(id) : id;
    document.querySelectorAll(`[data-action="lista"][data-g="${sel}"]`).forEach((el) => el.classList.add('latido'));
    const n = $('#n-lista');
    if (n) { n.classList.remove('brinca'); void n.offsetWidth; n.classList.add('brinca'); }
  }

  // ---------- Mini historial en las tarjetas ----------
  function sparkline(h) {
    const s = h.serie, W = 120, H = 34;
    const rango = h.max - h.min || 1;
    const pts = s.map((x, i) => [(i * W) / (s.length - 1), H - 4 - ((x.p - h.min) / rango) * (H - 8)]);
    const linea = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const [ux, uy] = pts[pts.length - 1];
    return `<svg class="spark ${h.cambio < -0.005 ? 'baja' : h.cambio > 0.005 ? 'sube' : ''}" viewBox="-3 -3 ${W + 6} ${H + 6}" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,${H} ${linea} ${W},${H}"/><polyline points="${linea}"/><circle cx="${ux.toFixed(1)}" cy="${uy.toFixed(1)}" r="3"/></svg>`;
  }
  // El mismo resumen que trae la búsqueda, armado con el historial completo del detalle
  function histDeDetalle(D) {
    const g = D.grupo;
    if (!g || !D.historial?.length) return null;
    const ids = new Set(g.ofertas.map((o) => o.id));
    const dia = new Map();
    for (const h of D.historial) if (ids.has(h.oferta_id)) dia.set(h.fecha, Math.min(dia.get(h.fecha) ?? Infinity, h.precio));
    const serie = [...dia.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([f, p]) => ({ f, p }));
    if (serie.length < 2) return null;
    const m = mejor(g);
    const limite = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const hace30 = serie.find((x) => x.f >= limite) || serie[0];
    const precios = serie.map((x) => x.p);
    return { serie, min: Math.min(...precios), max: Math.max(...precios), desde: serie[0].f, dias: serie.length, cambio: m && hace30.p ? (m.precio - hace30.p) / hace30.p : 0 };
  }
  function insigniasHist(g, h = g.hist) {
    const m = mejor(g);
    if (!h || !m) return [];
    if (h.dias >= 7 && m.precio <= h.min) return [['b-bueno', 'Precio más bajo registrado']];
    if (h.cambio <= -0.03) return [['b-bueno', `Bajó ${Math.round(-h.cambio * 100)}% en 30 días`]];
    if (h.cambio >= 0.03) return [['b-esperar', `Subió ${Math.round(h.cambio * 100)}% en 30 días`]];
    return [];
  }

  // ---------- Calculadora de cuotas ----------
  function calculadora(monto) {
    return `<form class="calc" id="form-calc" novalidate>
      <div><h3>Calculadora de cuotas</h3><p class="sub">¿Lo vas a pagar con tarjeta o con crédito de la tienda? Poné la tasa de interés anual y el plazo y te decimos cuánto pagarías.</p></div>
      <div class="calc-campos">
        <label class="campo" for="calc-monto">Monto en colones<input id="calc-monto" name="monto" inputmode="numeric" value="${monto ? Math.round(monto) : ''}"></label>
        <label class="campo" for="calc-tasa">Tasa anual (%)<input id="calc-tasa" name="tasa" inputmode="decimal" value="0"></label>
        <label class="campo" for="calc-meses">Plazo<select id="calc-meses" name="meses">${[3, 6, 10, 12, 18, 24, 36, 48].map((m) => `<option value="${m}" ${m === 12 ? 'selected' : ''}>${m} meses</option>`).join('')}</select></label>
      </div>
      <div class="calc-res" id="calc-res" aria-live="polite"></div>
      <p class="nota" style="margin:0">Con tasa 0% es una compra a “tasa cero”. La tasa de tu tarjeta aparece en tu estado de cuenta o en el contrato de crédito. Es un cálculo de referencia (sistema de cuota fija).</p>
    </form>`;
  }
  function calcularCuota() {
    const f = $('#form-calc'), out = $('#calc-res');
    if (!f || !out) return;
    const P = Number(String(f.monto.value).replace(/[^\d.]/g, ''));
    const tasa = Number(String(f.tasa.value).replace(',', '.').replace(/[^\d.]/g, '')) || 0;
    const n = Number(f.meses.value);
    if (!P || P < 1000) { out.innerHTML = '<p class="sub">Escribí el monto que querés financiar.</p>'; return; }
    const r = tasa / 100 / 12;
    const cuota = r ? (P * r) / (1 - Math.pow(1 + r, -n)) : P / n;
    const total = cuota * n;
    out.innerHTML = `
      <div class="calc-dato principal"><small>Cuota mensual</small><strong>${dinero(cuota)}</strong></div>
      <div class="calc-dato"><small>Total a pagar</small><strong>${dinero(total)}</strong></div>
      <div class="calc-dato ${total - P > 1 ? 'malo' : 'bueno'}"><small>Intereses</small><strong>${total - P > 1 ? dinero(total - P) : '₡0'}</strong></div>`;
  }

  // ---------- Búsqueda por voz ----------
  const Reconocer = window.SpeechRecognition || window.webkitSpeechRecognition;
  const IMIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
  const micBtn = (id) => (Reconocer ? `<button type="button" class="mic" data-action="voz" data-input="${id}" aria-label="Buscar por voz" title="Buscar por voz">${IMIC}</button>` : '');
  let escuchando = null;
  function buscarPorVoz(b) {
    if (!Reconocer) { aviso('Tu navegador no permite buscar por voz. Probá con Chrome.'); return; }
    if (escuchando) { escuchando.stop(); return; }
    const input = document.getElementById(b.dataset.input);
    const rec = new Reconocer();
    rec.lang = 'es-CR'; rec.interimResults = true; rec.maxAlternatives = 1;
    escuchando = rec;
    b.classList.add('escuchando');
    aviso('Te escucho… decí el producto 🎙️');
    let final = '';
    rec.onresult = (e) => {
      let t = '';
      for (const r of e.results) { t += r[0].transcript; if (r.isFinal) final = t; }
      if (input) input.value = t;
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') aviso('Necesitamos permiso para usar el micrófono');
      else if (e.error === 'no-speech') aviso('No te escuché. Probá de nuevo');
    };
    rec.onend = () => {
      document.querySelectorAll('.mic.escuchando').forEach((x) => x.classList.remove('escuchando'));
      escuchando = null;
      const q = final.trim().replace(/[.¿?¡!]+$/g, '');
      if (q.length >= 2) { S.panel = null; irA({ q }); }
    };
    try { rec.start(); } catch (e) { escuchando = null; b.classList.remove('escuchando'); }
  }

  // ---------- Tiendas favoritas ----------
  const ISTAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>';
  function alternarFavorita(id) {
    const es = S.favoritas.includes(id);
    S.favoritas = es ? S.favoritas.filter((x) => x !== id) : [...S.favoritas, id];
    guardar.set('favoritas', S.favoritas);
    if (!S.favoritas.length) S.f.soloFav = false;
    aviso(es ? `${tiendaNombre(id)} ya no es favorita` : `${tiendaNombre(id)} es una de tus favoritas ★`);
  }

  // ---------- Reseñas de tiendas ----------
  async function cargarResenas() {
    if (!cuentasActivas()) { S.resenas = {}; return; }
    try {
      const r = await fetch(`${CFG.supabaseUrl}/rest/v1/resenas?select=id,user_id,tienda_id,estrellas,comentario,nombre,creado&order=creado.desc&limit=1000`, { headers: { apikey: CFG.supabaseClavePublica } });
      if (!r.ok) throw new Error('sin reseñas');
      const por = {};
      for (const f of await r.json()) { const t = (por[f.tienda_id] ||= { suma: 0, n: 0, lista: [] }); t.suma += f.estrellas; t.n++; t.lista.push(f); }
      S.resenas = por;
    } catch (e) { S.resenas = S.resenas || {}; }
  }
  const promedio = (rs) => (rs && rs.n ? rs.suma / rs.n : 0);
  const decimal = (x) => x.toFixed(1).replace('.', ',');
  function estrellas(p) {
    return `<span class="estrellas" role="img" aria-label="${decimal(p)} de 5 estrellas">${[1, 2, 3, 4, 5].map((i) => `<i class="${p >= i - 0.25 ? 'on' : p >= i - 0.75 ? 'medio' : ''}">★</i>`).join('')}</span>`;
  }
  function estrellasMini(tid) {
    const rs = S.resenas?.[tid];
    if (!rs?.n) return '';
    return ` <button type="button" class="estrellas-mini" data-action="resenas" data-t="${esc(tid)}" title="Ver opiniones de ${esc(tiendaNombre(tid))}">★ ${decimal(promedio(rs))}<small>(${rs.n})</small></button>`;
  }
  function panelResena() {
    const t = S.resenaTienda;
    const rs = S.resenas?.[t];
    const mia = C.usuario && rs?.lista.find((x) => x.user_id === C.usuario.id);
    const val = S.resenaBorrador?.estrellas ?? mia?.estrellas ?? 0;
    const form = C.usuario ? `
      <form class="form-cuenta" id="form-resena" novalidate>
        <b class="form-t">${mia ? 'Tu opinión' : '¿Cómo te fue comprando aquí?'}</b>
        <div class="pick-estrellas" role="radiogroup" aria-label="Calificación">${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="${n === val}" data-action="estrella" data-n="${n}" class="${n <= val ? 'on' : ''}" aria-label="${plural(n, 'estrella', 'estrellas')}">★</button>`).join('')}</div>
        <input type="hidden" name="estrellas" value="${val}">
        <label class="campo" for="r-coment">Comentario (opcional)<textarea id="r-coment" name="comentario" maxlength="500" placeholder="Entrega, atención, garantía…">${esc(S.resenaBorrador?.comentario ?? mia?.comentario ?? '')}</textarea></label>
        ${S.resenaError ? `<p class="error">${esc(S.resenaError)}</p>` : ''}
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <button type="submit" class="btn primario">${mia ? 'Actualizar mi opinión' : 'Publicar opinión'}</button>
          ${mia ? '<button type="button" class="limpiar" data-action="borrar-resena">Borrar mi opinión</button>' : ''}
        </div>
        <p class="nota" style="margin:0">Se publica con tu nombre${nombreUsuario() ? ` (${esc(nombreUsuario())})` : ''}. Una opinión por tienda; podés cambiarla cuando querás.</p>
      </form>`
      : `<div class="panel-vacio">${ILU.candado}<b>Ingresá para opinar</b><p>Las opiniones son de personas con cuenta, así evitamos reseñas falsas.</p><button type="button" class="btn primario" data-action="panel" data-p="cuenta">Ingresar o crear cuenta</button></div>`;
    const lista = rs?.lista || [];
    return cabeceraPanel(`Opiniones de ${tiendaNombre(t)}`, rs?.n ? `${decimal(promedio(rs))} de 5 · ${plural(rs.n, 'opinión', 'opiniones')}` : 'Todavía sin opiniones') + `
      ${rs?.n ? `<div class="resumen-estrellas">${estrellas(promedio(rs))}<b>${decimal(promedio(rs))}</b>${[5, 4, 3, 2, 1].map((n) => { const c = lista.filter((x) => x.estrellas === n).length; return `<div class="re-fila"><span>${n}★</span><div class="barra-pista"><i style="width:${(c / rs.n) * 100}%"></i></div><small>${c}</small></div>`; }).join('')}</div>` : ''}
      ${form}
      ${lista.length ? `<div class="resenas">${lista.map((x) => `<article class="resena"><header>${estrellas(x.estrellas)}<b>${esc(x.nombre || 'Compradora anónima')}</b><small>${hace(x.creado)}</small></header>${x.comentario ? `<p>${esc(x.comentario)}</p>` : ''}</article>`).join('')}</div>` : ''}
      <p class="nota">Las opiniones son de las personas usuarias, no de PinkyPrecios.</p>
      <button type="button" class="limpiar" data-action="panel" data-p="tiendas">← Todas las tiendas</button>`;
  }
  async function enviarResena(f) {
    const estrellasN = Number(f.estrellas.value);
    S.resenaError = '';
    S.resenaBorrador = { estrellas: estrellasN, comentario: f.comentario.value };
    if (!estrellasN) { S.resenaError = 'Elegí de 1 a 5 estrellas.'; renderPanel(true); return; }
    const boton = f.querySelector('button[type=submit]'); boton.disabled = true; boton.textContent = 'Publicando…';
    const { error } = await C.cliente.from('resenas').upsert({
      user_id: C.usuario.id, tienda_id: S.resenaTienda, estrellas: estrellasN,
      comentario: f.comentario.value.trim().slice(0, 500) || null,
      nombre: (C.usuario.user_metadata?.nombre || '').trim().slice(0, 60) || null
    }, { onConflict: 'user_id,tienda_id' });
    if (error) {
      S.resenaError = /relation|does not exist|schema cache/i.test(error.message || '') ? 'Las opiniones todavía no están activadas (falta la actualización 3 de la base de datos).' : 'No se pudo publicar. Intentá de nuevo.';
      renderPanel(true); return;
    }
    S.resenaBorrador = null;
    await cargarResenas();
    renderPanel(true);
    confeti($('#panel .resumen-estrellas') || $('#panel'));
    aviso('¡Gracias por tu opinión! 💗');
  }
  async function borrarResena() {
    if (!confirm('¿Borrar tu opinión de esta tienda?')) return;
    await C.cliente.from('resenas').delete().eq('user_id', C.usuario.id).eq('tienda_id', S.resenaTienda);
    S.resenaBorrador = null;
    await cargarResenas();
    renderPanel(true);
    aviso('Opinión borrada');
  }

  // ---------- Tarjeta para compartir (imagen) ----------
  function enlaceProducto(g) { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('p', idsDe(g).join(',')); return u.href; }
  function textoProducto(g) { const m = mejor(g); return `${g.nombre}: ${m ? `${dinero(m.precio)} en ${tiendaNombre(m.tienda)}` : 'agotado'} · Comparado en PinkyPrecios ${enlaceProducto(g)}`; }
  function panelImagen() {
    const g = S.detalle?.grupo;
    if (!g) return cabeceraPanel('Tarjeta para compartir', '') + '<div class="panel-vacio"><p>Abrí un producto para crear su tarjeta.</p></div>';
    return cabeceraPanel('Tarjeta para compartir', 'Una imagen lista para WhatsApp, Instagram o tus estados') + `
      <div class="share-prev"><canvas id="lienzo" width="1080" height="1350" role="img" aria-label="Tarjeta con el mejor precio de ${esc(g.nombre)}"></canvas><p class="sub" id="lienzo-estado">Dibujando…</p></div>
      <div class="share-acc">
        <button type="button" class="btn primario" data-action="img-compartir">${I.compartir}Compartir imagen</button>
        <button type="button" class="btn" data-action="img-descargar">Descargar</button>
        <a class="btn" href="https://wa.me/?text=${encodeURIComponent(textoProducto(g))}" target="_blank" rel="noopener">Enviar enlace por WhatsApp</a>
      </div>`;
  }
  function cargarImagen(src) {
    return new Promise((ok) => {
      const i = new Image();
      const t = setTimeout(() => ok(null), 8000);
      i.onload = () => { clearTimeout(t); ok(i); };
      i.onerror = () => { clearTimeout(t); ok(null); };
      i.src = src;
    });
  }
  function caja(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function lineasDeTexto(c, texto, ancho, max) {
    const palabras = String(texto).split(/\s+/), lineas = [];
    let actual = '';
    for (const p of palabras) {
      const prueba = actual ? actual + ' ' + p : p;
      if (c.measureText(prueba).width > ancho && actual) { lineas.push(actual); actual = p; } else actual = prueba;
    }
    if (actual) lineas.push(actual);
    if (lineas.length > max) { lineas.length = max; let u = lineas[max - 1]; while (c.measureText(u + '…').width > ancho && u.length) u = u.slice(0, -1); lineas[max - 1] = u.trim() + '…'; }
    return lineas;
  }
  async function dibujarTarjeta() {
    const cv = $('#lienzo'), g = S.detalle?.grupo;
    if (!cv || !g) return;
    const c = cv.getContext('2d'), W = 1080, H = 1350;
    try { await document.fonts?.ready; } catch (e) { /* sin fuentes */ }
    const [logo, foto] = await Promise.all([cargarImagen('img/logo.png'), g.imagen ? cargarImagen(CFG.api + '/imagen?u=' + encodeURIComponent(g.imagen)) : null]);
    if ($('#lienzo') !== cv) return;
    const fondo = c.createLinearGradient(0, 0, W, H);
    fondo.addColorStop(0, '#fff4f8'); fondo.addColorStop(1, '#ffd3e5');
    c.fillStyle = fondo; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,.6)';
    c.beginPath(); c.arc(960, 120, 190, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(90, 1270, 230, 0, Math.PI * 2); c.fill();
    // Encabezado
    if (logo) c.drawImage(logo, 70, 52, 112, 112);
    c.textBaseline = 'alphabetic';
    c.font = '600 66px Fraunces, Georgia, serif'; c.fillStyle = '#4f2238';
    c.fillText('Pinky', 200, 132);
    const wP = c.measureText('Pinky').width;
    c.font = 'italic 600 66px Fraunces, Georgia, serif'; c.fillStyle = '#b9406f';
    c.fillText('Precios', 200 + wP, 132);
    // Tarjeta blanca
    c.save(); c.shadowColor = 'rgba(185,64,111,.20)'; c.shadowBlur = 50; c.shadowOffsetY = 14;
    c.fillStyle = '#ffffff'; caja(c, 64, 206, 952, 1010, 52); c.fill(); c.restore();
    // Foto del producto
    const bx = 120, by = 250, bw = 840, bh = 440;
    if (foto) {
      const k = Math.min(bw / foto.width, bh / foto.height);
      const w = foto.width * k, h = foto.height * k;
      c.drawImage(foto, bx + (bw - w) / 2, by + (bh - h) / 2, w, h);
    } else {
      c.fillStyle = '#fdecf3'; c.beginPath(); c.arc(W / 2, by + bh / 2, 150, 0, Math.PI * 2); c.fill();
      c.font = '140px serif'; c.textAlign = 'center'; c.fillText('🛍️', W / 2, by + bh / 2 + 50); c.textAlign = 'left';
    }
    // Nombre
    c.fillStyle = '#4f2238'; c.font = '800 46px Nunito, "Segoe UI", sans-serif';
    lineasDeTexto(c, g.nombre, 840, 2).forEach((l, i) => c.fillText(l, 120, 770 + i * 56));
    const m = mejor(g), d = disponibles(g);
    if (m) {
      // Etiqueta de precio
      c.font = '900 96px Nunito, "Segoe UI", sans-serif';
      const precio = dinero(m.precio), wPr = c.measureText(precio).width;
      c.fillStyle = '#ffcadd'; caja(c, 112, 862, wPr + 76, 160, 26); c.fill();
      c.fillStyle = '#5c1a3c'; c.font = '800 26px Nunito, "Segoe UI", sans-serif';
      c.fillText('MEJOR PRECIO HOY', 150, 908);
      c.font = '900 96px Nunito, "Segoe UI", sans-serif'; c.fillText(precio, 150, 998);
      c.fillStyle = '#8a5f73'; c.font = '700 34px Nunito, "Segoe UI", sans-serif';
      const xt = 112 + wPr + 76 + 28;
      if (xt < 820) { c.fillText('en', xt, 930); c.fillStyle = '#4f2238'; c.font = '800 40px Nunito, "Segoe UI", sans-serif'; lineasDeTexto(c, tiendaNombre(m.tienda), 960 - xt, 2).forEach((l, i) => c.fillText(l, xt, 978 + i * 46)); }
      else { c.fillText('en ' + tiendaNombre(m.tienda), 112, 1060); }
      const max = Math.max(...d.map((o) => o.precio));
      const ts = new Set(d.map((o) => o.tienda)).size;
      c.font = '800 34px Nunito, "Segoe UI", sans-serif'; c.fillStyle = '#23855f';
      const linea = ts > 1 ? (max > m.precio ? `Comparado en ${ts} tiendas · ahorrás ${dinero(max - m.precio)}` : `Comparado en ${ts} tiendas`) : 'Precio publicado por la tienda';
      c.fillText(linea, 120, xt < 820 ? 1100 : 1120);
    } else {
      c.fillStyle = '#8a5f73'; c.font = '800 44px Nunito, "Segoe UI", sans-serif'; c.fillText('Agotado por ahora', 120, 960);
    }
    c.fillStyle = '#8a5f73'; c.font = '600 28px Nunito, "Segoe UI", sans-serif';
    c.fillText(`Precio revisado el ${fechaCorta(new Date().toISOString())} · confirmá en la tienda`, 120, 1170);
    // Pie
    c.textAlign = 'center'; c.fillStyle = '#b9406f'; c.font = '800 34px Nunito, "Segoe UI", sans-serif';
    c.fillText(`Compará precios reales en ${location.host || 'PinkyPrecios'} 💗`, W / 2, 1290);
    c.textAlign = 'left';
    const est = $('#lienzo-estado'); if (est) est.textContent = foto || !g.imagen ? '' : 'No pudimos traer la foto de la tienda, pero la tarjeta está lista.';
  }
  function blobTarjeta() { const cv = $('#lienzo'); return new Promise((ok) => (cv ? cv.toBlob(ok, 'image/png') : ok(null))); }
  function descargarBlob(b) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = 'pinkyprecios.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function compartirImagen() {
    const b = await blobTarjeta();
    if (!b) { aviso('No se pudo crear la imagen'); return; }
    const archivo = new File([b], 'pinkyprecios.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try { await navigator.share({ files: [archivo], text: textoProducto(S.detalle.grupo) }); } catch (e) { /* la persona canceló */ }
    } else { descargarBlob(b); aviso('Tu navegador no comparte imágenes directo: la descargamos para que la mandés'); }
  }

  // ---------- Gráfico de línea simple (sin interacción) ----------
  function graficoLinea(puntos, etiqueta, fmt) {
    if (puntos.length < 2) return '';
    const W = 640, H = 230, m = { l: 50, r: 14, t: 14, b: 28 };
    let lo = Math.min(...puntos.map((p) => p.v)), hi = Math.max(...puntos.map((p) => p.v));
    const pad = (hi - lo) * 0.18 || Math.abs(hi) * 0.03 || 1; lo -= pad; hi += pad;
    const paso = pasoBonito(hi - lo, 4);
    const ticks = []; for (let v = Math.ceil(lo / paso) * paso; v <= hi; v += paso) ticks.push(v);
    const n = puntos.length - 1;
    const X = (i) => m.l + (i * (W - m.l - m.r)) / n, Y = (v) => m.t + ((hi - v) * (H - m.t - m.b)) / (hi - lo);
    const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.v).toFixed(1)}`).join('');
    const xs = [...new Set([0, Math.floor(n / 2), n])];
    return `<svg class="graf-linea" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(etiqueta)}">
      ${ticks.map((v) => `<line class="grid-l" x1="${m.l}" x2="${W - m.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="axis-t" x="${m.l - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${fmt(v)}</text>`).join('')}
      ${xs.map((i, k) => `<text class="axis-t" x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : i === n ? 'end' : 'middle'}">${fechaCorta(puntos[i].f)}</text>`).join('')}
      <path class="area-g" d="${d}L${X(n).toFixed(1)} ${H - m.b}L${m.l} ${H - m.b}Z"/>
      <path class="serie" d="${d}" style="stroke:var(--accent)"/>
      ${puntos.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="${n > 40 ? 0 : 3.5}" class="punto"><title>${fechaCorta(p.f)}: ${fmt(p.v)}</title></circle>`).join('')}
    </svg>`;
  }
  const porcentaje = (x) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(1).replace('.', ',')}%`;

  // ---------- Vista: canasta básica ----------
  async function cargarCanastaB() {
    S.canastaB = { cargando: true };
    if (S.vista === 'canasta') render();
    try { S.canastaB = { datos: await api('/canasta') }; } catch (e) { S.canastaB = { error: e }; }
    if (S.vista === 'canasta') render();
  }
  function vistaCanasta() {
    const K = S.canastaB || { cargando: true };
    const cab = `<section class="of-head">
      <button type="button" class="volver" data-action="inicio" style="padding:0">← Inicio</button>
      <span class="ceja"><i>ÍNDICE PINKY</i>Se mide todos los días</span>
      <h1>Canasta <em>básica</em></h1>
      <p>Todos los días buscamos 10 productos básicos en los supermercados conectados, elegimos el más barato que cumple la descripción y lo llevamos a la misma presentación (por ejemplo, arroz de 1,8 kg). Así ves cuánto cuesta lo básico y si sube o baja.</p>
    </section>`;
    if (K.cargando) return cab + `<div class="of-grid">${Array.from({ length: 4 }, () => '<div class="esqueleto" aria-hidden="true"><i></i><i></i><i></i><i></i></div>').join('')}</div>`;
    if (K.error) return cab + `<div class="aviso-caja"><b>No pudimos cargar la canasta</b>${esc(K.error.message)}<br><button type="button" class="btn primario" data-action="ir" data-ver="canasta">Intentar de nuevo</button></div>`;
    const d = K.datos;
    const con = (d.items || []).filter((i) => i.precio);
    if (!con.length) {
      return cab + `<div class="aviso-caja">${ILU.canasta}<b>La primera medición viene pronto</b>${d.baseDeDatos === false ? 'La canasta necesita la base de datos (Supabase).' : 'Medimos automáticamente una vez al día. Estos son los productos que seguimos:'}
        <div class="chips-centro">${(d.definicion || []).map((x) => `<span class="chip">${esc(x.nombre)} · ${esc(x.ref)}</span>`).join('')}</div></div>`;
    }
    const total = con.reduce((s, i) => s + i.precio, 0);
    const comp = con.filter((i) => i.semanaPasada);
    const antes = comp.reduce((s, i) => s + i.semanaPasada, 0), ahora = comp.reduce((s, i) => s + i.precio, 0);
    const cambioSem = antes ? (ahora - antes) / antes : null;
    const serie = d.serie || [];
    const ult = serie[serie.length - 1];
    const maxP = Math.max(0, ...(d.tiendas || []).map((t) => t.productos));
    const comparables = (d.tiendas || []).filter((t) => t.productos === maxP).sort((a, b) => a.total - b.total);
    const otras = (d.tiendas || []).filter((t) => t.productos !== maxP);
    const maxT = Math.max(1, ...comparables.map((t) => t.total));
    return cab + `
      <section class="cifras">
        <div class="cifra"><strong>${dinero(total)}</strong><span>la canasta hoy (${con.length} de ${d.totalProductos} productos, cada uno donde está más barato)</span></div>
        <div class="cifra"><strong class="${cambioSem > 0.001 ? 'txt-malo' : cambioSem < -0.001 ? 'txt-bueno' : ''}">${cambioSem == null ? '—' : porcentaje(cambioSem)}</strong><span>${cambioSem == null ? 'cambio semanal (con 7 días de datos)' : 'vs. hace una semana'}</span></div>
        <div class="cifra"><strong>${ult?.indice != null ? String(ult.indice).replace('.', ',') : '—'}</strong><span>índice (100 = ${serie[0] ? fechaCorta(serie[0].fecha) : 'primer día'})</span></div>
        <div class="cifra"><strong>${d.dias}</strong><span>${d.dias === 1 ? 'día medido' : 'días medidos'}</span></div>
      </section>
      <div class="det-grid">
        <section class="bloque span2" aria-labelledby="t-cidx">
          <div class="bloque-head"><div><h2 id="t-cidx">¿Sube o baja?</h2><p class="sub">Índice de precios: cada producto empieza en 100 el primer día y se promedian. Si marca 103, lo básico está 3% más caro.</p></div></div>
          ${serie.length >= 2 ? graficoLinea(serie.map((x) => ({ f: x.fecha, v: x.indice })), 'Índice de la canasta básica', (v) => String(Math.round(v * 10) / 10).replace('.', ',')) : '<p class="sub">El gráfico aparece con 2 días de medición. ¡Volvé mañana!</p>'}
        </section>
        <section class="bloque span2" aria-labelledby="t-citems">
          <div class="bloque-head"><div><h2 id="t-citems">Producto por producto</h2><p class="sub">El más barato de hoy entre los supermercados, en la misma presentación.</p></div></div>
          <div class="tabla-wrap"><table class="tabla-canasta">
            <thead><tr><th>Producto</th><th class="n">Hoy</th><th>Dónde</th><th class="n">Hace una semana</th><th>Cambio</th></tr></thead>
            <tbody>${d.items.map((i) => {
              const c = i.precio && i.semanaPasada ? (i.precio - i.semanaPasada) / i.semanaPasada : null;
              return `<tr>
                <td><b>${esc(i.nombre)}</b><span class="vendedor">${esc(i.ref)}${i.producto ? ` · ${esc(i.producto)}` : ''}</span></td>
                <td class="n">${i.precio ? dinero(i.precio) : '—'}</td>
                <td>${i.tienda ? (i.url ? `<a class="lnk" href="${esc(i.url)}" target="_blank" rel="noopener">${esc(tiendaNombre(i.tienda))} ↗</a>` : esc(tiendaNombre(i.tienda))) : '<span class="sub">Sin dato hoy</span>'}</td>
                <td class="n">${i.semanaPasada ? dinero(i.semanaPasada) : '—'}</td>
                <td>${c == null ? '' : Math.abs(c) < 0.005 ? '<span class="badge b-normal">Igual</span>' : `<span class="badge ${c < 0 ? 'b-bueno' : 'b-esperar'}">${porcentaje(c)}</span>`}</td>
              </tr>`;
            }).join('')}</tbody></table></div>
        </section>
        ${comparables.length ? `<section class="bloque span2" aria-labelledby="t-csup">
          <div class="bloque-head"><div><h2 id="t-csup">¿Qué supermercado sale más barato?</h2><p class="sub">Comprando toda la canasta en un solo lugar (${plural(maxP, 'producto', 'productos')} que tienen todos).</p></div></div>
          <div class="barras">${comparables.map((t, i) => `<div class="barra-fila ${i === 0 && comparables.length > 1 ? 'mejor' : ''}"><b>${esc(tiendaNombre(t.tienda))}</b><div class="barra-pista"><i style="width:${Math.max(6, (t.total / maxT) * 100).toFixed(1)}%"></i></div><span>${dinero(t.total)}${i ? `<small>+${dinero(t.total - comparables[0].total)}</small>` : ''}</span></div>`).join('')}</div>
          ${otras.length ? `<p class="nota">Con menos productos hoy: ${otras.map((t) => `${esc(tiendaNombre(t.tienda))} (${t.productos} de ${d.totalProductos})`).join(', ')}.</p>` : ''}
        </section>` : ''}
      </div>
      <p class="nota">Método: buscamos cada producto con su nombre común, descartamos variantes que no son lo mismo (por ejemplo, arroz integral o aceite de oliva) y convertimos el precio a la presentación de referencia según el peso o volumen del paquete. Los precios son los que publica cada supermercado en su sitio.</p>`;
  }
  function seccionCanastaHome() {
    const d = S.canastaB?.datos;
    const con = (d?.items || []).filter((i) => i.precio);
    return `<section class="canasta-home" id="canasta-home" aria-labelledby="t-chome">
      <div>
        <span class="ceja"><i>NUEVO</i>Índice Pinky</span>
        <h2 id="t-chome">¿Cuánto cuesta la <em>canasta básica</em> hoy?</h2>
        <p>${con.length ? `${plural(con.length, 'producto básico', 'productos básicos')} (arroz, frijoles, aceite, café…): <b>${dinero(con.reduce((s, i) => s + i.precio, 0))}</b> comprando cada uno donde está más barato.` : 'Medimos todos los días el precio de 10 productos básicos en los supermercados conectados y te mostramos si sube o baja.'}</p>
        <button type="button" class="btn primario" data-action="ir" data-ver="canasta">Ver la canasta básica</button>
      </div>
      <div class="canasta-home-ilu">${ILU.canasta}</div>
    </section>`;
  }

  // ---------- Vista: panel de administración ----------
  const esAdminLocal = () => Boolean(C.usuario?.email) && C.usuario.email.toLowerCase() === String(CFG.correo || '').toLowerCase();
  async function tokenSesion() { const { data } = await C.cliente.auth.getSession(); return data.session?.access_token || ''; }
  async function cargarAdmin() {
    S.admin = { cargando: true };
    render();
    for (let i = 0; i < 50 && !C.listo; i++) await new Promise((ok) => setTimeout(ok, 200));
    if (!C.usuario || !C.cliente) S.admin = { sinSesion: true };
    else {
      try { S.admin = { datos: await api('/panel', { headers: { Authorization: 'Bearer ' + await tokenSesion() } }) }; }
      catch (e) { S.admin = { error: e }; }
    }
    if (S.vista === 'admin') render();
  }
  async function accionAdm(accion, id) {
    if (accion === 'borrar' && !confirm('¿Borrar este mensaje? No se puede deshacer.')) return;
    try {
      await api('/panel', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await tokenSesion() }, body: JSON.stringify({ accion, id }) });
      const d = S.admin.datos;
      if (accion === 'borrar') d.mensajes = d.mensajes.filter((m) => String(m.id) !== String(id));
      else { const m = d.mensajes.find((x) => String(x.id) === String(id)); if (m) m.leido = true; }
      render();
      aviso(accion === 'borrar' ? 'Mensaje borrado' : 'Marcado como leído');
    } catch (e) { aviso(e.message); }
  }
  const fechaHora = (iso) => { try { return new Date(iso).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  function vistaAdmin() {
    const A = S.admin || { cargando: true };
    const cab = `<section class="of-head">
      <button type="button" class="volver" data-action="inicio" style="padding:0">← Inicio</button>
      <span class="ceja"><i>ADMIN</i>Solo la administradora puede ver esto</span>
      <h1>Panel de <em>administración</em></h1>
      ${A.datos ? `<p>Ingresaste como <b>${esc(A.datos.admin)}</b>. Aquí ves los mensajes de contacto, lo que busca la gente y el estado de las tiendas.</p>` : ''}
    </section>`;
    if (A.cargando) return cab + `<div class="of-grid">${Array.from({ length: 4 }, () => '<div class="esqueleto" aria-hidden="true"><i></i><i></i><i></i><i></i></div>').join('')}</div>`;
    if (A.sinSesion) return cab + `<div class="aviso-caja">${ILU.candado}<b>Ingresá con tu cuenta</b>Este panel es solo para la administradora de PinkyPrecios.<br><button type="button" class="btn primario" data-action="panel" data-p="cuenta">Ingresar</button></div>`;
    if (A.error) return cab + `<div class="aviso-caja">${ILU.candado}<b>No se pudo abrir el panel</b>${esc(A.error.message)}<br><button type="button" class="btn" data-action="adm-recargar">Intentar de nuevo</button></div>`;
    const d = A.datos, t = d.totales || {};
    const noLeidos = d.mensajes.filter((m) => !m.leido).length;
    const maxV = Math.max(1, ...d.populares.map((p) => p.veces));
    const n = (x) => (x == null ? '—' : nf.format(x));
    return cab + `
      <section class="cifras adm-cifras">${[['cuentas', 'cuentas creadas'], ['alertas', 'alertas creadas'], ['cumplidas', 'alertas cumplidas'], ['ofertas', 'precios guardados'], ['registros', 'registros de historial'], ['paginas', 'páginas indexadas']].map(([k, l]) => `<div class="cifra"><strong>${n(t[k])}</strong><span>${l}</span></div>`).join('')}</section>
      <div class="det-grid">
        <section class="bloque span2" aria-labelledby="t-amsg">
          <div class="bloque-head"><div><h2 id="t-amsg">Mensajes de contacto</h2><p class="sub">${plural(noLeidos, 'sin leer', 'sin leer')} de ${d.mensajes.length}</p></div><button type="button" class="btn" data-action="adm-recargar">Actualizar</button></div>
          ${d.mensajes.length ? `<div class="adm-msgs">${d.mensajes.map((m) => `
            <article class="adm-msg ${m.leido ? '' : 'nuevo'}">
              <header><b>${esc(m.nombre || 'Sin nombre')}</b>${m.correo ? `<a class="lnk" href="mailto:${esc(m.correo)}?subject=${encodeURIComponent('Re: ' + (m.asunto || 'PinkyPrecios'))}">${esc(m.correo)}</a>` : ''}<small>${fechaHora(m.creado)}</small></header>
              ${m.asunto ? `<p class="adm-asunto">${esc(m.asunto)}</p>` : ''}
              <p>${esc(m.mensaje)}</p>
              <div class="adm-acc">${m.leido ? '<span class="badge b-normal">Leído</span>' : `<button type="button" class="chip suave" data-action="adm" data-a="leido" data-id="${esc(m.id)}">Marcar como leído</button>`}${m.correo ? `<a class="chip suave" href="mailto:${esc(m.correo)}?subject=${encodeURIComponent('Re: ' + (m.asunto || 'PinkyPrecios'))}">Responder</a>` : ''}<button type="button" class="chip suave" data-action="adm" data-a="borrar" data-id="${esc(m.id)}">Borrar</button></div>
            </article>`).join('')}</div>` : `<div class="panel-vacio">${ILU.alertas}<b>Sin mensajes todavía</b><p>Cuando alguien use el formulario de contacto, aparece aquí.</p></div>`}
        </section>
        <section class="bloque" aria-labelledby="t-apop">
          <div class="bloque-head"><div><h2 id="t-apop">Lo más buscado</h2><p class="sub">Total de veces que se buscó cada término.</p></div></div>
          ${d.populares.length ? `<div class="barras">${d.populares.slice(0, 15).map((p) => `<div class="barra-fila"><b title="${esc(p.termino)}">${esc(p.termino)}</b><div class="barra-pista"><i style="width:${Math.max(6, (p.veces / maxV) * 100).toFixed(1)}%"></i></div><span>${nf.format(p.veces)}</span></div>`).join('')}</div>` : '<p class="sub">Todavía no hay búsquedas.</p>'}
        </section>
        <section class="bloque" aria-labelledby="t-arec">
          <div class="bloque-head"><div><h2 id="t-arec">Búsquedas recientes</h2></div></div>
          ${d.recientes.length ? `<div class="adm-lista">${d.recientes.map((p) => `<button type="button" class="adm-fila" data-action="buscar" data-q="${esc(p.termino)}"><span>${esc(p.termino)}</span><small>${hace(p.ultima)}</small></button>`).join('')}</div>` : '<p class="sub">Todavía no hay búsquedas.</p>'}
        </section>
        <section class="bloque span2" aria-labelledby="t-ares">
          <div class="bloque-head"><div><h2 id="t-ares">Opiniones recientes</h2></div></div>
          ${d.resenas?.length ? `<div class="resenas">${d.resenas.map((x) => `<article class="resena"><header>${estrellas(x.estrellas)}<b>${esc(tiendaNombre(x.tienda_id))}</b><small>${hace(x.creado)}</small></header><p>${x.comentario ? esc(x.comentario) : '<i>Sin comentario</i>'}${x.nombre ? ` — ${esc(x.nombre)}` : ''}</p></article>`).join('')}</div>` : '<p class="sub">Todavía no hay opiniones.</p>'}
        </section>
        <section class="bloque span2" aria-labelledby="t-atie">
          <div class="bloque-head"><div><h2 id="t-atie">Tiendas</h2><p class="sub">Según el último diagnóstico e indexación.</p></div></div>
          <div class="tabla-wrap"><table>
            <thead><tr><th>Tienda</th><th>Forma</th><th>Estado</th><th class="n">Indexados</th></tr></thead>
            <tbody>${(d.tiendas || []).map((x) => `<tr><td><span class="tienda-nom">${esc(x.nombre)}</span><span class="vendedor">${esc(x.detalle || '')}${x.revisado ? ` · ${hace(x.revisado)}` : ''}</span></td><td>${esc(x.plataforma_detectada || '—')}</td><td><span class="badge ${x.estado === 'ok' ? 'b-bueno' : ['bloqueado', 'error', 'no_disponible'].includes(x.estado) ? 'b-falsa' : 'b-normal'}">${esc(x.estado || 'sin revisar')}</span></td><td class="n">${x.productos_indexados ? nf.format(x.productos_indexados) : '—'}</td></tr>`).join('')}</tbody>
          </table></div>
        </section>
      </div>
      <p class="nota">Para tareas de mantenimiento (indexar, actualizar, diagnóstico, canasta) usá <code>/api/admin?token=…&tarea=…</code> como dice el README.</p>`;
  }

  // ---------- Vista: sobre el proyecto ----------
  const ARQ = `<svg class="arq-svg" viewBox="0 0 780 330" role="img" aria-label="Diagrama: el navegador habla con Netlify; las funciones de Netlify leen las tiendas y guardan en Supabase">
    <defs><marker id="flecha" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="arq-punta"/></marker></defs>
    <rect class="arq-caja c-rosa" x="16" y="118" width="160" height="96" rx="18"/>
    <text class="arq-t" x="96" y="155" text-anchor="middle">Tu navegador</text>
    <text class="arq-s" x="96" y="177" text-anchor="middle">Página + app instalable</text>
    <text class="arq-s" x="96" y="195" text-anchor="middle">lista, tema, moneda</text>
    <rect class="arq-caja c-lila" x="280" y="20" width="230" height="130" rx="18"/>
    <text class="arq-t" x="395" y="54" text-anchor="middle">Netlify</text>
    <text class="arq-s" x="395" y="78" text-anchor="middle">Página (HTML, CSS, JavaScript)</text>
    <text class="arq-s" x="395" y="98" text-anchor="middle">Funciones: buscar, producto,</text>
    <text class="arq-s" x="395" y="116" text-anchor="middle">ofertas, canasta, contacto…</text>
    <text class="arq-s" x="395" y="136" text-anchor="middle">Tareas cada hora y cada 6 h</text>
    <rect class="arq-caja c-menta" x="280" y="200" width="230" height="112" rx="18"/>
    <text class="arq-t" x="395" y="234" text-anchor="middle">Supabase</text>
    <text class="arq-s" x="395" y="258" text-anchor="middle">PostgreSQL: precios e historial</text>
    <text class="arq-s" x="395" y="278" text-anchor="middle">Cuentas (Auth) y reseñas</text>
    <text class="arq-s" x="395" y="298" text-anchor="middle">Seguridad por fila (RLS)</text>
    <rect class="arq-caja c-durazno" x="604" y="66" width="160" height="130" rx="18"/>
    <text class="arq-t" x="684" y="100" text-anchor="middle">Tiendas de CR</text>
    <text class="arq-s" x="684" y="124" text-anchor="middle">VTEX · Shopify</text>
    <text class="arq-s" x="684" y="144" text-anchor="middle">WooCommerce</text>
    <text class="arq-s" x="684" y="164" text-anchor="middle">Mapas del sitio</text>
    <text class="arq-s" x="684" y="184" text-anchor="middle">+ Hacienda (dólar)</text>
    <path class="arq-f" d="M176 150 C220 120 240 95 278 88" marker-end="url(#flecha)"/>
    <text class="arq-e" x="200" y="104">busca</text>
    <path class="arq-f" d="M510 96 L602 120" marker-end="url(#flecha)"/>
    <text class="arq-e" x="520" y="92">lee precios</text>
    <path class="arq-f" d="M395 152 L395 198" marker-start="url(#flecha)" marker-end="url(#flecha)"/>
    <text class="arq-e" x="402" y="180">guarda</text>
    <path class="arq-f punteada" d="M176 186 C220 230 240 250 278 254" marker-end="url(#flecha)"/>
    <text class="arq-e" x="168" y="250">tu cuenta</text>
  </svg>`;
  function vistaProyecto() {
    const st = S.inicio?.stats, act = tiendasActivas(), resto = (S.inicio?.tiendas || []).filter((t) => !activa(t));
    const n = (x) => (x == null ? '—' : nf.format(x));
    return `
      <section class="of-head">
        <button type="button" class="volver" data-action="inicio" style="padding:0">← Inicio</button>
        <span class="ceja"><i>PROYECTO FINAL</i>Programación · Costa Rica</span>
        <h1>Sobre <em>PinkyPrecios</em></h1>
        <p>Un comparador de precios hecho en Costa Rica como proyecto final de programación. La idea: tomar lo que ya hacen los comparadores y agregarle lo que nos hacía falta como compradoras — historial real, detector de descuentos inflados, cuotas claras, canasta básica y un diseño bonito.</p>
      </section>
      <section class="cifras" aria-label="PinkyPrecios en números">
        <div class="cifra"><strong>${S.inicio ? act.length : '—'}</strong><span>tiendas conectadas</span></div>
        <div class="cifra"><strong>${n(st?.ofertas)}</strong><span>precios guardados</span></div>
        <div class="cifra"><strong>${n(st?.registros)}</strong><span>registros de historial</span></div>
        <div class="cifra"><strong>${n(st?.busquedas)}</strong><span>productos distintos buscados</span></div>
      </section>
      <div class="det-grid">
        <section class="bloque">
          <h2>La historia</h2>
          <p class="parrafo">El profesor nos pidió hacer “un comparador mejorado”. En vez de inventar precios de ejemplo, PinkyPrecios consulta de verdad los sitios públicos de las tiendas de Costa Rica, junta el mismo producto aunque cada tienda lo llame distinto y guarda cada precio todos los días. Con ese historial puede decir si una rebaja es real o si subieron el precio antes de “rebajarlo”.</p>
          <p class="parrafo">Todo funciona con servicios gratuitos: no hay inteligencia artificial pagada ni servidores propios.</p>
        </section>
        <section class="bloque">
          <h2>Lo que lo hace distinto</h2>
          <ul class="beneficios">
            <li>Historial diario de cada precio y mini gráfico en cada resultado</li>
            <li>Detector de descuentos inflados</li>
            <li>Cuotas publicadas por las tiendas y calculadora de intereses</li>
            <li>Índice de la canasta básica</li>
            <li>Lista con cantidades y “¿dónde sale más barato todo?”</li>
            <li>Alertas de precio, cuentas y tiendas favoritas</li>
            <li>Búsqueda por voz y asistente Pinky</li>
          </ul>
        </section>
      </div>
      <section class="seccion" aria-labelledby="t-arq">
        <div class="sec-head"><h2 id="t-arq">Cómo funciona <em>por dentro</em></h2><p>Cuando buscás, una función de Netlify consulta las tiendas al mismo tiempo, junta los resultados y guarda los precios en Supabase.</p></div>
        <div class="bloque arq">${ARQ}</div>
      </section>
      <section class="seccion" aria-labelledby="t-tec">
        <div class="sec-head"><h2 id="t-tec">Tecnologías</h2></div>
        <div class="tecnos">
          <div class="tecno bg-rosa"><b>HTML, CSS y JavaScript</b><p>Sin frameworks: una sola página que cambia de vista y se puede instalar como app (PWA).</p></div>
          <div class="tecno bg-lila"><b>Netlify</b><p>Publica la página desde GitHub y corre las funciones del servidor y las tareas programadas.</p></div>
          <div class="tecno bg-menta"><b>Supabase</b><p>Base de datos PostgreSQL, cuentas de usuario y seguridad a nivel de fila para que cada quien vea solo sus datos.</p></div>
          <div class="tecno bg-durazno"><b>Datos públicos</b><p>Catálogos VTEX, Shopify y WooCommerce, mapas del sitio con datos estructurados y el tipo de cambio de Hacienda.</p></div>
        </div>
      </section>
      <section class="seccion" aria-labelledby="t-tev">
        <div class="sec-head"><h2 id="t-tev">Tiendas <em>evaluadas</em></h2><p>Cada tienda se prueba sola. Solo aparecen las que publican precios legibles y permiten robots en su archivo robots.txt.</p></div>
        ${S.inicio ? `<div class="chips-centro izq">${act.map((t) => `<span class="chip ok">✓ ${esc(t.nombre)}</span>`).join('')}${resto.map((t) => `<span class="chip">${esc(t.nombre)}</span>`).join('')}</div>
        <p class="nota">${plural(act.length, 'conectada', 'conectadas')} · ${resto.length} en evaluación.</p>` : '<p class="sub">Cargando tiendas…</p>'}
      </section>
      <section class="seccion" aria-labelledby="t-lim">
        <div class="sec-head"><h2 id="t-lim">Límites <em>honestos</em></h2></div>
        <ul class="limites">
          <li>Algunas tiendas no se pudieron conectar porque bloquean robots, no publican sus precios o su sitio responde demasiado lento.</li>
          <li>El historial empieza el día en que se conectó cada tienda: decir si es “buen momento para comprar” necesita al menos 7 días de datos.</li>
          <li>Juntar el mismo producto entre tiendas usa código de barras, modelo y nombre. Casi siempre acierta, pero puede fallar.</li>
          <li>Mostramos los precios publicados en línea; en tienda física, el envío o los impuestos pueden cambiar el total.</li>
          <li>El plan gratuito de Netlify da unos 10 segundos por búsqueda, por eso una tienda muy lenta puede quedar fuera de una búsqueda.</li>
        </ul>
      </section>
      <section class="creditos">
        <img src="img/logo.png" alt="" width="72" height="72">
        <div><b>Hecho con 💗 por ${esc(CFG.autora || 'Valeria Naranjo')}</b><p>Proyecto final de programación · Costa Rica · ${new Date().getFullYear()}</p></div>
        <div class="c-acc"><button type="button" class="btn primario" data-action="ir" data-ver="contacto">Escribime</button><button type="button" class="btn" data-action="tour">Ver el tour</button></div>
      </section>`;
  }

  // ---------- Tour de bienvenida ----------
  const PASOS_TOUR = [
    { sel: ['#form-hero', '#form-top'], t: 'Buscá lo que quieras', d: 'Escribí un producto (o tocá el micrófono) y comparamos todas las tiendas conectadas al mismo tiempo.' },
    { sel: ['#catnav'], t: 'Atajos', d: 'Categorías, ofertas de la semana y la canasta básica, a un toque.' },
    { sel: ['.top-actions [data-p="lista"]'], t: 'Tu lista', d: 'Guardá productos con el corazón, elegí cantidades y mirá en qué tienda sale más barato todo junto.' },
    { sel: ['#btn-cuenta'], t: 'Tu cuenta', d: 'Creala gratis para tener tu lista, alertas y tiendas favoritas en el celular y en la compu.' },
    { sel: ['.ayuda-btn'], t: 'Pinky te ayuda', d: '¿Alguna duda? Preguntale a Pinky cómo usar cualquier parte de la página.' }
  ];
  let TOUR = null;
  function elementoTour(p) {
    for (const s of p.sel) { const el = document.querySelector(s); if (el) { const r = el.getBoundingClientRect(); if (r.width && r.height) return el; } }
    return null;
  }
  function iniciarTour() {
    if (TOUR) return;
    if (S.panel) { S.panel = null; render(); }
    const pasos = PASOS_TOUR.filter(elementoTour);
    if (!pasos.length) return;
    TOUR = { i: 0, pasos };
    document.body.insertAdjacentHTML('beforeend', '<div class="tour" id="tour" role="dialog" aria-modal="true" aria-labelledby="tour-t"><div class="tour-luz" id="tour-luz"></div><div class="tour-globo" id="tour-globo"></div></div>');
    pasoTour(0);
  }
  function pasoTour(i) {
    if (!TOUR) return;
    TOUR.i = Math.max(0, Math.min(TOUR.pasos.length - 1, i));
    const p = TOUR.pasos[TOUR.i], el = elementoTour(p);
    if (!el) { terminarTour(); return; }
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: 'center' });
    const ultimo = TOUR.i === TOUR.pasos.length - 1;
    $('#tour-globo').innerHTML = `<span class="tour-n">${TOUR.i + 1} de ${TOUR.pasos.length}</span>
      <b id="tour-t">${esc(p.t)}</b><p>${esc(p.d)}</p>
      <div class="tour-acc"><button type="button" class="limpiar" data-action="tour-fin">Saltar</button><span>${TOUR.i ? '<button type="button" class="btn" data-action="tour-atras">Atrás</button>' : ''}<button type="button" class="btn primario" data-action="${ultimo ? 'tour-listo' : 'tour-sig'}">${ultimo ? '¡Listo!' : 'Siguiente'}</button></span></div>`;
    posicionarTour();
    $('#tour-globo .btn.primario')?.focus();
  }
  function posicionarTour() {
    if (!TOUR) return;
    const el = elementoTour(TOUR.pasos[TOUR.i]), luz = $('#tour-luz'), globo = $('#tour-globo');
    if (!el || !luz || !globo) return;
    const r = el.getBoundingClientRect(), m = 6;
    Object.assign(luz.style, { top: r.top - m + 'px', left: r.left - m + 'px', width: r.width + m * 2 + 'px', height: r.height + m * 2 + 'px' });
    const gw = globo.offsetWidth, gh = globo.offsetHeight;
    const abajo = r.bottom + m + 12 + gh < innerHeight;
    const top = abajo ? r.bottom + m + 12 : Math.max(12, r.top - m - 12 - gh);
    const left = Math.max(12, Math.min(innerWidth - gw - 12, r.left + r.width / 2 - gw / 2));
    Object.assign(globo.style, { top: top + 'px', left: left + 'px' });
  }
  function terminarTour(celebrar) {
    if (!TOUR) return;
    TOUR = null;
    $('#tour')?.remove();
    guardar.set('tour', 1);
    if (celebrar) { confeti(); aviso('¡Listo! Ya sabés usar PinkyPrecios 💗'); }
  }
  window.addEventListener('resize', posicionarTour);
  window.addEventListener('scroll', posicionarTour, { passive: true });

  // ---------- Render ----------
  let claveVista = '';
  function render() {
    const app = $('#app');
    const clave = S.vista + '|' + (S.vista === 'detalle' ? S.detalle?.llave : S.vista === 'resultados' ? S.busqueda?.q : '');
    if (S.vista === 'detalle' && S.detalle) {
      app.innerHTML = vistaDetalle();
      document.title = (S.detalle.grupo?.nombre ? S.detalle.grupo.nombre + ' · ' : '') + CFG.nombre;
      dibujarGrafico();
      calcularCuota();
    } else if (S.vista === 'canasta') {
      app.innerHTML = vistaCanasta();
      document.title = 'Canasta básica · ' + CFG.nombre;
    } else if (S.vista === 'admin') {
      app.innerHTML = vistaAdmin();
      document.title = 'Administración · ' + CFG.nombre;
    } else if (S.vista === 'proyecto') {
      app.innerHTML = vistaProyecto();
      document.title = 'Sobre el proyecto · ' + CFG.nombre;
    } else if (S.vista === 'ofertas') {
      app.innerHTML = vistaOfertas();
      document.title = 'Ofertas de la semana · ' + CFG.nombre;
    } else if (S.vista === 'contacto') {
      app.innerHTML = vistaContacto();
      document.title = 'Contacto · ' + CFG.nombre;
    } else if (S.vista === 'resultados' && S.busqueda) {
      app.innerHTML = vistaResultados();
      document.title = `${S.busqueda.q} · ${CFG.nombre}`;
    } else {
      app.innerHTML = vistaInicio();
      document.title = CFG.nombre;
    }
    if (clave !== claveVista) { claveVista = clave; app.classList.remove('entrar'); void app.offsetWidth; app.classList.add('entrar'); }
    renderBarra();
    renderCatnav();
    renderTray();
    renderPanel();
  }

  function renderCatnav() {
    const q = S.vista === 'resultados' ? norm(S.busqueda?.q) : '';
    $('#catnav').innerHTML = `<button type="button" class="destacado" data-action="ir" data-ver="ofertas" aria-current="${S.vista === 'ofertas'}">${I.chispa}Ofertas de la semana</button>`
      + `<button type="button" data-action="ir" data-ver="canasta" aria-current="${S.vista === 'canasta'}"><svg viewBox="0 0 24 24"><path d="M4 10h16l-1.6 9a1.5 1.5 0 0 1-1.5 1.2H7.1a1.5 1.5 0 0 1-1.5-1.2zM8 10l3-6M16 10l-3-6M9.5 14v3M14.5 14v3"/></svg>Canasta básica</button>`
      + CATEGORIAS.map((c) => `<button type="button" data-action="buscar" data-q="${esc(c.q)}" aria-current="${q === norm(c.q)}">${c.icono}${esc(c.nombre)}</button>`).join('')
      + `<button type="button" data-action="ir" data-ver="contacto" aria-current="${S.vista === 'contacto'}">${ICANAL.mail}Contacto</button>`;
    const pie = $('#pie-categorias');
    if (pie && !pie.childElementCount) pie.innerHTML = CATEGORIAS.slice(0, 7).map((c) => `<button type="button" data-action="buscar" data-q="${esc(c.q)}">${esc(c.nombre)}</button>`).join('');
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
    const av = $('#avatar'), lbl = $('#cuenta-lbl');
    if (av && lbl) {
      if (C.usuario) { av.className = 'avatar'; av.textContent = inicial(); lbl.textContent = nombreUsuario() || 'Mi cuenta'; }
      else { av.className = 'avatar sin-sesion'; av.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>'; lbl.textContent = 'Ingresar'; }
    }
  }

  function renderTray() {
    const t = $('#tray');
    document.body.classList.toggle('con-bandeja', S.comparar.length > 0 && S.panel !== 'comparar');
    if (!S.comparar.length || S.panel === 'comparar') { t.hidden = true; return; }
    t.innerHTML = `<p><b>${S.comparar.length}/3</b> · ${esc(S.comparar.map((g) => g.nombre).join(', '))}</p>
      <button type="button" class="btn primario" data-action="panel" data-p="comparar" ${S.comparar.length < 2 ? 'disabled' : ''}>${S.comparar.length < 2 ? 'Elegí 1 más' : 'Comparar'}</button>
      <button type="button" class="btn x" data-action="limpiar-cmp" aria-label="Quitar todos">${I.x}</button>`;
    t.hidden = false;
  }

  let ultimoFoco = null;
  let panelPintado = null;
  function renderPanel(forzar = false) {
    const pn = $('#panel'), ov = $('#overlay');
    document.body.classList.toggle('panel-abierto', Boolean(S.panel));
    if (!S.panel) { pn.hidden = true; ov.hidden = true; panelPintado = null; return; }
    const abierto = !pn.hidden;
    // Los paneles con formularios no se repintan solos (para no borrar lo que la persona está escribiendo)
    if (!forzar && abierto && panelPintado === S.panel && ['cuenta', 'asistente', 'resena', 'imagen'].includes(S.panel)) return;
    pn.classList.toggle('ancho', S.panel === 'comparar');
    pn.classList.toggle('chat-panel', S.panel === 'asistente');
    pn.innerHTML = { lista: panelLista, alertas: panelAlertas, comparar: panelComparar, tiendas: panelTiendas, cuenta: panelCuenta, asistente: panelAsistente, resena: panelResena, imagen: panelImagen }[S.panel]();
    panelPintado = S.panel;
    pn.hidden = false; ov.hidden = false;
    if (S.panel === 'imagen') dibujarTarjeta();
    if (S.panel === 'asistente') { pintarChat(); if (!abierto || forzar) $('#chat-in')?.focus(); }
    else if (!abierto) $('.cerrar', pn)?.focus();
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
    let agregado = false;
    if (i >= 0) { S.lista.splice(i, 1); aviso('Quitado de tu lista'); }
    else { const g = grupoPorId(id); if (!g) return false; S.lista.unshift(instantanea(g)); aviso('Agregado a tu lista ♡'); agregado = true; }
    guardar.set('lista', S.lista);
    return agregado;
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
      case 'lista': { const ag = alternarLista(b.dataset.g); render(); if (ag) latir(b.dataset.g); break; }
      case 'cant': {
        const x = S.lista.find((y) => y.id === b.dataset.g);
        if (!x) break;
        x.cantidad = Math.max(1, Math.min(99, cant(x) + Number(b.dataset.d)));
        guardar.set('lista', S.lista);
        renderPanel();
        const sel = window.CSS && CSS.escape ? CSS.escape(x.id) : x.id;
        document.querySelector(`#panel [data-action="cant"][data-g="${sel}"][data-d="${b.dataset.d}"]:not([disabled])`)?.focus();
        break;
      }
      case 'voz': buscarPorVoz(b); break;
      case 'fav': alternarFavorita(b.dataset.t); render(); break;
      case 'resenas': ultimoFoco = ultimoFoco || b; S.resenaTienda = b.dataset.t; S.resenaError = ''; S.resenaBorrador = null; S.panel = 'resena'; render(); break;
      case 'estrella': {
        const n = Number(b.dataset.n), f = b.closest('form');
        if (!f) break;
        f.estrellas.value = n;
        f.querySelectorAll('[data-action="estrella"]').forEach((x) => { const k = Number(x.dataset.n); x.classList.toggle('on', k <= n); x.setAttribute('aria-checked', String(k === n)); });
        break;
      }
      case 'borrar-resena': borrarResena(); break;
      case 'img-compartir': compartirImagen(); break;
      case 'img-descargar': blobTarjeta().then((bl) => (bl ? descargarBlob(bl) : aviso('No se pudo crear la imagen'))); break;
      case 'adm': accionAdm(b.dataset.a, b.dataset.id); break;
      case 'adm-recargar': cargarAdmin(); break;
      case 'tour': ev.preventDefault(); S.panel = null; render(); setTimeout(iniciarTour, 250); break;
      case 'tour-sig': pasoTour(TOUR ? TOUR.i + 1 : 0); break;
      case 'tour-atras': pasoTour(TOUR ? TOUR.i - 1 : 0); break;
      case 'tour-fin': terminarTour(false); break;
      case 'tour-listo': terminarTour(true); break;
      case 'quitar-lista': S.lista = S.lista.filter((x) => x.id !== b.dataset.g); guardar.set('lista', S.lista); render(); break;
      case 'refrescar-lista': refrescarLista(); break;
      case 'canasta': calcularCanasta(); break;
      case 'ir': ev.preventDefault(); S.panel = null; irA({ ver: b.dataset.ver }); break;
      case 'of-tab': S.ofertas.tab = b.dataset.t; render(); break;
      case 'of-rubro': S.ofertas.rubro = b.dataset.r; render(); break;
      case 'copiar-ofertas': copiar(location.origin + location.pathname + '?ver=ofertas', 'Enlace copiado'); break;
      case 'copiar': copiar(b.dataset.texto, 'Copiado'); break;
      case 'cuenta-modo': C.modo = b.dataset.m; C.error = ''; C.aviso = ''; renderPanel(true); break;
      case 'cerrar-sesion': C.cliente?.auth.signOut().then(() => aviso('Cerraste sesión. Tu lista sigue en este navegador.')); break;
      case 'chat-chip': { const c = b.dataset.c; if (ACCIONES_CHIP[c]) { agregarMensaje('user', c); ACCIONES_CHIP[c](); } else preguntar(c); break; }
      case 'instalar': instalarApp(); break;
      case 'comparar': alternarComparar(b.dataset.g); render(); break;
      case 'limpiar-cmp': S.comparar = []; render(); break;
      case 'compartir': compartir(); break;
      case 'borrar-vistos': S.vistos = []; guardar.set('vistos', []); render(); break;
      case 'panel': ultimoFoco = b; if (b.dataset.p === 'cuenta') { C.error = ''; C.aviso = ''; } S.panel = b.dataset.p; render(); break;
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
    if (t.id === 'f-fav') { S.f.soloFav = t.checked; render(); }
    if (t.id === 'precio-max') render();
    if (t.dataset.filtro === 'tienda') { S.f.tiendas = t.checked ? [...S.f.tiendas, t.value] : S.f.tiendas.filter((x) => x !== t.value); render(); }
    if (t.dataset.filtro === 'cat') { S.f.cat = t.value; render(); }
  });

  document.addEventListener('input', (ev) => { if (ev.target.closest && ev.target.closest('#form-calc')) calcularCuota(); });
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
    if (f.id === 'form-cuenta') { ev.preventDefault(); enviarCuenta(f); return; }
    if (f.id === 'form-nueva') { ev.preventDefault(); guardarNuevaClave(f); return; }
    if (f.id === 'form-chat') { ev.preventDefault(); const i = $('#chat-in'); const t = i.value; i.value = ''; preguntar(t); return; }
    if (f.id === 'form-contacto') { ev.preventDefault(); enviarContactoForm(f); return; }
    if (f.id === 'form-resena') { ev.preventDefault(); enviarResena(f); return; }
    if (f.id === 'form-calc') { ev.preventDefault(); calcularCuota(); return; }
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
    confeti(boton);
    f.reset();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (TOUR) terminarTour(false);
    else if (S.panel) cerrarPanel();
  });
  window.addEventListener('popstate', leerUrl);

  let anchoPrevio = window.innerWidth;
  window.addEventListener('resize', () => {
    if (S.vista !== 'detalle' || Math.abs(window.innerWidth - anchoPrevio) < 60) return;
    anchoPrevio = window.innerWidth;
    dibujarGrafico();
  });

  // ---------- Sugerencias mientras se escribe ----------
  const IRELOJ = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
  const ITEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>';
  const ILUPA = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  function opcionesSugerir(texto) {
    const t = norm(texto).trim();
    const coincide = (x) => !t || norm(x).includes(t);
    const rec = recientes().filter(coincide).slice(0, 4).map((x) => ({ q: x, tipo: 'reciente' }));
    const pop = (S.inicio?.populares || []).map((p) => p.termino).filter((x) => coincide(x) && !rec.some((r) => norm(r.q) === norm(x))).slice(0, 5).map((x) => ({ q: x, tipo: 'popular' }));
    const cats = CATEGORIAS.filter((c) => t && (norm(c.nombre).includes(t) || norm(c.q).includes(t))).slice(0, 3).map((c) => ({ q: c.q, tipo: 'categoria', nombre: c.nombre }));
    const lista = [...rec, ...pop, ...cats];
    if (t && !lista.some((x) => norm(x.q) === t)) lista.unshift({ q: texto.trim(), tipo: 'buscar' });
    return lista.slice(0, 9);
  }
  function pintarSugerir(input) {
    const caja = document.getElementById(input.getAttribute('aria-controls'));
    if (!caja) return;
    const ops = opcionesSugerir(input.value);
    if (!ops.length) { cerrarSugerir(input); return; }
    const titulo = { reciente: 'Tus búsquedas', popular: 'Lo más buscado', categoria: 'Categorías', buscar: '' };
    let ultimo = '';
    caja.innerHTML = ops.map((o, i) => {
      const t = o.tipo !== ultimo && titulo[o.tipo] ? `<span class="sg-t">${titulo[o.tipo]}</span>` : '';
      ultimo = o.tipo;
      const ico = o.tipo === 'reciente' ? IRELOJ : o.tipo === 'popular' ? ITEND : ILUPA;
      return `${t}<button type="button" role="option" id="${caja.id}-${i}" data-sugerido="${esc(o.q)}" aria-selected="false">${ico}<span>${o.tipo === 'buscar' ? `Buscar “${esc(o.q)}”` : esc(o.nombre || o.q)}</span>${o.tipo === 'categoria' ? '<small>categoría</small>' : ''}</button>`;
    }).join('');
    caja.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  function cerrarSugerir(input) {
    const caja = input && document.getElementById(input.getAttribute('aria-controls'));
    if (caja) { caja.hidden = true; caja.innerHTML = ''; }
    if (input) { input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
  }
  function moverSugerir(input, paso) {
    const caja = document.getElementById(input.getAttribute('aria-controls'));
    if (!caja || caja.hidden) return false;
    const ops = [...caja.querySelectorAll('[role=option]')];
    if (!ops.length) return false;
    let i = ops.findIndex((o) => o.getAttribute('aria-selected') === 'true');
    ops.forEach((o) => o.setAttribute('aria-selected', 'false'));
    i = (i + paso + ops.length) % ops.length;
    ops[i].setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', ops[i].id);
    return true;
  }
  const inputBusqueda = (el) => el && (el.id === 'q' || el.id === 'q-hero');
  document.addEventListener('input', (ev) => { if (inputBusqueda(ev.target)) pintarSugerir(ev.target); });
  document.addEventListener('focusin', (ev) => { if (inputBusqueda(ev.target)) pintarSugerir(ev.target); });
  document.addEventListener('keydown', (ev) => {
    const el = ev.target;
    if (!inputBusqueda(el)) return;
    if (ev.key === 'ArrowDown' && moverSugerir(el, 1)) ev.preventDefault();
    else if (ev.key === 'ArrowUp' && moverSugerir(el, -1)) ev.preventDefault();
    else if (ev.key === 'Escape') cerrarSugerir(el);
    else if (ev.key === 'Enter') {
      const sel = document.getElementById(el.getAttribute('aria-activedescendant') || '');
      if (sel && sel.dataset.sugerido) { ev.preventDefault(); el.value = sel.dataset.sugerido; cerrarSugerir(el); S.panel = null; irA({ q: sel.dataset.sugerido }); el.blur(); }
    }
  });
  document.addEventListener('mousedown', (ev) => {
    const op = ev.target.closest('[data-sugerido]');
    if (op) {
      ev.preventDefault();
      const input = op.closest('form').querySelector('input');
      input.value = op.dataset.sugerido; cerrarSugerir(input); S.panel = null; irA({ q: op.dataset.sugerido }); input.blur();
      return;
    }
    for (const id of ['q', 'q-hero']) { const i = document.getElementById(id); if (i && !ev.target.closest('form')?.contains(i)) cerrarSugerir(i); }
  });
  document.addEventListener('focusout', (ev) => { if (inputBusqueda(ev.target)) setTimeout(() => { if (document.activeElement !== ev.target) cerrarSugerir(ev.target); }, 150); });

  // ---------- Cuentas de usuario (Supabase Auth) ----------
  const C = { cliente: null, usuario: null, modo: 'ingresar', error: '', aviso: '', cargando: false, sincronizado: null, listo: false, campos: {} };
  const SINCRONIZA = ['lista', 'alertas', 'vistos', 'recientes', 'favoritas'];
  const cuentasActivas = () => Boolean(CFG.supabaseUrl && CFG.supabaseClavePublica);

  function cargarScript(src) {
    return new Promise((ok, mal) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = mal; document.head.appendChild(s); });
  }

  async function iniciarCuentas() {
    if (!cuentasActivas()) return;
    try {
      await cargarScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.js');
      C.cliente = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseClavePublica, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });
      C.cliente.auth.onAuthStateChange((evento, sesion) => {
        if (evento === 'PASSWORD_RECOVERY') { C.modo = 'nueva'; S.panel = 'cuenta'; renderPanel(true); }
        if (sesion?.user && (!C.usuario || C.usuario.id !== sesion.user.id)) setTimeout(() => alIngresar(sesion.user), 0);
        if (evento === 'SIGNED_OUT') { C.usuario = null; renderBarra(); if (S.panel === 'cuenta') renderPanel(true); if (S.vista === 'admin') { S.admin = { sinSesion: true }; render(); } }
      });
      const { data } = await C.cliente.auth.getSession();
      if (data.session?.user) await alIngresar(data.session.user);
    } catch (e) { console.warn('No se pudieron cargar las cuentas', e); }
    C.listo = true;
    renderBarra();
  }

  const unirPorId = (a, b, max) => { const m = new Map(); for (const x of [...(a || []), ...(b || [])]) if (x && x.id && !m.has(x.id)) m.set(x.id, x); return [...m.values()].slice(0, max); };
  const unirTextos = (a, b, max) => [...new Set([...(a || []), ...(b || [])])].slice(0, max);

  async function alIngresar(usuario) {
    C.usuario = usuario;
    renderBarra();
    try {
      const { data, error } = await C.cliente.from('datos_usuario').select('*').eq('user_id', usuario.id).maybeSingle();
      if (error) throw error;
      if (data) {
        S.lista = unirPorId(S.lista, data.lista, 200);
        S.alertas = unirPorId(S.alertas, data.alertas, 100);
        S.vistos = unirPorId(S.vistos, data.vistos, 12);
        guardarLocal('lista', S.lista); guardarLocal('alertas', S.alertas); guardarLocal('vistos', S.vistos);
        guardarLocal('recientes', unirTextos(recientes(), data.recientes, 8));
        if (Array.isArray(data.favoritas)) { S.favoritas = unirTextos(S.favoritas, data.favoritas, 40); guardarLocal('favoritas', S.favoritas); }
      }
      await subirDatos();
      if (data && (data.lista?.length || data.alertas?.length)) aviso(`¡Hola${nombreUsuario() ? ', ' + nombreUsuario() : ''}! Trajimos tu lista y tus alertas`);
    } catch (e) { console.warn('No se pudo sincronizar', e); C.error = 'No pudimos sincronizar tus datos. Revisá que corriste la actualización de la base de datos.'; }
    render();
    if (S.panel === 'cuenta') renderPanel(true);
    if (S.vista === 'admin' && !S.admin?.datos && !S.admin?.cargando) cargarAdmin();
  }

  let temporizadorSubida = null;
  function programarSubida() {
    if (!C.usuario || !C.cliente) return;
    clearTimeout(temporizadorSubida);
    temporizadorSubida = setTimeout(subirDatos, 1200);
  }
  async function subirDatos() {
    if (!C.usuario || !C.cliente) return;
    const fila = { user_id: C.usuario.id, lista: S.lista, alertas: S.alertas, vistos: S.vistos, recientes: recientes(), favoritas: S.favoritas, actualizado: new Date().toISOString() };
    let { error } = await C.cliente.from('datos_usuario').upsert(fila);
    // Si todavía no se corrió la actualización 3 (columna favoritas), se guarda lo demás igual
    if (error && /favoritas/.test(error.message || '')) { delete fila.favoritas; ({ error } = await C.cliente.from('datos_usuario').upsert(fila)); }
    if (!error) C.sincronizado = new Date().toISOString();
  }

  const nombreUsuario = () => (C.usuario?.user_metadata?.nombre || '').split(' ')[0];
  const inicial = () => (C.usuario?.user_metadata?.nombre || C.usuario?.email || '?').trim().charAt(0).toUpperCase();

  function panelCuenta() {
    if (!cuentasActivas()) return cabeceraPanel('Tu cuenta', '') + '<div class="panel-vacio"><b>Cuentas desactivadas</b><p>Configurá Supabase en config.js para activarlas.</p></div>';
    if (!C.listo) return cabeceraPanel('Tu cuenta', 'Cargando…') + '<div class="panel-vacio"><p>Un momento…</p></div>';
    if (C.modo === 'nueva') return cabeceraPanel('Nueva contraseña', 'Elegí una contraseña nueva para tu cuenta') + `
      <form class="form-cuenta" id="form-nueva" novalidate>
        <label class="campo" for="cu-nueva">Contraseña nueva<input id="cu-nueva" name="clave" type="password" autocomplete="new-password" minlength="8" required><span class="ayuda">Mínimo 8 caracteres.</span></label>
        ${C.error ? `<p class="error">${esc(C.error)}</p>` : ''}
        <button type="submit" class="btn primario" ${C.cargando ? 'disabled' : ''}>Guardar contraseña</button>
      </form>`;
    if (C.usuario) {
      const nombre = C.usuario.user_metadata?.nombre || C.usuario.email;
      return cabeceraPanel('Tu cuenta', C.usuario.email) + `
        <div class="perfil"><span class="avatar">${esc(inicial())}</span><b>${esc(nombre)}</b><span>${C.sincronizado ? `Sincronizado ${hace(C.sincronizado)}` : 'Sincronizando…'}</span></div>
        ${C.error ? `<p class="error">${esc(C.error)}</p>` : ''}
        <div class="cifras" style="margin:0;grid-template-columns:repeat(3,minmax(0,1fr))">
          <div class="cifra"><strong>${S.lista.length}</strong><span>en tu lista</span></div>
          <div class="cifra"><strong>${S.alertas.length}</strong><span>alertas</span></div>
          <div class="cifra"><strong>${S.vistos.length}</strong><span>vistos</span></div>
        </div>
        <p class="nota" style="margin:0">Tu lista, tus alertas y tus búsquedas se guardan en tu cuenta. Entrá con el mismo correo en el celular o la compu y vas a ver lo mismo.</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button type="button" class="btn" data-action="panel" data-p="lista">${I.corazon}Ver mi lista</button>
          <button type="button" class="btn" data-action="cerrar-sesion">Cerrar sesión</button>
          ${esAdminLocal() ? '<button type="button" class="btn primario" data-action="ir" data-ver="admin">Panel de administración</button>' : ''}
        </div>`;
    }
    const registro = C.modo === 'registro', olvido = C.modo === 'olvido';
    return cabeceraPanel(registro ? 'Creá tu cuenta' : olvido ? 'Recuperar contraseña' : 'Ingresá a tu cuenta', 'Gratis, solo necesitás un correo') + `
      ${olvido ? '' : `<div class="cuenta-tabs" role="tablist">
        <button type="button" role="tab" data-action="cuenta-modo" data-m="ingresar" aria-selected="${!registro}">Ingresar</button>
        <button type="button" role="tab" data-action="cuenta-modo" data-m="registro" aria-selected="${registro}">Crear cuenta</button>
      </div>`}
      <form class="form-cuenta" id="form-cuenta" novalidate>
        ${registro ? `<label class="campo" for="cu-nombre">Tu nombre<input id="cu-nombre" name="nombre" autocomplete="name" maxlength="60" value="${esc(C.campos.nombre || '')}"></label>` : ''}
        <label class="campo" for="cu-correo">Correo<input id="cu-correo" name="correo" type="email" autocomplete="email" required value="${esc(C.campos.correo || '')}"></label>
        ${olvido ? '' : `<label class="campo" for="cu-clave">Contraseña<input id="cu-clave" name="clave" type="password" autocomplete="${registro ? 'new-password' : 'current-password'}" minlength="8" required>${registro ? '<span class="ayuda">Mínimo 8 caracteres.</span>' : ''}</label>`}
        ${C.error ? `<p class="error">${esc(C.error)}</p>` : ''}
        ${C.aviso ? `<p class="ok-msg">${esc(C.aviso)}</p>` : ''}
        <button type="submit" class="btn primario" ${C.cargando ? 'disabled' : ''}>${C.cargando ? 'Un momento…' : registro ? 'Crear mi cuenta' : olvido ? 'Mandarme el enlace' : 'Ingresar'}</button>
        ${registro ? '' : olvido ? '<button type="button" class="limpiar" data-action="cuenta-modo" data-m="ingresar">Volver a ingresar</button>' : '<button type="button" class="limpiar" data-action="cuenta-modo" data-m="olvido">¿Olvidaste tu contraseña?</button>'}
      </form>
      ${olvido ? '' : `<ul class="beneficios">
        <li>Tu lista y tus alertas en el celular y la compu</li>
        <li>Tus búsquedas recientes donde sea</li>
        <li>Sin publicidad ni correos que no pediste</li>
      </ul>`}`;
  }

  const MENSAJES_AUTH = {
    'Invalid login credentials': 'El correo o la contraseña no coinciden.',
    'Email not confirmed': 'Todavía no confirmaste tu correo. Revisá tu bandeja (y el spam).',
    'User already registered': 'Ya existe una cuenta con ese correo. Probá ingresar.',
    'Password should be at least 6 characters': 'La contraseña es muy corta.'
  };
  const traducir = (e) => MENSAJES_AUTH[e?.message] || (/rate limit/i.test(e?.message || '') ? 'Hiciste muchos intentos seguidos. Esperá unos minutos.' : 'No se pudo completar. Intentá de nuevo en un momento.');

  async function enviarCuenta(f) {
    const correo = f.correo.value.trim(), clave = f.clave?.value || '', nombre = f.nombre?.value.trim() || '';
    C.error = ''; C.aviso = ''; C.campos = { correo, nombre }; // se conservan si hay que volver a mostrar el formulario
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { C.error = 'Revisá el correo: falta la @ o el dominio.'; return renderPanel(true); }
    if (C.modo !== 'olvido' && clave.length < 8) { C.error = 'La contraseña debe tener al menos 8 caracteres.'; return renderPanel(true); }
    C.cargando = true; renderPanel(true);
    const volver = location.origin + location.pathname;
    let r;
    if (C.modo === 'registro') r = await C.cliente.auth.signUp({ email: correo, password: clave, options: { data: { nombre }, emailRedirectTo: volver } });
    else if (C.modo === 'olvido') r = await C.cliente.auth.resetPasswordForEmail(correo, { redirectTo: volver });
    else r = await C.cliente.auth.signInWithPassword({ email: correo, password: clave });
    C.cargando = false;
    if (r.error) C.error = traducir(r.error);
    else if (C.modo === 'registro' && !r.data.session) C.aviso = `¡Listo! Te mandamos un correo a ${correo} para confirmar tu cuenta.`;
    else if (C.modo === 'olvido') C.aviso = 'Si existe una cuenta con ese correo, te llegó un enlace para crear una contraseña nueva.';
    else { aviso('¡Bienvenida de vuelta! 💗'); C.campos = {}; confeti($('#btn-cuenta')); }
    renderPanel(true);
  }

  async function guardarNuevaClave(f) {
    const clave = f.clave.value;
    if (clave.length < 8) { C.error = 'La contraseña debe tener al menos 8 caracteres.'; return renderPanel(true); }
    C.cargando = true; renderPanel(true);
    const { error } = await C.cliente.auth.updateUser({ password: clave });
    C.cargando = false;
    if (error) C.error = traducir(error); else { C.modo = 'ingresar'; C.error = ''; aviso('Contraseña actualizada'); }
    renderPanel(true);
  }

  // ---------- Asistente de ayuda ----------
  // Responde solo: preguntas frecuentes y acciones (buscar, abrir paneles). Si en Netlify hay ANTHROPIC_API_KEY,
  // las preguntas que no reconoce se las pasa a la IA (Claude) mediante /api/asistente.
  const CH = { mensajes: [], escribiendo: false, ia: null };
  const R = (texto, chips = [], accion = null) => ({ texto, chips, accion });
  const INTENCIONES = [
    { claves: ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'pura vida', 'hey'], r: () => R(`¡Hola${nombreUsuario() ? ', ' + nombreUsuario() : ''}! Soy Pinky 💗 Te ayudo a usar la página. ¿Qué necesitás?`, ['¿Cómo busco?', 'Ofertas de la semana', '¿Qué es un descuento inflado?']) },
    { claves: ['como busco', 'como buscar', 'buscar producto', 'como funciona', 'como se usa', 'usar la pagina'], r: () => R('Escribí el producto en el buscador de arriba (por ejemplo “pantalla 55”) y apretá Enter. Buscamos en todas las tiendas a la vez y juntamos el mismo producto. Después podés filtrar por tienda, precio o categoría en la barra de la izquierda.', ['Buscá freidora de aire', 'Ver categorías']) },
    { claves: ['lista', 'guardar', 'corazon', 'favorito'], r: () => R('Tocá “Guardar” (el corazón) en cualquier producto. En “Mi lista” ves el total y, con “Comparar mi lista por tienda”, en qué tienda sale más barato comprar todo junto.', ['Abrir mi lista']) },
    { claves: ['alerta', 'avisame', 'avisar', 'notificar', 'baje', 'baja de precio'], r: () => R('Entrá a un producto y usá “Avisame si baja”: ponés tu precio objetivo y, si querés, tu correo. Revisamos los precios cada 6 horas y te avisamos cuando alguna tienda llegue.', ['Ver mis alertas']) },
    { claves: ['comparar', 'lado a lado', 'comparacion'], r: () => R('Tocá “Comparar” en hasta 3 productos y abajo aparece una barra para verlos lado a lado: precio, tiendas, marca y cuotas.') },
    { claves: ['historial', 'grafico', 'buen momento', 'cuando comprar', 'esperar'], r: () => R('Cada precio se guarda un día a la vez. Con 7 días de datos te decimos si es buen momento para comprar o mejor esperar, y el gráfico te muestra cómo cambió en cada tienda.') },
    { claves: ['inflado', 'falso', 'descuento falso', 'engano', 'trampa'], r: () => R('Un descuento inflado es cuando la tienda muestra un precio “antes” más alto, pero según nuestro historial hace más de 25 días ya costaba lo mismo o menos. Lo marcamos en rojo para que no te engañen.') },
    { claves: ['cuota', 'credito', 'tasa cero', 'meses', 'financiar', 'pagos'], r: () => R('En cada producto, la pestaña “Cuotas” muestra las cuotas que publica cada tienda (por ejemplo 12 meses sin intereses con ciertas tarjetas) y cuánto terminás pagando. Abajo hay una calculadora para probar con la tasa de tu tarjeta.') },
    { claves: ['dolar', 'dolares', 'tipo de cambio', 'moneda', 'colones'], r: () => R(`Con el botón ₡ / US$ de arriba cambiás todos los precios a dólares. Usamos el tipo de cambio del Ministerio de Hacienda${S.tc.venta ? ` (hoy ₡${String(S.tc.venta).replace('.', ',')})` : ''}.`) },
    { claves: ['tienda', 'tiendas', 'cuales tiendas', 'que tiendas', 'walmart', 'monge', 'gollo'], r: () => R(`Hoy comparamos ${tiendasActivas().length || 'varias'} tiendas: ${tiendasActivas().map((t) => t.nombre).join(', ') || 'cargando…'}. En “Tiendas” ves cuál es más barata más veces.`, ['Ver tiendas']) },
    { claves: ['cuenta', 'registrar', 'registro', 'crear cuenta', 'iniciar sesion', 'sesion', 'ingresar', 'login', 'contrasena', 'clave', 'perfil', 'usuario'], r: () => R(C.usuario ? `Ya estás en tu cuenta (${C.usuario.email}). Tu lista y alertas se guardan solas.` : 'Tocá “Ingresar” arriba para crear tu cuenta gratis. Así tu lista, alertas y búsquedas se guardan en la nube y las ves en el celular y la compu. Si olvidaste la contraseña, ahí mismo podés recuperarla.', C.usuario ? [] : ['Abrir mi cuenta']) },
    { claves: ['olvide', 'olvido', 'recuperar', 'contrasena', 'clave', 'restablecer'], r: () => R('Tocá “Ingresar” arriba y después “¿Olvidaste tu contraseña?”. Escribís tu correo y te llega un enlace para crear una contraseña nueva (revisá también el spam).', ['Abrir mi cuenta']) },
    { claves: ['oferta', 'ofertas', 'semana', 'rebaja', 'rebajas', 'descuentos'], r: () => R('En “Ofertas de la semana” están los productos que de verdad bajaron de precio en los últimos 7 días y las rebajas sin descuentos inflados.', ['Ofertas de la semana']) },
    { claves: ['contacto', 'contactar', 'whatsapp', 'correo', 'email', 'escribir', 'reportar', 'error', 'sugerencia'], r: () => R(`Podés escribirnos por WhatsApp al ${CFG.whatsappVisible} o al correo ${CFG.correo}. También está el formulario en la página de Contacto.`, ['Ir a contacto']) },
    { claves: ['instalar', 'app', 'aplicacion', 'pantalla de inicio', 'descargar'], r: () => R('En el celular abrí el menú del navegador y tocá “Agregar a pantalla de inicio”. Queda como una app con el logo de PinkyPrecios.') },
    { claves: ['oscuro', 'claro', 'tema', 'noche'], r: () => R('El botón con el círculo mitad lleno, arriba, cambia entre tema automático, claro y oscuro.') },
    { claves: ['kilo', 'litro', 'por unidad', 'super', 'supermercado'], r: () => R('En productos de supermercado te mostramos el precio por kilo o por litro, para comparar presentaciones distintas. En los resultados podés ordenar por ese precio.', ['Buscá café']) },
    { claves: ['real', 'reales', 'de donde', 'confiable', 'fuente', 'verdad'], r: () => R('Los precios salen en vivo de los sitios públicos de cada tienda y los revisamos cada 6 horas. Ninguna tienda paga por aparecer. Igual, confirmá siempre en la tienda antes de comprar.') },
    { claves: ['canasta', 'canasta basica', 'basicos', 'indice', 'arroz', 'frijoles', 'inflacion'], r: () => R('En “Canasta básica” medimos todos los días 10 productos básicos (arroz, frijoles, aceite, café…) en los supermercados y te mostramos cuánto cuesta todo, si subió o bajó y qué súper sale más barato.', ['Ver canasta básica']) },
    { claves: ['voz', 'microfono', 'hablar', 'dictar', 'hablando'], r: () => R(Reconocer ? 'Tocá el micrófono que está dentro del buscador y decí el producto (por ejemplo “freidora de aire”). La primera vez el navegador te pide permiso para usar el micrófono.' : 'La búsqueda por voz funciona en Chrome, Edge y la mayoría de celulares Android. En este navegador no está disponible, pero podés escribir el producto.') },
    { claves: ['calculadora', 'calcular', 'interes', 'intereses', 'tasa'], r: () => R('Abrí un producto y tocá la pestaña “Cuotas”. Abajo está la calculadora: ponés el monto, la tasa anual de tu tarjeta y el plazo, y te dice la cuota mensual, el total y cuánto pagás de intereses.') },
    { claves: ['favorita', 'favoritas', 'tienda favorita', 'tiendas favoritas', 'estrella'], r: () => R('En “Tiendas” tocá la ★ de tus tiendas preferidas. Aparecen primero y, al buscar, podés activar “Solo mis tiendas favoritas”. Si tenés cuenta, se guardan en la nube.', ['Ver tiendas']) },
    { claves: ['resena', 'resenas', 'opinion', 'opiniones', 'calificar', 'calificacion', 'comentario'], r: () => R('En “Tiendas” cada tienda tiene sus opiniones con estrellas. Para dejar la tuya necesitás una cuenta (así evitamos reseñas falsas). Podés cambiarla o borrarla cuando querás.', ['Ver tiendas']) },
    { claves: ['imagen', 'instagram', 'foto', 'tarjeta para compartir', 'compartir'], r: () => R('Abrí un producto y tocá “Tarjeta para compartir”: armamos una imagen con el mejor precio para mandarla por WhatsApp o subirla a tus estados. También podés copiar el enlace.') },
    { claves: ['tour', 'recorrido', 'tutorial', 'guia', 'primera vez', 'nueva aqui'], r: () => R('¡Claro! Te muestro las partes principales de la página en unos pasos.', ['Ver el tour']) },
    { claves: ['proyecto', 'sobre el proyecto', 'tecnologia', 'tecnologias', 'como esta hecho', 'supabase', 'netlify'], r: () => R('PinkyPrecios usa Netlify (página y funciones), Supabase (base de datos y cuentas) y los catálogos públicos de las tiendas. En “Sobre el proyecto” está todo explicado con un diagrama.', ['Sobre el proyecto']) },
    { claves: ['gracias', 'genial', 'tuanis', 'excelente', 'perfecto'], r: () => R('¡Con mucho gusto! 💗 Si necesitás algo más, aquí estoy.') },
    { claves: ['quien', 'creadora', 'autor', 'hizo', 'valeria'], r: () => R(`PinkyPrecios lo creó ${CFG.autora} como proyecto final de programación en Costa Rica.`) }
  ];
  const ACCIONES_CHIP = {
    'Abrir mi lista': () => { S.panel = 'lista'; render(); },
    'Ver mis alertas': () => { S.panel = 'alertas'; render(); },
    'Ver tiendas': () => { S.panel = 'tiendas'; render(); },
    'Abrir mi cuenta': () => { S.panel = 'cuenta'; renderPanel(true); },
    'Ofertas de la semana': () => { S.panel = null; irA({ ver: 'ofertas' }); },
    'Ir a contacto': () => { S.panel = null; irA({ ver: 'contacto' }); },
    'Ver canasta básica': () => { S.panel = null; irA({ ver: 'canasta' }); },
    'Ver el tour': () => { S.panel = null; render(); setTimeout(iniciarTour, 300); },
    'Sobre el proyecto': () => { S.panel = null; irA({ ver: 'proyecto' }); },
    'Ver categorías': () => { S.panel = null; irA({}); setTimeout(() => document.getElementById('t-cats')?.scrollIntoView({ behavior: 'smooth' }), 100); }
  };

  function entender(texto) {
    const t = ' ' + norm(texto).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ') + ' ';
    const busca = t.match(/\b(?:busca|buscame|buscar|busque|precio de|precio del|precio de la|cuanto cuesta|cuanto vale|cuanto sale|donde esta mas barat[oa]|donde venden|quiero comprar|comparame|compara)\s+(?:un |una |el |la |los |las )?(.{2,60})$/);
    if (busca) { const q = busca[1].trim(); return R(`Te busco “${q}” en todas las tiendas… 🔎`, [], () => { S.panel = null; irA({ q }); }); }
    // Coincidencia por raíz: "registro", "registrarme" y "registrarse" cuentan igual
    const palabras = t.trim().split(' ').filter((w) => w.length > 2);
    const raiz = (w) => w.slice(0, Math.max(5, Math.min(6, w.length - 2)));
    const pega = (clave) => clave.includes(' ')
      ? t.includes(' ' + clave + ' ')
      : palabras.some((w) => w === clave || (clave.length >= 5 && w.length >= 5 && (w.startsWith(raiz(clave)) || clave.startsWith(raiz(w)))));
    let mejorI = null, puntos = 0;
    for (const it of INTENCIONES) {
      let p = 0;
      for (const c of it.claves) if (pega(c)) p += c.includes(' ') ? 2 : 1;
      if (p > puntos) { puntos = p; mejorI = it; }
    }
    return mejorI ? mejorI.r() : null;
  }

  function agregarMensaje(rol, texto, chips = []) {
    CH.mensajes.push({ role: rol, content: texto, chips });
    pintarChat();
  }

  async function preguntar(texto) {
    texto = texto.trim();
    if (!texto) return;
    agregarMensaje('user', texto);
    const r = entender(texto);
    if (r) {
      CH.escribiendo = true; pintarChat();
      await new Promise((ok) => setTimeout(ok, 350));
      CH.escribiendo = false;
      agregarMensaje('assistant', r.texto, r.chips);
      if (r.accion) setTimeout(r.accion, 700);
      return;
    }
    if (CH.ia === null) { try { CH.ia = (await api('/asistente')).disponible; } catch (e) { CH.ia = false; } }
    if (CH.ia) {
      CH.escribiendo = true; pintarChat();
      try {
        const d = await api('/asistente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensajes: CH.mensajes.map((m) => ({ role: m.role, content: m.content })) }) });
        CH.escribiendo = false;
        agregarMensaje('assistant', d.respuesta || 'No tengo una respuesta para eso.');
        return;
      } catch (e) { CH.escribiendo = false; }
    }
    agregarMensaje('assistant', `No estoy segura de entenderte 🙈 Puedo ayudarte con cómo buscar, tu lista, alertas, cuotas, ofertas, la canasta básica o tu cuenta. Si querés que busque algo, escribí por ejemplo “buscá freidora de aire”.`, ['¿Cómo busco?', 'Ofertas de la semana', 'Ir a contacto']);
  }

  function panelAsistente() {
    if (!CH.mensajes.length) CH.mensajes.push({ role: 'assistant', content: `¡Hola${nombreUsuario() ? ', ' + nombreUsuario() : ''}! Soy Pinky, la asistente de PinkyPrecios 💗\n¿En qué te ayudo?`, chips: ['¿Cómo busco?', 'Ofertas de la semana', '¿Qué es un descuento inflado?', 'Crear cuenta'] });
    return cabeceraPanel('Asistente Pinky', 'Respuestas al instante sobre cómo usar la página') + `
      <div class="chat">
        <div class="chat-msgs" id="chat-msgs" aria-live="polite"></div>
        <form class="chat-form" id="form-chat" autocomplete="off">
          <label class="sr-only" for="chat-in">Escribí tu pregunta</label>
          <input id="chat-in" placeholder="Escribí tu pregunta o “buscá…”" maxlength="300">
          <button type="submit" class="btn primario" style="padding:8px 16px">Enviar</button>
        </form>
        <p class="chat-pie">Pinky responde preguntas sobre la página. Para precios, buscá el producto.</p>
      </div>`;
  }

  function pintarChat() {
    const caja = $('#chat-msgs');
    if (!caja) return;
    caja.innerHTML = CH.mensajes.map((m) => `<div class="burbuja ${m.role === 'user' ? 'yo' : 'bot'}">${esc(m.content)}${m.chips?.length ? `<div class="chips-chat">${m.chips.map((c) => `<button type="button" data-action="chat-chip" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}</div>`).join('')
      + (CH.escribiendo ? '<div class="burbuja bot"><span class="escribiendo" aria-label="Escribiendo"><i></i><i></i><i></i></span></div>' : '');
    caja.scrollTop = caja.scrollHeight;
  }

  async function copiar(texto, msg) {
    try { await navigator.clipboard.writeText(texto); aviso(msg); } catch (e) { aviso(texto); }
  }

  async function enviarContactoForm(f) {
    const err = $('#c-error'), ok = $('#c-ok'), boton = f.querySelector('button[type=submit]');
    err.hidden = true; ok.hidden = true;
    const datos = { nombre: f.nombre.value, correo: f.correo.value, asunto: f.asunto.value, mensaje: f.mensaje.value, sitio: f.sitio.value };
    if (datos.mensaje.trim().length < 5) { err.textContent = 'Escribí tu mensaje (al menos 5 letras).'; err.hidden = false; f.mensaje.focus(); return; }
    if (datos.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo.trim())) { err.textContent = 'Revisá el correo: falta la @ o el dominio.'; err.hidden = false; f.correo.focus(); return; }
    boton.disabled = true; boton.textContent = 'Enviando…';
    try { await api('/contacto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) }); ok.hidden = false; f.reset(); }
    catch (e) { err.textContent = `${e.message} También podés escribirnos a ${CFG.correo} o por WhatsApp al ${CFG.whatsappVisible}.`; err.hidden = false; }
    boton.disabled = false; boton.textContent = 'Enviar mensaje';
  }

  // ---------- App instalable ----------
  let pedidoInstalar = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedidoInstalar = e; const b = $('#btn-instalar'); if (b) b.hidden = false; });
  async function instalarApp() {
    if (!pedidoInstalar) { aviso('En el celular: menú del navegador → “Agregar a pantalla de inicio”'); return; }
    pedidoInstalar.prompt();
    await pedidoInstalar.userChoice.catch(() => {});
    pedidoInstalar = null; $('#btn-instalar').hidden = true;
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

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
  if (Reconocer) $('#form-top .search-btn')?.insertAdjacentHTML('beforebegin', micBtn('q'));
  $('#anio').textContent = new Date().getFullYear();
  iniciarCuentas();
  leerUrl();
  api('/inicio').then((r) => {
    S.inicio = r;
    if (r.tipoCambio?.venta) S.tc.venta = r.tipoCambio.venta;
    $('#pie-fuente').textContent = `Tipo de cambio de referencia: ₡${r.tipoCambio?.venta ?? '—'} por dólar (${r.tipoCambio?.fuente || ''}).`;
    $('#anuncio-tc').textContent = r.tipoCambio?.venta ? `Dólar hoy: ₡${String(r.tipoCambio.venta).replace('.', ',')} (Hacienda)` : 'Tipo de cambio no disponible';
    revisarAlertas();
  }).catch((e) => { S.errorInicio = e; }).finally(() => {
    if (['inicio', 'proyecto', 'canasta', 'admin', 'ofertas'].includes(S.vista) || S.panel === 'tiendas') render();
    // Tour de bienvenida: solo la primera visita
    setTimeout(() => {
      const escribiendo = document.activeElement && document.activeElement.matches('input, textarea');
      if (!guardar.get('tour', 0) && !TOUR && S.vista === 'inicio' && !S.panel && !escribiendo) iniciarTour();
    }, 1400);
  });
  cargarResenas().then(() => {
    if (['tiendas', 'resena'].includes(S.panel)) renderPanel(true);
    else if (S.vista === 'detalle' && Object.keys(S.resenas || {}).length) render();
  });
  api('/canasta').then((d) => {
    if (!S.canastaB?.datos) S.canastaB = { datos: d };
    const el = $('#canasta-home');
    if (el) el.outerHTML = seccionCanastaHome();
  }).catch(() => {});
})();
