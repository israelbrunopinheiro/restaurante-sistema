-- Índices nas chaves estrangeiras (recomendação do verificador de desempenho do Supabase).
create index if not exists order_items_product_idx on public.order_items (product_id);
create index if not exists orders_created_by_idx on public.orders (created_by);
create index if not exists orders_dining_table_idx on public.orders (dining_table_id);
