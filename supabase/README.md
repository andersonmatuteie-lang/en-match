# EN-MATCH · Servidor (Fase 1: cuentas + CV + puntaje con IA)

Mientras `config.js` esté vacío, la página funciona en **modo demostración** (datos de ejemplo).
Para activar cuentas reales y el análisis de CV con IA, sigue estos pasos una sola vez.

## 1. Crear el proyecto
1. Entra a https://supabase.com → **New project** (el plan gratuito alcanza para el piloto).
2. Cuando termine de crearse, abre **SQL Editor → New query**, pega todo `supabase/schema.sql` y pulsa **Run**.
   Esto crea las tablas, las reglas de seguridad (cada persona solo ve lo suyo) y el almacén privado de CV.

## 2. Autenticación
- **Authentication → Providers → Email**: déjalo activo.
  - Para probar rápido puedes desactivar *Confirm email*. Para el piloto real, déjalo activo.
- **Authentication → URL Configuration → Site URL**: pon la dirección de tu página (la de GitHub Pages).

## 3. Activar la IA (clave de Anthropic)
La clave **nunca** va en el HTML ni en el repositorio. Se guarda como secreto en el servidor:

```bash
npm i -g supabase
supabase login
supabase link --project-ref TU_REF            # el REF está en Settings → General
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...        # tu clave de console.anthropic.com
supabase secrets set ALLOWED_ORIGIN=https://TU-USUARIO.github.io   # solo tu página puede llamar a la función
supabase functions deploy analizar-cv
```

Opcional: `supabase secrets set CLAUDE_MODEL=<id del modelo>` para cambiar de modelo.

## 4. Conectar la página
En **Settings → API** copia **Project URL** y la clave **anon public**, y pégalas en `config.js`:

```js
window.ENMATCH_CONFIG = { SUPABASE_URL: 'https://xxxx.supabase.co', SUPABASE_ANON_KEY: 'eyJ...' };
```
La clave *anon* es pública por diseño. **No pegues aquí la `service_role` ni la de Anthropic.**
Sube `config.js` a GitHub junto con el resto.

Para presentar con datos de ejemplo aunque esté conectado, abre la página con `?demo` al final de la dirección.

## 5. Crear un administrador
Nadie puede registrarse como administrador desde el formulario. Registra la cuenta normal y luego, en el SQL Editor:
```sql
update public.perfiles set rol = 'admin' where id = (select id from auth.users where email = 'tu@correo.com');
```

## Cómo se calcula el puntaje
- La IA **solo extrae** datos del CV (carrera, ciclo, habilidades, herramientas, idiomas, experiencia).
- El puntaje lo calcula una fórmula fija en `functions/analizar-cv/score.ts`: habilidades 35, herramientas 20, experiencia 25, idiomas 10, formación 10.
- No se extraen ni usan género, edad, nacionalidad, región ni universidad.
- Pruebas de la fórmula: `node --experimental-strip-types tests/score.test.mjs`

## Seguridad incluida
- CV en un almacén privado: cada persona solo accede a su carpeta; solo PDF de hasta 5 MB.
- El puntaje lo escribe solo el servidor, así nadie puede falsearlo desde el navegador.
- Máximo 5 análisis por persona cada 24 h (controla el costo de la IA).
- El texto del CV se trata como dato: si contiene órdenes dirigidas a la IA, se ignoran; y todo lo extraído se valida y se escapa antes de mostrarse.
- La persona puede borrar su CV y su análisis desde "Mi CV y puntaje".

## Pendiente antes de recibir usuarios reales
- Política de privacidad y términos revisados por un abogado (Ley 29733, protección de datos personales, Perú).
- Probar el análisis con CV reales y ajustar los rubros de `score.ts`.
