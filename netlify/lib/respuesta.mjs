// Ayudas para responder JSON desde las funciones de Netlify
export const json = (datos, estado = 200, cache = 'no-store') =>
  new Response(JSON.stringify(datos), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache }
  });

export const parametros = (req) => new URL(req.url).searchParams;

export async function manejar(fn) {
  try { return await fn(); }
  catch (e) { console.error(e); return json({ error: 'Algo falló en el servidor: ' + String(e.message || e).slice(0, 200) }, 500); }
}

export const autorizado = (req) => {
  const token = process.env.ADMIN_TOKEN;
  return Boolean(token) && parametros(req).get('token') === token;
};
