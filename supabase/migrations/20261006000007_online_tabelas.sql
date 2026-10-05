-- Cardápio online: configurações, QR por mesa e origem do pedido.
-- Tudo nasce DESLIGADO: o dono precisa ligar "Aceitando pedidos online".

alter table public.settings
  add column online_open boolean not null default false,
  add column online_pickup boolean not null default true,
  add column online_delivery boolean not null default true,
  add column online_table boolean not null default true,
  add column online_min_cents integer not null default 0 check (online_min_cents >= 0);

-- Cada mesa tem um código secreto (vai dentro do QR). O dono pode trocá-lo quando quiser.
alter table public.dining_tables
  add column qr_token text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 24);
create unique index dining_tables_qr_token_key on public.dining_tables (qr_token);

-- De onde veio o pedido; client_hash = resumo do IP, só para limitar abuso (não é o IP).
alter table public.orders
  add column source text not null default 'staff' check (source in ('staff', 'online')),
  add column client_hash text;
create index orders_online_recent_idx on public.orders (created_at) where source = 'online';
create index orders_online_phone_idx on public.orders (customer_phone, created_at) where source = 'online';
create index orders_online_hash_idx on public.orders (client_hash, created_at) where source = 'online';
