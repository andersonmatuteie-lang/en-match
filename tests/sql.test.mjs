// Prueba los esquemas SQL en un Postgres real (PGlite) con las reglas de seguridad (RLS).
// Simula auth.uid() de Supabase con la variable request.jwt.claim.sub.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const dir = new URL('../supabase/', import.meta.url)
const db = new PGlite()

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  grant select on auth.users to authenticated;
  grant all on storage.objects, storage.buckets to authenticated;
`)
for (const f of ['schema.sql', 'schema_fase2.sql', 'schema.sql', 'schema_fase2.sql']) await db.exec(readFileSync(new URL(f, dir), 'utf8'))
console.log('OK: schema.sql y schema_fase2.sql se ejecutan (y se pueden repetir)')

const U = { est: '11111111-1111-1111-1111-111111111111', est2: '22222222-2222-2222-2222-222222222222', sinCv: '33333333-3333-3333-3333-333333333333',
  org: '44444444-4444-4444-4444-444444444444', org2: '55555555-5555-5555-5555-555555555555', adm: '66666666-6666-6666-6666-666666666666' }
const meta = (rol, extra = {}) => JSON.stringify({ rol, nombre: 'Nombre ' + rol, ...extra })
await db.exec(`
  insert into auth.users (id,email,raw_user_meta_data) values
   ('${U.est}','e1@x.pe','${meta('estudiante')}'),('${U.est2}','e2@x.pe','${meta('estudiante')}'),('${U.sinCv}','e3@x.pe','${meta('estudiante')}'),
   ('${U.org}','o1@x.pe','${meta('rrhh', { ruc: '20131312955' })}'),('${U.org2}','o2@x.pe','${meta('rrhh', { ruc: '12345' })}'),
   ('${U.adm}','a@x.pe','${meta('admin')}');
  update public.perfiles set rol='admin' where id='${U.adm}';
`)

// Ayudante: ejecuta como un usuario (rol authenticated) o como servidor (superusuario).
async function como(uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid ?? ''}',false);` + (uid ? ' set role authenticated;' : ''))
  try { return { ok: true, rows: (await db.query(sql, params)).rows } }
  catch (e) { return { ok: false, err: e.message } }
  finally { await db.exec('reset role') }
}
// Ejecuta como el servidor (service_role): sin usuario.
const srv = sql => db.exec("reset role; select set_config('request.jwt.claim.sub','',false);" + sql)
const ok = async (...a) => { const r = await como(...a); assert.ok(r.ok, 'debía funcionar: ' + a[1] + ' → ' + r.err); return r.rows }
const falla = async (msg, ...a) => { const r = await como(...a); assert.ok(!r.ok && r.rows === undefined, 'debía fallar: ' + msg); }
// Un UPDATE/DELETE bloqueado por RLS no falla: afecta 0 filas.
const afecta = async (uid, sql, n, msg) => { const r = await como(uid, sql + ' returning 1'); assert.ok(r.ok, r.err); assert.equal(r.rows.length, n, msg) }

// --- Perfiles y trigger
assert.equal((await ok(null, `select rol from public.perfiles where id='${U.adm}'`))[0].rol, 'admin')
await db.exec(`insert into auth.users (id,email,raw_user_meta_data) values ('77777777-7777-7777-7777-777777777777','x@x.pe','{"rol":"admin","nombre":"Intruso"}')`)
assert.equal((await ok(null, `select rol from public.perfiles where id='77777777-7777-7777-7777-777777777777'`))[0].rol, 'estudiante', 'nadie se registra como admin')
assert.equal((await ok(null, `select ruc from public.perfiles where id='${U.org}'`))[0].ruc, '20131312955')
assert.equal((await ok(null, `select ruc from public.perfiles where id='${U.org2}'`))[0].ruc, null, 'RUC inválido no se guarda')
assert.deepEqual((await ok(null, `select public.ruc_valido('20131312955') a, public.ruc_valido('20601234571') b, public.ruc_valido(null) c, public.ruc_valido('30131312955') d`))[0], { a: true, b: false, c: false, d: false })
// un usuario no puede subirse de rol ni verificarse solo
await falla('cambiar su rol', U.est, `update public.perfiles set rol='admin' where id='${U.est}'`)
await falla('auto-verificarse', U.org, `update public.perfiles set verificada=true where id='${U.org}'`)
// cada quien ve solo su perfil; el admin ve todos
assert.equal((await ok(U.est, `select id from public.perfiles`)).length, 1)
assert.ok((await ok(U.adm, `select id from public.perfiles`)).length >= 6)

// --- Datos base (los escribe el servidor)
await db.exec(`
  insert into public.analisis_cv (user_id,cv_path,extraccion,rubro_objetivo,puntajes) values
   ('${U.est}','x','{}','costos_finanzas','{}'),('${U.est2}','x','{}','costos_finanzas','{}');
  insert into public.ofertas (id,org_id,org_nombre,tipo,titulo,descripcion,estado) values
   ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','${U.org}','Org 1','practica','Practicante de costos','${'x'.repeat(50)}','activa'),
   ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','${U.org}','Org 1','practica','Oferta pendiente','${'x'.repeat(50)}','pendiente'),
   ('cccccccc-cccc-cccc-cccc-cccccccccccc','${U.org2}','Org 2','curso','Curso de Excel','${'x'.repeat(50)}','activa');
`)
const OA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', OP = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', OC = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

// --- Ofertas: visibilidad (y que no haya recursión entre políticas)
assert.deepEqual((await ok(U.est, `select id from public.ofertas order by id`)).map(r => r.id), [OA, OC], 'el estudiante solo ve ofertas activas')
assert.equal((await ok(U.org, `select id from public.ofertas`)).length, 3, 'la org ve las suyas (incl. pendiente) y las activas de otros')
await falla('crear oferta desde el navegador', U.org, `insert into public.ofertas (org_id,org_nombre,tipo,titulo,descripcion) values ('${U.org}','x','practica','Título válido','${'y'.repeat(50)}')`)
await afecta(U.est, `update public.ofertas set estado='cerrada' where id='${OA}'`, 0, 'un estudiante no cierra ofertas ajenas')
await falla('activar una oferta pendiente sin estar verificada', U.org, `update public.ofertas set estado='activa' where id='${OP}'`)
await afecta(U.org, `update public.ofertas set estado='cerrada' where id='${OA}'`, 1, 'la org cierra la suya')
await falla('reabrir sin estar verificada', U.org, `update public.ofertas set estado='activa' where id='${OA}'`)
await srv(`update public.ofertas set estado='activa' where id='${OA}'`) // el servidor la restaura

// --- Postulaciones: lo que puede hacer el estudiante
await ok(U.est, `insert into public.postulaciones (oferta_id,estudiante_id,estado) values ('${OA}','${U.est}','interesado')`)
await falla('postular dos veces', U.est, `insert into public.postulaciones (oferta_id,estudiante_id,estado) values ('${OA}','${U.est}','interesado')`)
await falla('postular a nombre de otro', U.est, `insert into public.postulaciones (oferta_id,estudiante_id,estado) values ('${OC}','${U.est2}','interesado')`)
await falla('autoasignarse entrevista', U.est2, `insert into public.postulaciones (oferta_id,estudiante_id,estado) values ('${OA}','${U.est2}','entrevista')`)
await falla('postular a una oferta pendiente', U.est2, `insert into public.postulaciones (oferta_id,estudiante_id,estado) values ('${OP}','${U.est2}','interesado')`)
await falla('postular sin haber analizado el CV', U.sinCv, `insert into public.postulaciones (oferta_id,estudiante_id,estado) values ('${OA}','${U.sinCv}','interesado')`)
await falla('una org no postula', U.org, `insert into public.postulaciones (oferta_id,estudiante_id,estado) values ('${OA}','${U.org}','interesado')`)
await ok(U.est2, `insert into public.postulaciones (oferta_id,estudiante_id,estado) values ('${OA}','${U.est2}','omitido')`)
await falla('el estudiante se da entrevista a sí mismo', U.est, `update public.postulaciones set estado='entrevista' where estudiante_id='${U.est}'`)
await falla('el estudiante escribe un motivo', U.est, `update public.postulaciones set motivo='quiero' where estudiante_id='${U.est}'`)
await afecta(U.est, `update public.postulaciones set estado='omitido' where estudiante_id='${U.est}'`, 1, 'el estudiante puede cambiar de opinión')
await afecta(U.est, `update public.postulaciones set estado='interesado' where estudiante_id='${U.est}'`, 1)
assert.equal((await ok(U.est2, `select id from public.postulaciones`)).length, 1, 'cada estudiante ve solo lo suyo')

// --- Lo que ve y decide la organización
assert.equal((await ok(U.org, `select id from public.postulaciones`)).length, 1, 'la org ve interesados pero NO los omitidos')
assert.equal((await ok(U.org2, `select id from public.postulaciones`)).length, 0, 'otra org no ve candidatos ajenos')
await afecta(U.org2, `update public.postulaciones set estado='entrevista'`, 0, 'otra org no decide sobre candidatos ajenos')
await falla('descartar sin motivo', U.org, `update public.postulaciones set estado='descartado' where estudiante_id='${U.est}'`)
await falla('descartar con motivo vacío', U.org, `update public.postulaciones set estado='descartado', motivo='   ' where estudiante_id='${U.est}'`)
await falla('la org no puede poner estados internos', U.org, `update public.postulaciones set estado='reto_aprobado' where estudiante_id='${U.est}'`)
await falla('la org no puede cambiar el estudiante', U.org, `update public.postulaciones set estudiante_id='${U.est2}' where estudiante_id='${U.est}'`)
await afecta(U.org, `update public.postulaciones set estado='entrevista' where estudiante_id='${U.est}'`, 1, 'pasar a entrevista')
await afecta(U.est, `update public.postulaciones set estado='omitido' where estudiante_id='${U.est}'`, 0, 'tras la decisión, el estudiante ya no puede cambiarla')
await afecta(U.org, `update public.postulaciones set estado='descartado', motivo='Falta inglés intermedio' where estudiante_id='${U.est}'`, 1, 'descartar con motivo')
const m = await ok(U.est, `select estado, motivo from public.postulaciones`)
assert.deepEqual(m[0], { estado: 'descartado', motivo: 'Falta inglés intermedio' }, 'el estudiante ve el motivo')

// --- Retos: las respuestas correctas no se filtran
const preg = JSON.stringify([{ pregunta: '¿Qué es un costo fijo?', opciones: ['a', 'b', 'c', 'd'], correcta: 1 }])
await falla('un estudiante crea un reto', U.est, `insert into public.retos (oferta_id,preguntas) values ('${OA}','${preg}')`)
await falla('otra org crea retos ajenos', U.org2, `insert into public.retos (oferta_id,preguntas) values ('${OA}','${preg}')`)
await ok(U.org, `insert into public.retos (oferta_id,preguntas,umbral,cupos) values ('${OA}','${preg}',60,3)`)
assert.equal((await ok(U.org, `select tiene_reto from public.ofertas where id='${OA}'`))[0].tiene_reto, true, 'la oferta queda marcada con reto')
assert.equal((await ok(U.est, `select tiene_reto from public.ofertas where id='${OA}'`))[0].tiene_reto, true, 'el estudiante sabe que hay reto')
assert.equal((await ok(U.est, `select * from public.retos`)).length, 0, 'el estudiante NO puede leer el reto (trae las respuestas)')
await falla('reto vacío', U.org, `insert into public.retos (oferta_id,preguntas) values ('${OC}','[]')`)
await falla('reto con 9 preguntas', U.org2, `insert into public.retos (oferta_id,preguntas) values ('${OC}','${JSON.stringify(Array(9).fill({}))}')`)
await srv(`insert into public.reto_resultados (oferta_id,estudiante_id,puntaje,aprobado) values ('${OA}','${U.est}',80,true)`)
assert.equal((await ok(U.est, `select puntaje from public.reto_resultados`)).length, 1, 'el estudiante ve su resultado')
assert.equal((await ok(U.est2, `select puntaje from public.reto_resultados`)).length, 0, 'otro estudiante no lo ve')
assert.equal((await ok(U.org, `select puntaje from public.reto_resultados`)).length, 1, 'la org ve resultados de su oferta')
await afecta(U.est, `update public.reto_resultados set puntaje=100`, 0, 'no se puede falsear el resultado del reto')
await falla('insertar un resultado propio', U.est2, `insert into public.reto_resultados (oferta_id,estudiante_id,puntaje,aprobado) values ('${OA}','${U.est2}',100,true)`)
await srv(`delete from public.retos where oferta_id='${OA}'`)
assert.equal((await ok(U.org, `select tiene_reto from public.ofertas where id='${OA}'`))[0].tiene_reto, false, 'borrar el reto lo desmarca')

// --- Análisis de CV y registros de la IA
assert.equal((await ok(U.est2, `select user_id from public.analisis_cv`)).length, 1)
await afecta(U.est, `update public.analisis_cv set puntajes='{"objetivo":{"total":100}}'`, 0, 'no se puede falsear el puntaje del CV')
await falla('leer el registro de la IA', U.est, `select * from public.ia_log`).catch(() => {})
assert.equal((await como(U.est, `select * from public.ia_log`)).rows?.length ?? 0, 0, 'ia_log queda cerrado a los usuarios')

// --- Administración: verificar organizaciones
await falla('un no-admin verifica organizaciones', U.org, `select public.verificar_org('${U.org}', true)`)
await falla('un estudiante verifica organizaciones', U.est, `select public.verificar_org('${U.org}', true)`)
await ok(U.adm, `select public.verificar_org('${U.org}', true)`)
assert.equal((await ok(U.adm, `select verificada from public.perfiles where id='${U.org}'`))[0].verificada, true)
assert.equal((await ok(U.org, `select estado from public.ofertas where id='${OP}'`))[0].estado, 'activa', 'al verificar, sus ofertas pendientes se activan')
await afecta(U.org, `update public.ofertas set estado='cerrada' where id='${OA}'`, 1)
await afecta(U.org, `update public.ofertas set estado='activa' where id='${OA}'`, 1, 'una org verificada sí puede reabrir')
await ok(U.adm, `select public.verificar_org('${U.org}', false)`)
assert.equal((await ok(U.org, `select estado from public.ofertas where id='${OP}'`))[0].estado, 'pendiente', 'al revocar, vuelven a pendiente')
await ok(U.adm, `select public.verificar_org('${U.est}', true)`)
assert.equal((await ok(U.adm, `select verificada from public.perfiles where id='${U.est}'`))[0].verificada, false, 'solo se verifican organizaciones')

console.log('OK: todas las reglas de seguridad (RLS) se comportan como se espera')
