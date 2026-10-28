# Campus por código: alcance y seguridad

## Estado actual

Ingreso con un único código de acceso. La autenticación anterior por usuario y contraseña fue eliminada, no conservada como alternativa. Internamente cada acceso mantiene un identificador para separar los resultados; ese identificador no se pide al estudiante.

La presentación está preparada para GitHub Pages mediante un artefacto público permitido explícitamente. El campus funcional sigue siendo una prueba local. Como el equipo dispone solo de GitHub y pidió dejar la conexión para después, no se conectó ni desplegó un backend externo y `frontend/public/js/config.js` mantiene `campusUrl` vacío. En Pages el ingreso no está habilitado hasta conectar ese servicio. No se afirma que subir las carpetas ejecute Python o proteja contenido pago.

## Prueba local y administración

Ejecutar `node scripts/iniciar.js` y abrir `http://127.0.0.1:4173/ingreso`. El código de prueba y la base se guardan fuera del repositorio, en `%USERPROFILE%/.codex/private/MetodoJudicialPrueba/`. El código está en `codigo-prueba.txt`. El historial de la demostración anterior se conserva cuando está disponible.

Crear un código: `python backend/app.py --create-code estudiante_001`. La etiqueta es administrativa. `--days 30` limita opcionalmente la vigencia. Para revocar el código y sus sesiones: `python backend/app.py --revoke-code estudiante_001`. No se reemplazan ni reactivan automáticamente códigos existentes.

Cada código tiene 128 bits generados con `secrets` y se guarda en la base por huella SHA-256, nunca en claro. El archivo de entrega del código sí lo contiene para que el equipo lo comparta con su estudiante; se conserva fuera del proyecto y no se empaqueta. Un código es una credencial reutilizable: quien lo tenga puede ingresar. El sistema no puede impedir por sí solo que un estudiante lo comparta.

## Controles

- Validación en servidor de código activo, vigencia y estado del acceso. Revocación comprobada en cada petición privada, incluidas páginas y recursos del campus.
- Tokens aleatorios de sesión de 256 bits, guardados por hash, rotación al ingresar e invalidación al salir. Máximo de dos horas y treinta minutos sin actividad.
- Cookie HttpOnly y SameSite=Strict. En producción serán obligatorios HTTPS y Secure; HTTP solo se utiliza sobre loopback en esta prueba.
- Token CSRF, Origin y Host exactos, JSON y límites de tamaño para escrituras. Seis intentos fallidos en quince minutos antes del bloqueo temporal. Los fallos guardan la huella del código, no el código en claro.
- SQL parametrizado, historial por acceso e intentos corregidos una única vez. Puntajes y tiempo definitivo de mecanografía calculados por el servidor; las claves de respuestas no se envían al iniciar el examen.
- Rutas públicas permitidas explícitamente, sin listado de carpetas ni acceso a fuentes Python, bases, archivos ocultos o PDF. CSP, no-store, nosniff y DENY. Sin códigos en URL, logs o almacenamiento local del navegador.
- Empaquetado separado de Pages: no incluye backend, datos, PDF, códigos ni archivos de entrega. El ZIP de repositorio incluye fuentes y ejemplos, nunca los datos privados de ejecución.

## Verificación

`python -m unittest discover -s tests -v`: La suite incluye comprobaciones de dominio, arquitectura, seguridad del servidor y paquete público. El resultado de la ejecución actual se registra en `VERIFICACION.md`. Cubren sesión anónima/falsa/vencida, códigos incorrectos/vencidos/revocados, eliminación del ingreso anterior, rotación y logout, CSRF/origen/Host, SQL injection, límite de intentos, accesos directos/HEAD/traversal, separación de resultados e intentos, corrección y envío duplicado, ausencia de claves iniciales, mecanografía y rutas bajo el prefijo de un repositorio de GitHub Pages. El artefacto no contiene backend ni datos privados.

La versión anterior fue probada en navegador con examen, lectura y mecanografía. Se verificaron también el ingreso actual con un único código, el cierre de sesión y la conservación del historial previo. Las comprobaciones son locales; el workflow no se ha ejecutado en un repositorio remoto y no se ha auditado un despliegue en producción.

## Límites

El servidor usa `http.server` de Python y escucha solo en `127.0.0.1`. No es apto para Internet: no abrirlo en `0.0.0.0`, ni usar un túnel público para vender accesos. El contenido real deberá permanecer en un backend y almacenamiento privados, con operación, recuperación, administración, copias de seguridad y revisión de seguridad de producción. GitHub Pages publica lo que contiene su artefacto; un formulario o una clave en JavaScript no protegen esos archivos.

Los ejemplos incluyen cuatro preguntas por módulo, integrador de veinte, lectura de cuatro preguntas y mecanografía. El banco completo de veinte/cincuenta sigue pendiente. No hay pagos, autoinscripción ni administración web. No se declara invulnerabilidad, protección contra quien controle esta computadora ni una certificación legal o de seguridad.

Referencias: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [HTTP de Python](https://docs.python.org/3/library/http.server.html), [sesiones OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [CSRF OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
