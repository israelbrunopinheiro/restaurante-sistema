-- Fase 3: financeiro (contas a pagar/receber, categorias). Tudo restrito ao dono.
-- Dinheiro em centavos; datas de negócio no fuso America/Manaus.

create type public.entry_kind as enum ('payable', 'receivable');

create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  kind public.entry_kind not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (kind, name)
);

insert into public.finance_categories (name, kind) values
  ('Ingredientes e insumos', 'payable'),
  ('Embalagens', 'payable'),
  ('Aluguel', 'payable'),
  ('Energia', 'payable'),
  ('Água', 'payable'),
  ('Gás', 'payable'),
  ('Salários e encargos', 'payable'),
  ('Impostos e taxas', 'payable'),
  ('Manutenção', 'payable'),
  ('Marketing', 'payable'),
  ('Outras despesas', 'payable'),
  ('Eventos e encomendas', 'receivable'),
  ('Outras receitas', 'receivable');

-- Conta a pagar (payable) ou a receber (receivable). "Baixa" = preencher os campos paid_*.
create table public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  kind public.entry_kind not null,
  category_id uuid not null references public.finance_categories (id) on delete restrict,
  description text not null check (length(trim(description)) > 0),
  party text,                                   -- fornecedor ou cliente
  amount_cents integer not null check (amount_cents > 0),
  due_date date not null,
  notes text,
  series_id uuid,                               -- lançamentos repetidos (ex.: aluguel de 12 meses)
  installment integer,
  installments integer,
  paid_at timestamptz,
  paid_date date,                               -- data da baixa (dia de negócio)
  paid_amount_cents integer check (paid_amount_cents > 0),  -- pode diferir (juros, desconto)
  paid_method text check (paid_method in ('cash', 'pix', 'boleto', 'transfer', 'card')),
  paid_from_drawer boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((paid_at is null) = (paid_date is null)),
  check ((paid_at is null) = (paid_amount_cents is null)),
  check ((paid_at is null) = (paid_method is null)),
  check (not paid_from_drawer or paid_method = 'cash')
);
create index finance_entries_open_idx on public.finance_entries (kind, due_date) where paid_at is null;
create index finance_entries_paid_idx on public.finance_entries (kind, paid_date) where paid_at is not null;
create index finance_entries_category_idx on public.finance_entries (category_id);
create index finance_entries_series_idx on public.finance_entries (series_id);
create index finance_entries_created_by_idx on public.finance_entries (created_by);
create trigger finance_entries_touch before update on public.finance_entries
  for each row execute function private.touch_updated_at();

-- A categoria tem que ser do mesmo tipo do lançamento (despesa com despesa, receita com receita).
create function private.check_entry_category()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.finance_categories c where c.id = new.category_id and c.kind = new.kind) then
    raise exception 'A categoria não combina com o tipo do lançamento.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger finance_entries_category_check before insert or update of category_id, kind on public.finance_entries
  for each row execute function private.check_entry_category();

-- Sangria/suprimento criado por uma baixa fica ligado ao lançamento.
alter table public.cash_movements add column entry_id uuid references public.finance_entries (id) on delete set null;
create index cash_movements_entry_idx on public.cash_movements (entry_id);

-- RLS: só o dono. Lançamentos nascem pela função create_finance_entry; baixa só pela pay_finance_entry.
-- Edição e exclusão diretas valem apenas para lançamentos ainda NÃO baixados.
alter table public.finance_categories enable row level security;
alter table public.finance_entries enable row level security;
revoke all on public.finance_categories, public.finance_entries from anon;

create policy finance_categories_select on public.finance_categories for select to authenticated
  using ((select public.is_owner()));
create policy finance_categories_insert on public.finance_categories for insert to authenticated
  with check ((select public.is_owner()));
create policy finance_categories_update on public.finance_categories for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

create policy finance_entries_select on public.finance_entries for select to authenticated
  using ((select public.is_owner()));
create policy finance_entries_update on public.finance_entries for update to authenticated
  using ((select public.is_owner()) and paid_at is null)
  with check ((select public.is_owner()) and paid_at is null);
create policy finance_entries_delete on public.finance_entries for delete to authenticated
  using ((select public.is_owner()) and paid_at is null);
