-- Fase 1: cardápio, mesas, pedidos (mesa / retirada / delivery / whatsapp) e cozinha.
-- Dinheiro sempre em centavos (integer). Fuso do restaurante: America/Manaus.

create schema if not exists private;

-- ───────────────────────── Tipos ─────────────────────────
create type public.app_role as enum ('owner', 'attendant', 'kitchen');
create type public.order_channel as enum ('table', 'pickup', 'delivery', 'whatsapp');
create type public.order_status as enum ('new', 'preparing', 'ready', 'delivered', 'cancelled');

-- ───────────────────────── Utilitário ─────────────────────────
create function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────────────────── Configurações (linha única) ─────────────────────────
create table public.settings (
  id boolean primary key default true check (id),
  restaurant_name text not null default 'Cordeiro''s Refeições',
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  updated_at timestamptz not null default now()
);
insert into public.settings default values;
create trigger settings_touch before update on public.settings
  for each row execute function private.touch_updated_at();

-- ───────────────────────── Perfis / equipe ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'attendant',
  active boolean not null default false,
  created_at timestamptz not null default now()
);

-- Primeiro usuário vira dono (ativo). Os demais ficam inativos até o dono aprovar.
create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_first boolean;
begin
  perform pg_advisory_xact_lock(hashtext('profiles_first_user'));
  select not exists (select 1 from public.profiles) into v_first;
  insert into public.profiles (id, full_name, role, active)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    case when v_first then 'owner'::public.app_role else 'attendant'::public.app_role end,
    v_first
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Helpers de permissão (usados nas políticas RLS)
create function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid()) and active
$$;

create function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and active)
$$;

create function public.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active and role = 'owner'
  )
$$;

revoke execute on function public.current_app_role(), public.is_staff(), public.is_owner() from public, anon;
grant execute on function public.current_app_role(), public.is_staff(), public.is_owner() to authenticated;

-- ───────────────────────── Cardápio ─────────────────────────
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  description text,
  price_cents integer not null check (price_cents >= 0),
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);
create trigger products_touch before update on public.products
  for each row execute function private.touch_updated_at();

-- ───────────────────────── Mesas ─────────────────────────
create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  label text not null unique check (length(trim(label)) > 0),
  seats integer check (seats > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Pedidos ─────────────────────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  business_date date not null default ((now() at time zone 'America/Manaus')::date),
  order_number integer not null,
  channel public.order_channel not null,
  status public.order_status not null default 'new',
  dining_table_id uuid references public.dining_tables (id) on delete restrict,
  customer_name text,
  customer_phone text,
  delivery_address text,
  notes text,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  cancel_reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  unique (business_date, order_number),
  check (channel <> 'table' or dining_table_id is not null),
  check (channel <> 'delivery' or (
    nullif(trim(delivery_address), '') is not null and nullif(trim(customer_phone), '') is not null)),
  check (channel <> 'pickup' or nullif(trim(customer_name), '') is not null),
  check (channel <> 'whatsapp' or nullif(trim(customer_phone), '') is not null)
);
create index orders_date_status_idx on public.orders (business_date, status);
create index orders_created_idx on public.orders (created_at desc);
create index orders_open_idx on public.orders (created_at)
  where status in ('new', 'preparing', 'ready');
create trigger orders_touch before update on public.orders
  for each row execute function private.touch_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity between 1 and 99),
  notes text,
  created_at timestamptz not null default now()
);
create index order_items_order_idx on public.order_items (order_id);

-- ───────────────────────── RLS ─────────────────────────
alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.dining_tables enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

revoke all on all tables in schema public from anon;

-- settings
create policy settings_select on public.settings for select to authenticated
  using ((select public.is_staff()));
create policy settings_update on public.settings for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- profiles: cada um vê o próprio; o dono vê e edita os outros (nunca o próprio, para não se trancar fora)
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_owner()));
create policy profiles_update on public.profiles for update to authenticated
  using ((select public.is_owner()) and id <> (select auth.uid()))
  with check ((select public.is_owner()) and id <> (select auth.uid()));

-- catálogo: equipe lê, dono escreve
create policy categories_select on public.categories for select to authenticated
  using ((select public.is_staff()));
create policy categories_write on public.categories for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

create policy products_select on public.products for select to authenticated
  using ((select public.is_staff()));
create policy products_write on public.products for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

create policy dining_tables_select on public.dining_tables for select to authenticated
  using ((select public.is_staff()));
create policy dining_tables_write on public.dining_tables for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- pedidos: equipe só lê; criar e mudar status passam pelas funções abaixo
create policy orders_select on public.orders for select to authenticated
  using ((select public.is_staff()));
create policy order_items_select on public.order_items for select to authenticated
  using ((select public.is_staff()));

-- ───────────────────────── Criação de pedido ─────────────────────────
-- Função interna, sem checagem de usuário: servirá também ao atendente de WhatsApp (via service role).
-- Preços vêm SEMPRE da tabela products; o cliente só informa produto, quantidade e observação.
create function private.create_order_internal(
  p_channel public.order_channel,
  p_dining_table_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_notes text,
  p_items jsonb,
  p_created_by uuid
) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_today date := (now() at time zone 'America/Manaus')::date;
  v_number integer;
  v_fee integer := 0;
  v_subtotal integer := 0;
  v_item jsonb;
  v_product public.products;
  v_qty integer;
  v_name text := nullif(trim(p_customer_name), '');
  v_phone text := nullif(trim(p_customer_phone), '');
  v_address text := nullif(trim(p_delivery_address), '');
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'O pedido precisa ter ao menos um item.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Pedido com itens demais.' using errcode = '22023';
  end if;

  if p_channel = 'table' then
    if p_dining_table_id is null or not exists (
      select 1 from public.dining_tables where id = p_dining_table_id and active
    ) then
      raise exception 'Escolha uma mesa válida.' using errcode = '22023';
    end if;
  else
    p_dining_table_id := null;
  end if;
  if p_channel = 'pickup' and v_name is null then
    raise exception 'Informe o nome do cliente para retirada.' using errcode = '22023';
  end if;
  if p_channel in ('delivery', 'whatsapp') and v_phone is null then
    raise exception 'Informe o telefone do cliente.' using errcode = '22023';
  end if;
  if p_channel = 'delivery' then
    if v_address is null then
      raise exception 'Informe o endereço de entrega.' using errcode = '22023';
    end if;
    select delivery_fee_cents into v_fee from public.settings;
  end if;

  -- numeração diária (zera a cada dia no fuso de Manaus)
  perform pg_advisory_xact_lock(hashtext('order_number'));
  select coalesce(max(order_number), 0) + 1 into v_number
  from public.orders where business_date = v_today;

  insert into public.orders (
    business_date, order_number, channel, dining_table_id,
    customer_name, customer_phone, delivery_address, notes,
    delivery_fee_cents, created_by
  ) values (
    v_today, v_number, p_channel, p_dining_table_id,
    v_name, v_phone, v_address, nullif(trim(p_notes), ''),
    v_fee, p_created_by
  ) returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      v_qty := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'Quantidade inválida.' using errcode = '22023';
    end;
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'Quantidade inválida (use de 1 a 99).' using errcode = '22023';
    end if;

    select * into v_product from public.products
    where id = (v_item ->> 'product_id')::uuid and active;
    if not found then
      raise exception 'Produto indisponível ou inexistente.' using errcode = '22023';
    end if;

    insert into public.order_items (order_id, product_id, product_name, unit_price_cents, quantity, notes)
    values (v_order.id, v_product.id, v_product.name, v_product.price_cents, v_qty,
            nullif(trim(v_item ->> 'notes'), ''));
    v_subtotal := v_subtotal + v_product.price_cents * v_qty;
  end loop;

  update public.orders
  set subtotal_cents = v_subtotal, total_cents = v_subtotal + v_fee
  where id = v_order.id
  returning * into v_order;

  return v_order;
end $$;

revoke all on function private.create_order_internal(public.order_channel, uuid, text, text, text, text, jsonb, uuid) from public, anon, authenticated;

create function public.create_order(
  p_channel public.order_channel,
  p_items jsonb,
  p_dining_table_id uuid default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_delivery_address text default null,
  p_notes text default null
) returns public.orders
language plpgsql security definer set search_path = '' as $$
begin
  if public.current_app_role() not in ('owner', 'attendant') then
    raise exception 'Sem permissão para lançar pedidos.' using errcode = '42501';
  end if;
  return private.create_order_internal(
    p_channel, p_dining_table_id, p_customer_name, p_customer_phone,
    p_delivery_address, p_notes, p_items, (select auth.uid())
  );
end $$;

revoke execute on function public.create_order(public.order_channel, jsonb, uuid, text, text, text, text) from public, anon;
grant execute on function public.create_order(public.order_channel, jsonb, uuid, text, text, text, text) to authenticated;

-- ───────────────────────── Mudança de status ─────────────────────────
create function public.set_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_reason text default null
) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.app_role := public.current_app_role();
  v_order public.orders;
  v_ok boolean;
begin
  if v_role is null then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;

  v_ok := case v_order.status
    when 'new'       then p_status in ('preparing', 'cancelled')
    when 'preparing' then p_status in ('new', 'ready', 'cancelled')
    when 'ready'     then p_status in ('preparing', 'delivered', 'cancelled')
    else false
  end;
  if not v_ok then
    raise exception 'Não é possível mudar o pedido de "%" para "%".', v_order.status, p_status
      using errcode = '22023';
  end if;

  if p_status = 'cancelled' and v_role = 'kitchen' then
    raise exception 'A cozinha não pode cancelar pedidos.' using errcode = '42501';
  end if;

  update public.orders
  set status = p_status,
      status_changed_at = now(),
      cancel_reason = case when p_status = 'cancelled' then nullif(trim(p_reason), '') else null end
  where id = p_order_id
  returning * into v_order;

  return v_order;
end $$;

revoke execute on function public.set_order_status(uuid, public.order_status, text) from public, anon;
grant execute on function public.set_order_status(uuid, public.order_status, text) to authenticated;

-- ───────────────────────── Tempo real ─────────────────────────
alter publication supabase_realtime add table public.orders, public.order_items;
