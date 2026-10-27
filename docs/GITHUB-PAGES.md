# Subir las carpetas a GitHub y publicar la presentación

## Qué funciona con solo GitHub

La presentación, biblioteca pública, páginas de fuentes, términos, privacidad y diseño se publican en GitHub Pages. Las rutas se prueban también dentro de `https://usuario.github.io/nombre-del-repositorio/`, no solo en la raíz de un dominio.

El acceso ahora solicita únicamente **Código de acceso**, sin usuario ni contraseña adicional. Cada estudiante deberá tener un código individual generado y validado fuera de los archivos públicos. El código funciona como una credencial: quien lo conozca puede usarlo. No es posible impedir que lo comparta solo por cambiar el nombre de la credencial.

GitHub Pages es alojamiento estático. No ejecuta este backend Python, no mantiene sesiones privadas y no puede ocultar recursos incluidos en el artefacto público. Por decisión del equipo, la conexión del backend se difiere. Por eso, en Pages el ingreso queda sin habilitar hasta conectar un servicio externo real. No hay un código maestro en JavaScript ni un desbloqueo por localStorage.

## Archivos listos

- `output/repositorio-github.zip`: código preparado para subir al repositorio. Extraer y subir su contenido, no el ZIP como único archivo. Incluye `.github/workflows/pages.yml`; no omitir esa carpeta.
- `dist/`: artefacto público que genera el flujo de GitHub Pages. No incluye `backend/`, `tests/`, `scripts/`, bases de datos, códigos ni PDF.
- `frontend/public/js/config.js`: configuración pública de la dirección del campus. Hoy `campusUrl` está vacío porque todavía no se conectó un backend.
- `backend/`: implementación **solo de prueba local**, con validación de códigos y contenido demostrativo. Aunque su fuente forme parte del repositorio, no se incluye en el sitio de Pages. No cargar material pago real en un repositorio público.

## Pasos en GitHub

1. Descomprimir el ZIP y subir los archivos y carpetas a la raíz del repositorio existente, respetando nombres y mayúsculas. No subir `output/`, `dist/`, `.env`, códigos, bases o los PDF privados.
2. En **Settings → Pages → Build and deployment → Source**, elegir **GitHub Actions**. Estas flechas son indicaciones del panel de GitHub, no elementos del sitio.
3. El flujo `Publicar presentación en GitHub Pages` genera las páginas, ejecuta las pruebas y empaqueta solo archivos públicos. Se despliega únicamente desde la rama predeterminada del repositorio, cualquiera sea su nombre. No exige que se llame `main`.
4. Consultar el resultado en la pestaña Actions y la dirección devuelta por Pages. Los permisos y reglas del repositorio pueden exigir un paso de habilitación o aprobación del propietario.

No se ha subido ni publicado desde esta computadora: no se configuró todavía una URL de repositorio ni acceso a la cuenta.

## Cuando se agregue el backend

El backend de producción debe servir `/ingreso`, validar el código, emitir su sesión y proteger campus, materiales y API. Debe usar HTTPS y cookie Secure. La prueba local basada en `http.server` no es un servidor de producción y no se debe exponer mediante un túnel público.

Editar únicamente la dirección pública en `frontend/public/js/config.js`, por ejemplo `campusUrl: 'https://dominio-real-del-campus'`. Debe ser el origen HTTPS, sin credenciales ni rutas, consultas o fragmentos. No pegar códigos ni claves en ese archivo.

Al tocar Ingresar en Pages, el navegador abre `/ingreso` en el origen del backend. El estudiante introduce el código allí. No se transmite en parámetros de URL ni es necesario habilitar CORS amplio o cookies entre sitios. La sesión y el contenido privado pertenecen al backend; Pages conserva la presentación pública.

## Código de prueba local

`scripts/start_campus.ps1` prepara un código si no existe y arranca la prueba en `http://127.0.0.1:4173/ingreso`. El código se guarda en `%USERPROFILE%/.codex/private/MetodoJudicialPrueba/codigo-prueba.txt`, fuera del repositorio. El ingreso anterior por usuario y contraseña fue eliminado; las sesiones anteriores se invalidan al crear el código.

Para crear otro código: `python backend/app.py --create-code estudiante_001`. La etiqueta es administrativa, no se pide al ingresar. Opcional: `--days 30` para limitar su vigencia. El código no se pasa como argumento de consola y se escribe únicamente en su archivo privado. Revocar: `python backend/app.py --revoke-code estudiante_001`; invalida también sus sesiones.

Los códigos tienen 128 bits aleatorios y se guardan por huella SHA-256 en la base. Se mantienen límites de intentos, protección CSRF, vencimiento de sesiones y separación de resultados. Los archivos de entrega de códigos no deben subirse a GitHub.

Referencias: [Qué es GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Flujos personalizados para Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
