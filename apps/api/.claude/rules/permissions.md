# Permisos

Los permisos los **otorga Saba** y los **hace cumplir esta API**. Hoy hay dos: `marketing:access`, que Saba deriva de `profiles.has_marketing_access` (más un rol de staff), y `assistant:manage`, que además exige `profiles.can_manage_assistant` y solo controla el interruptor global del asistente de WhatsApp. El catálogo vive en `packages/schemas` (`PERMISSIONS`); un permiso que Saba mande y este repo no conozca se ignora.

Nunca se decide un permiso en el frontend: la API le informa sus permisos efectivos (`GET /me`) solo para que pinte la interfaz, y no confía en lo que el cliente diga.

Nomenclatura: `<recurso>:<accion>` — p. ej. `report:view`, `document:download`, `document:view_confidential`.

## Cómo se usa

`PermissionsGuard` es global (`modules/auth`) y corre después del `AuthGuard`, sobre el usuario que este dejó en la petición:

```typescript
@RequirePermissions({ permissions: ['marketing:access'] })
@RequirePermissions({ operator: 'OR', permissions: ['report:view', 'queue:review'] })
```

Va en el controller o en el método (el del método reemplaza al del controller). Una ruta sin `@RequirePermissions` solo exige sesión. El rechazo es `AUTH_PERMISSION_DENIED` (403), explicable.

Para lógica condicional dentro del controller —filtrar resultados por lo que el usuario alcanza— se usa `@CurrentUser().permissions`, ya resuelto, sin consulta extra.

## Dos cosas fáciles de romper

- **Permisos independientes no forman jerarquía.** Si dos permisos protegen dos dimensiones distintas de un recurso, tener uno no da acceso al otro; un recurso marcado con los dos exige los dos. No asumas "el más restrictivo".
- **Los permisos no viajan en el token.** Se resuelven en Saba (`GET /api/marketing/session`) y esta API los cachea **30 s** por proceso (`InMemorySessionCache`, clave = hash del token). Quitarle un permiso a alguien con sesión abierta aplica como mucho en ese plazo, sin cerrar la sesión; un logout borra la entrada al instante. No subir ese TTL sin pensarlo: es la ventana en la que un acceso revocado sigue funcionando.
