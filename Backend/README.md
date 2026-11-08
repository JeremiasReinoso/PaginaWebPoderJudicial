# Backend — integración pendiente

El ZIP recibido no incluye código de servidor, API desplegable, base de datos ni migraciones. La carpeta se conserva para separar claramente esa responsabilidad y describir la integración necesaria.

## Lo que existe hoy en el frontend

- `Frontend/campus/api.js`: cliente que puede conectarse a rutas de sesión y campus.
- `Frontend/admin/admin.js`: panel con modo local y compatibilidad con rutas `/api/admin/*`.
- `Frontend/js/modules/license-validator.js`: cliente de activación de licencias.
- `Frontend/campus/client_backend.js`: simulación local con almacenamiento del navegador.

El modo de navegador sirve para una demostración local. El estado depende del navegador usado y no equivale a una base central, no aplica controles de seguridad de servidor y no sincroniza usuarios.

## Para una versión de producción

Implementar una API y base de datos para cuentas, licencias, activaciones y auditoría; autenticar a administradores en el servidor; añadir controles CSRF, límites de intentos y validación de licencias; y configurar el origen HTTPS del campus en `Frontend/js/config.js`. Guardar claves solo como secretos del servidor.

Hasta completar esa implementación, no usar el modo local para procesar pagos ni guardar información personal real.
