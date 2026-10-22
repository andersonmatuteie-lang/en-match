# EN-MATCH · instrucciones para Claude

Prototipo web de EN-MATCH (Laboratorio de Emprendimientos 2026, EQUIPU-PUCP): plataforma que conecta a estudiantes y recién egresados con su primera práctica.

## Cómo está hecho
- Todo vive en un solo archivo: `index.html` (HTML + CSS + JavaScript, sin dependencias ni compilación).
- Se publica con GitHub Pages desde la rama `main`: https://andersonmatuteie-lang.github.io/en-match/
- Capas: portada con elección de perfil → inicio de sesión (acepta cualquier correo y contraseña) → panel del perfil.
- Perfiles: `estudiante`, `rrhh` (Empresa), `ong`, `cursos` (Empresa de cursos), `admin`. Cada panel es una función en el objeto `V`; los datos de ejemplo están en `S`, `ME` y `L` (logos ficticios).

## Reglas
- Escribe todo el texto de la interfaz en español (Perú), con tono claro y directo.
- Mantén el diseño visual: colores definidos en `:root`, tipografías Poppins y DM Sans, tarjetas e íconos existentes.
- No inventes cifras ni empresas nuevas sin que se pida; las empresas, ONGs y logos son ficticios.
- La página debe funcionar en celular (desde 390 px de ancho) sin desplazamiento horizontal.
- Antes de terminar, abre la página en un navegador y revisa que no haya errores en la consola.
