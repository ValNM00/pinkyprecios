// Asistente con IA (opcional). Funciona solo si configurás ANTHROPIC_API_KEY en Netlify.
// Sin la clave, la página usa su asistente automático de respuestas frecuentes.
import { preguntarAsistente, asistenteDisponible } from '../lib/extra.mjs';
import { json, manejar } from '../lib/respuesta.mjs';

export default async (req) => manejar(async () => {
  if (req.method === 'GET') return json({ disponible: asistenteDisponible() }, 200, 'public, max-age=300');
  const cuerpo = await req.json().catch(() => ({}));
  const r = await preguntarAsistente(cuerpo.mensajes);
  return json(r, r.error ? 502 : 200);
});

export const config = { path: '/api/asistente' };
