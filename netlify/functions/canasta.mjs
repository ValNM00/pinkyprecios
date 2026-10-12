import { serieCanasta, CANASTA } from '../lib/canasta.mjs';
import { json, manejar } from '../lib/respuesta.mjs';

export default async () => manejar(async () => json({ ...(await serieCanasta()), definicion: CANASTA.map(({ id, nombre, ref }) => ({ id, nombre, ref })) }, 200, 'public, max-age=600'));

export const config = { path: '/api/canasta' };
