# EN-MATCH · Servidor (cuentas, CV, match, retos y verificación)

Mientras `config.js` esté vacío, la página funciona en **modo demostración** (datos de ejemplo, sin servidor).
Para activar todo lo real, sigue estos pasos una sola vez. Tiempo estimado: 30 a 40 minutos.

## 1. Crear el proyecto y las tablas
1. Entra a https://supabase.com → **New project** (el plan gratuito alcanza para el piloto).
2. **SQL Editor → New query**: pega `supabase/schema.sql` y pulsa **Run**.
3. Otra consulta nueva: pega `supabase/schema_fase2.sql` y pulsa **Run**. (Ambos se pueden volver a ejecutar sin problema.)

## 2. Autenticación
- **Authentication → Providers → Email**: déjalo activo.
  - Para probar rápido puedes desactivar *Confirm email*. Para el piloto real, déjalo activo.
- **Authentication → URL Configuration → Site URL**: la dirección de tu página (la de GitHub Pages).

## 3. Activar la IA y las funciones del servidor
La clave de Anthropic **nunca** va en el HTML ni en el repositorio: se guarda como secreto en el servidor.

Necesitas [Node.js](https://nodejs.org) instalado y este repositorio en tu computadora (en GitHub: **Code → Download ZIP**, y descomprímelo). Abre una terminal **dentro de esa carpeta**. No hace falta instalar nada más: se usa `npx`.

**Windows (PowerShell):**
```powershell
npx supabase login
npx supabase link --project-ref TU_REF                     # el REF está en Settings → General
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...      # tu clave de console.anthropic.com
npx supabase secrets set ALLOWED_ORIGIN=https://TU-USUARIO.github.io
foreach ($f in 'analizar-cv','publicar-oferta','match-feed','match-candidatos','reto-generar','reto-obtener','reto-responder') {
  npx supabase functions deploy $f --use-api
}
```

**Mac o Linux:**
```bash
npx supabase login
npx supabase link --project-ref TU_REF
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase secrets set ALLOWED_ORIGIN=https://TU-USUARIO.github.io
for f in analizar-cv publicar-oferta match-feed match-candidatos reto-generar reto-obtener reto-responder; do
  npx supabase functions deploy $f --use-api
done
```
`ALLOWED_ORIGIN` es solo el dominio (sin ruta ni barra final). `--use-api` evita tener que instalar Docker.
Opcional: `supabase secrets set CLAUDE_MODEL=<id del modelo>` para cambiar de modelo.

## 4. Conectar la página
En **Settings → API** copia **Project URL** y la clave **anon public** en `config.js`:

```js
window.ENMATCH_CONFIG = { SUPABASE_URL: 'https://xxxx.supabase.co', SUPABASE_ANON_KEY: 'eyJ...' };
```
La clave *anon* es pública por diseño. **No pegues aquí la `service_role` ni la de Anthropic.**
Para presentar con datos de ejemplo aunque esté conectado, abre la página con `?demo` al final de la dirección.

## 5. Crear el administrador
Nadie puede registrarse como administrador desde el formulario. Registra una cuenta normal y, en el SQL Editor:
```sql
update public.perfiles set rol = 'admin' where id = (select id from auth.users where email = 'tu@correo.com');
```
Desde ese usuario, **Verificación** muestra las organizaciones con su RUC. Compruébalo en la consulta pública de SUNAT y pulsa **Aprobar**: sus publicaciones se activan.

## Cómo funciona
| Quién | Qué hace |
|---|---|
| **Estudiante** | Sube su CV; la IA extrae sus datos y se calcula su puntaje por rubro. Desliza prácticas, cursos y voluntariados ordenados por match. Si hay reto, lo resuelve. Ve la respuesta de cada organización con su motivo. |
| **Empresa / ONG / Cursos** | Se registra con su RUC. Escribe su oferta en texto libre y la IA extrae los requisitos. Ve a los interesados ordenados por match y reto, con una lista corta sugerida, y decide (el motivo al descartar es obligatorio). |
| **Administrador** | Verifica las organizaciones por RUC. |

- La IA **solo extrae** datos (del CV, de las ofertas y para borradores de retos). Los puntajes y porcentajes los calculan fórmulas fijas en `functions/_shared/score.ts` y `match.ts`.
- No se usan género, edad, región ni universidad para puntuar ni para el match.
- **Lista corta:** con reto, los que superan el mínimo, ordenados por la mezcla de match y reto, hasta llenar los cupos. Sin reto, los 5 mejores por match.
- Los retos son de opción múltiple y se califican en el servidor; el estudiante nunca recibe las respuestas y tiene un solo intento.

## Seguridad incluida
- Reglas de acceso (RLS) en todas las tablas: cada persona solo ve lo suyo. Las organizaciones solo ven a quienes mostraron interés en sus ofertas, y reciben el perfil analizado, no el CV ni el correo.
- CV en un almacén privado (solo PDF de hasta 5 MB). La persona puede borrarlo desde la plataforma.
- Puntajes, resultados de retos y ofertas los escribe solo el servidor; nadie puede falsearlos desde el navegador.
- Límites diarios de uso de la IA por persona (controlan el costo).
- El texto de CV y ofertas se trata como dato (se ignoran órdenes dirigidas a la IA); todo lo extraído se valida y se escapa antes de mostrarse.

## Pruebas
```bash
cd tests && npm install          # una vez
npm test                         # puntaje, match, retos y reglas de seguridad de la base de datos (SQL real con PGlite)
deno test --allow-env --allow-read --import-map=tests/import_map.json tests/functions.test.ts   # funciones del servidor
```

## Pendiente antes de recibir usuarios reales
- **Política de privacidad y términos**: `privacidad.html` es un borrador con campos `[COMPLETAR]`; debe revisarlo un abogado (Ley N.° 29733).
- Probar con CV y ofertas reales y ajustar rubros y pesos en `score.ts` y `match.ts`.
- **Avisos por correo** (por ejemplo "una empresa te respondió"): hoy los avisos son dentro de la plataforma. Requieren un servicio de correo (Resend, SMTP).
- **Validar horas de voluntariado y panel de reportes de admin**: siguen con datos de ejemplo.
- La verificación del RUC es del formato y del dígito verificador, más la revisión manual del administrador; no consulta SUNAT automáticamente.
