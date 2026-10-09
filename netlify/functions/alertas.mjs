import { crearAlerta, estadoAlertas } from '../lib/servicios.mjs';
import { json, parametros, manejar } from '../lib/respuesta.mjs';

export default async (req) => manejar(async () => {
  if (req.method === 'POST') {
    const cuerpo = await req.json().catch(() => ({}));
    const r = await crearAlerta(cuerpo);
    return json(r, r.error ? 400 : 201);
  }
  const ids = (parametros(req).get('ids') || '').split(',').filter(Boolean);
  return json(await estadoAlertas(ids));
});

export const config = { path: '/api/alertas' };
