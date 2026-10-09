// Tarea programada: cada hora detecta tiendas nuevas o indexa (de a una) los catálogos de Shopify y mapas del sitio.
import { indexar } from '../lib/servicios.mjs';

export default async () => {
  const r = await indexar({ tiempo: 22000 });
  console.log('Indexación:', JSON.stringify(r));
};

export const config = { schedule: '17 * * * *' };
