# Cerrar tickets

Un ticket no se cierra hasta que **cada criterio de aceptación está validado y marcado** en su cuerpo.

1. **Revisa los criterios uno por uno.** Para cada checkbox (`- [ ]`) del cuerpo del issue, confirma que se cumple con evidencia concreta: un test que lo cubre, una prueba manual que hizo el usuario o el código que lo implementa. "Debería funcionar" no cuenta.
2. **Marca solo lo validado.** Cambia `- [ ]` por `- [x]` en el cuerpo del issue (`gh issue view <n> --json body`, editar, `gh issue edit <n> --body-file`). Un criterio sin validar se queda sin marcar.
3. **Si alguno no se cumple, no cierres.** Dilo, y o bien termínalo, o bien deja un comentario con lo que falta y el ticket abierto.
4. **Comentario de cierre:** los commits que lo implementan y cómo se validó cada criterio (test, prueba manual o ambos). Luego `gh issue close`.
