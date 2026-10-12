import { ofertasSemana } from '../lib/extra.mjs';
import { json, manejar } from '../lib/respuesta.mjs';

export default async () => manejar(async () => json(await ofertasSemana(), 200, 'public, max-age=600'));

export const config = { path: '/api/ofertas' };
