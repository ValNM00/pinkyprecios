# PinkyPrecios

Comparador de precios **reales** de tiendas de Costa Rica. Es una versión mejorada de la idea de MisterPrecios.com, hecha como proyecto final de programación.

Cuando alguien busca un producto, la página consulta en ese momento los catálogos públicos de las tiendas. Junta el mismo producto de distintas tiendas y guarda cada precio en una base de datos para armar el historial. No hay precios inventados.

---

## Qué tiene de nuevo frente a MisterPrecios

| Función | Cómo funciona |
|---|---|
| Búsqueda en vivo | Consulta las tiendas en el momento, en paralelo, en unos 2 a 5 segundos. |
| Mismo producto, varias tiendas | Agrupa por código de barras (EAN), por código de modelo o por nombre casi igual (misma marca y mismos números). |
| **Historial real de precios** | Cada precio encontrado se guarda. Una tarea automática los vuelve a revisar cada 6 horas: un punto por día. |
| **¿Buen momento para comprar?** | Compara el precio de hoy con el mínimo y el promedio registrados (a partir de 7 días de datos). |
| **Detector de descuentos inflados** | Si la tienda muestra un precio "antes", revisa si hace más de 25 días ya costaba lo mismo. |
| **Cuotas reales** | Muestra las cuotas sin interés que publica la tienda (por ejemplo, 12 meses con American Express o Visa en Walmart). |
| **Alertas de precio** | El usuario pone un precio objetivo y un correo. La tarea automática revisa las alertas y puede mandar el correo. |
| **Ranking de tiendas** | Cuál tienda tiene el precio más bajo más veces, con productos que venden 2 o más tiendas. |
| **Rebajas de hoy** | Rebajas encontradas en las tiendas, descartando las que el historial muestra como infladas. |
| **Lo más buscado** | Las búsquedas reales de los usuarios. |
| Colones / dólares | Tipo de cambio oficial del **Ministerio de Hacienda**, consultado en vivo. |
| Estado de las tiendas | La página muestra qué tiendas están funcionando y por qué alguna no. |
| Mi lista, comparar, compartir, modo oscuro | Mi lista y vistos recientemente se guardan en el navegador. Compartir copia un enlace al producto. |

## Tiendas

| Tienda | Rubro | Cómo se lee |
|---|---|---|
| Walmart, Simán | Tecnología y hogar | API pública VTEX, búsqueda en vivo |
| Maxi Palí, Más x Menos | Supermercado | API pública VTEX, búsqueda en vivo |
| Monge, Gollo, La Curacao | Tecnología y hogar | Mapa del sitio + precio de cada página (con memoria de 24 h) |
| iCon | Tecnología | Catálogo público de Shopify (precios en dólares convertidos a colones) |
| Palí, Auto Mercado, Pequeño Mundo, Steren, Tienda Credix, Office Depot, Extreme Tech, ADN Tienda, Unimart, Intelec, Kölbi, Pacifiko, EPA, El Lagar | Varios | **Detección automática**: la página prueba VTEX, Shopify, WooCommerce y mapa del sitio. Solo aparecen si funcionan; las demás quedan "en evaluación" en el panel de Tiendas |

**Descartadas:** Ekono e iShop (rechazan la conexión del robot) y PriceSmart (sus páginas no entregan el precio a un robot).

**Reglas que respeta el robot:**
- Lee el `robots.txt` de cada tienda y no entra donde la tienda no lo permite.
- Se identifica como `PinkyPreciosBot`.
- Hace como máximo 3 pedidos a la vez por tienda.
- Guarda los resultados para no repetir consultas.

Para agregar una tienda, sumá una línea en `netlify/lib/tiendas.mjs`.

## Cómo está armado

```
public/                    La página (lo que ve el usuario)
  index.html, styles.css, app.js, config.js, img/
netlify/functions/         Funciones del servidor (Netlify)
  buscar.mjs               GET /api/buscar?q=…      búsqueda en vivo
  producto.mjs             GET /api/producto?ids=…  detalle + historial
  inicio.mjs               GET /api/inicio          portada, rebajas, ranking, tipo de cambio
  alertas.mjs              POST/GET /api/alertas
  diagnostico.mjs          GET /api/diagnostico     revisa cada tienda
  admin.mjs                GET /api/admin?token=…&tarea=indexar|actualizar
  cron-actualizar.mjs      cada 6 horas: refresca precios y revisa alertas
  cron-indexar.mjs         cada hora: detecta tiendas e indexa catálogos
netlify/lib/               Lógica compartida
  tiendas.mjs              lista de tiendas
  adaptadores.mjs          VTEX, Shopify, mapa del sitio + JSON-LD, tipo de cambio
  texto.mjs                normalización, sinónimos ticos, modelo, agrupación
  robots.mjs, http.mjs     respeto de robots.txt y pedidos
  db.mjs, servicios.mjs    Supabase y lógica principal
supabase/schema.sql        tablas de la base de datos
scripts/                   servidor local y prueba de tiendas
tests/                     pruebas automáticas
```

La página nunca habla directo con Supabase. Solo las funciones de Netlify tienen la clave, que vive en variables de entorno. Así nadie puede modificar los precios desde el navegador.

---

## Paso a paso para publicarla

### 1. Base de datos (Supabase)
1. Creá un proyecto en <https://supabase.com>.
2. Abrí **SQL Editor → New query**, pegá todo `supabase/schema.sql` y dale **Run**.
3. En **Project Settings → API** copiá:
   - **Project URL**
   - la clave **secreta** (`sb_secret_…`, o la antigua **service_role**). Es secreta: nunca la pongas en archivos de `public/` ni la subas a GitHub

### 2. Código en GitHub
Creá un repositorio y subí esta carpeta completa. Podés arrastrar los archivos en GitHub con **Add file → Upload files**, o usar `git`.

### 3. Netlify
1. En <https://app.netlify.com> elegí **Add new site → Import an existing project → GitHub** y escogé el repositorio. `netlify.toml` ya trae la configuración.
2. En **Site configuration → Environment variables** agregá:
   - `SUPABASE_URL` = la Project URL
   - `SUPABASE_SERVICE_KEY` = la clave service_role
   - `ADMIN_TOKEN` = una clave larga que vos inventes
3. Dale **Deploy**.

> Importante: **Netlify Drop** (arrastrar la carpeta) **no sirve**, porque no publica las funciones. Usá GitHub o la terminal: `npx netlify-cli deploy --prod`.

### 4. Primer arranque
1. Abrí `https://TU-SITIO.netlify.app/api/diagnostico`. Muestra qué tiendas funcionan.
2. Para no esperar a las tareas automáticas, indexá los catálogos a mano. Abrí varias veces, hasta que diga "Todos los catálogos están al día":
   `https://TU-SITIO.netlify.app/api/admin?token=TU_ADMIN_TOKEN&tarea=indexar`
   Cada vez avanza con una tienda: primero detecta las de modo automático, después indexa iCon y Monge.
3. Buscá algo en la página. Desde ese momento el historial empieza a llenarse solo.

### 5. Cuentas de usuario
1. En Supabase → **SQL Editor**, corré `supabase/actualizacion-2.sql` (si instalaste desde cero con `schema.sql` ya está incluido).
2. En Supabase → **Authentication → URL Configuration**: *Site URL* = `https://TU-SITIO.netlify.app` y en *Redirect URLs* agregá `https://TU-SITIO.netlify.app/**`.
3. Poné la URL del proyecto y la clave **publishable** en `public/config.js` (es pública por diseño).
4. Opcional para la presentación: en **Authentication → Providers → Email** podés desactivar *Confirm email* para que las cuentas queden activas al instante (el correo gratuito de Supabase envía pocos mensajes por hora).

### 6. Asistente con IA (opcional)
Sin configurar nada, el asistente responde las preguntas frecuentes. Para que use IA en las demás, agregá `ANTHROPIC_API_KEY` (y opcionalmente `ANTHROPIC_MODEL`, por defecto `claude-haiku-5-5`) en las variables de Netlify. Tiene costo por uso.

### 7. Correos de alertas y de contacto (opcional)
Creá una cuenta gratis en <https://resend.com> y agregá `RESEND_API_KEY` en Netlify. Con esa clave llegan los correos de alertas cumplidas y los mensajes del formulario de contacto (a `CONTACTO_CORREO`, por defecto naranjov740@gmail.com). Sin la clave, las alertas igual se marcan como cumplidas en la página y los mensajes quedan guardados en la tabla `mensajes` de Supabase.

---

## Probar en tu compu

Requiere Node.js 18 o más nuevo.

```bash
cp .env.example .env      # y completá los datos de Supabase
npm start                 # abre http://localhost:8888
npm run probar            # revisa cada tienda y hace una búsqueda real
npm run probar -- iphone  # lo mismo con otra búsqueda
npm test                  # pruebas automáticas (no usan internet)
```

Sin Supabase, la búsqueda en vivo de Walmart y Simán igual funciona. Lo que no hay es historial, alertas guardadas ni catálogos indexados.

## Límites honestos (para la presentación)
- Los precios son los que cada tienda publica en su sitio. No incluyen envío ni promociones de sucursal.
- Unir productos entre tiendas depende de que tengan el mismo código de barras, el mismo modelo o un nombre muy parecido. Algunos productos quedan separados.
- El historial empieza el día que se publica la página. "¿Buen momento?" necesita al menos 7 días de datos, y el detector de descuentos inflados al menos 25.
- Si una tienda cambia su sitio, puede dejar de leerse. El diagnóstico lo muestra.
- Las funciones gratuitas de Netlify tienen 10 segundos por búsqueda. Por eso las tiendas lentas se cortan y aparecen como "muy lenta".

---

© 2026 Valeria Naranjo · PinkyPrecios. Todos los derechos reservados.
Contacto: naranjov740@gmail.com · WhatsApp +506 8937 6664
