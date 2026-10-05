-- Funções do financeiro. Só o dono executa qualquer uma delas.

create function private.require_owner()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_app_role() is distinct from 'owner' then
    raise exception 'Só o dono pode acessar o financeiro.' using errcode = '42501';
  end if;
end $$;
revoke all on function private.require_owner() from public, anon, authenticated;

-- ───────── Criar lançamento (opcionalmente repetido todo mês) ─────────
create function public.create_finance_entry(
  p_kind public.entry_kind,
  p_category_id uuid,
  p_description text,
  p_party text,
  p_amount_cents integer,
  p_due_date date,
  p_notes text default null,
  p_repeat_months integer default 1
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_desc text := nullif(trim(p_description), '');
  v_n integer := coalesce(p_repeat_months, 1);
  v_series uuid := gen_random_uuid();
  v_uid uuid := (select auth.uid());
  i integer;
begin
  perform private.require_owner();
  if v_desc is null then
    raise exception 'Informe a descrição.' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Informe um valor maior que zero.' using errcode = '22023';
  end if;
  if p_due_date is null then
    raise exception 'Informe a data de vencimento.' using errcode = '22023';
  end if;
  if v_n < 1 or v_n > 36 then
    raise exception 'A repetição vai de 1 a 36 meses.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.finance_categories where id = p_category_id and kind = p_kind and active
  ) then
    raise exception 'Escolha uma categoria válida.' using errcode = '22023';
  end if;

  for i in 0 .. v_n - 1 loop
    insert into public.finance_entries (
      kind, category_id, description, party, amount_cents, due_date, notes,
      series_id, installment, installments, created_by
    ) values (
      p_kind, p_category_id, v_desc, nullif(trim(p_party), ''), p_amount_cents,
      (p_due_date + make_interval(months => i))::date, nullif(trim(p_notes), ''),
      case when v_n > 1 then v_series end,
      case when v_n > 1 then i + 1 end,
      case when v_n > 1 then v_n end,
      v_uid
    );
  end loop;
  return v_n;
end $$;

-- ───────── Dar baixa (pagar / receber) ─────────
-- p_from_drawer: o dinheiro saiu (ou entrou) pela gaveta do caixa → vira sangria (ou suprimento) automática.
create function public.pay_finance_entry(
  p_entry_id uuid,
  p_method text,
  p_amount_cents integer default null,
  p_paid_date date default null,
  p_from_drawer boolean default false
) returns public.finance_entries
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.finance_entries;
  v_s public.cash_sessions;
  v_today date := (now() at time zone 'America/Manaus')::date;
  v_date date;
  v_amount integer;
  v_expected integer;
  v_kind public.cash_movement_kind;
begin
  perform private.require_owner();
  select * into v_e from public.finance_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Lançamento não encontrado.' using errcode = 'P0002';
  end if;
  if v_e.paid_at is not null then
    raise exception 'Este lançamento já foi baixado.' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('cash', 'pix', 'boleto', 'transfer', 'card') then
    raise exception 'Escolha a forma de pagamento.' using errcode = '22023';
  end if;
  v_date := coalesce(p_paid_date, v_today);
  if v_date > v_today then
    raise exception 'A data da baixa não pode ser no futuro.' using errcode = '22023';
  end if;
  v_amount := coalesce(p_amount_cents, v_e.amount_cents);
  if v_amount <= 0 then
    raise exception 'Informe um valor maior que zero.' using errcode = '22023';
  end if;

  if coalesce(p_from_drawer, false) then
    if p_method <> 'cash' then
      raise exception 'Só dinheiro passa pela gaveta do caixa.' using errcode = '22023';
    end if;
    if v_date <> v_today then
      raise exception 'Pela gaveta, a baixa só pode ser de hoje.' using errcode = '22023';
    end if;
    select * into v_s from public.cash_sessions where closed_at is null for update;
    if not found then
      raise exception 'Abra o caixa para usar o dinheiro da gaveta.' using errcode = '22023';
    end if;
    v_kind := case when v_e.kind = 'payable' then 'withdrawal' else 'supply' end;
    if v_kind = 'withdrawal' then
      v_expected := (private.session_totals(v_s.id) ->> 'expected_cash_cents')::integer;
      if v_amount > v_expected then
        raise exception 'Só há % em dinheiro no caixa.', private.fmt_brl(v_expected) using errcode = '22023';
      end if;
    end if;
    insert into public.cash_movements (session_id, kind, amount_cents, reason, created_by, entry_id)
    values (
      v_s.id, v_kind, v_amount,
      left(case when v_e.kind = 'payable' then 'Pagamento: ' else 'Recebimento: ' end || v_e.description, 200),
      (select auth.uid()), v_e.id
    );
  end if;

  update public.finance_entries
  set paid_at = now(), paid_date = v_date, paid_amount_cents = v_amount,
      paid_method = p_method, paid_from_drawer = coalesce(p_from_drawer, false)
  where id = v_e.id
  returning * into v_e;
  return v_e;
end $$;

-- ───────── Reabrir (desfazer a baixa) ─────────
create function public.reopen_finance_entry(p_entry_id uuid)
returns public.finance_entries
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.finance_entries;
  v_s public.cash_sessions;
  v_kind public.cash_movement_kind;
  v_expected integer;
begin
  perform private.require_owner();
  select * into v_e from public.finance_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Lançamento não encontrado.' using errcode = 'P0002';
  end if;
  if v_e.paid_at is null then
    raise exception 'Este lançamento não está baixado.' using errcode = '22023';
  end if;

  if v_e.paid_from_drawer then
    select * into v_s from public.cash_sessions where closed_at is null for update;
    if not found then
      raise exception 'Abra o caixa para reabrir um lançamento pago com o dinheiro da gaveta.' using errcode = '22023';
    end if;
    -- devolve o movimento: a despesa paga pela gaveta volta como suprimento; a receita, como sangria
    v_kind := case when v_e.kind = 'payable' then 'supply' else 'withdrawal' end;
    if v_kind = 'withdrawal' then
      v_expected := (private.session_totals(v_s.id) ->> 'expected_cash_cents')::integer;
      if v_e.paid_amount_cents > v_expected then
        raise exception 'Só há % em dinheiro no caixa.', private.fmt_brl(v_expected) using errcode = '22023';
      end if;
    end if;
    insert into public.cash_movements (session_id, kind, amount_cents, reason, created_by, entry_id)
    values (v_s.id, v_kind, v_e.paid_amount_cents, left('Estorno: ' || v_e.description, 200), (select auth.uid()), v_e.id);
  end if;

  update public.finance_entries
  set paid_at = null, paid_date = null, paid_amount_cents = null, paid_method = null, paid_from_drawer = false
  where id = v_e.id
  returning * into v_e;
  return v_e;
end $$;

-- ───────── Resumo financeiro (regime de caixa: vale a data em que o dinheiro entrou/saiu) ─────────
create function public.finance_summary(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Manaus')::date;
  v_sales jsonb;
  v_other integer;
  v_exp integer;
  v_by_cat jsonb;
  v_days jsonb;
  v_pending jsonb;
  v_loose integer;
begin
  perform private.require_owner();
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;
  if p_to - p_from > 366 then
    raise exception 'Escolha um período de até 1 ano.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'cash_cents', coalesce(sum(amount_cents) filter (where method = 'cash'), 0),
    'pix_cents', coalesce(sum(amount_cents) filter (where method = 'pix'), 0),
    'debit_cents', coalesce(sum(amount_cents) filter (where method = 'debit'), 0),
    'credit_cents', coalesce(sum(amount_cents) filter (where method = 'credit'), 0),
    'total_cents', coalesce(sum(amount_cents), 0)
  ) into v_sales
  from public.payments
  where (created_at at time zone 'America/Manaus')::date between p_from and p_to;

  select coalesce(sum(paid_amount_cents), 0) into v_other
  from public.finance_entries
  where kind = 'receivable' and paid_date between p_from and p_to;

  select coalesce(sum(paid_amount_cents), 0) into v_exp
  from public.finance_entries
  where kind = 'payable' and paid_date between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object('category', name, 'cents', cents) order by cents desc), '[]'::jsonb)
  into v_by_cat
  from (
    select c.name, sum(e.paid_amount_cents)::integer as cents
    from public.finance_entries e join public.finance_categories c on c.id = e.category_id
    where e.kind = 'payable' and e.paid_date between p_from and p_to
    group by c.name
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('date', d, 'income_cents', inc, 'expense_cents', exp) order by d), '[]'::jsonb)
  into v_days
  from (
    select g::date as d,
      (select coalesce(sum(p.amount_cents), 0) from public.payments p
        where (p.created_at at time zone 'America/Manaus')::date = g::date)
      + (select coalesce(sum(e.paid_amount_cents), 0) from public.finance_entries e
        where e.kind = 'receivable' and e.paid_date = g::date) as inc,
      (select coalesce(sum(e.paid_amount_cents), 0) from public.finance_entries e
        where e.kind = 'payable' and e.paid_date = g::date) as exp
    from generate_series(p_from, p_to, interval '1 day') as g
  ) t;

  select jsonb_build_object(
    'payables_open_cents', coalesce(sum(amount_cents) filter (where kind = 'payable'), 0),
    'payables_overdue_cents', coalesce(sum(amount_cents) filter (where kind = 'payable' and due_date < v_today), 0),
    'payables_next7_cents', coalesce(sum(amount_cents) filter (where kind = 'payable' and due_date between v_today and v_today + 7), 0),
    'receivables_open_cents', coalesce(sum(amount_cents) filter (where kind = 'receivable'), 0),
    'receivables_overdue_cents', coalesce(sum(amount_cents) filter (where kind = 'receivable' and due_date < v_today), 0)
  ) into v_pending
  from public.finance_entries where paid_at is null;

  -- retiradas do caixa que não viraram despesa (informativo; não entram no resultado)
  select coalesce(sum(amount_cents), 0) into v_loose
  from public.cash_movements
  where kind = 'withdrawal' and entry_id is null
    and (created_at at time zone 'America/Manaus')::date between p_from and p_to;

  return jsonb_build_object(
    'sales', v_sales,
    'other_income_cents', v_other,
    'expenses_cents', v_exp,
    'result_cents', (v_sales ->> 'total_cents')::integer + v_other - v_exp,
    'expenses_by_category', v_by_cat,
    'days', v_days,
    'pending', v_pending,
    'loose_withdrawals_cents', v_loose
  );
end $$;

-- ───────── Relatório de vendas (pedidos não cancelados, por dia de negócio) ─────────
create function public.sales_report(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_orders integer; v_revenue integer; v_cancelled integer; v_cancelled_cents integer; v_unpaid integer;
  v_channels jsonb; v_products jsonb; v_hours jsonb; v_days jsonb;
begin
  perform private.require_owner();
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;
  if p_to - p_from > 366 then
    raise exception 'Escolha um período de até 1 ano.' using errcode = '22023';
  end if;

  select count(*) filter (where status <> 'cancelled'),
         coalesce(sum(total_cents) filter (where status <> 'cancelled'), 0),
         count(*) filter (where status = 'cancelled'),
         coalesce(sum(total_cents) filter (where status = 'cancelled'), 0),
         coalesce(sum(total_cents) filter (where status <> 'cancelled' and paid_at is null), 0)
    into v_orders, v_revenue, v_cancelled, v_cancelled_cents, v_unpaid
  from public.orders where business_date between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object('channel', channel, 'count', n, 'cents', cents) order by cents desc), '[]'::jsonb)
  into v_channels
  from (
    select channel, count(*)::integer as n, sum(total_cents)::integer as cents
    from public.orders where business_date between p_from and p_to and status <> 'cancelled'
    group by channel
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'quantity', qty, 'cents', cents) order by qty desc, cents desc), '[]'::jsonb)
  into v_products
  from (
    select oi.product_name as name, sum(oi.quantity)::integer as qty, sum(oi.quantity * oi.unit_price_cents)::integer as cents
    from public.order_items oi join public.orders o on o.id = oi.order_id
    where o.business_date between p_from and p_to and o.status <> 'cancelled'
    group by oi.product_name
    order by sum(oi.quantity) desc, sum(oi.quantity * oi.unit_price_cents) desc
    limit 10
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'count', n) order by h), '[]'::jsonb)
  into v_hours
  from (
    select extract(hour from created_at at time zone 'America/Manaus')::integer as h, count(*)::integer as n
    from public.orders where business_date between p_from and p_to and status <> 'cancelled'
    group by 1
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('date', d, 'count', n, 'cents', cents) order by d), '[]'::jsonb)
  into v_days
  from (
    select g::date as d,
      (select count(*) from public.orders o where o.business_date = g::date and o.status <> 'cancelled')::integer as n,
      (select coalesce(sum(o.total_cents), 0) from public.orders o where o.business_date = g::date and o.status <> 'cancelled')::integer as cents
    from generate_series(p_from, p_to, interval '1 day') as g
  ) t;

  return jsonb_build_object(
    'orders', v_orders,
    'revenue_cents', v_revenue,
    'average_ticket_cents', case when v_orders > 0 then round(v_revenue::numeric / v_orders)::integer else 0 end,
    'cancelled', v_cancelled,
    'cancelled_cents', v_cancelled_cents,
    'unpaid_cents', v_unpaid,
    'by_channel', v_channels,
    'top_products', v_products,
    'by_hour', v_hours,
    'days', v_days
  );
end $$;

revoke execute on function
  public.create_finance_entry(public.entry_kind, uuid, text, text, integer, date, text, integer),
  public.pay_finance_entry(uuid, text, integer, date, boolean),
  public.reopen_finance_entry(uuid),
  public.finance_summary(date, date),
  public.sales_report(date, date)
from public, anon;
grant execute on function
  public.create_finance_entry(public.entry_kind, uuid, text, text, integer, date, text, integer),
  public.pay_finance_entry(uuid, text, integer, date, boolean),
  public.reopen_finance_entry(uuid),
  public.finance_summary(date, date),
  public.sales_report(date, date)
to authenticated;
