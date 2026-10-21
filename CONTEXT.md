# CONTEXT — Saba Marketing Leads

Contexto de dominio y **lenguaje ubicuo** del proyecto. Se llena a medida que se modela el dominio (con `/grill-me`, `/to-spec` y `/domain-modeling`).

## Glosario

- **Lead**: contacto interesado que llega por algún canal de marketing. Se identifica por su **correo** (único, normalizado a minúsculas).
- **Origen**: canal por el que llegó el lead (formulario web, referido, evento…). Texto libre por ahora.
- **Asistente**: agente automático que responde por WhatsApp preguntas sobre productos activos, sedes y horarios. Responde solo mientras ninguna persona atiende la conversación. _Evitar_: bot (en código y docs).
- **Traspaso**: el asistente deja una conversación a una persona del panel (tema fuera de alcance, pedido del cliente, dato no disponible o mensaje no textual). La conversación queda marcada "Necesita asesor" y el asistente se calla en ella hasta que pase a `resolved`.
- **Sede**: tienda propia de Saba (tabla `stores` de Saba). Los afiliados no son sedes.
