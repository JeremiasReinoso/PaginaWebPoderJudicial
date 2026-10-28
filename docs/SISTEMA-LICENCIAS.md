# Sistema de Validación de Licencias — Poder Judicial

Sistema de licencias de un solo uso y activación permanente para desbloquear los PDF de estudio de `pages/material-estudio.html`. No usa cifrado ni hashes: los datos se guardan tal cual en SQLite.

## Dónde está

- Panel administrativo: `frontend/admin/` (`index.html`, `admin.css`, `admin.js`), servido en `/panel-licencias`.
- Activación de licencias: `frontend/public/pages/material-estudio.html` + `frontend/public/js/modules/license-validator.js` (solo esa página).
- Backend: `backend/license_service.js` (reglas), `backend/admin_auth.js` (login y sesiones), `backend/license_db.js` (tablas y migraciones), `backend/license_config.js` (configuración), `backend/random_ids.js` (códigos aleatorios), rutas en `backend/app.js`.

## Usuario y contraseña del panel (archivo oculto)

El usuario y la contraseña están en `backend/private/admin_credentials.json`:

```json
{ "users": [ { "username": "USUARIO", "password": "CONTRASEÑA", "role": "admin" } ] }
```

- La carpeta `backend/private/` está en `.gitignore`: no se sube a GitHub.
- Se excluye de `scripts/package_repository.js` y de `scripts/package_friend.js`.
- El servidor web no la publica (devuelve 404).
- `backend/admin_credentials.example.json` es solo una plantilla sin datos reales.
- Roles: `admin` (crea, revoca y reemplaza), `auditor` (consulta y exporta) y `viewer` (consulta).
- Para cambiar la contraseña, editar ese archivo; no hace falta reiniciar.

## Puesta en marcha

```bash
node scripts/iniciar.js
```

- Panel: `http://127.0.0.1:4173/panel-licencias`
- Activación: `http://127.0.0.1:4173/pages/material-estudio.html`

Las tablas se crean solas al iniciar (migraciones versionadas en `backend/license_db.js`).

## Reglas

- Cada código tiene el formato `PJ-XXXX-…` (40 dígitos hexadecimales aleatorios) y se muestra completo una sola vez, al crearlo.
- Un código se activa una sola vez; después queda asociado a la instalación sin fecha de vencimiento.
- Un código usado, revocado o inexistente es rechazado.
- Si se pierde un código sin activar, se usa «Reemplazar extraviado»: se invalida el anterior y se emite otro, con registro de auditoría.
- La activación es atómica (transacción `BEGIN IMMEDIATE`): dos solicitudes simultáneas no pueden consumir el mismo código.
- Los PDF se entregan solo desde el servidor, con licencia activa.
- Hay límite de intentos para activación y para el inicio de sesión del panel.

## Pruebas

```bash
node --test tests/*.js
```

## Limitaciones

- GitHub Pages es solo estático: sin el servidor Node.js, la sección de activación informa que no hay conexión.
- Sin cifrado, quien tenga acceso a la base de datos o al archivo `backend/private/` puede ver los códigos y la contraseña. Hay que proteger esos archivos en el equipo.
- Hacer copias de seguridad del archivo SQLite.
