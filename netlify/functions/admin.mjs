// Ejecuta a mano las tareas programadas: /api/admin?token=TU_TOKEN&tarea=indexar|actualizar|diagnostico
// Para indexar una tienda específica: &tarea=indexar&tienda=gollo
import { indexar, actualizar, diagnostico } from '../lib/servicios.mjs';
import { actualizarCanasta } from '../lib/canasta.mjs';
import { json, parametros, manejar, autorizado } from '../lib/respuesta.mjs';

export default async (req) => manejar(async () => {
  if (!autorizado(req)) return json({ error: 'Token inválido. Configurá ADMIN_TOKEN en Netlify y pasalo como ?token=' }, 401);
  const tarea = parametros(req).get('tarea');
  if (tarea === 'indexar') return json(await indexar({ tiempo: 8000, tienda: parametros(req).get('tienda') }));
  if (tarea === 'actualizar') return json(await actualizar({ tiempo: 7000, limite: 25 }));
  if (tarea === 'diagnostico') return json(await diagnostico());
  if (tarea === 'canasta') return json(await actualizarCanasta({ tiempo: 8500 }));
  return json({ error: 'Tarea desconocida. Usá indexar, actualizar, diagnostico o canasta' }, 400);
});

export const config = { path: '/api/admin' };
