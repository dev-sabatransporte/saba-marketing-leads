# Categorías y marcas del catálogo que ve el asistente

Ticket: #43 (mapa #41). Fuentes: repo `../saba` (rama `ai-whatsapp-model`, leído el 2026-10-26, sin modificar), rama `ai-whatsapp-model-v2` de este repo, y datos reales leídos el 2026-10-26 por el endpoint **público** de solo lectura del catálogo web (`GET https://sabatransporte.com/api/storefront/products[/filters]`, sin credenciales; ver "Cómo se obtuvieron los conteos"). Complementa `.scratch/whatsapp-assistant/research/saba-data-sources.md` (#9).

## Respuesta corta

- El catálogo son **54 motos activas**, **16 con stock**, en **4 categorías** (Urbanas, Scooters, Deportivas, Clásicas) y **9 marcas**.
- **No existe ninguna categoría "motos"**: buscar "motos" o "moto urbana" devuelve **0 resultados**, aunque las instrucciones del asistente ponen "motos" como ejemplo de búsqueda por categoría.
- El tope de **10 resultados** se aplica **antes** de mirar el stock y ordena por más nuevo: una búsqueda amplia puede dejar fuera productos con stock.
- "Producto parecido" se puede definir por **categoría + cilindrada** (el campo `model` es casi siempre la cilindrada, p. ej. "150 CC") y, si hace falta, por marca. Pero el endpoint del asistente no filtra por categoría ni por stock. Tampoco hay forma de listar categorías: hace falta un endpoint nuevo o ampliar el actual.

## Cómo arma los resultados `/api/assistant/products`

Ruta: `saba/routes/assistantApi.js` → `searchAssistantProducts` en `saba/services/assistant/assistantProducts.js` → reglas puras en `saba/services/assistant/assistantAccess.js`.

| Aspecto | Comportamiento | Fuente |
|---|---|---|
| Autenticación | Header `x-saba-assistant-key`, límite de 60 peticiones/min por clave | `assistantAccess.js:10-15`, `middleware/requireAssistantService.js` |
| Productos base | `products` con `available = true` (activo, **no** "con stock"), orden `created_at desc, id asc`, todas las páginas | `assistantProducts.js:29-36` |
| Marca | `products.brand_id` → `brands.name` (embed `brand:brand_id(name)`) | `assistantProducts.js:32` |
| Categorías | `product_categories (product_id, category_id)` → `categories (id, name)`; un producto puede tener 0, 1 o varias | `assistantProducts.js:10-24` |
| Búsqueda | En memoria. Texto normalizado (minúsculas, sin acentos, puntuación → espacio, máx. 80 caracteres). Se quitan palabras de relleno (`de`, `la`, `marca`, …). **Cada** palabra restante debe aparecer como subcadena en `nombre + modelo + marca + categorías`. También se acepta el singular quitando `es`/`s` (si quedan ≥ 3 letras) | `assistantAccess.js:98-135`, `lib/products/productSearch.js` |
| Sin palabras | HTTP 400 `missing_search` (el cliente de leads lo trata como lista vacía) | `assistantApi.js:39-43`, `HttpSabaAssistantProducts.ts` |
| Tope | `ASSISTANT_PRODUCTS_LIMIT = 10`, aplicado con `.slice` **después** del match y **antes** de calcular stock | `assistantAccess.js:17, 134` |
| Stock | `in_stock` = el id está en `getSellableProductIds()` (inventario asignable en almacenes que no están excluidos del catálogo web, caché de 60 s), el mismo cálculo que usa el catálogo web | `services/inventory/sellableProducts.js` |
| Campos devueltos | `name, model, brand, categories, in_stock`; nunca montos, ids ni imagen | `assistantAccess.js:88-96` |

Nota: el comentario JSDoc de la ruta dice "matching name, model or brand", pero el código también busca en categorías.

## Categorías y marcas reales (2026-10-26)

Total: **54 productos activos**, **16 con stock**.

| Categoría | Activos | Con stock |
|---|---:|---:|
| Urbanas | 32 | 10 |
| Scooters | 11 | 3 |
| Deportivas | 8 | 3 |
| Clásicas | 4 | 1 |

Las filas suman 55: **Empire NEW HORSE** está en 3 categorías (Deportivas, Scooters, Urbanas) y **Empire RK** no tiene ninguna.

| Marca | Activos | Con stock |
|---|---:|---:|
| Toro | 15 | 3 |
| Bera | 14 | 3 |
| Empire | 13 | 6 |
| Bajaj | 3 | 1 |
| Haojue | 2 | 0 |
| HJM | 2 | 1 |
| Loncin | 2 | 0 |
| MD HAOJIN | 2 | 2 |
| Suzuki | 1 | 0 |

Con stock hoy: Bajaj PULSAR NS200; Bera BRF, MILAN, SBR; Empire EK XPRESS II, NEW HORSE, OUTLOOK II, RK, RK 250, XPRESS LITE; HJM HJ150 Street JB; MD HAOJIN AGUILA, CONDOR; Toro LEÓN 200 TR, TRX (PALETA), TRX 150 (RAYOS).

### El campo `model` es la cilindrada

En 53 de los 54 productos, `model` es una cilindrada escrita sin un formato fijo: "150 CC", "150", "125  CC" (con doble espacio), "250 CCS". La excepción es Bera "BR 125 X 1", con `model = "BR 125 X 1"`. El nombre comercial está en `name`. Distribución aproximada: 150 cc (29 coincidencias al buscar "150"), 180 cc, 200 cc (8 al buscar "200 cc"), 250 cc, 100/125/175 cc (casos sueltos).

### Qué devuelve hoy el asistente (simulación del algoritmo con los datos reales)

Se reprodujo `pickAssistantMatches` con los 54 productos, en el mismo orden que usa Saba:

| Búsqueda | Coinciden | Devueltos (tope 10) | Con stock entre los devueltos |
|---|---:|---:|---:|
| `motos` / `moto` / `moto urbana` | **0** | 0 | 0 |
| `urbanas` | 32 | 10 | 10 |
| `scooter` | 11 | 10 | 3 (de 3) |
| `deportivas` | 8 | 8 | 3 |
| `toro` | 15 | 10 | 3 |
| `bera` | 14 | 10 | 3 |
| `150` | 29 | 10 | 10 |

- **"motos" no encuentra nada.** Ninguna categoría, nombre ni marca contiene "moto". Aun así, `domain/instructions.ts` (rama v2) le dice al modelo que busque "por … categoría, como "motos"". Ese ejemplo lleva a `data_not_found` y a un traspaso a un asesor.
- Hoy los productos más nuevos suelen tener stock, así que el tope casi no esconde stock. Pero nada lo garantiza: el orden es por fecha de alta, no por stock.

## ¿Se puede definir "producto parecido"?

Sí, con los datos que el endpoint ya devuelve, con algunas salvedades:

1. **Misma categoría** es el criterio más natural. Las 4 categorías parten bien el catálogo. Salvedades: RK no tiene categoría y NEW HORSE tiene tres.
2. **Cilindrada cercana** (no "modelo cercano"): hay que leer el número de `model` con una expresión como `/(\d{2,3})/`, porque el formato varía. No hay una columna de cilindrada propiamente dicha.
3. **Misma marca** sirve como desempate, pero sola no da parecido: Toro y Bera tienen motos de todas las categorías.
4. **Solo con stock**: hoy hay 16 productos con stock. En Clásicas hay 1 (TRX 150 RAYOS) y en Scooters 3. Para muchas consultas solo habrá 1 a 3 alternativas.

Lo que **no** alcanza con el endpoint actual:
- No hay **filtro por categoría, marca ni `onlyAvailable`**. Para pedir "Scooters con stock" el asistente tiene que buscar "scooters" y filtrar en memoria. Funciona mientras la categoría tenga 10 productos o menos. Con Urbanas (32), el tope corta resultados antes de que se pueda filtrar por stock.
- Buscar por cilindrada con texto ("150") compara subcadenas sobre nombre, modelo, marca y categorías a la vez. Hoy da 29 coincidencias y el tope las corta a 10. No sirve como filtro de "cilindrada cercana": ese cálculo tiene que hacerse aparte.

Opciones (a decidir en los tickets que dependen de este, #44 y #49):
- **A.** Mínimo en Saba: en `searchAssistantProducts`, ordenar primero los productos con stock antes del `slice(0, 10)`. No cambia el contrato.
- **B.** Ampliar `/api/assistant/products` con `?category=`, `?in_stock=1` (y que `search` sea opcional cuando venga un filtro). La lógica ya existe en `listCatalogProducts` del catálogo web (`saba/services/storefront/catalogProducts.js`: `categoryIds`, `brandIds`, `onlyAvailable`).
- **C.** Un endpoint de alternativas que reciba un producto y devuelva otros de la misma categoría y cilindrada parecida, con stock. Es más trabajo en Saba y deja la regla de parecido fuera de leads.

## ¿Existe "listar categorías"?

- **Para el asistente, no.** `routes/assistantApi.js` solo expone `/stores` y `/products`, y `/products` exige texto de búsqueda.
- **Sí existe** en el catálogo web: `GET /api/storefront/products/filters` (`listCatalogFilters` en `catalogProducts.js:121-142`). Es público, no pide autenticación y devuelve `brands`, `categories` (id y nombre, solo de productos activos) y `priceRange`. **No conviene que el asistente lo use tal cual**: devuelve ids y un rango de montos (`priceRange` sale de `cuota_inicial`), y el mapa decidió no reutilizar los endpoints del catálogo web (ver #9).
- Hace falta, entonces, **un endpoint nuevo `GET /api/assistant/categories`** (o `/catalog-summary`) detrás de `requireAssistantService`. Debería devolver solo nombres, idealmente con cuántos productos tienen stock, para que el botón "Productos" ofrezca solo categorías con algo que mostrar. Puede reutilizar las consultas de `listCatalogFilters` sin `priceRange`. Con 4 categorías hoy, la alternativa sería una lista fija en leads, pero se desactualiza cuando Saba cambie el catálogo.

## Cómo se obtuvieron los conteos

- En `saba/supabase/migrationsv1` no hay seeds, migraciones ni fixtures de `categories` ni `brands`. El esquema se maneja en el dashboard de Supabase (ver también `saba-backend/CLAUDE.md`). Los conteos no salen del repo.
- Se leyeron del endpoint público del catálogo web (sin credenciales, solo GET, unas 30 peticiones): `/api/storefront/products/filters` para las listas y `/api/storefront/products?pageSize=1&brand=<id>|category=<id>[&onlyAvailable=1]` para el campo `total`. Este endpoint usa la misma condición de activo (`available = true`) y el mismo cálculo de stock (`getSellableProductIds`) que el del asistente, así que los conteos son equivalentes. En la nota no se guardaron montos.
- Para repetir el conteo con exactitud contra la base hace falta acceso de lectura a Supabase (service role, en manos de Saba): `select c.name, count(*) from products p join product_categories pc on pc.product_id = p.id join categories c on c.id = pc.category_id where p.available group by c.name;` y la consulta equivalente con `brands`.
