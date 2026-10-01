-- Fase 2: caixa (turnos), sangria/suprimento e pagamentos.
-- Dinheiro em centavos. Estornos são lançamentos NEGATIVOS (o histórico nunca é apagado).

create type public.payment_method as enum ('cash', 'pix', 'debit', 'credit');
create type public.cash_movement_kind as enum ('supply', 'withdrawal');

alter table public.orders add column paid_at timestamptz;
create index orders_unpaid_idx on public.orders (created_at)
  where paid_at is null and status <> 'cancelled';

-- Turno de caixa. Só pode haver UM aberto por vez (índice único parcial).
create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  opened_at timestamptz not null default now(),
  opened_by uuid references public.profiles (id) on delete set null,
  opened_by_name text not null default '',
  opening_cents integer not null check (opening_cents >= 0),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  closed_by_name text,
  expected_cash_cents integer,
  counted_cents integer check (counted_cents >= 0),
  difference_cents integer,
  totals jsonb,
  notes text,
  check ((closed_at is null) = (counted_cents is null))
);
create unique index cash_sessions_one_open on public.cash_sessions ((true)) where closed_at is null;
create index cash_sessions_opened_by_idx on public.cash_sessions (opened_by);
create index cash_sessions_closed_by_idx on public.cash_sessions (closed_by);
create index cash_sessions_closed_at_idx on public.cash_sessions (closed_at desc);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cash_sessions (id) on delete restrict,
  order_id uuid not null references public.orders (id) on delete restrict,
  method public.payment_method not null,
  amount_cents integer not null check (amount_cents <> 0), -- negativo = estorno
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index payments_session_idx on public.payments (session_id);
create index payments_order_idx on public.payments (order_id);
create index payments_created_by_idx on public.payments (created_by);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cash_sessions (id) on delete restrict,
  kind public.cash_movement_kind not null,
  amount_cents integer not null check (amount_cents > 0),
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index cash_movements_session_idx on public.cash_movements (session_id);
create index cash_movements_created_by_idx on public.cash_movements (created_by);

-- Pedido pago não pode ser cancelado direto: o dono estorna primeiro.
create function private.block_cancel_paid_order()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' and old.paid_at is not null then
    raise exception 'Este pedido já foi pago. Peça ao dono para estornar o pagamento antes de cancelar.'
      using errcode = '22023';
  end if;
  return new;
end $$;

create trigger orders_block_cancel_paid before update of status on public.orders
  for each row execute function private.block_cancel_paid_order();

-- RLS: dono lê tudo; atendente só enxerga o turno ABERTO. Escrita só pelas funções.
alter table public.cash_sessions enable row level security;
alter table public.payments enable row level security;
alter table public.cash_movements enable row level security;
revoke all on public.cash_sessions, public.payments, public.cash_movements from anon;

create policy cash_sessions_select on public.cash_sessions for select to authenticated
  using (
    (select public.is_owner())
    or ((select public.current_app_role()) = 'attendant' and closed_at is null)
  );

create policy payments_select on public.payments for select to authenticated
  using (
    (select public.is_owner())
    or ((select public.current_app_role()) = 'attendant' and exists (
      select 1 from public.cash_sessions s where s.id = session_id and s.closed_at is null))
  );

create policy cash_movements_select on public.cash_movements for select to authenticated
  using (
    (select public.is_owner())
    or ((select public.current_app_role()) = 'attendant' and exists (
      select 1 from public.cash_sessions s where s.id = session_id and s.closed_at is null))
  );
