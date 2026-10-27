# Biblioteca privada

El campus incorpora una pestaña Biblioteca con seis fichas: cinco módulos y un repaso general. Cada ficha contiene resumen por temas, mapa conceptual semántico, cuadro comparativo y esquema de repaso. Los cinco módulos permiten abrir su PDF original; el integrador enlaza los cinco originales.

Los contenidos se leen exclusivamente desde la carpeta privada de ejecución, junto a la base local:

```
%USERPROFILE%/.codex/private/MetodoJudicialPrueba/
  campus.sqlite3
  library/
    library.json
    documents/
      module-1.pdf
      module-2.pdf
      module-3.pdf
      module-4.pdf
      module-5.pdf
```

El archivo editorial y los documentos se prepararon en esta computadora a partir de los cinco PDF aportados. No están incluidos en el repositorio ni en el artefacto de GitHub Pages. Una instalación nueva del código sin esa carpeta devuelve «Biblioteca no disponible»; no genera material de ejemplo que pueda confundirse con el real.

`backend/library.py` lee el catálogo; `/api/library`, `/api/library/modules/{id}` y `/api/library/books/{id}.pdf` validan la sesión en el servidor. Las respuestas no se guardan en caché. El JavaScript usa nodos de texto para presentar el contenido y no almacena fichas ni códigos en localStorage. La numeración de fuentes corresponde a la posición de página en el PDF, incluida la portada.

Las síntesis son material de apoyo independiente. Las lecturas externas que los documentos indican no se presentan como si estuvieran incluidas. La ficha del módulo 2 señala el contexto de actualización de justicia penal juvenil del documento aportado; no afirma una verificación independiente de vigencia normativa.

Para migrar, transferir `library/` al almacenamiento privado del futuro backend por un canal privado, separado del repositorio público. La entrega `output/MetodoJudicial-Para-Amigo.zip` es privada e incluye los materiales: **no subirla a GitHub ni a Pages**. Configurar la protección del backend antes de ofrecer acceso comercial. El servidor actual está limitado a pruebas locales.

La caché de fichas se limita a memoria del servidor y se renueva al cambiar el archivo. No se guardan materiales en el almacenamiento persistente del navegador.
