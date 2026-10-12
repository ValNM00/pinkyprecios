// Tarea programada: todos los días a las 6:07 a.m. (hora de Costa Rica) registra el precio de la canasta básica.
import { actualizarCanasta } from '../lib/canasta.mjs';

export default async () => {
  const r = await actualizarCanasta({ tiempo: 24000 });
  console.log('Canasta básica:', JSON.stringify(r));
};

export const config = { schedule: '7 12 * * *' };
