# Dónde viven en Saba los productos activos, las sedes y los horarios

Ticket: #9 (mapa #8). Fuente: repo `../saba` al 2026-10-20. Todo se lee con `supabaseAdmin` (service role) desde el servidor Node de Saba.

## Productos activos

- **Tabla `products`**. "Activo" = `available = true`. Columnas que usa hoy el catálogo público: `id, name, model, image_url, cuota_inicial, brand_id, created_at`.
- **Marca**: `brands (id, name)` vía `products.brand_id`. **Categoría**: `product_categories (product_id, category_id)` → `categories (id, name)`.
- **Con stock** (distinto de "activo"): un producto tiene unidades vendibles si existe un `inventory_items` con `status = ASSIGNABLE_INVENTORY_STATUS`, `application_id IS NULL`, `deleted_at IS NULL`, en un almacén no excluido del storefront, encadenado `inventory_items.variant_value_id → product_variant_attribute_values.attribute_id → product_variant_attributes.product_id`. Lógica en `services/storefront/catalogProducts.js` + `lib/inventory/assignableInventoryStock.js`; cacheado 60 s.
- **Planes de financiamiento por producto**: `product_payment_options (product_id, financed_amount, promo_active, promo_financed_amount)` → `payment_interest_rules (frequency, plazo)`.
- Referencia existente (que el agente **no** reutiliza, por decisión del mapa): `GET /api/storefront/products`, público y sin auth.

**Sensibles / no exponer:** conteos de inventario por almacén, ids de almacén, `inventory_items` en general, costos (no aparecen en el catálogo; verificar al diseñar el endpoint).

## Sedes (tiendas propias)

- **Tabla `stores`**: `id, code, name, address, map_url, warehouse_id, status ('active'|…), is_default, created_at, updated_by`. Activas = `status = 'active'`. Administradas en `/admin/stores` (`services/stores/adminStores.js`).
- Tiene **dirección** y **enlace a mapa**; **no** tiene teléfono, horario ni ciudad como columnas.
- Los afiliados (concesionarios aliados) no están en `stores`; son otro canal.

**Sensibles / no exponer:** `warehouse_id`, `updated_by`, conteos de inventario.

## Horarios

- **No hay horario de atención al público guardado en ningún lado.**
- Lo más parecido: `attendance_sites` + `attendance_site_schedules (site_id, weekday, is_workday, start_time, end_time)` del módulo de **asistencia de empleados** (migraciones `20261016200100/200200`). Son turnos de entrada/salida del personal (Catia e Iglesia 08:00–17:00 L–V; también Jabian y Xerox, que no son tiendas), con `grace_minutes`. No están vinculados a `stores` (se relacionan solo por nombre) y no reflejan apertura al público (p. ej. sábados).

## Implicaciones para el mapa

1. Productos y sedes **existen** en Saba y bastan para endpoints `/api/assistant/*`.
2. Los horarios **no existen** como dato de cara al cliente → la niebla "datos que no existan en Saba" se vuelve un ticket concreto.
3. `cuota_inicial` y los planes de financiamiento son información del producto, pero rozan "pagos", que está fuera de alcance → decidir en el ticket de campos.
4. "Activo" (`available`) ≠ "con stock": decidir cuál de los dos usa el agente.
