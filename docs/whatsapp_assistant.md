# Asistente de WhatsApp — qué hace y cómo se comporta

Asistente virtual que contesta a los clientes de Saba en los **Chats de WhatsApp**, con Claude como modelo. Este documento describe su comportamiento desde el punto de vista del producto: qué responde, cuándo le pasa el chat a una persona y qué controla el equipo desde el panel.

El código vive en `apps/api/src/modules/assistant/` (las reglas que lee el modelo están en `domain/instructions.ts` y los textos fijos en `domain/fixedReplies.ts` y `domain/handoff.ts`). La configuración de Meta está en `docs/whatsapp_meta_setup.md`.

---

## 1. De qué habla

Solo de tres temas:

- **Productos:** si Saba los maneja y si hay stock. Los busca en el catálogo de Saba por nombre, modelo, marca o categoría (sin importar tildes ni plurales) y recibe hasta 10 resultados. Si preguntan por "todo lo que hay", da ejemplos y nunca dice que es la lista completa.
- **Sedes:** nombre y dirección. Cuando la respuesta nombra una sola sede, el sistema agrega el enlace del mapa (📍); el modelo nunca escribe enlaces.
- **Horarios de atención al público** de cada sede. Si una sede no tiene horario cargado en Saba, da la dirección y dice que no tiene el horario.

**Nunca da precios, montos, cuotas, iniciales ni financiamiento.** Saba no le entrega ningún monto, y además de pedírselo en las instrucciones, el código revisa cada respuesta: si trae un monto, no se envía.

## 2. Cómo responde

- **Espera a que el cliente termine de escribir.** Cada mensaje nuevo mueve la respuesta 8 segundos más tarde, pero nunca más de 30 segundos después del primero. Los mensajes seguidos se contestan juntos en una sola respuesta.
- **Muestra "escribiendo…"** en WhatsApp mientras prepara la respuesta.
- **Se presenta en la primera respuesta** desde que se abre el chat, con un texto fijo según la hora de Caracas: "Buenos días / Buenas tardes / Buenas noches, te responde el asistente virtual de Saba Transporte 🤖."
- **Responde directo al dato**, en español, en un mensaje corto y sin formato.

### Textos fijos (no consumen tokens)

Para los mensajes más repetidos el modelo solo decide el caso y el sistema envía un texto escrito de antemano:

| Caso | Texto |
| --- | --- |
| El cliente solo saluda | "Puedo ayudarte con nuestros productos, nuestras sedes y sus horarios de atención. ¿Qué necesitas?" |
| El cliente solo agradece o se despide | "¡Con gusto! Si necesitas algo más, escríbeme por aquí." |
| El cliente pregunta por precios o financiamiento | "Los precios y las opciones de financiamiento los puedes ver en nuestra página web: www.sabatransporte.com" (y sigue atendiendo) |

Un saludo que trae una pregunta se trata como pregunta.

### "Respuestas simples"

Ajuste del panel (encendido por defecto): respuestas de 1 o 2 frases, sin listas largas y sin repetir datos ya dados, con un tope bajo de salida para gastar menos.

## 3. Cuándo le pasa el chat a un asesor

El asistente envía "Te paso con un asesor de Saba, en breve te escribe por aquí.", el chat queda marcado como **"Necesita asesor"** en el panel y el asistente no vuelve a escribir en ese chat hasta que se resuelva. Lo hace cuando:

| Motivo | Situación |
| --- | --- |
| El cliente lo pide | Quiere hablar con una persona, o insiste con los precios |
| Sin stock | El producto existe pero no hay stock. El aviso dice que el modelo sí se maneja |
| Dato no encontrado | El producto no aparece en el catálogo, o falta el dato de la sede |
| Fuera de tema | La pregunta no es de productos, sedes ni horarios |
| No es texto | El cliente manda audio, imagen u otro tipo de mensaje |
| Límite por cliente | Ese contacto llegó a su límite de respuestas en 24 horas |
| Error | Falla del modelo, de Saba o de la configuración |

## 4. Cuándo no responde

- **Una persona tiene el chat:** está asignado, alguien respondió desde el panel o desde el teléfono, o el asistente está pausado en ese chat.
- **Ya traspasó el chat** y nadie lo ha resuelto.
- **Pasaron más de 24 horas** desde el último mensaje del cliente (Meta no permite texto libre fuera de esa ventana).
- **Se alcanzó el límite diario total.** En ese caso no traspasa: el equipo ve el aviso en el panel.
- **Reacciones** (👍) y avisos del sistema de WhatsApp.
- **El asistente está apagado.**

Si una persona toma el chat mientras el modelo está escribiendo, la respuesta se descarta.

## 5. Lo que controla el equipo en el panel

### En "Ajustes"

Editable con el permiso `assistant:manage`. Cada ajuste muestra quién lo cambió por última vez y cuándo.

| Ajuste | Por defecto |
| --- | --- |
| "Asistente encendido" | Apagado (si falta la configuración, nada responde por accidente) |
| "Respuestas totales al día" | 300 (el día empieza a medianoche, hora de Caracas) |
| "Respuestas por cliente al día" | 20 (ventana móvil de 24 horas) |
| "Espera (segundos)" | 8 |
| "Espera máxima (segundos)" | 30 |
| "Respuestas simples" | Encendido |

### Resumen semanal

También en "Ajustes": conversaciones atendidas, cuántas se resolvieron sin persona, traspasos agrupados por motivo y costo estimado de la semana. Los textos fijos cuentan como respuestas.

### "¿Por qué?" en cada mensaje del asistente

En los chats, cada mensaje del asistente tiene la opción "¿Por qué?", que muestra qué productos buscó y cuántos resultados encontró (o si respondió solo con los datos de sedes y horarios) y cuál fue el resultado: respondió o traspasó, y por qué motivo.

### Pausar y resolver

La API permite pausar el asistente en un chat y marcar el chat como resuelto (resolver limpia la pausa y el traspaso, y el asistente vuelve a atender). Los botones del panel para estas dos acciones no están en la interfaz actual.

## 6. Datos y retención

- Cada turno del asistente queda registrado (búsquedas, decisión, motivo, tokens y latencia): es lo que alimenta el "¿Por qué?" y el resumen semanal.
- **Los registros con más de 90 días se borran automáticamente**, también al arrancar la API. Pasado ese plazo, el "¿Por qué?" de un mensaje viejo ya no está disponible.

## 7. Configuración técnica

| Variable (`apps/api/.env`) | Para qué |
| --- | --- |
| `ASSISTANT_ANTHROPIC_API_KEY` | Llave de Claude |
| `ASSISTANT_MODEL` | Modelo a usar; por defecto `claude-sonnet-5-5` |
| `SABA_ASSISTANT_KEY` | Llave del asistente para los endpoints de Saba |

El catálogo de productos y las sedes salen de los endpoints del asistente en el servidor de Saba (`/api/assistant/products` y `/api/assistant/stores`, en `SABA_API_URL`). Si Saba rechaza la llave o falta, el asistente traspasa el chat con motivo de error.
