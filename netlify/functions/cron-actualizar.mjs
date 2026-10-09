// Tarea programada: cada 6 horas vuelve a leer los precios más viejos y revisa las alertas.
import { actualizar } from '../lib/servicios.mjs';

export default async () => {
  const r = await actualizar({ tiempo: 24000, limite: 80 });
  console.log('Actualización de precios:', JSON.stringify(r));
};

export const config = { schedule: '0 */6 * * *' };
