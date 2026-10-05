-- Funções públicas do cardápio online. São as ÚNICAS portas abertas a quem não tem login:
-- as tabelas continuam fechadas. Preço e total vêm sempre do banco; o cliente só escolhe produto e quantidade.

-- Resumo (hash) do IP de quem chama, para limitar abuso. Sem cabeçalho, retorna null.
create function private.client_ip_hash()
returns text language plpgsql stable set search_path = '' as $$
declare v_h text; v_ip text;
begin
  v_h := current_setting('request.headers', true);
  if v_h is null or v_h = '' then
    return null;
  end if;
  v_ip := nullif(trim(split_part(coalesce(v_h::json ->> 'x-forwarded-for', ''), ',', 1)), '');
  v_ip := coalesce(v_ip, nullif(trim(v_h::json ->> 'cf-connecting-ip'), ''));
  return md5(v_ip);
exception when others then
  return null;
end $$;
revoke all on function private.client_ip_hash() from public, anon, authenticated;

-- ───────── Cardápio público ─────────
create function public.public_menu(p_table_token text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_s public.settings;
  v_table public.dining_tables;
  v_cats jsonb;
begin
  select * into v_s from public.settings;
  if not v_s.online_open then
    return jsonb_build_object('open', false, 'restaurant_name', v_s.restaurant_name);
  end if;

  if p_table_token is not null and length(p_table_token) between 8 and 64 then
    select * into v_table from public.dining_tables where qr_token = p_table_token and active;
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object('id', c.id, 'name', c.name, 'products', pr.products)
           order by c.position, c.name), '[]'::jsonb)
  into v_cats
  from public.categories c
  cross join lateral (
    select jsonb_agg(
             jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'price_cents', p.price_cents)
             order by p.position, p.name) as products
    from public.products p
    where p.category_id = c.id and p.active
  ) pr
  where c.active and pr.products is not null;

  return jsonb_build_object(
    'open', true,
    'restaurant_name', v_s.restaurant_name,
    'pickup', v_s.online_pickup,
    'delivery', v_s.online_delivery,
    'delivery_fee_cents', v_s.delivery_fee_cents,
    'min_cents', v_s.online_min_cents,
    'table_requested', p_table_token is not null,
    'table', case when v_table.id is not null and v_s.online_table
                  then jsonb_build_object('label', v_table.label) end,
    'categories', v_cats
  );
end $$;

-- ───────── Fazer pedido ─────────
create function public.place_public_order(
  p_channel text,
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text default null,
  p_notes text default null,
  p_table_token text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.settings;
  v_table public.dining_tables;
  v_ch public.order_channel;
  v_order public.orders;
  v_item jsonb;
  v_name text := nullif(trim(p_customer_name), '');
  v_digits text := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  v_addr text := nullif(trim(p_delivery_address), '');
  v_notes text := nullif(trim(p_notes), '');
  v_hash text := private.client_ip_hash();
  n integer;
begin
  select * into v_s from public.settings;
  if not v_s.online_open then
    raise exception 'O restaurante não está recebendo pedidos online agora.' using errcode = '22023';
  end if;
  if p_channel is null or p_channel not in ('table', 'pickup', 'delivery') then
    raise exception 'Escolha como quer receber o pedido.' using errcode = '22023';
  end if;
  v_ch := p_channel::public.order_channel;

  if v_ch = 'pickup' and not v_s.online_pickup then
    raise exception 'Retirada indisponível no momento.' using errcode = '22023';
  end if;
  if v_ch = 'delivery' and not v_s.online_delivery then
    raise exception 'Delivery indisponível no momento.' using errcode = '22023';
  end if;
  if v_ch = 'table' then
    if not v_s.online_table or p_table_token is null or length(p_table_token) not between 8 and 64 then
      raise exception 'Pedido pela mesa indisponível. Chame o atendente.' using errcode = '22023';
    end if;
    select * into v_table from public.dining_tables where qr_token = p_table_token and active;
    if not found then
      raise exception 'QR code da mesa inválido. Chame o atendente.' using errcode = '22023';
    end if;
  end if;

  if v_name is null or length(v_name) < 2 or length(v_name) > 60 then
    raise exception 'Informe seu nome (de 2 a 60 letras).' using errcode = '22023';
  end if;
  if length(v_digits) < 10 or length(v_digits) > 13 then
    raise exception 'Informe um telefone válido, com DDD.' using errcode = '22023';
  end if;
  if v_ch = 'delivery' and (v_addr is null or length(v_addr) < 8 or length(v_addr) > 200) then
    raise exception 'Informe o endereço de entrega completo.' using errcode = '22023';
  end if;
  if v_notes is not null and length(v_notes) > 200 then
    raise exception 'A observação do pedido passou de 200 letras.' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'Escolha de 1 a 30 itens.' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Item inválido.' using errcode = '22023';
    end if;
    begin
      if (v_item ->> 'quantity')::integer not between 1 and 20 then
        raise exception 'Quantidade de 1 a 20 por item.' using errcode = '22023';
      end if;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Quantidade inválida.' using errcode = '22023';
    end;
    if length(coalesce(v_item ->> 'notes', '')) > 100 then
      raise exception 'A observação de um item passou de 100 letras.' using errcode = '22023';
    end if;
  end loop;

  -- limites contra abuso (pedidos online recentes)
  select count(*) into n from public.orders
  where source = 'online' and customer_phone = v_digits and created_at > now() - interval '1 hour';
  if n >= 4 then
    raise exception 'Muitos pedidos deste telefone em pouco tempo. Ligue para o restaurante.' using errcode = '22023';
  end if;
  if v_hash is not null then
    select count(*) into n from public.orders
    where source = 'online' and client_hash = v_hash and created_at > now() - interval '10 minutes';
    if n >= 8 then
      raise exception 'Muitos pedidos deste aparelho em pouco tempo. Tente de novo em alguns minutos.' using errcode = '22023';
    end if;
  end if;
  if v_table.id is not null then
    select count(*) into n from public.orders
    where source = 'online' and dining_table_id = v_table.id and created_at > now() - interval '10 minutes';
    if n >= 6 then
      raise exception 'Muitos pedidos desta mesa em pouco tempo. Chame o atendente.' using errcode = '22023';
    end if;
  end if;
  select count(*) into n from public.orders where source = 'online' and created_at > now() - interval '10 minutes';
  if n >= 60 then
    raise exception 'Estamos com muitos pedidos agora. Tente de novo em alguns minutos.' using errcode = '22023';
  end if;

  -- cria o pedido pelo mesmo caminho do atendente (preços e totais calculados no banco)
  v_order := private.create_order_internal(v_ch, v_table.id, v_name, v_digits, v_addr, v_notes, p_items, null);

  if v_order.total_cents > 300000 then
    raise exception 'Pedido muito grande para o cardápio online. Ligue para o restaurante.' using errcode = '22023';
  end if;
  if v_ch <> 'table' and v_order.subtotal_cents < v_s.online_min_cents then
    raise exception 'O pedido mínimo é %.', private.fmt_brl(v_s.online_min_cents) using errcode = '22023';
  end if;

  update public.orders set source = 'online', client_hash = v_hash where id = v_order.id;

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'total_cents', v_order.total_cents
  );
end $$;

-- ───────── Acompanhar pedido (só os feitos online; o id do pedido é a "chave") ─────────
create function public.public_order_status(p_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_o public.orders;
  v_items jsonb;
begin
  select * into v_o from public.orders where id = p_order_id and source = 'online';
  if not found then
    return null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('name', product_name, 'quantity', quantity, 'notes', notes)
                            order by created_at, id), '[]'::jsonb)
  into v_items from public.order_items where order_id = v_o.id;

  return jsonb_build_object(
    'order_number', v_o.order_number,
    'status', v_o.status,
    'channel', v_o.channel,
    'total_cents', v_o.total_cents,
    'delivery_fee_cents', v_o.delivery_fee_cents,
    'created_at', v_o.created_at,
    'paid', v_o.paid_at is not null,
    'table_label', (select label from public.dining_tables where id = v_o.dining_table_id),
    'items', v_items
  );
end $$;

revoke execute on function
  public.public_menu(text),
  public.place_public_order(text, jsonb, text, text, text, text, text),
  public.public_order_status(uuid)
from public;
grant execute on function
  public.public_menu(text),
  public.place_public_order(text, jsonb, text, text, text, text, text),
  public.public_order_status(uuid)
to anon, authenticated;
