# Método Judicial — paquete del proyecto

Este ZIP incluye el sitio web y sus documentos de estudio. El video promocional se guarda en el proyecto separado `video`.

## Carpetas

- `Frontend/`: sitio público, páginas, biblioteca PDF, campus de demostración, panel administrativo, imágenes y estilos.
- `Backend/`: estado y especificación de la integración pendiente del servidor.

## Cómo abrirlo

En Windows, abrí PowerShell en la carpeta `Frontend` y ejecutá:

```powershell
.\iniciar-local.ps1
```

Después visitá <http://127.0.0.1:8765/>. Para cerrar el servidor local, presioná `Ctrl+C`.

## Estado funcional

La versión incluida es una demostración estática. La sesión, las licencias y los datos administrativos se guardan en el navegador de prueba; no se comparten con otros dispositivos ni constituyen autenticación segura de producción. No conectar pagos reales ni datos personales hasta implementar el servidor descrito en `Backend/README.md`.
