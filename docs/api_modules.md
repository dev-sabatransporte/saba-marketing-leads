# Mapa de módulos de la API

Dueño de cada tabla y puertos entre módulos (`apps/api/.claude/rules/architecture.md`).
Todo módulo nuevo se registra acá antes o en el mismo PR que su implementación.

| Módulo | Tablas que posee | Exporta |
|---|---|---|
| `health` | — | — |
| `leads` | `leads` | — |
| `auth` | Ninguna. **No lee tablas de Saba:** login, sesiones y permisos se piden al servidor de Saba por HTTP | `AuthGuard` y `PermissionsGuard` globales (`APP_GUARD`), `@CurrentUser()` |
| `whatsapp` | `whatsapp_contacts`, `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_webhook_events`, `whatsapp_accounts` | `WHATSAPP_TOKENS.AssistantChannel` (`AssistantChannelPort`); evento `InboundMessageStored` |
| `assistant` | `assistant_settings`, `assistant_runs` | — |
| `sabaCustomers` | Ninguna. **No lee tablas de Saba:** le pregunta al servidor de Saba por HTTP | `SABA_CUSTOMERS_TOKENS.Reader` (`SabaCustomersReaderPort`) |

## `whatsapp`

- Chats de WhatsApp Cloud API (`.scratch/whatsapp-chats/PLAN.md`).
- `GET/POST /whatsapp/webhook` lo llama Meta: público, sin rate limit y fuera del sobre `{ success, data }`. El `POST` se autentica con `X-Hub-Signature-256` (HMAC del cuerpo crudo con `WHATSAPP_APP_SECRET`; por eso `main.ts` crea la app con `rawBody: true`), guarda cada `entry[].changes[]` en `whatsapp_webhook_events` y publica `WebhookEventReceived` por el `EventBus`. El procesamiento es aparte, para responder 200 rápido.
- Sin `WHATSAPP_APP_SECRET` / `WHATSAPP_VERIFY_TOKEN` la API arranca igual y el webhook responde 401/403.
- Procesamiento: `ProcessWebhookEventHandler` (al instante) y `WebhookReprocessorService` (al arrancar y cada 60 s, hasta 5 intentos por evento) llaman a `ProcessWebhookEventUseCase`, que aplica cada evento en una transacción y lo marca. Un contacto se identifica por `user_id` (BSUID) o teléfono.
- `saba_profile_id`, `assigned_to` y `sent_by` guardan ids de `profiles` de Saba **sin FK**: la tabla es de otro sistema. Los datos de clientes de Saba no se leen de sus tablas: se piden al servidor de Saba vía `sabaCustomers`.
- Archivos de los mensajes: `GET /whatsapp/messages/:id/media` los pide a Meta en el momento (dos pasos con el token) y los pasa en stream, sin guardar copia. Solo tipos seguros se sirven `inline`; el resto como `attachment` con `CSP: sandbox`, porque el BFF los sirve en el mismo origen del panel.
- Datos de Saba: `whatsapp` declara `SabaCustomersPort` y lo cumple el lector que exporta `sabaCustomers` (`useExisting`). Se consultan al abrir el chat, no al procesar el webhook.

## `auth`

- Saba es dueño del login de staff, las sesiones y los permisos; este módulo habla con sus endpoints `/api/marketing/*` (`HttpSabaAuthGateway`, en el repo de Saba `routes/marketingPanel.js`). Toda llamada lleva `X-Saba-Service-Key` (`SABA_SERVICE_KEY`); sin ella Saba responde 401 con `code: invalid_service_key`, que acá se reporta como `AUTH_UNAVAILABLE` (424) y no como sesión vencida, para no echar a todos los agentes por un error de configuración.
- **Toda ruta exige sesión** salvo `@Public()`: `health`, `auth/login`, `auth/refresh` y `whatsapp/webhook`.
- Login: Turnstile se valida acá; el resto (rate limit por IP, bloqueo al quinto fallo, "sin acceso" revelado solo con la contraseña correcta) es el `loginAdmin` de Saba. La IP y el user agent del agente viajan en `X-Marketing-Client-Ip` / `X-Marketing-User-Agent`, para que el rate limit de Saba cuente por agente y no por servidor.
- Por petición, el guard pregunta a Saba `GET /api/marketing/session` con el token del agente: sesión viva, rol de staff y `profiles.has_marketing_access`. La respuesta se cachea 30 s por proceso (clave: SHA-256 del token; solo respuestas exitosas). Un logout borra la entrada al instante; un acceso quitado en Saba aplica en ≤ 30 s.
- Permisos: `@RequirePermissions()` + `PermissionsGuard` sobre los permisos que devolvió Saba (hoy `marketing:access`, en `leads` y en los controllers de `whatsapp` del panel). Ver `apps/api/.claude/rules/permissions.md`.

## `sabaCustomers`

- Cliente HTTP del servidor Node de Saba (`SABA_API_URL`): `GET /api/marketing/customers/by-phone?phone=` devuelve hasta 5 perfiles con identidad y últimas solicitudes, el más probable primero. La normalización de teléfonos y qué es "información importante" viven en Saba (`services/marketing/customerLookup.js`), no acá.
- Va con la service key y el token de sesión del agente: Saba vuelve a validar la sesión y `has_marketing_access`. 401 → `SABA_CUSTOMERS_SESSION_NOT_RECOGNIZED` (424), 403 → `SABA_CUSTOMERS_FORBIDDEN` (403); caída, timeout, service key rechazada o respuesta inesperada → `SABA_CUSTOMERS_UNAVAILABLE` (424).
- Lo usa `whatsapp` al **abrir un chat** (`GET /whatsapp/conversations/:id/saba-customer`). Ya no hay vínculo automático al recibir mensajes; `whatsapp_contacts.saba_profile_id` queda para un vínculo manual futuro.

## `assistant`

- Asistente de WhatsApp v1 (spec: issue #18). Responde solo con datos que Saba le da por sus endpoints propios `/api/assistant/*` (`HttpSabaAssistantStores` y `HttpSabaAssistantProducts`, header `X-Saba-Assistant-Key` con `SABA_ASSISTANT_KEY` = `ASSISTANT_SERVICE_KEY` de Saba; nunca la llave de marketing). Timeout 5 s. Las sedes tienen caché de 5 min y última copia buena si Saba falla; los productos no se cachean aquí (Saba ya cachea el stock 60 s).
- Escucha `InboundMessageStored` (lo publica `whatsapp` después del commit) y corre un turno: lee `assistant_settings` (apagado = no hace nada), lee el chat por `AssistantChannelPort`, arma las instrucciones con las sedes (no son herramienta) y llama a Claude (`AnthropicAssistantModel`, `@anthropic-ai/sdk`, `ASSISTANT_MODEL` por defecto `claude-sonnet-5-5`, llave propia `ASSISTANT_ANTHROPIC_API_KEY`, effort bajo, instrucciones cacheadas). Envía un solo mensaje por turno, con `source = 'assistant'` y `sent_by` NULL.
- **Productos:** el modelo tiene la herramienta `search_products(query)` (strict, una llamada a la vez). El caso de uso corre cada búsqueda contra `GET /api/assistant/products?search=` y le devuelve al modelo solo `name`, `model`, `brand`, `categories` e `in_stock`; hasta 3 búsquedas por turno. Si Saba responde 401, 429, está caído o pasa el timeout, traspasa con `error` sin reintentar (el 401 se registra como error de configuración). Una respuesta que menciona un monto (`$`, `US$`, `USD`, `Bs`, dólares, bolívares, euros) no se envía: traspasa con `pricing`. Con `out_of_stock` el aviso al cliente dice que el modelo se maneja pero no hay stock.
- **Traspaso a un asesor:** el modelo lo pide con la herramienta `transfer_to_human` (`out_of_scope`, `customer_requested`, `data_not_found`, `pricing`, `out_of_stock`); el código lo decide para un mensaje que no es texto (`non_text`), la llave rechazada por Saba y cualquier error del modelo o del envío (`error`). Ante una negativa del modelo se pide `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`). El cliente recibe un aviso fijo (nunca detalles técnicos), el chat queda con `handoff_requested_at`/`handoff_reason` ("Necesita asesor", primero en la lista, sin asignar) y el asistente no responde mientras esa marca esté puesta. La limpia volver a encender el asistente en ese chat.
- **Convivencia con personas:** cada chat tiene un interruptor del asistente (`PUT /whatsapp/conversations/:id/assistant` con `{ enabled }`, `marketing:access`; columnas `assistant_paused_at`/`assistant_paused_by`). Responder desde el panel lo apaga solo, y el asistente también se calla si el chat está asignado, si una persona escribió desde el panel o el celular desde `opened_at`, o si tiene la marca de traspaso. Encenderlo quita la marca "Necesita asesor" y la asignación y reinicia `opened_at`: el asistente responde desde el siguiente mensaje del cliente.
- Cada turno deja una fila en `assistant_runs` (mensajes atendidos y enviado, resultado, modelo, tokens sumados de todas las llamadas al modelo, latencia y `tool_calls`: cada búsqueda con su texto y su número de resultados, `null` si Saba no respondió). Sin configuración, la API arranca igual; con el asistente encendido, un turno sin llave de Saba o de Anthropic traspasa con motivo `error`.
- No toca las tablas de `whatsapp`: todo pasa por `WHATSAPP_TOKENS.AssistantChannel`, que aplica las mismas reglas que una respuesta del panel (ventana de 24 h, teléfono).
