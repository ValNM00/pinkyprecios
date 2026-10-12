-- PinkyPrecios: esquema de la base de datos (Supabase / PostgreSQL)
-- Pegalo completo en Supabase → SQL Editor → New query → Run. Se puede correr varias veces sin problema.
-- Ojo: si ya tenías las tablas de la versión de ejemplo, este archivo las borra primero (no tenían datos reales).

drop view  if exists resumen_precios;
drop table if exists precios cascade;
drop table if exists productos cascade;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'historial_precios' and column_name = 'producto_id') then
    drop table historial_precios cascade;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'alertas' and column_name = 'producto_id') then
    drop table alertas cascade;
  end if;
end $$;

create extension if not exists pg_trgm;

-- Estado de cada tienda (lo llenan el diagnóstico y la indexación)
create table if not exists tiendas (
  id                   text primary key,
  nombre               text not null,
  url                  text not null,
  plataforma           text,                 -- la configurada: vtex, shopify, sitemap o auto
  plataforma_detectada text,                 -- la encontrada cuando es "auto"
  moneda_detectada     text,
  estado               text,                 -- ok, pendiente, bloqueado, error, no_disponible
  detalle              text,
  revisado             timestamptz,
  indexado_en          timestamptz,
  productos_indexados  integer default 0,
  cursor               text                  -- para continuar una indexación larga
);

-- Precio actual de cada producto en cada tienda (una fila por producto y tienda)
create table if not exists ofertas (
  id              text primary key,          -- "tienda:sku"
  tienda_id       text not null,
  sku             text,
  ref             text,                      -- dato para volver a consultarlo (sku, handle o URL)
  nombre          text not null,
  marca           text,
  modelo          text,                      -- código de modelo normalizado (ej. 43lm6370psb)
  ean             text,                      -- código de barras sin ceros iniciales
  categoria       text,
  url             text not null,
  imagen          text,
  vendedor        text,                      -- vendedor externo en marketplaces
  precio          integer not null,          -- colones
  antes           integer,                   -- precio "tachado" que anuncia la tienda
  precio_original numeric,                   -- precio en la moneda de la tienda
  moneda          text default 'CRC',
  disponible      boolean not null default true,
  cuotas          jsonb,
  actualizado     timestamptz not null default now(),
  creado          timestamptz not null default now(),
  descuento       numeric generated always as (
                    case when antes is not null and antes > precio then round(1 - precio::numeric / antes, 4) end
                  ) stored
);
create index if not exists ofertas_ean_idx        on ofertas (ean) where ean is not null;
create index if not exists ofertas_modelo_idx     on ofertas (modelo) where modelo is not null;
create index if not exists ofertas_actualizado_idx on ofertas (actualizado);
create index if not exists ofertas_descuento_idx  on ofertas (descuento desc) where descuento is not null;

-- Un precio por día para cada oferta: así se arma el historial real
create table if not exists historial_precios (
  oferta_id  text not null references ofertas(id) on delete cascade,
  fecha      date not null,
  precio     integer not null,
  primary key (oferta_id, fecha)
);
create index if not exists historial_fecha_idx on historial_precios (fecha);

-- Índice de catálogos (Shopify con precio; mapas del sitio solo con URL y texto)
create table if not exists paginas (
  id              text primary key,
  tienda_id       text not null,
  url             text not null,
  texto           text not null,             -- texto normalizado para buscar
  nombre          text,
  marca           text,
  sku             text,
  ref             text,
  ean             text,
  modelo          text,
  imagen          text,
  categoria       text,
  precio          integer,
  antes           integer,
  precio_original numeric,
  moneda          text,
  disponible      boolean,
  actualizado     timestamptz default now()
);
create index if not exists paginas_tienda_idx on paginas (tienda_id);
create index if not exists paginas_texto_trgm on paginas using gin (texto gin_trgm_ops);

-- Alertas de precio
create table if not exists alertas (
  id                 uuid primary key default gen_random_uuid(),
  oferta_ids         text[] not null,
  nombre             text,
  correo             text,
  precio_objetivo    integer not null check (precio_objetivo > 0),
  creada             timestamptz not null default now(),
  cumplida_en        timestamptz,
  precio_encontrado  integer,
  tienda_encontrada  text,
  notificada         boolean default false
);

-- Lo más buscado
create table if not exists busquedas (
  termino  text primary key,
  veces    integer not null default 1,
  ultima   timestamptz not null default now()
);

create or replace function registrar_busqueda(t text) returns void
language sql security definer set search_path = public as $$
  insert into busquedas (termino) values (left(t, 80))
  on conflict (termino) do update set veces = busquedas.veces + 1, ultima = now();
$$;

-- Seguridad: la página nunca habla directo con la base de datos.
-- Solo las funciones de Netlify (con la clave service_role) pueden leer y escribir.
alter table tiendas           enable row level security;
alter table ofertas           enable row level security;
alter table historial_precios enable row level security;
alter table paginas           enable row level security;
alter table alertas           enable row level security;
alter table busquedas         enable row level security;
revoke execute on function registrar_busqueda(text) from anon, authenticated;

-- ---------- Cuentas de usuario y contacto (actualización 2) ----------
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
