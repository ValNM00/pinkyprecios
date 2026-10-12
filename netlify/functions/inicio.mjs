import { inicio } from '../lib/servicios.mjs';
import { json, manejar } from '../lib/respuesta.mjs';

export default async () => manejar(async () => json(await inicio(), 200, 'public, max-age=60'));

export const config = { path: '/api/inicio' };
