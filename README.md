# Método Judicial

Preparación independiente para el concurso de ingreso al Poder Judicial de Mendoza.
Nombre provisional. Frontend HTML/CSS/JavaScript y backend Python 3.10 o posterior,
sin dependencias externas para ejecutar el campus.

## Estructura

- `frontend/public/`: presentación pública y recursos para GitHub Pages.
- `frontend/campus/`: interfaz privada, con módulos por herramienta.
- `frontend/access.html`: pantalla de ingreso.
- `backend/`: dominio, acceso, prácticas, biblioteca, almacenamiento y HTTP.
- `scripts/`: generación de páginas, empaquetado y arranque.
- `tests/`: dominio, arquitectura, seguridad y publicación.
- `docs/ARQUITECTURA.md`: modelo del dominio, reglas y fronteras.
- `docs/SISTEMA-LICENCIAS.md`: sistema de licencias, panel administrativo y archivo oculto de credenciales.

Los PDF, fichas completas, códigos y datos de estudiantes se guardan fuera del
repositorio, en `%USERPROFILE%/.codex/private/MetodoJudicialPrueba/`.

## Probar en esta computadora

Ejecutar `node scripts/iniciar.js` (prepara el acceso y arranca el servidor), o `node backend/app.js --init` y luego
`node backend/app.js --port 4173`. Abrir `http://127.0.0.1:4173/ingreso`.
El código local está en `codigo-prueba.txt`, dentro de la carpeta privada.
No se pide usuario ni contraseña adicional. Crear otro acceso:
`python backend/app.py --create-code estudiante_001`; revocar:
`python backend/app.py --revoke-code estudiante_001`. La etiqueta es interna.

El campus incluye Biblioteca con cinco módulos y repaso general, PDF originales,
resúmenes, mapas conceptuales, cuadros y esquemas. Los exámenes son demostrativos:
4 preguntas por módulo y 20 en el integrador. El banco definitivo 20/50 está pendiente.
Lectura y mecanografía sortean textos originales de más de 350 palabras sin repetir
hasta recorrer los cinco; cada lectura tiene cuatro preguntas propias. La rotación
se conserva por acceso. Puntuación y tiempo se calculan en el servidor.

## Pasar una prueba privada a un amigo

El ZIP `output/MetodoJudicial-Para-Amigo.zip` es una entrega privada para Windows
64 bits. Extraer todo y abrir `INICIAR.cmd`; incluye un intérprete Python portátil.
El código está en `codigo-amigo.txt` y en `output/credencial-amigo.txt`.
La copia contiene una base nueva, sin resultados ni sesiones de otros accesos.
No publicar este ZIP: incluye materiales privados y un código. Quien recibe la copia
completa puede acceder a sus archivos desde el disco; se entrega a una persona de confianza.

Para reconstruirla: `python scripts/package_friend.py --runtime RUTA_PYTHON_WINDOWS_312`.
La ruta debe contener el intérprete, DLL, biblioteca estándar y licencia originales.
Verificar la entrega con `python scripts/verify_friend.py`.

## Subir el código a GitHub

Ejecutar `python scripts/package_repository.py`. Extraer `output/repositorio-github.zip`
y subir su contenido, incluida `.github/`, a la raíz del repositorio. No subir `output/`,
`dist/`, bases, códigos ni PDF. Configurar Pages con Source: GitHub Actions.
El workflow genera los HTML, ejecuta las pruebas y publica solo el contenido público
permitido por `scripts/package_pages.py`. No se ha configurado un remoto ni publicado.

GitHub Pages sirve la presentación. El campus protegido necesita un backend externo;
su conexión sigue pendiente. `frontend/public/js/config.js` mantiene `campusUrl` vacío.
El servidor local escucha exclusivamente en 127.0.0.1 y no debe exponerse en Internet.
Ver `docs/GITHUB-PAGES.md`, `docs/CAMPUS-PRUEBA.md` y `docs/BIBLIOTECA.md`.

## Editar y verificar

Contenido público: `scripts/build_pages.py`; términos y privacidad:
`scripts/legal_content.py`. Regenerar con `python scripts/build_pages.py`.
Son borradores: no hay pagos ni inscripciones habilitadas.

Pruebas: `python -m unittest discover -s tests -v`.
La verificación actual se documenta en `docs/VERIFICACION.md`.
