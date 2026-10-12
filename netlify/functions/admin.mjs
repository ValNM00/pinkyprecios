// Ejecuta a mano las tareas programadas: /api/admin?token=TU_TOKEN&tarea=indexar|actualizar|diagnostico
// Para indexar una tienda específica: &tarea=indexar&tienda=gollo
import { indexar, actualizar, diagnostico } from '../lib/servicios.mjs';
import { json, parametros, manejar, autorizado } from '../lib/respuesta.mjs';

export default async (req) => manejar(async () => {
  if (!autorizado(req)) return json({ error: 'Token inválido. Configurá ADMIN_TOKEN en Netlify y pasalo como ?token=' }, 401);
  const tarea = parametros(req).get('tarea');
  if (tarea === 'indexar') return json(await indexar({ tiempo: 8000, tienda: parametros(req).get('tienda') }));
  if (tarea === 'actualizar') return json(await actualizar({ tiempo: 7000, limite: 25 }));
  if (tarea === 'diagnostico') return json(await diagnostico());
  return json({ error: 'Tarea desconocida. Usá indexar, actualizar o diagnostico' }, 400);
});

export const config = { path: '/api/admin' };
