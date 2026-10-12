-- PinkyPrecios · Actualización 2: cuentas de usuario y mensajes de contacto
-- Pegalo en Supabase → SQL Editor → New query → Run. Se puede correr más de una vez.

-- Datos de cada usuario (su lista, alertas, vistos y búsquedas), uno por cuenta
create table if not exists datos_usuario (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  lista       jsonb not null default '[]'::jsonb,
  alertas     jsonb not null default '[]'::jsonb,
  vistos      jsonb not null default '[]'::jsonb,
  recientes   jsonb not null default '[]'::jsonb,
  actualizado timestamptz not null default now()
);

-- Cada persona solo puede ver y cambiar SUS datos (seguridad a nivel de fila)
alter table datos_usuario enable row level security;
drop policy if exists "ver mis datos" on datos_usuario;
drop policy if exists "crear mis datos" on datos_usuario;
drop policy if exists "cambiar mis datos" on datos_usuario;
create policy "ver mis datos"     on datos_usuario for select to authenticated using (auth.uid() = user_id);
create policy "crear mis datos"   on datos_usuario for insert to authenticated with check (auth.uid() = user_id);
create policy "cambiar mis datos" on datos_usuario for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on datos_usuario to authenticated;

-- Mensajes del formulario de contacto (solo los leen las funciones de Netlify)
create table if not exists mensajes (
  id       bigint generated always as identity primary key,
  nombre   text,
  correo   text,
  asunto   text,
  mensaje  text not null,
  creado   timestamptz not null default now(),
  leido    boolean not null default false
);
alter table mensajes enable row level security;

-- Las alertas pueden quedar ligadas a una cuenta
alter table alertas add column if not exists user_id uuid;
