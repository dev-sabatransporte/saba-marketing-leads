# Convenciones de Git y Commits

## Estilo de commits (Conventional Commits)

Formato: `<tipo>(<ámbito>): <descripción corta en imperativo>` — en español, sin punto final. El `<ámbito>` es opcional pero recomendado (el módulo o feature tocado).

### Tipos permitidos

- `feat`: nueva funcionalidad
- `fix`: corrección de un error
- `refactor`: cambio de código que no corrige un bug ni añade una funcionalidad
- `style`: cambios de formato (espacios, comas, etc.) que no afectan el comportamiento
- `docs`: documentación
- `test`: añadir o corregir pruebas
- `chore`: mantenimiento, dependencias o configuración del build

### Commits granulares

Un commit = un cambio lógico. Nunca un solo commit para todo un ticket.

- Separa por capa o por pieza: migración (`chore(db)`), lógica pura con sus tests, middleware o adaptador con sus tests, endpoint o caso de uso, UI.
- Cada commit lleva sus propios tests y deja la suite en verde por sí solo (se puede hacer checkout de cualquiera sin romper nada).
- Ordénalos para que cada uno solo dependa de los anteriores: primero el esquema, luego la lógica, al final lo que lo expone.
- Si un archivo compartido (p. ej. `package.json`) cambia por varias piezas, cada commit lleva solo su parte.

### Ejemplos

- `feat(users): implementar validación zod en el formulario de registro`
- `fix(auth): corregir refresco de token expirado`
- `refactor(shared): extraer botón genérico a shared/components`
