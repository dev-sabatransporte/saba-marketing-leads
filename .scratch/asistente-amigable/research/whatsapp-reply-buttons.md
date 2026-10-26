# Botones de respuesta de WhatsApp: límites y cómo llegan al webhook

Ticket: #42 (mapa #41). Investigado el 2026-10-26 sobre la rama `ai-whatsapp-model-v2` (commit `25cea01`).

Fuentes de Meta (primarias):

- [M1] Reply buttons — https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-reply-buttons-messages
- [M2] Interactive messages webhook reference — https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/interactive
- [M3] Button messages webhook reference (quick-reply de **plantillas**) — https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/button
- [M4] Send messages / Customer service windows — https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages
- [M5] Guía clásica de interactive messages — https://developers.facebook.com/docs/whatsapp/guides/interactive-messages
- [M6] List messages (para el límite de encabezado de texto) — https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-list-messages
- [M7] Messages API reference (HeaderObject/BodyObject/FooterObject) — https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api
- [C1] Hilo de la comunidad de desarrolladores de Meta (no es documentación oficial; son reportes de usuarios) — https://developers.facebook.com/community/threads/3423432361161832/

## Resumen

- **Hasta 3 botones**; título **≤ 20 caracteres** y único; id **≤ 256**; cuerpo **≤ 1024** (obligatorio); pie **≤ 60**; encabezado opcional (texto, imagen, video o documento). Nuestros 3 títulos caben: "Productos" (9), "Sedes y horarios" (16), "Hablar con asesor" (17).
- El toque llega como un **mensaje entrante normal** `type: "interactive"`, con `interactive.type: "button_reply"`, `button_reply.id` y `button_reply.title`, más `context.id` = wamid del mensaje con los botones.
- Se envían **sin plantilla** dentro de la ventana de 24 h (son *service messages*); fuera de la ventana, error. Un toque en un botón viejo genera un mensaje nuevo (y reabre la ventana); Meta no lo bloquea.
- Meta dice "iOS, Android y web". Hubo un bug reportado (julio 2026) en el que el toque desde WhatsApp Web llegaba como `unsupported` con error 131000. Para la app de escritorio no hay nada oficial: hay que probarlo a mano.
- Hoy un toque **se guarda bien** (`type = 'interactive'`, `body` = título; el id se pierde), pero el asistente lo **traspasa** como `non_text`. Además el canal solo sabe mandar texto.

## 1. Límites de un mensaje con botones de respuesta

De [M1], tabla de parámetros:

| Parte | Límite | Notas |
| --- | --- | --- |
| Botones | hasta 3 | `action.buttons[]`, cada uno `{ type: "reply", reply: { id, title } }` |
| `reply.title` | máx. **20** caracteres | "Must be unique if using multiple buttons" |
| `reply.id` | máx. **256** caracteres | Vuelve en el webhook tal cual |
| `body.text` | máx. **1024** caracteres, **obligatorio** | Los URLs se vuelven enlace solos |
| `footer.text` | máx. **60** caracteres, opcional | |
| `header` | opcional: `text`, `image`, `video` o `document` | Los medios van por `id` subido (el `link` "not recommended") |

- **Límite del encabezado de texto:** [M1] no lo da. [M6] (mensajes de lista) dice "Maximum 60 characters" para el encabezado de texto, y [M7] solo dice "Emojis supported, no markdown". Tomamos **60** como límite seguro. Si importa, se confirma con un envío de prueba.
- [M7]: el cuerpo admite emojis y markdown (`*negrita*`); el encabezado admite emojis pero no markdown.
- Petición: `POST https://graph.facebook.com/<versión>/<phone_number_id>/messages` con `type: "interactive"` e `interactive.type: "button"` [M1]. Nuestra versión por defecto ya es `v26.0` (`apps/api/src/modules/whatsapp/infrastructure/whatsappConfig.ts:41`), la misma de los ejemplos de Meta.
- La respuesta es la misma que la de un texto (`messages[0].id` = wamid) [M1]. Los estados `sent/delivered/read/failed` llegan por el mismo webhook de status.

Ejemplo para la bienvenida (los ids son nuestros y estables; los títulos se pueden cambiar sin romper nada):

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "<wa_id>",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": { "text": "¡Hola! Soy el asistente de Saba. ¿En qué te ayudo? También puedes escribirme tu pregunta." },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "welcome.products", "title": "Productos" } },
        { "type": "reply", "reply": { "id": "welcome.stores", "title": "Sedes y horarios" } },
        { "type": "reply", "reply": { "id": "welcome.advisor", "title": "Hablar con asesor" } }
      ]
    }
  }
}
```

## 2. Cómo llega el toque al webhook

Según [M1] y [M2], es un webhook `messages` con un mensaje entrante así:

```json
{
  "context": { "from": "<número del negocio>", "id": "<wamid del mensaje con botones>" },
  "from": "<wa_id del cliente>",
  "id": "<wamid nuevo>",
  "timestamp": "1714510003",
  "type": "interactive",
  "interactive": {
    "type": "button_reply",
    "button_reply": { "id": "welcome.products", "title": "Productos" }
  }
}
```

- `context.id`: "WhatsApp message ID of the message containing the button the WhatsApp user tapped" [M2]. Sirve para saber **qué** bienvenida se tocó, y si era una vieja.
- Un toque en una lista llega con el mismo `type: "interactive"`, pero `interactive.type: "list_reply"` con `id/title/description` [M2].
- **No confundir** con `type: "button"` ([M3]): ese es el toque de un botón *quick reply* de una **plantilla** (`button.text` / `button.payload`), no de un mensaje interactivo.

### Cómo lo procesa hoy nuestro módulo `whatsapp`

`apps/api/src/modules/whatsapp/domain/parseWebhook.ts`:

- El esquema ya acepta `interactive.button_reply.title` y `interactive.list_reply.title` (líneas 51-56), y `button.text` (línea 57). **No lee `button_reply.id` ni `context`.** Son `looseObject`, así que no fallan: simplemente ignoran esos campos.
- `bodyOf` (líneas 122-144): para `interactive` guarda el **título** como `body`; para `button` guarda `button.text`.
- `toInboundMessage` (líneas 159-188) deja `type: 'interactive'` (el `type` de Meta, sin cambios), `body` = título, `preview` = título y `opensWindow: true` (solo `reaction`, `unsupported` y `system` no abren ventana, línea 22).
- Se guarda en `whatsapp_messages` con `type = 'interactive'` y `body = 'Productos'` (`apps/api/src/modules/whatsapp/infrastructure/persistence/whatsapp.schema.ts:116-119`; la columna `type` es texto libre "because Meta keeps adding types"). El payload crudo, con el id y el `context`, queda solo en `whatsapp_webhook_events.payload` (misma tabla, línea 165).
- Panel: `MessageBubble` muestra el `body`, pero `noticeWithoutText('interactive')` agrega "Mensaje no compatible — ver en el celular", porque solo `text` y `template` se salvan (`apps/client/src/features/chats/domain/chat.model.ts:127-131`). O sea, el panel muestra el título del botón junto con un aviso de que el mensaje no es compatible.

### Cómo lo trata hoy el asistente

1. `ScheduleReplyUseCase` lo agenda: `isForTheAssistant('interactive')` es `true`, porque solo excluye `reaction` y `system` (`apps/api/src/modules/assistant/domain/conversation.ts:6-10`; `.../use-cases/ScheduleReplyUseCase.ts:39`).
2. `RunAssistantTurnUseCase` hace **traspaso** con motivo `non_text` si algún mensaje del lote no es `text` (`apps/api/src/modules/assistant/application/use-cases/RunAssistantTurnUseCase.ts:172-180`).
3. Aunque pasara ese filtro, `toModelTurns` descarta todo lo que no sea `type === 'text'` (`apps/api/src/modules/assistant/domain/conversation.ts:56`), así que el modelo nunca vería el toque.

**Hoy, tocar "Productos" le pasaría el chat a una persona.**

## 3. Ventana de 24 h, plantillas y botones viejos

- Los mensajes con botones son *service messages*: se envían por la Messages API "during a customer service window" y "do not require pre-approval" (sin plantilla). [M4] los incluye en la lista ("Interactive reply buttons messages allow you to send up to three predefined replies…").
- Cerrada la ventana, solo se permiten plantillas [M4]. [M5]: "Currently, they can only be sent within 24 hours of the last message sent by the user", "If you try to send a message outside the 24-hour window, you get an error message", y "List or reply button messages cannot be used as notifications".
- La bienvenida siempre responde a un mensaje del cliente, así que siempre está dentro de la ventana. `ReplyToConversationUseCase` ya rechaza el envío con la ventana cerrada (`WindowClosedException`, `apps/api/src/modules/whatsapp/application/use-cases/ReplyToConversationUseCase.ts:67-70`), y eso sirve igual para un envío interactivo.
- **Botón viejo:** [M5] dice que el usuario no puede elegir más de una opción a la vez, pero "they can go back and re-open a previous message". Meta no documenta que un botón caduque. Un toque viejo llega como un mensaje entrante nuevo, con `context.id` apuntando a la bienvenida vieja. Como es un mensaje del cliente, **abre o reinicia la ventana** de 24 h [M4], y nuestro parser lo marca `opensWindow: true`.
  - Consecuencia: el asistente debe responder al **id** del botón sin depender de que la bienvenida sea reciente. Un toque de "Productos" de hace tres días se responde igual. Si se quiere, `context.id` permite detectar que era una bienvenida vieja, pero no es necesario.
  - También puede llegar un toque después de un traspaso o con una persona a cargo del chat. Ahí rige `aPersonHasTheChat` como con cualquier mensaje (`conversation.ts:77-89`).

## 4. WhatsApp Web, escritorio y clientes donde no se ven

- Oficial [M5]: "Supported platforms: iOS, Android, and web (Flows messages are not supported on web)". Los botones de respuesta están soportados en web. La app de escritorio (Windows/Mac) no aparece nombrada en ninguna página de Meta.
- [M1], [M4] y [M7] no dicen qué ve un cliente que no soporta los botones. **No hay fuente primaria** sobre un texto de reemplazo.
- Reporte de la comunidad [C1], julio de 2026, sin respuesta de Meta: al tocar un botón desde **WhatsApp Web** (y desde clientes de escritorio de terceros), el webhook llegaba como un mensaje con error **131000 "Unsupported webhook payload"** en lugar de `button_reply`. En la app móvil y en la app nativa de escritorio funcionaba. A veces el segundo toque sí llegaba. Un usuario reportó que estaba resuelto el 24/7/2026, sin confirmación oficial.
  - En nuestro código, un mensaje así se guardaría como `type = 'unsupported'`, no abre ventana (`parseWebhook.ts:22`) y el asistente lo traspasa como `non_text`. Es un fallo seguro: alguien lo atiende.
- Recomendaciones de diseño:
  - El **cuerpo** de la bienvenida debe entenderse solo y decir que también se puede escribir ("…o escríbeme tu pregunta"). Así, si los botones no se ven o el toque falla, el cliente sigue por texto.
  - Antes de publicar, probar a mano el toque desde Android, iPhone, WhatsApp Web y la app de escritorio, y mirar el payload en `whatsapp_webhook_events`.

## 5. Qué habría que cambiar en el código (solo descripción)

### Enviar botones

- `WhatsAppCloudPort` (`apps/api/src/modules/whatsapp/application/ports/out/WhatsAppCloudPort.ts`) solo tiene `sendText`. Hace falta un `sendReplyButtons(to, { body, buttons: {id,title}[], header?, footer? })`, y en `GraphWhatsAppCloudAdapter` (`.../infrastructure/external/GraphWhatsAppCloudAdapter.ts:35-80`) armar el JSON de la sección 1, con el mismo manejo de errores `MetaSendError`.
- `ReplyToConversationUseCase.send` (líneas 59-102) hace ventana → `registerOutbound` → `cloud.sendText` → `confirmSend`. Hay que generalizarlo, o agregar un `sendButtonsAsAssistant`, para que el paso de envío sea intercambiable.
- `DrizzleChatsRepository.registerOutbound` fija `type: 'text'` (línea ~157). Hay que permitir `type: 'interactive'` y guardar en `body` el texto del cuerpo, para que el panel y el historial lo muestren. Los títulos de los botones se pueden anexar al `body` o ir en una columna nueva; decidirlo en el spec. Sin migración, basta con anexarlos al `body`.
- Puertos hacia el asistente: `AssistantChannelPort` (whatsapp, `application/ports/in/AssistantChannelPort.ts`), `WhatsAppAssistantChannel.sendAsAssistant` (`infrastructure/assistant/WhatsAppAssistantChannel.ts:45-47`) y `ChatChannelPort` (assistant, `application/ports/out/ChatChannelPort.ts:32-35`) necesitan un método nuevo, por ejemplo `sendButtonsAsAssistant(conversationId, body, buttons)`.

### Reconocer los toques

- `parseWebhook.ts`: leer también `interactive.type`, `button_reply.id` (y `list_reply.id`) y, opcionalmente, `context.id`. Hay dos formas de guardarlo:
  - (a) Columnas nuevas en `whatsapp_messages` (p. ej. `reply_id`, `context_wamid`), con migración.
  - (b) Sin migración: el asistente reconoce el toque por el **título** guardado en `body`. Es frágil si se cambian los títulos o si coinciden con algo que el cliente escribe a mano.
  - Recomendado: (a), o al menos guardar el id. Es lo que Meta garantiza como estable.
- `ChatLine` (`assistant/domain/conversation.ts:13-20`) necesitaría el id del botón (p. ej. `replyId: string | null`), y `ChatsRepository.listMessages` tendría que devolverlo.
- `RunAssistantTurnUseCase` (líneas 172-180): antes del filtro `non_text`, si el lote es un toque de bienvenida, responder con el **texto fijo** correspondiente según el id (`welcome.products`, `welcome.stores`) o hacer **traspaso** (`welcome.advisor`, con un motivo propio para que el resumen semanal y "¿Por qué?" lo distingan; ver "Not yet specified" del mapa #41). El filtro `non_text` debe dejar pasar `interactive` con `button_reply` conocido. Un id desconocido o un `list_reply` sigue traspasando, o se trata como texto con el título.
- `toModelTurns` (`conversation.ts:56`): para que el modelo tenga contexto en turnos siguientes, los `interactive` podrían entrar como turno de usuario con su título ("Productos"). La bienvenida saliente entraría como turno del asistente con su cuerpo.
- Panel: agregar `interactive` a los tipos que no muestran "Mensaje no compatible" (`apps/client/src/features/chats/domain/chat.model.ts:129`), para los toques entrantes y para la bienvenida saliente.

### Fuera de alcance de este ticket

- Cuándo mostrar la bienvenida y su texto exacto (mapa #41, tickets de grilling).
- Cómo se cuenta un toque en el resumen semanal.
