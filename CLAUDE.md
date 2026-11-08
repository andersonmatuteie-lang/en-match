# EN-MATCH · instrucciones para Claude

Prototipo web de EN-MATCH (Laboratorio de Emprendimientos 2026, EQUIPU-PUCP): plataforma que conecta a estudiantes y recién egresados con su primera práctica.

## Cómo está hecho
- Todo vive en un solo archivo: `index.html` (HTML + CSS + JavaScript, sin dependencias ni compilación).
- Se publica con GitHub Pages desde la rama `main`: https://andersonmatuteie-lang.github.io/en-match/
- Capas: portada con elección de perfil → inicio de sesión (acepta cualquier correo y contraseña) → onboarding del estudiante → panel del perfil.
- Perfiles: `estudiante`, `rrhh` (Empresa), `ong`, `cursos` (Empresa de cursos), `admin`. Cada pantalla es una función `V[perfil][pantalla]`; el menú de cada perfil está en `NAV`.
- Datos: catálogos fijos en `OFERTAS`, `RETOS`, `CURSOS`, `CANDS` y `L` (logos ficticios). Todo lo que hace el usuario se guarda en `DB` (localStorage, clave `enmatch-db-v3`) y se comparte entre perfiles en el mismo navegador.
- Motores: `matchOf` (match estudiante ↔ oferta), `parseQuery` + `searchCands` (buscador en lenguaje natural), `puntaje` (retos 70 %, constancia 20 %, feedback 10 %), `cvScore`, `evalTexto` y `analizar` (evaluación de retos y entrevista, simulada en el navegador).
- Entrevista por videollamada: `openVcall` abre la cámara y el micrófono; `vcTick` mide voz (volumen, tono, silencios) e imagen (rostro, encuadre, movimiento, luz); `vcScore` arma el puntaje (contenido 50 %, lenguaje corporal 20 %, voz 15 %, ritmo 15 %) y el índice de calma. No graba ni envía audio o video.
- Buscador: `liveSearch` actualiza los filtros y resultados mientras se escribe; `searchRes` sugiere ampliar la distancia cuando nadie cumple.

## Reglas
- Escribe todo el texto de la interfaz en español (Perú), con tono claro y directo.
- Mantén el diseño visual: colores definidos en `:root`, tipografías Poppins y DM Sans, tarjetas e íconos existentes.
- No inventes cifras ni empresas nuevas sin que se pida; las empresas, ONGs y logos son ficticios.
- La página debe funcionar en celular (desde 390 px de ancho) sin desplazamiento horizontal.
- No conectes APIs con claves en el código: la página es pública.
- Antes de terminar, abre la página en un navegador y revisa que no haya errores en la consola.
