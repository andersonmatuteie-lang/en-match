-- EN-MATCH · Fase 1: cuentas, CV y análisis. Pégalo en Supabase → SQL Editor → Run.

create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('estudiante','rrhh','ong','cursos','admin')),
  nombre text not null,
  consentimiento_cv boolean not null default false,
  creado_en timestamptz not null default now()
);

-- Al registrarse se crea el perfil. Nadie puede elegir 'admin' desde el formulario.
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text := coalesce(new.raw_user_meta_data->>'rol','estudiante');
begin
  if r not in ('estudiante','rrhh','ong','cursos') then r := 'estudiante'; end if;
  insert into public.perfiles (id, rol, nombre)
  values (new.id, r, left(coalesce(nullif(trim(new.raw_user_meta_data->>'nombre'),''), split_part(new.email,'@',1)), 80));
  return new;
end $$;
drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users for each row execute function public.crear_perfil();

alter table public.perfiles enable row level security;
drop policy if exists perfiles_ver on public.perfiles;
create policy perfiles_ver on public.perfiles for select using (id = auth.uid());
drop policy if exists perfiles_editar on public.perfiles;
create policy perfiles_editar on public.perfiles for update using (id = auth.uid()) with check (id = auth.uid());
-- Solo estas columnas se pueden editar desde el navegador (el rol no).
revoke update on public.perfiles from authenticated, anon;
grant update (nombre, consentimiento_cv) on public.perfiles to authenticated;

-- Resultado del análisis: lo escribe solo la función del servidor, así nadie puede falsear su puntaje.
create table if not exists public.analisis_cv (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cv_path text not null,
  extraccion jsonb not null,
  rubro_objetivo text not null,
  busca text[] not null default '{}',
  puntajes jsonb not null,
  analizado_en timestamptz not null default now()
);
alter table public.analisis_cv enable row level security;
drop policy if exists analisis_ver on public.analisis_cv;
create policy analisis_ver on public.analisis_cv for select using (user_id = auth.uid());
drop policy if exists analisis_borrar on public.analisis_cv;
create policy analisis_borrar on public.analisis_cv for delete using (user_id = auth.uid());

create table if not exists public.analisis_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now()
);
alter table public.analisis_log enable row level security; -- sin políticas: solo el servidor

-- CV privados: cada persona solo ve su carpeta. Solo PDF de hasta 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cv','cv', false, 5242880, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['application/pdf'];

drop policy if exists cv_subir on storage.objects;
create policy cv_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'cv' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists cv_actualizar on storage.objects;
create policy cv_actualizar on storage.objects for update to authenticated
  using (bucket_id = 'cv' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists cv_ver on storage.objects;
create policy cv_ver on storage.objects for select to authenticated
  using (bucket_id = 'cv' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists cv_borrar on storage.objects;
create policy cv_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'cv' and (storage.foldername(name))[1] = auth.uid()::text);
