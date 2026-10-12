// Datos del panel de administración (solo para las cuentas de ADMIN_EMAILS)
import { esAdmin, datosAdmin, accionAdmin } from '../lib/extra.mjs';
import { json, manejar } from '../lib/respuesta.mjs';

export default async (req) => manejar(async () => {
  const admin = await esAdmin(req);
  if (!admin) return json({ error: 'Esta sección es solo para la administradora. Ingresá con tu cuenta.' }, 403);
  if (req.method === 'POST') { const r = await accionAdmin(await req.json().catch(() => ({}))); return json(r, r.error ? 400 : 200); }
  return json({ admin: admin.email, ...(await datosAdmin()) });
});

export const config = { path: '/api/panel' };
