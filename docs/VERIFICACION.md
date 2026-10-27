# Verificación actual · 26 de octubre de 2026

Se separaron frontend y backend. El frontend del campus usa módulos ES por función.
El backend diferencia transporte, almacenamiento, acceso, prácticas y reglas puras
de dominio. El modelo y sus invariantes están en `ARQUITECTURA.md`.

`python -m unittest discover -s tests -v`: 47 pruebas correctas.
Cubren estados válidos del modo de práctica, fronteras de dependencias, imports del
frontend, acceso y sesiones, CSRF y origen, revocación, corrección, rotación de textos,
biblioteca privada y publicación con prefijo de repositorio de GitHub Pages.

Se corrigió el cierre de peticiones rechazadas con cuerpo sin consumir que podía
ocultar un 403 mediante un reinicio de conexión en Windows. El cuerpo se limita antes
de leerlo y la validación de origen se mantiene antes de interpretar el JSON.

`python scripts/verify_friend.py`: prueba satisfactoria del ZIP extraído con su propio
intérprete portátil. Verifica base aislada sin historial ni sesiones anteriores,
ingreso por código, biblioteca, PDF, lectura corregida, mecanografía al 100 % con el
texto asignado y carga de módulos frontend. La prueba usa una copia extraída; no agrega
sus resultados a la base limpia incluida en el ZIP entregado.

La publicación remota no se realizó. La separación de carpetas no convierte el servidor
local en un servicio apto para Internet ni protege archivos entregados en una copia
completa a una persona. El paquete de Pages excluye campus, backend y datos privados.

## Optimizaciones verificadas

El artefacto público y el paquete privado entregan un único CSS con el mismo orden
de cascada, en vez de cargar main.css y sus 14 importaciones. Los estilos por módulo
se conservan legibles en el código fuente. La compilación conserva las bases de URL
y rechaza ciclos o importaciones fuera de la carpeta de estilos.

La biblioteca se conserva en una caché de memoria del servidor limitada a ocho
versiones, invalidada por tamaño y fecha de modificación del archivo. La autenticación
se comprueba antes de consultarla; las respuestas privadas mantienen no-store.
Los archivos se envían en bloques de 64 KiB y HEAD no lee el contenido completo.

Se retiraron archivos JS y CSS vacíos, la imagen anterior sin uso y documentación
obsoleta. Las carpetas temporales y las capturas antiguas se retiraron del proyecto
a un archivo recuperable privado porque el entorno bloqueó su borrado permanente.
Los originales de estudio y la base de la computadora se conservaron fuera del proyecto.
No se atribuye una mejora de tiempo de carga sin una medición de rendimiento.

La revisión general posterior y sus correcciones están en `REVISION-GENERAL.md`. Las nuevas compilaciones y verificaciones usan carpetas privadas externas al repositorio.
