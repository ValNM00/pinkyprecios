import { buscar } from '../lib/servicios.mjs';
import { json, parametros, manejar } from '../lib/respuesta.mjs';

export default async (req, context) => manejar(async () => {
  const r = await buscar(parametros(req).get('q'), (p) => (context?.waitUntil ? context.waitUntil(p) : p));
  return json(r, r.error ? 400 : 200, r.error ? 'no-store' : 'public, max-age=120');
});

export const config = { path: '/api/buscar' };
