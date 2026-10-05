-- Pix e forma de pagamento declarada pelo cliente no cardápio online.
-- O Pix é um QR "estático": o cliente paga no app do banco e o restaurante CONFERE no extrato (não há confirmação
-- automática). Por isso o sistema registra o que o cliente disse que vai usar, para a equipe saber o que esperar.

alter table public.settings
  add column pix_key text check (pix_key is null or length(pix_key) between 1 and 77),
  add column pix_name text check (pix_name is null or length(pix_name) between 1 and 25),
  add column pix_city text check (pix_city is null or length(pix_city) between 1 and 15);

alter table public.orders
  add column pay_with text check (pay_with in ('pix', 'cash', 'card')),
  add column change_for_cents integer check (change_for_cents > 0);
