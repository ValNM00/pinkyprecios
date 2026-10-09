import { producto } from '../lib/servicios.mjs';
import { json, parametros, manejar } from '../lib/respuesta.mjs';

export default async (req) => manejar(async () => {
  const p = parametros(req);
  const ids = (p.get('ids') || '').split(',').map((x) => x.trim()).filter(Boolean);
  const r = await producto(ids, { expandir: p.get('expandir') !== '0' });
  return json(r, r.error ? 404 : 200);
});

export const config = { path: '/api/producto' };
