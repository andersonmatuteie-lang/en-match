-- EN-MATCH · Fases 2 a 4: ofertas, match, postulaciones, retos y verificación por RUC.
-- Ejecútalo DESPUÉS de schema.sql (Supabase → SQL Editor → Run). Se puede volver a ejecutar sin problema.

-- ===== RUC y verificación de organizaciones =====
alter table public.perfiles add column if not exists ruc text;
alter table public.perfiles add column if not exists verificada boolean not null default false;

-- Valida el formato y el dígito verificador del RUC peruano (no confirma que exista en SUNAT).
create or replace function public.ruc_valido(r text) returns boolean language plpgsql immutable as $$
declare w int[] := array[5,4,3,2,7,6,5,4,3,2]; s int := 0; d int; i int;
begin
  if r is null or r !~ '^[0-9]{11}$' then return false; end if;
  if substr(r,1,2) not in ('10','15','17','20') then return false; end if;
  for i in 1..10 loop s := s + substr(r,i,1)::int * w[i]; end loop;
  d := 11 - (s % 11);
  if d = 10 then d := 0; elsif d = 11 then d := 1; end if;
  return d = substr(r,11,1)::int;
end $$;

create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text := coalesce(new.raw_user_meta_data->>'rol','estudiante');
        ruc_in text := btrim(coalesce(new.raw_user_meta_data->>'ruc',''));
begin
  if r not in ('estudiante','rrhh','ong','cursos') then r := 'estudiante'; end if;
  insert into public.perfiles (id, rol, nombre, ruc)
  values (new.id, r,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'nombre'),''), split_part(new.email,'@',1)), 80),
    case when r in ('rrhh','ong','cursos') and public.ruc_valido(ruc_in) then ruc_in else null end);
  return new;
end $$;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin') $$;

drop policy if exists perfiles_ver on public.perfiles;
create policy perfiles_ver on public.perfiles for select using (id = auth.uid() or public.es_admin());

-- ===== Ofertas (prácticas, cursos y voluntariados) =====
-- Las crea solo el servidor (función publicar-oferta), que extrae los requisitos con IA.
create table if not exists public.ofertas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references auth.users(id) on delete cascade,
  org_nombre text not null,
  tipo text not null check (tipo in ('practica','curso','voluntariado')),
  titulo text not null check (length(titulo) between 5 and 120),
  descripcion text not null check (length(descripcion) between 40 and 4000),
  rubro text,
  requisitos jsonb not null default '{}'::jsonb,
  estado text not null default 'pendiente' check (estado in ('activa','pendiente','cerrada')),
  tiene_reto boolean not null default false,
  creado_en timestamptz not null default now()
);
create index if not exists ofertas_feed on public.ofertas (tipo, estado, creado_en desc);
create index if not exists ofertas_org on public.ofertas (org_id);

-- ===== Postulaciones (interés del estudiante + decisión de la organización) =====
create table if not exists public.postulaciones (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references public.ofertas(id) on delete cascade,
  estudiante_id uuid not null references auth.users(id) on delete cascade,
  estado text not null default 'interesado'
    check (estado in ('interesado','omitido','reto_aprobado','reto_no_aprobado','entrevista','descartado')),
  motivo text check (motivo is null or length(motivo) <= 300),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (oferta_id, estudiante_id)
);
create index if not exists postulaciones_est on public.postulaciones (estudiante_id);
create index if not exists postulaciones_of on public.postulaciones (oferta_id);

create or replace function public.tocar_actualizado() returns trigger language plpgsql as $$
begin new.actualizado_en := now(); return new; end $$;
drop trigger if exists postulaciones_tocar on public.postulaciones;
create trigger postulaciones_tocar before update on public.postulaciones for each row execute function public.tocar_actualizado();

-- Funciones auxiliares (security definer) para que las políticas de ofertas y postulaciones
-- no se llamen entre sí (Postgres lo rechaza por recursión infinita).
create or replace function public.es_dueno_oferta(p_oferta uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.ofertas where id = p_oferta and org_id = auth.uid()) $$;
create or replace function public.oferta_activa(p_oferta uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.ofertas where id = p_oferta and estado = 'activa') $$;

alter table public.ofertas enable row level security;
drop policy if exists ofertas_ver on public.ofertas;
create policy ofertas_ver on public.ofertas for select using (
  estado = 'activa' or org_id = auth.uid() or public.es_admin()
  or exists (select 1 from public.postulaciones p where p.oferta_id = ofertas.id and p.estudiante_id = auth.uid())
);
drop policy if exists ofertas_cerrar on public.ofertas;
create policy ofertas_cerrar on public.ofertas for update using (org_id = auth.uid()) with check (org_id = auth.uid());
drop policy if exists ofertas_borrar on public.ofertas;
create policy ofertas_borrar on public.ofertas for delete using (org_id = auth.uid());
revoke update on public.ofertas from authenticated, anon;
grant update (estado) on public.ofertas to authenticated;
-- Una organización no verificada no puede reactivar una oferta pendiente por su cuenta.
create or replace function public.ofertas_proteger_estado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.es_admin() and new.estado = 'activa' and old.estado <> 'activa'
     and not exists (select 1 from public.perfiles where id = new.org_id and verificada) then
    raise exception 'Tu organización aún no está verificada';
  end if;
  return new;
end $$;
drop trigger if exists ofertas_estado on public.ofertas;
create trigger ofertas_estado before update on public.ofertas for each row execute function public.ofertas_proteger_estado();

alter table public.postulaciones enable row level security;
drop policy if exists post_ver_estudiante on public.postulaciones;
create policy post_ver_estudiante on public.postulaciones for select using (estudiante_id = auth.uid());
drop policy if exists post_ver_org on public.postulaciones;
create policy post_ver_org on public.postulaciones for select using (
  estado <> 'omitido' and public.es_dueno_oferta(oferta_id)
);
drop policy if exists post_crear on public.postulaciones;
create policy post_crear on public.postulaciones for insert with check (
  estudiante_id = auth.uid() and estado in ('interesado','omitido') and motivo is null
  and public.oferta_activa(oferta_id)
  and exists (select 1 from public.perfiles p where p.id = auth.uid() and p.rol = 'estudiante')
  and exists (select 1 from public.analisis_cv a where a.user_id = auth.uid())
);
drop policy if exists post_editar_estudiante on public.postulaciones;
create policy post_editar_estudiante on public.postulaciones for update
  using (estudiante_id = auth.uid() and estado in ('interesado','omitido'))
  with check (estudiante_id = auth.uid() and estado in ('interesado','omitido') and motivo is null);
-- La organización decide: pasar a entrevista, o descartar (el motivo es obligatorio: siempre hay respuesta).
drop policy if exists post_decidir_org on public.postulaciones;
create policy post_decidir_org on public.postulaciones for update
  using (estado <> 'omitido' and public.es_dueno_oferta(oferta_id))
  with check (
    estado in ('entrevista','descartado')
    and (estado = 'entrevista' or length(btrim(coalesce(motivo,''))) > 0)
    and public.es_dueno_oferta(oferta_id)
  );
revoke update on public.postulaciones from authenticated, anon;
grant update (estado, motivo) on public.postulaciones to authenticated;

-- ===== Retos =====
create table if not exists public.retos (
  oferta_id uuid primary key references public.ofertas(id) on delete cascade,
  preguntas jsonb not null check (
    jsonb_typeof(preguntas) = 'array' and jsonb_array_length(preguntas) between 1 and 8 and pg_column_size(preguntas) < 20000),
  umbral int not null default 60 check (umbral between 1 and 100),
  cupos int not null default 5 check (cupos between 1 and 50),
  actualizado_en timestamptz not null default now()
);
alter table public.retos enable row level security;
drop policy if exists retos_org on public.retos;
create policy retos_org on public.retos for all
  using (public.es_dueno_oferta(oferta_id))
  with check (public.es_dueno_oferta(oferta_id));
-- Los estudiantes NO leen esta tabla (trae las respuestas correctas): reciben las preguntas por la función reto-obtener.

create or replace function public.marcar_reto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then update public.ofertas set tiene_reto = false where id = old.oferta_id;
  else update public.ofertas set tiene_reto = true where id = new.oferta_id; end if;
  return null;
end $$;
drop trigger if exists retos_marca on public.retos;
create trigger retos_marca after insert or delete on public.retos for each row execute function public.marcar_reto();

-- Resultado del reto: solo lo escribe el servidor. Un intento por estudiante.
create table if not exists public.reto_resultados (
  oferta_id uuid not null references public.ofertas(id) on delete cascade,
  estudiante_id uuid not null references auth.users(id) on delete cascade,
  puntaje int not null check (puntaje between 0 and 100),
  aprobado boolean not null,
  creado_en timestamptz not null default now(),
  primary key (oferta_id, estudiante_id)
);
alter table public.reto_resultados enable row level security;
drop policy if exists resultados_ver on public.reto_resultados;
create policy resultados_ver on public.reto_resultados for select using (
  estudiante_id = auth.uid()
  or public.es_dueno_oferta(oferta_id)
);

-- Registro de usos de la IA (límite diario por persona y función).
create table if not exists public.ia_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  funcion text not null,
  creado_en timestamptz not null default now()
);
create index if not exists ia_log_uso on public.ia_log (user_id, funcion, creado_en desc);
alter table public.ia_log enable row level security; -- sin políticas: solo el servidor

-- ===== Administración: verificar organizaciones =====
create or replace function public.verificar_org(p_id uuid, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'No autorizado'; end if;
  update public.perfiles set verificada = p_ok where id = p_id and rol in ('rrhh','ong','cursos');
  if p_ok then update public.ofertas set estado = 'activa' where org_id = p_id and estado = 'pendiente';
  else update public.ofertas set estado = 'pendiente' where org_id = p_id and estado = 'activa'; end if;
end $$;
revoke all on function public.verificar_org(uuid, boolean) from public, anon;
grant execute on function public.verificar_org(uuid, boolean) to authenticated;
