-- Versões "v2" das funções públicas (as antigas continuam existindo, sem Pix). O cliente novo usa só as v2.

-- Cardápio público: igual ao anterior + informa se o restaurante aceita Pix (a chave NÃO é exposta aqui).
create function public.public_menu_v2(p_table_token text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_s public.settings;
  v_base jsonb;
begin
  v_base := public.public_menu(p_table_token);
  select * into v_s from public.settings;
  return v_base || jsonb_build_object(
    'pix', coalesce(nullif(trim(v_s.pix_key), '') is not null
                    and nullif(trim(v_s.pix_name), '') is not null
                    and nullif(trim(v_s.pix_city), '') is not null, false)
  );
end $$;

-- Fazer pedido: igual ao anterior + forma de pagamento (e troco).
create function public.place_public_order_v2(
  p_channel text,
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text default null,
  p_notes text default null,
  p_table_token text default null,
  p_pay_with text default null,
  p_change_for_cents integer default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.settings;
  v_res jsonb;
  v_id uuid;
  v_total integer;
  v_pay text := nullif(trim(p_pay_with), '');
begin
  select * into v_s from public.settings;
  if p_channel in ('pickup', 'delivery') and v_pay is null then
    raise exception 'Escolha a forma de pagamento.' using errcode = '22023';
  end if;
  if v_pay is not null and v_pay not in ('pix', 'cash', 'card') then
    raise exception 'Forma de pagamento inválida.' using errcode = '22023';
  end if;
  if v_pay = 'pix' and not (nullif(trim(v_s.pix_key), '') is not null
                            and nullif(trim(v_s.pix_name), '') is not null
                            and nullif(trim(v_s.pix_city), '') is not null) then
    raise exception 'O restaurante não aceita Pix por aqui no momento. Escolha dinheiro ou cartão.' using errcode = '22023';
  end if;
  if p_change_for_cents is not null and (v_pay is distinct from 'cash' or p_change_for_cents <= 0) then
    raise exception 'O troco só vale para pagamento em dinheiro.' using errcode = '22023';
  end if;

  v_res := public.place_public_order(p_channel, p_items, p_customer_name, p_customer_phone,
                                     p_delivery_address, p_notes, p_table_token);
  v_id := (v_res ->> 'id')::uuid;
  v_total := (v_res ->> 'total_cents')::integer;

  if p_change_for_cents is not null and p_change_for_cents < v_total then
    raise exception 'O valor para o troco precisa ser igual ou maior que o total do pedido.' using errcode = '22023';
  end if;
  if p_change_for_cents is not null and p_change_for_cents > v_total + 50000 then
    raise exception 'Valor para o troco muito alto. Informe uma nota menor ou fale com o restaurante.' using errcode = '22023';
  end if;

  update public.orders set pay_with = v_pay, change_for_cents = p_change_for_cents where id = v_id;
  return v_res || jsonb_build_object('pay_with', v_pay);
end $$;

-- Acompanhar pedido: igual ao anterior + forma de pagamento e, se for Pix ainda não pago, os dados para pagar.
create function public.public_order_status_v2(p_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_base jsonb;
  v_o public.orders;
  v_s public.settings;
  v_pix jsonb := null;
begin
  v_base := public.public_order_status(p_order_id);
  if v_base is null then
    return null;
  end if;
  select * into v_o from public.orders where id = p_order_id;
  select * into v_s from public.settings;
  if v_o.pay_with = 'pix' and v_o.paid_at is null and v_o.status <> 'cancelled'
     and nullif(trim(v_s.pix_key), '') is not null
     and nullif(trim(v_s.pix_name), '') is not null
     and nullif(trim(v_s.pix_city), '') is not null then
    v_pix := jsonb_build_object('key', trim(v_s.pix_key), 'name', trim(v_s.pix_name), 'city', trim(v_s.pix_city));
  end if;
  return v_base || jsonb_build_object('pay_with', v_o.pay_with, 'change_for_cents', v_o.change_for_cents, 'pix', v_pix);
end $$;

revoke execute on function
  public.public_menu_v2(text),
  public.place_public_order_v2(text, jsonb, text, text, text, text, text, text, integer),
  public.public_order_status_v2(uuid)
from public;
grant execute on function
  public.public_menu_v2(text),
  public.place_public_order_v2(text, jsonb, text, text, text, text, text, text, integer),
  public.public_order_status_v2(uuid)
to anon, authenticated;
