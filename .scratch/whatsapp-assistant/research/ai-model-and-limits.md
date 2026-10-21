# Qué modelo de IA usa el asistente y con qué límites

Ticket: #12 (mapa #8). Investigado el 2026-10-20.

## Lo que ya usa Saba

- Saba llama a Claude por HTTP directo (`fetch` a `api.anthropic.com`) con `ANTHROPIC_API_KEY`.
- Modelo por defecto: `claude-sonnet-4-6` (`ANTHROPIC_MODEL`) para leer placas y certificados (`services/claude/*`); `claude-haiku-4-5` (`ANTHROPIC_CHAT_MODEL`) para el chat de insights (`services/insights/runChat.js`).

## Recomendación

**Proveedor:** Claude (Anthropic), con el SDK oficial `@anthropic-ai/sdk` desde el módulo `assistant` de la API (NestJS/TypeScript). Es una sola llamada por turno con herramientas propias (tool use + Tool Runner del SDK). No hace falta Managed Agents: no hay sandbox ni archivos, solo 3 o 4 herramientas de lectura.

**Modelo:** línea Sonnet, como en Saba, pero en su versión actual: **`claude-sonnet-5-5`**. Es más barato que `claude-sonnet-4-6` ($2/$10 vs $3/$15 por millón de tokens de entrada/salida) y más nuevo. Queda configurable por env (`ASSISTANT_MODEL`) para poder cambiarlo sin tocar código.

**Llave propia:** `ASSISTANT_ANTHROPIC_API_KEY`, distinta de la `ANTHROPIC_API_KEY` de Saba, idealmente en un workspace propio de la consola de Anthropic con límite de gasto. Así se cumple la regla del mapa (servicios propios), el gasto del asistente se ve por separado, y revocar una llave no tumba la otra.

**Parámetros (Sonnet 5.5):**
- `output_config.effort: "low"` para chat; subir solo si una evaluación lo justifica.
- Herramientas con `strict: true`; `tool_choice: auto` (el forzado da 400 en este modelo).
- `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) para que una negativa del modelo no deje al cliente sin respuesta; si igual termina en `refusal`, se hace traspaso a persona.
- Prompt caching del system prompt + herramientas (prefijo estable, sin fechas ni ids dentro).

## Cómo no inventar datos

- Productos, sedes y horarios **solo** desde herramientas que llaman a `/api/assistant/*` de Saba. El system prompt prohíbe responder esos datos de memoria.
- Una herramienta `transfer_to_human(reason)` materializa el traspaso: si ninguna herramienta trae el dato, el agente traspasa en vez de improvisar.
- Las herramientas son de solo lectura y devuelven solo datos públicos: aunque un cliente intente manipular al agente (prompt injection), lo peor que obtiene es información que ya es pública.
- El historial que se le pasa al modelo se arma desde `whatsapp_messages` (últimos N mensajes de texto), no se guarda el estado interno del modelo.

## Ventana de 24 h y costo de WhatsApp

- Los mensajes libres (no plantilla) solo se pueden enviar dentro de la ventana de 24 h que abre cada mensaje del cliente. El asistente solo responde, nunca inicia, así que siempre está dentro; si el procesamiento se retrasa más allá de la ventana (`last_inbound_at` + 24 h), no responde.
- **Desde el 1 de octubre de 2026 Meta cobra los mensajes de servicio** (antes eran gratis), por mensaje entregado; hay 1.000 gratis por número al mes. Respuestas de IA de terceros cuentan como mensajes de servicio, igual que las de una persona. Esto aplica también a lo que ya responde el equipo hoy.
- Consecuencia de diseño: el asistente debe responder en **un solo mensaje por turno**, no en varios mensajes cortos.
- Pendiente: la tarifa exacta por mensaje para Venezuela en el rate card de Meta.

## Costo estimado por conversación (orden de magnitud)

Supuestos: ~3K tokens fijos (system + herramientas, cacheados), ~1K variables por llamada, 2 o 3 llamadas por turno (con herramientas), ~500 tokens de salida por turno, conversación de 4 turnos.

| Modelo | Por turno | Por conversación |
|---|---|---|
| `claude-sonnet-5-5` | ~US$0,013 | **~US$0,05** |
| `claude-sonnet-4-6` | ~US$0,02 | ~US$0,08 |

Más el costo de Meta por mensaje entregado pasada la cuota gratis. Validar con `usage` real en el piloto.

## Fuentes

- Skill `claude-api` (precios y parámetros de modelos, caché al 2026-10-06).
- [Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Upcoming pricing updates for Meta Business Agent, service and utility messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages)
- [Service messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages)
