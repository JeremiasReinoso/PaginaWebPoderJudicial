# Sistema de Validación de Licencias — Poder Judicial

Documentación técnica, operativa y de seguridad del sistema de validación de licencias de un solo uso y activación permanente integrado en **Método Judicial**.

---

## 1. Descripción general del sistema

El sistema de validación de licencias protege el acceso y descarga del material bibliográfico oficial en PDF desde la sección pública **Material de Estudio** (`frontend/public/pages/material-estudio.html`), garantizando que:

- Cada licencia posea un código único de alta entropía (**160 bits**, formato `PJ-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`).
- El código completo se entregue **una única vez** al momento de su creación administrativa y jamás se almacene en texto plano (solo su digest `SHA-256` y su prefijo público `PJ-XXXX-XXXX`).
- Cada código pueda activarse **una sola vez** durante toda su existencia mediante una transacción atómica (`BEGIN IMMEDIATE`) en SQLite.
- Una vez activada, la licencia quede asociada permanentemente a la instalación autorizada (`installation_id` + credencial criptográfica firmada con HMAC-SHA256 y verificada contra su hash en la base de datos) **sin fecha de vencimiento**, renovaciones periódicas ni suscripciones.

---

## 2. Arquitectura y estructura de carpetas

El diseño respeta estrictamente las fronteras modulares del proyecto sin dependencias externas:

- **`backend/license_config.js`**: lectura y validación de variables de entorno (`NODE_ENV`, `LICENSE_DB_PATH`, `ADMIN_PANEL_PATH`, `INSTALLATION_TOKEN_SECRET`, cookies y límites de tasa).
- **`backend/license_db.js`**: migraciones versionadas (`schema_migrations`) y definición de tablas (`admin_users`, `admin_sessions`, `licenses`, `license_activations`, `audit_logs`, `license_rate_limits`).
- **`backend/admin_auth.js`**: hash de contraseñas con `crypto.scryptSync` (`N=16384, r=8, p=1`), bloqueo por fuerza bruta, sesiones administrativas `HttpOnly`, protección CSRF, control de acceso basado en roles (`admin`, `auditor`, `viewer`) y auditoría.
- **`backend/license_service.js`**: lógica de dominio de licencias desacoplada de HTTP (generación criptográfica, activación atómica, verificación de instalación, revocación y reemplazo auditable de códigos extraviados no activados).
- **`backend/app.js`**: rutas HTTP (`/api/licenses/*`, `/api/admin/*`), middleware `requireActivatedLicense` que protege la descarga de los PDFs de estudio y entrega del panel administrativo en `ADMIN_PANEL_PATH`.
- **`frontend/public/js/modules/license-validator.js`**: módulo cliente cargado **exclusivamente** en `frontend/public/pages/material-estudio.html`.
- **`frontend/admin/`**: panel administrativo protegido (`index.html`, `admin.css`, `admin.js`), separado de la navegación pública.
- **`scripts/init_admin.js`**: utilidad de línea de comandos para crear el administrador inicial de forma segura sin contraseñas predeterminadas en el código.
- **`tests/test_license_system.js`**: suite automatizada con los 15 escenarios de unidad, integración, concurrencia y seguridad.

---

## 3. Requisitos previos

- **Navegador web moderno** (Chrome, Edge, Firefox, Safari) para abrir directamente el panel administrativo (`frontend/admin/index.html`) y la página de activación (`frontend/public/pages/material-estudio.html`).
- **Node.js** (opcional para servidor local y pruebas automatizadas): versión `>= 22.5.0` (probado en Node.js `v24.19.0`), utilizando únicamente módulos nativos (`node:sqlite`, `node:crypto`, `node:http`, `node:test`).

---

## 4. Variables de entorno

Copiá el archivo `.env.example` como referencia si ejecutás el servidor backend:

| Variable | Descripción | Valor por defecto (desarrollo) |
| :--- | :--- | :--- |
| `NODE_ENV` | Entorno de ejecución (`development` o `production`). En `production` exige `INSTALLATION_TOKEN_SECRET` y activa el atributo `Secure` en cookies. | `development` |
| `PORT` | Puerto de escucha del servidor HTTP. | `4173` |
| `LICENSE_DB_PATH` | Ruta absoluta al archivo SQLite de persistencia. | `~/.codex/private/MetodoJudicialPrueba/campus.sqlite3` |
| `ADMIN_PANEL_PATH` | Ruta donde se sirve la interfaz del panel administrativo. | `/panel-licencias` |
| `INSTALLATION_TOKEN_SECRET` | Secreto de al menos 32 bytes hexadecimales para firmar tokens de instalación con HMAC-SHA256. **Obligatorio en producción.** | Secreto efímero aleatorio por proceso en desarrollo |
| `ADMIN_SESSION_COOKIE` | Nombre de la cookie de sesión administrativa. | `mj_admin_session` |
| `INSTALLATION_COOKIE` | Nombre de la cookie de credencial de instalación. | `mj_installation_cred` |

---

## 5. Uso directo y puesta en marcha

1. **Panel Administrativo de Licencias**:
   - Archivo directo: `frontend/admin/index.html` (con sus estilos en `frontend/admin/admin.css` y lógica en `frontend/admin/admin.js`).
   - Ruta en servidor local (`node backend/app.js --port 4173`): `http://127.0.0.1:4173/panel-licencias`.
2. **Pantalla de Activación de Licencias (Material de Estudio)**:
   - Archivo directo: `frontend/public/pages/material-estudio.html`.
   - Ruta en servidor local: `http://127.0.0.1:4173/pages/material-estudio.html`.

---

## 6. Ejecución de migraciones

Las migraciones versionadas definidas en `backend/license_db.js` (`MIGRATIONS`) se ejecutan automáticamente de manera transaccional e idempotente al inicializar `Store` (`backend/storage.js`):

```bash
node backend/app.js --init
```

Esto crea y verifica la tabla `schema_migrations` junto con `admin_users`, `admin_sessions`, `licenses`, `license_activations`, `audit_logs` y `license_rate_limits`.

---

## 7. Credenciales de administración

El sistema cuenta con la cuenta administrativa inicial configurada (almacenada únicamente mediante su hash criptográfico `scrypt` / `SHA-256` con sal) para la gestión y emisión de licencias. Adicionalmente, `node scripts/init_admin.js` permite dar de alta otros usuarios administrativos si se requiere.

---

## 8. Puesta en marcha del servidor (opcional)

### Entorno local
```bash
node backend/app.js --port 4173
```
El servidor escuchará en `http://127.0.0.1:4173`:
- Validador de licencias (Material de Estudio): `http://127.0.0.1:4173/pages/material-estudio.html`
- Panel administrativo protegido: `http://127.0.0.1:4173/panel-licencias`

### Entorno de producción
Definir `NODE_ENV=production` y un `INSTALLATION_TOKEN_SECRET` criptográfico de 32+ bytes detrás de un proxy inverso HTTPS (por ejemplo, Nginx o Caddy):
```bash
NODE_ENV=production \
INSTALLATION_TOKEN_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" \
ADMIN_PANEL_PATH="/panel-licencias" \
node backend/app.js --port 4173
```

---

## 9. Flujo de creación y entrega única de una licencia

1. El administrador inicia sesión en `/panel-licencias` (`POST /api/admin/login`).
2. En la sección **«Generar nueva licencia de un solo uso»**, ingresa opcionalmente una referencia interna (ej. *Juzgado Civil N.º 1*) y presiona **«Crear licencia»** (`POST /api/admin/licenses/create` con token CSRF).
3. El backend genera 20 bytes criptográficamente aleatorios (`160 bits`), formatea el código `PJ-XXXX-...`, guarda únicamente `SHA-256(code)` en `licenses.code_hash` y devuelve el código en texto plano **en esa única respuesta HTTP**.
4. El panel administrativo muestra el código en un cuadro destacado con botón **«Copiar código»** y advertencia explícita de que no volverá a mostrarse al cerrar o recargar la página.

---

## 10. Flujo de activación de una licencia

1. Al abrir `pages/material-estudio.html`, `license-validator.js` consulta `GET /api/licenses/status` enviando la cookie `HttpOnly` de instalación (y/o el encabezado `X-Installation-Token` de respaldo).
2. Si el backend confirma `activated: true`, se desbloquea inmediatamente el listado y la descarga de los 5 módulos PDF (`/api/licenses/study-pdfs/1.pdf` al `5.pdf`) sin volver a pedir el código al recargar la página.
3. Si la instalación no está activada, se muestra el formulario de activación en `material-estudio.html`.
4. Al enviar un código (`POST /api/licenses/activate`), el backend abre una transacción `BEGIN IMMEDIATE`:
   - Verifica el límite de intentos (`license_rate_limits`).
   - Busca la licencia por `code_hash`.
   - Si el estado es `available`, la actualiza atómicamente a `activated` (`WHERE id = ? AND status = 'available'`), asocia `installation_id`, genera una credencial aleatoria de 256 bits cuyo hash `SHA-256` se guarda en `installation_credential_hash`, registra el evento en `license_activations` y `audit_logs`, y emite el token firmado en una cookie `HttpOnly; SameSite=Strict`.
   - Si el código ya fue consumido (`activated`), rechaza la solicitud con `409 Conflict` (salvo que la misma instalación autorizada reintente de forma idempotente presentando su credencial criptográfica válida tras un corte de red).

---

## 11. Procedimiento ante pérdida de código no activado

Dado que el código completo no se almacena en la base de datos, **es imposible recuperar en texto plano un código ya emitido**.

Si se extravía un código que todavía se encuentra en estado `available` (no activado):
1. En el panel administrativo (`/panel-licencias`), localizar la licencia por su prefijo (`PJ-XXXX-XXXX`) o referencia de cliente.
2. Presionar el botón **«Reemplazar código perdido»** (`POST /api/admin/licenses/replace`).
3. El servidor ejecuta una transacción atómica que:
   - Verifica que la licencia original siga en estado `available` (si ya fue activada, rechaza la operación con `409 Conflict`).
   - Marca la licencia extraviada como `revoked` (`revoked_at`, `revoked_by`).
   - Crea una nueva licencia `available` conservando la `client_reference`.
   - Registra la acción `LICENSE_REPLACED_LOST_CODE` en `audit_logs` vinculando ambos identificadores sin almacenar los códigos completos.
   - Muestra por única vez el nuevo código de reemplazo para su entrega.

---

## 12. Procedimiento de revocación administrativa

1. Desde la tabla de licencias en `/panel-licencias`, el administrador presiona **«Revocar»** sobre una licencia `available` o `activated` (`POST /api/admin/licenses/revoke`).
2. El servidor cambia el estado a `revoked`, limpia `installation_credential_hash` y registra `LICENSE_REVOKED` en `audit_logs`.
3. Cualquier intento posterior de activar ese código o de acceder a los PDFs desde la instalación asociada es rechazado inmediatamente por el servidor.
4. Una licencia activada o revocada **jamás** puede volver a estado `available`.

---

## 13. Ejecución de pruebas automatizadas

Para ejecutar la suite completa de pruebas (incluyendo los 15 escenarios obligatorios de licencias, concurrencia, seguridad del campus y empaquetado de GitHub Pages):

```bash
node --test tests/*.js
```

Para ejecutar únicamente las pruebas del sistema de validación de licencias:

```bash
node --test tests/test_license_system.js
```

---

## 14. Medidas de seguridad implementadas

- **Entropía criptográfica**: códigos de licencia de 160 bits generados con `crypto.randomBytes(20)`.
- **Almacenamiento irreversible**: códigos de licencia hasheados con `SHA-256`; contraseñas administrativas hasheadas con `scrypt` (`N=16384, r=8, p=1`, sal aleatoria de 16 bytes) y comparadas en tiempo constante con `crypto.timingSafeEqual`.
- **Atomicidad y prevención de condiciones de carrera**: transacciones `BEGIN IMMEDIATE` en SQLite combinadas con cláusula condicional `WHERE id = ? AND status = 'available'` e índices `UNIQUE` en `code_hash` e `installation_id`.
- **Validación en el servidor**: los archivos PDF de estudio (`/api/licenses/study-pdfs/:id.pdf`) están protegidos en el backend mediante `requireActivatedLicense`; modificar `localStorage` o el DOM en el navegador no concede acceso a los documentos.
- **Protección de sesiones y cabeceras HTTP**: cookies `HttpOnly; SameSite=Strict` (`Secure` en producción), tokens CSRF por sesión verificados en cada `POST` administrativo, validación de `Host` y `Origin`, y cabeceras `Content-Security-Policy`, `X-Frame-Options: DENY` y `X-Content-Type-Options: nosniff`.
- **Limitación de tasa (Rate Limiting)**: bloqueo automático con `429 Too Many Requests` ante intentos repetidos de adivinación de licencias o fuerza bruta sobre el inicio de sesión administrativo.
- **Auditoría sin filtración de secretos**: `audit_logs` y `license_activations` registran todas las operaciones administrativas y de activación usando únicamente prefijos (`PJ-XXXX-XXXX`), sin guardar jamás códigos completos, hashes ni tokens.

---

## 15. Limitaciones conocidas y recomendaciones para producción

- **Despliegue en GitHub Pages**: GitHub Pages es un alojamiento exclusivamente estático. En modo estático sin backend conectado, la sección en `pages/material-estudio.html` informa que requiere conexión con el servidor de licencias. Para producción con validación activa, el backend Node.js debe ejecutarse en un servidor o contenedor con persistencia en disco para el archivo SQLite.
- **Terminación TLS (HTTPS)**: en producción, colocá el servidor Node.js detrás de un proxy inverso con HTTPS habilitado y configurá `NODE_ENV=production` junto con `INSTALLATION_TOKEN_SECRET`.
- **Copias de seguridad (Backups)**: realizá respaldos periódicos del archivo SQLite configurado en `LICENSE_DB_PATH` (y sus archivos `-wal` / `-shm`) dado que las activaciones son permanentes y no existen reenvíos del mismo código consumido.
