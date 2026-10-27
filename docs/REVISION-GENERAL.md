# Revisión general · 26 de octubre de 2026

Alcance: código frontend y backend, flujo de estudio local, acceso por código,
almacenamiento privado, Biblioteca, rutas públicas, compilación y entregas ZIP.
Se revisa una prueba local; no un despliegue comercial en Internet.

## Fallos corregidos

| Hallazgo | Cambio y comprobación |
| --- | --- |
| Los logros dependían de las últimas 100 prácticas y podían desaparecer del panel. | Se consultan los módulos aprobados en todo el historial, independientemente de las últimas 20 entradas mostradas. Prueba con 105 prácticas posteriores al logro. |
| Un código vencido podía reutilizarse al reconstruir la entrega privada. | El empaquetador comprueba código, propietario, cuenta activa y vencimiento. La copia conserva la fecha de vencimiento del acceso. |
| Un token CSRF con caracteres fuera de ASCII podía causar un error interno. | La comparación segura opera sobre bytes y rechaza la solicitud con 403. |
| Recargar el campus con sesión vencida mostraba JSON técnico al visitante. | La navegación HTML vuelve a ingreso; las API y los archivos privados mantienen el rechazo sin sesión. |
| Una ficha solicitada podía abrirse después de que el visitante cambiara de herramienta. | La navegación invalida solicitudes de ficha anteriores. |
| Regenerar el paquete público podía fallar por carpetas de OneDrive. | La nueva versión se compila antes de reemplazar la anterior, que se conserva recuperable; el cambio puede revertirse si falla la sustitución. |
| Las compilaciones y verificaciones volvían a crear carpetas temporales en el proyecto. | Las nuevas copias de trabajo se preparan fuera del repositorio, en almacenamiento privado. |

También se maneja el error de red al restaurar una página desde el historial del
navegador, sin dejar una promesa rechazada sin mostrar información al visitante.

## Evidencia

- `python -B -m unittest discover -s tests -v`: **47 pruebas correctas**.
- Sintaxis Python y de los 13 archivos JavaScript comprobada.
- Cinco PDF privados con huellas SHA-256 coincidentes con el registro editorial.
- Seis fichas: estructura de resúmenes, mapas, cuadros, esquemas y rangos de páginas válidos.
- Navegador: ingreso con el código de la entrega, examen de módulo corregido 4/4,
  registro del resultado, lectura extensa, escritura y puntuación parcial de
  mecanografía, Biblioteca y cuadro integrador. El pegado en mecanografía se rechazó.
- Presentación, términos, privacidad y fuentes inspeccionados; sin errores de consola observados.
- Empaquetado público probado bajo un prefijo de repositorio; un solo CSS compilado.
- ZIP privado verificado con su propio intérprete, código y base inicialmente limpia.

Las pruebas de integración utilizan datos aislados. Los resultados de la copia
local de revisión no se incluyen en la base limpia entregada al amigo.

## Límites y pendientes

- El servidor actual es local y no está preparado para exposición a Internet.
- GitHub Pages publica la presentación. Falta conectar un backend externo para
  ofrecer el campus protegido en línea.
- Los exámenes siguen siendo demostrativos: cuatro preguntas por módulo y veinte
  en el integrador. El banco completo de veinte/cincuenta no está implementado.
- Inscripciones y pagos siguen sin habilitarse. Términos y privacidad son borradores
  pendientes de completar con la operación y el responsable reales.
- La validación editorial comprueba integridad y referencias; no constituye una
  certificación jurídica de vigencia de todas las normas citadas en los PDF.
- No se ejecutó el workflow en GitHub ni se hizo una prueba real en otros equipos,
  navegadores o teléfonos. El intérprete portátil se probó en esta computadora Windows.
- Entregar el ZIP privado da acceso a sus archivos desde el disco; está destinado
  a una persona de confianza y no protege comercialmente una copia completa.

No se afirma invulnerabilidad ni conformidad legal o de accesibilidad certificada.
