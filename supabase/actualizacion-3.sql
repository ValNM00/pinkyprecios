-- PinkyPrecios · Actualización 3: índice de la canasta básica, reseñas de tiendas y tiendas favoritas
-- Pegalo en Supabase → SQL Editor → New query → Run. Se puede correr más de una vez.

-- Precio diario de cada producto de la canasta básica en cada supermercado
create table if not exists canasta_historial (
  fecha        date not null,
  item         text not null,
  tienda_id    text not null,
  precio       integer not null,   -- normalizado a la presentación de referencia (ej. arroz 1,8 kg)
  precio_real  integer,            -- lo que cuesta el producto elegido
  nombre       text,
  url          text,
  primary key (fecha, item, tienda_id)
);
alter table canasta_historial enable row level security;

-- Reseñas de tiendas: cualquiera las lee, solo quien tiene cuenta escribe (y solo las suyas)
create table if not exists resenas (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tienda_id   text not null,
  estrellas   integer not null check (estrellas between 1 and 5),
  comentario  text check (char_length(comentario) <= 500),
  nombre      text check (char_length(nombre) <= 60),
  creado      timestamptz not null default now(),
  unique (user_id, tienda_id)
);
alter table resenas enable row level security;
drop policy if exists "leer resenas" on resenas;
drop policy if exists "crear mi resena" on resenas;
drop policy if exists "cambiar mi resena" on resenas;
drop policy if exists "borrar mi resena" on resenas;
create policy "leer resenas"      on resenas for select to anon, authenticated using (true);
create policy "crear mi resena"   on resenas for insert to authenticated with check (auth.uid() = user_id);
create policy "cambiar mi resena" on resenas for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "borrar mi resena"  on resenas for delete to authenticated using (auth.uid() = user_id);
grant select on resenas to anon, authenticated;
grant insert, update, delete on resenas to authenticated;

-- Tiendas favoritas de cada cuenta
alter table datos_usuario add column if not exists favoritas jsonb not null default '[]'::jsonb;
