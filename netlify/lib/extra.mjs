// Ofertas de la semana, formulario de contacto y asistente con IA (opcional).
import { hayDB, rest, lista, filaAOfertaDB } from './db.mjs';
import { analizar } from './servicios.mjs';
import { normalizar } from './texto.mjs';
import { TIENDAS } from './tiendas.mjs';

const fecha = (d) => new Date(Date.now() - d * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const haceDias = (d) => new Date(Date.now() - d * 864e5).toISOString();

// ---------------- Ofertas de la semana ----------------
// 1) "Bajaron esta semana": productos que hoy cuestan al menos 5% menos que hace 7 días (según NUESTRO historial).
// 2) "Rebajas anunciadas": la tienda muestra precio anterior y el historial no indica que sea inflado.
let cacheOfertas = null;
export async function ofertasSemana() {
  if (!hayDB()) return { baseDeDatos: false, bajaron: [], rebajas: [] };
  if (cacheOfertas && cacheOfertas.vence > Date.now()) return cacheOfertas.datos;

  const viejos = await rest(`historial_precios?select=oferta_id,precio&fecha=gte.${fecha(9)}&fecha=lte.${fecha(6)}&limit=20000`);
  const antes = new Map();
  for (const h of viejos) antes.set(h.oferta_id, Math.max(antes.get(h.oferta_id) || 0, h.precio));
  const ids = [...antes.keys()];
  const actuales = [];
  for (let i = 0; i < ids.length; i += 150) {
    const parte = await rest(`ofertas?select=*&disponible=is.true&actualizado=gte.${haceDias(2)}&id=in.${lista(ids.slice(i, i + 150))}`);
    actuales.push(...parte.map(filaAOfertaDB));
  }
  const vistos = new Set();
  const bajaron = actuales
    .map((o) => ({ ...o, precioSemanaPasada: antes.get(o.id), baja: 1 - o.precio / antes.get(o.id) }))
    .filter((o) => o.baja >= 0.05 && o.baja < 0.8)
    .sort((a, b) => b.baja - a.baja)
    .filter((o) => { const k = normalizar(o.nombre); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .slice(0, 40);

  const filas = (await rest(`ofertas?select=*&disponible=is.true&descuento=gte.0.05&actualizado=gte.${haceDias(7)}&order=descuento.desc&limit=120`)).map(filaAOfertaDB);
  let rebajas = filas.filter((o) => { const k = normalizar(o.nombre); if (vistos.has(k)) return false; vistos.add(k); return true; });
  if (rebajas.length) {
    const hist = [];
    for (let i = 0; i < rebajas.length; i += 150) {
      hist.push(...await rest(`historial_precios?select=oferta_id,fecha,precio&oferta_id=in.${lista(rebajas.slice(i, i + 150).map((o) => o.id))}&fecha=gte.${fecha(90)}&limit=10000`));
    }
    const { inflados } = analizar(rebajas, hist);
    rebajas = rebajas.filter((o) => inflados[o.id] !== true).map((o) => ({ ...o, confirmada: inflados[o.id] === false })).slice(0, 60);
  }
  const rubro = (o) => TIENDAS.find((t) => t.id === o.tienda)?.rubro || '';
  const datos = {
    baseDeDatos: true, generado: new Date().toISOString(),
    bajaron: bajaron.map((o) => ({ ...o, rubro: rubro(o) })),
    rebajas: rebajas.map((o) => ({ ...o, rubro: rubro(o) }))
  };
  cacheOfertas = { datos, vence: Date.now() + 30 * 60e3 };
  return datos;
}

// ---------------- Contacto ----------------
export const CORREO_CONTACTO = () => process.env.CONTACTO_CORREO || 'naranjov740@gmail.com';

export async function enviarContacto(c) {
  const limpio = (x, n) => String(x || '').replace(/[<>]/g, '').trim().slice(0, n);
  if (c.sitio) return { ok: true }; // campo trampa: lo llenan solo los robots de spam
  const datos = { nombre: limpio(c.nombre, 80), correo: limpio(c.correo, 120), asunto: limpio(c.asunto, 120), mensaje: limpio(c.mensaje, 2000) };
  if (datos.mensaje.length < 5) return { error: 'Escribí tu mensaje (al menos 5 letras).' };
  if (datos.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo)) return { error: 'Revisá el correo: falta la @ o el dominio.' };
  if (!hayDB() && !process.env.RESEND_API_KEY) return { error: 'El formulario todavía no está configurado. Escribinos por correo o WhatsApp.' };
  if (hayDB()) await rest('mensajes', { metodo: 'POST', cuerpo: datos, prefer: 'return=minimal' });
  if (process.env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.CORREO_REMITENTE || 'PinkyPrecios <onboarding@resend.dev>',
        to: [CORREO_CONTACTO()],
        reply_to: datos.correo || undefined,
        subject: `Contacto PinkyPrecios: ${datos.asunto || 'mensaje nuevo'}`,
        text: `De: ${datos.nombre || 'Sin nombre'} <${datos.correo || 'sin correo'}>\n\n${datos.mensaje}`
      })
    }).catch(() => {});
  }
  return { ok: true };
}

// ---------------- Asistente con IA (solo si hay ANTHROPIC_API_KEY) ----------------
const GUIA = `Sos "Pinky", la asistente de PinkyPrecios, un comparador de precios reales de tiendas de Costa Rica.
Respondé en español de Costa Rica (voseo), de forma breve (máximo 4 oraciones), amable y clara.
Solo ayudás con: cómo usar la página, cómo comparar precios y consejos generales para comprar mejor. Si te preguntan otra cosa, decí con amabilidad que solo ayudás con PinkyPrecios.
Nunca inventes precios ni digas qué tienda es más barata: para eso la persona debe buscar el producto en la página.
Funciones de la página:
- Buscador arriba (y en la portada): busca en vivo en todas las tiendas conectadas y junta el mismo producto por código de barras o modelo.
- Categorías en el menú de arriba.
- Ficha de cada producto: precio por tienda, botón "Ver en la tienda", barras de cuánto cobra cada tienda, pestaña "Cuotas" con cuotas que publica cada tienda, historial de precios (se llena un punto por día), aviso de "buen momento para comprar" (necesita 7 días de datos) y detector de "descuento inflado" (compara con el precio de hace más de 25 días).
- "Avisame si baja": alerta con precio objetivo y correo opcional; se revisa cada 6 horas.
- "Mi lista" (corazón): guarda productos y calcula dónde sale más barata la lista completa.
- "Comparar": hasta 3 productos lado a lado.
- "Ofertas de la semana": productos que bajaron de precio en los últimos 7 días según el historial, y rebajas anunciadas sin descuentos inflados.
- "Tiendas": ranking de qué tienda es más barata más veces y estado de cada tienda.
- Botón ₡/US$ para ver precios en dólares (tipo de cambio de Hacienda). Botón de tema claro/oscuro.
- Cuenta de usuario (botón "Ingresar"): guarda la lista, alertas y búsquedas en la nube para usarlas en el celular y la compu.
- Se puede instalar como app: menú del navegador → "Agregar a pantalla de inicio".
- Contacto: página de Contacto, correo ${'naranjov740@gmail.com'} o WhatsApp +506 8937 6664.
- Los precios salen de los sitios públicos de cada tienda; pueden cambiar, siempre confirmar en la tienda.`;

export const asistenteDisponible = () => Boolean(process.env.ANTHROPIC_API_KEY);

export async function preguntarAsistente(mensajes) {
  if (!asistenteDisponible()) return { disponible: false };
  const historial = (Array.isArray(mensajes) ? mensajes : [])
    .filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 800) }));
  while (historial.length && historial[0].role !== 'user') historial.shift();
  if (!historial.length) return { error: 'Escribí una pregunta' };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 400, system: GUIA, messages: historial })
  });
  if (!r.ok) return { error: 'El asistente no está disponible en este momento' };
  const d = await r.json();
  const texto = (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return { disponible: true, respuesta: texto || 'No tengo una respuesta para eso. Probá preguntarlo de otra forma.' };
}
