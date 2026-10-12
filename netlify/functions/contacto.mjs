import { enviarContacto } from '../lib/extra.mjs';
import { json, manejar } from '../lib/respuesta.mjs';

export default async (req) => manejar(async () => {
  if (req.method !== 'POST') return json({ error: 'Usá el formulario de contacto' }, 405);
  const r = await enviarContacto(await req.json().catch(() => ({})));
  return json(r, r.error ? 400 : 200);
});

export const config = { path: '/api/contacto' };
