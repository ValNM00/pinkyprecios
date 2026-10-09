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

| Tienda | Cómo se lee | Estado verificado |
|---|---|---|
| Walmart | API pública de catálogo (VTEX), búsqueda en vivo | ✔ Probado: devuelve precio, precio anterior, existencias, cuotas y código de barras |
| Simán | API pública de catálogo (VTEX), búsqueda en vivo | ✔ Probado |
| iCon | Catálogo público de Shopify (`/products.json`), indexado cada día | ✔ Probado (precios en dólares, se convierten a colones) |
| Monge | Mapa del sitio + datos de cada página de producto | Su `robots.txt` bloquea las búsquedas pero permite las páginas de producto |
| Gollo, Ekono, iShop, La Curacao, PriceSmart | Detección automática | No se pudieron verificar durante el desarrollo. Revisalas en `/api/diagnostico` después de publicar |

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
   - la clave **service_role** (es secreta: nunca la pongas en archivos de `public/` ni la subas a GitHub)

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

### 5. Correos de alertas (opcional)
Creá una cuenta gratis en <https://resend.com> y agregá `RESEND_API_KEY` en Netlify. Sin esa clave, las alertas igual se marcan como cumplidas y se ven en la página.

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
