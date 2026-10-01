-- Funções do caixa. Tudo passa por aqui: as tabelas não aceitam escrita direta.

create function private.fmt_brl(p_cents integer)
returns text language sql immutable set search_path = '' as $$
  select 'R$ ' || (abs(p_cents) / 100)::text || ',' || lpad((abs(p_cents) % 100)::text, 2, '0')
$$;

create function private.require_cashier()
returns public.app_role language plpgsql stable security definer set search_path = '' as $$
declare v public.app_role := public.current_app_role();
begin
  if v is null or v not in ('owner', 'attendant') then
    raise exception 'Sem permissão para operar o caixa.' using errcode = '42501';
  end if;
  return v;
end $$;

-- Totais do turno: recebido por forma de pagamento (já líquido de estornos) e dinheiro esperado na gaveta.
create function private.session_totals(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_opening integer;
  v_cash integer; v_pix integer; v_debit integer; v_credit integer;
  v_sup integer; v_wd integer;
begin
  select opening_cents into v_opening from public.cash_sessions where id = p_session_id;
  select coalesce(sum(amount_cents) filter (where method = 'cash'), 0),
         coalesce(sum(amount_cents) filter (where method = 'pix'), 0),
         coalesce(sum(amount_cents) filter (where method = 'debit'), 0),
         coalesce(sum(amount_cents) filter (where method = 'credit'), 0)
    into v_cash, v_pix, v_debit, v_credit
  from public.payments where session_id = p_session_id;
  select coalesce(sum(amount_cents) filter (where kind = 'supply'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'withdrawal'), 0)
    into v_sup, v_wd
  from public.cash_movements where session_id = p_session_id;

  return jsonb_build_object(
    'opening_cents', v_opening,
    'cash_cents', v_cash,
    'pix_cents', v_pix,
    'debit_cents', v_debit,
    'credit_cents', v_credit,
    'received_cents', v_cash + v_pix + v_debit + v_credit,
    'supplies_cents', v_sup,
    'withdrawals_cents', v_wd,
    'expected_cash_cents', v_opening + v_cash + v_sup - v_wd
  );
end $$;
revoke all on function private.session_totals(uuid), private.require_cashier(), private.fmt_brl(integer)
  from public, anon, authenticated;

-- ───────── Abrir caixa ─────────
create function public.open_cash_session(p_opening_cents integer)
returns public.cash_sessions
language plpgsql security definer set search_path = '' as $$
declare v_s public.cash_sessions; v_name text;
begin
  perform private.require_cashier();
  if p_opening_cents is null or p_opening_cents < 0 then
    raise exception 'Informe o valor inicial do caixa (pode ser zero).' using errcode = '22023';
  end if;
  select full_name into v_name from public.profiles where id = (select auth.uid());
  begin
    insert into public.cash_sessions (opened_by, opened_by_name, opening_cents)
    values ((select auth.uid()), coalesce(v_name, ''), p_opening_cents)
    returning * into v_s;
  exception when unique_violation then
    raise exception 'Já existe um caixa aberto. Feche-o antes de abrir outro.' using errcode = '22023';
  end;
  return v_s;
end $$;

-- ───────── Sangria / suprimento ─────────
create function public.add_cash_movement(
  p_kind public.cash_movement_kind,
  p_amount_cents integer,
  p_reason text
) returns public.cash_movements
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.cash_sessions;
  v_m public.cash_movements;
  v_reason text := nullif(trim(p_reason), '');
  v_expected integer;
begin
  perform private.require_cashier();
  select * into v_s from public.cash_sessions where closed_at is null for update;
  if not found then
    raise exception 'Abra o caixa primeiro.' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Informe um valor maior que zero.' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'Informe o motivo.' using errcode = '22023';
  end if;
  if p_kind = 'withdrawal' then
    v_expected := (private.session_totals(v_s.id) ->> 'expected_cash_cents')::integer;
    if p_amount_cents > v_expected then
      raise exception 'Só há % em dinheiro no caixa.', private.fmt_brl(v_expected) using errcode = '22023';
    end if;
  end if;
  insert into public.cash_movements (session_id, kind, amount_cents, reason, created_by)
  values (v_s.id, p_kind, p_amount_cents, v_reason, (select auth.uid()))
  returning * into v_m;
  return v_m;
end $$;

-- ───────── Resumo do turno ─────────
-- Sem argumento: turno aberto (ou null se o caixa estiver fechado). Com id: o dono vê qualquer turno.
create function public.cash_session_summary(p_session_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_role public.app_role := private.require_cashier(); v_s public.cash_sessions;
begin
  if p_session_id is null then
    select * into v_s from public.cash_sessions where closed_at is null;
  else
    select * into v_s from public.cash_sessions where id = p_session_id;
  end if;
  if not found then
    return null;
  end if;
  if v_role = 'attendant' and v_s.closed_at is not null then
    raise exception 'Sem permissão para ver turnos fechados.' using errcode = '42501';
  end if;
  return jsonb_build_object('session', to_jsonb(v_s), 'totals', private.session_totals(v_s.id));
end $$;

-- ───────── Receber pagamento (um ou vários pedidos, uma ou várias formas) ─────────
-- A soma dos pagamentos tem que bater com o total dos pedidos. Troco é só da tela: aqui entra o valor aplicado.
create function public.pay_orders(p_order_ids uuid[], p_payments jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.cash_sessions;
  v_o record;
  v_p jsonb;
  v_uid uuid := (select auth.uid());
  v_total integer := 0;
  v_count integer := 0;
  v_sum integer := 0;
  v_methods public.payment_method[] := '{}';
  v_amounts integer[] := '{}';
  v_method public.payment_method;
  v_amount integer;
  v_need integer;
  v_take integer;
  i integer := 1;
begin
  perform private.require_cashier();
  select * into v_s from public.cash_sessions where closed_at is null;
  if not found then
    raise exception 'Abra o caixa antes de receber pagamentos.' using errcode = '22023';
  end if;
  if p_order_ids is null or coalesce(array_length(p_order_ids, 1), 0) = 0 then
    raise exception 'Escolha ao menos um pedido.' using errcode = '22023';
  end if;
  if array_length(p_order_ids, 1) > 50 then
    raise exception 'Pedidos demais de uma vez.' using errcode = '22023';
  end if;

  for v_o in select * from public.orders where id = any (p_order_ids) order by created_at for update loop
    if v_o.status = 'cancelled' then
      raise exception 'O pedido #% está cancelado.', v_o.order_number using errcode = '22023';
    end if;
    if v_o.paid_at is not null then
      raise exception 'O pedido #% já foi pago.', v_o.order_number using errcode = '22023';
    end if;
    v_total := v_total + v_o.total_cents;
    v_count := v_count + 1;
  end loop;
  if v_count <> (select count(distinct x) from unnest(p_order_ids) as x) then
    raise exception 'Algum pedido não foi encontrado.' using errcode = 'P0002';
  end if;

  if p_payments is not null and jsonb_typeof(p_payments) = 'array' then
    for v_p in select * from jsonb_array_elements(p_payments) loop
      begin
        v_method := (v_p ->> 'method')::public.payment_method;
        v_amount := (v_p ->> 'amount_cents')::integer;
      exception when others then
        raise exception 'Forma de pagamento ou valor inválido.' using errcode = '22023';
      end;
      if v_method is null or v_amount is null or v_amount <= 0 then
        raise exception 'Forma de pagamento ou valor inválido.' using errcode = '22023';
      end if;
      v_methods := v_methods || v_method;
      v_amounts := v_amounts || v_amount;
      v_sum := v_sum + v_amount;
    end loop;
  end if;

  if v_sum <> v_total then
    raise exception 'Os pagamentos somam %, mas a conta é %.', private.fmt_brl(v_sum), private.fmt_brl(v_total)
      using errcode = '22023';
  end if;

  -- distribui as parcelas pelos pedidos (cada linha de pagamento fica ligada a um único pedido)
  for v_o in select * from public.orders where id = any (p_order_ids) order by created_at loop
    v_need := v_o.total_cents;
    while v_need > 0 loop
      while v_amounts[i] = 0 loop
        i := i + 1;
      end loop;
      v_take := least(v_need, v_amounts[i]);
      insert into public.payments (session_id, order_id, method, amount_cents, created_by)
      values (v_s.id, v_o.id, v_methods[i], v_take, v_uid);
      v_amounts[i] := v_amounts[i] - v_take;
      v_need := v_need - v_take;
    end loop;
    update public.orders set paid_at = now() where id = v_o.id;
  end loop;

  return jsonb_build_object('orders', v_count, 'total_cents', v_total);
end $$;

-- ───────── Estorno (só o dono) ─────────
create function public.refund_order(p_order_id uuid, p_reason text)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.cash_sessions;
  v_o public.orders;
  v_p record;
  v_reason text := nullif(trim(p_reason), '');
  v_uid uuid := (select auth.uid());
  v_cash_back integer := 0;
  v_expected integer;
begin
  if public.current_app_role() is distinct from 'owner' then
    raise exception 'Só o dono pode estornar pagamentos.' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Informe o motivo do estorno.' using errcode = '22023';
  end if;
  select * into v_s from public.cash_sessions where closed_at is null;
  if not found then
    raise exception 'Abra o caixa para registrar o estorno.' using errcode = '22023';
  end if;
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  if v_o.paid_at is null then
    raise exception 'Este pedido não está pago.' using errcode = '22023';
  end if;

  select coalesce(sum(amount_cents), 0) into v_cash_back
  from public.payments where order_id = p_order_id and method = 'cash';
  if v_cash_back > 0 then
    v_expected := (private.session_totals(v_s.id) ->> 'expected_cash_cents')::integer;
    if v_cash_back > v_expected then
      raise exception 'Só há % em dinheiro no caixa para devolver %.',
        private.fmt_brl(v_expected), private.fmt_brl(v_cash_back) using errcode = '22023';
    end if;
  end if;

  for v_p in
    select method, sum(amount_cents)::integer as amt
    from public.payments where order_id = p_order_id
    group by method having sum(amount_cents) <> 0
  loop
    insert into public.payments (session_id, order_id, method, amount_cents, note, created_by)
    values (v_s.id, p_order_id, v_p.method, -v_p.amt, v_reason, v_uid);
  end loop;

  update public.orders set paid_at = null where id = p_order_id returning * into v_o;
  return v_o;
end $$;

-- ───────── Fechar caixa ─────────
create function public.close_cash_session(p_counted_cents integer, p_notes text default null)
returns public.cash_sessions
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.cash_sessions;
  v_totals jsonb;
  v_expected integer;
  v_diff integer;
  v_notes text := nullif(trim(p_notes), '');
  v_name text;
begin
  perform private.require_cashier();
  select * into v_s from public.cash_sessions where closed_at is null for update;
  if not found then
    raise exception 'Não há caixa aberto.' using errcode = '22023';
  end if;
  if p_counted_cents is null or p_counted_cents < 0 then
    raise exception 'Informe quanto dinheiro foi contado na gaveta.' using errcode = '22023';
  end if;

  v_totals := private.session_totals(v_s.id);
  v_expected := (v_totals ->> 'expected_cash_cents')::integer;
  v_diff := p_counted_cents - v_expected;
  if v_diff <> 0 and v_notes is null then
    raise exception 'Há uma diferença de % no caixa (%). Explique o motivo nas observações.',
      private.fmt_brl(v_diff), case when v_diff > 0 then 'sobra' else 'falta' end using errcode = '22023';
  end if;

  select full_name into v_name from public.profiles where id = (select auth.uid());
  update public.cash_sessions
  set closed_at = now(),
      closed_by = (select auth.uid()),
      closed_by_name = coalesce(v_name, ''),
      expected_cash_cents = v_expected,
      counted_cents = p_counted_cents,
      difference_cents = v_diff,
      totals = v_totals,
      notes = v_notes
  where id = v_s.id
  returning * into v_s;
  return v_s;
end $$;

revoke execute on function
  public.open_cash_session(integer),
  public.add_cash_movement(public.cash_movement_kind, integer, text),
  public.cash_session_summary(uuid),
  public.pay_orders(uuid[], jsonb),
  public.refund_order(uuid, text),
  public.close_cash_session(integer, text)
from public, anon;
grant execute on function
  public.open_cash_session(integer),
  public.add_cash_movement(public.cash_movement_kind, integer, text),
  public.cash_session_summary(uuid),
  public.pay_orders(uuid[], jsonb),
  public.refund_order(uuid, text),
  public.close_cash_session(integer, text)
to authenticated;
