// Revisa qué tiendas responden y guarda su estado. Abrilo en /api/diagnostico después de publicar.
import { diagnostico } from '../lib/servicios.mjs';
import { json, manejar } from '../lib/respuesta.mjs';

export default async () => manejar(async () => json(await diagnostico()));

export const config = { path: '/api/diagnostico' };
