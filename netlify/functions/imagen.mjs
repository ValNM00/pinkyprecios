// Trae la foto de un producto (solo de tiendas conocidas) para dibujar la tarjeta de compartir
import { traerImagen } from '../lib/extra.mjs';
import { parametros } from '../lib/respuesta.mjs';

export default async (req) => {
  const r = await traerImagen(parametros(req).get('u') || '');
  if (r.error) return new Response(r.error, { status: 400 });
  return new Response(r.buf, { headers: { 'Content-Type': r.tipo, 'Cache-Control': 'public, max-age=86400' } });
};

export const config = { path: '/api/imagen' };
