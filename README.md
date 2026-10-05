# Cordeiro's Refeições — sistema de gestão

Sistema web (funciona no celular, tablet e computador) para pedidos, cozinha, caixa e financeiro.
Projeto independente, com banco e repositório próprios.

## Fase 1: pedidos sem erro

| Tela | Quem usa | O que faz |
|---|---|---|
| **Novo pedido** | dono, atendente | Pedido de **mesa, retirada, delivery ou WhatsApp**, com observação por item ("sem cebola") |
| **Pedidos** | dono, atendente | Fila do dia, avançar status, cancelar com motivo, total do dia |
| **Cozinha** | dono, cozinha | Pedidos entrando ao vivo em 3 colunas, observações em destaque, aviso sonoro, alerta de atraso |
| **Cardápio** | dono | Categorias e produtos, preço, pausar/reativar |
| **Configurações** | dono | Nome, taxa de entrega, mesas, aprovação da equipe |

Como o app evita pedido errado: o pedido é digitado **uma vez** e aparece na tela da cozinha; **preços e totais são
calculados no banco** (o app só envia produto, quantidade e observação); cada pedido guarda o nome e o preço da época.

## Fase 2: caixa

| Tela | Quem usa | O que faz |
|---|---|---|
| **Caixa** | dono, atendente | Abrir e fechar o caixa, receber pagamentos, sangria e suprimento, estorno (dono), histórico (dono) |

- **Turno de caixa:** um por vez. Abre com o troco inicial; fecha com a contagem do dinheiro da gaveta.
- **Receber:** o pedido de **mesa** é cobrado pela **conta da mesa** (soma de todos os pedidos dela); retirada, delivery
  e WhatsApp são cobrados um a um. Pagamento em **dinheiro, Pix, débito ou crédito**, inteiro ou **dividido**
  (ex.: R$ 50 no Pix + o resto em dinheiro). Com dinheiro, a tela calcula o **troco**.
- **Sangria / suprimento:** exigem motivo; a sangria não passa do dinheiro que há na gaveta.
- **Fechamento:** o sistema mostra o dinheiro esperado (troco + vendas em dinheiro + suprimentos − sangrias) e você
  digita o contado. **Se houver diferença, o motivo é obrigatório.** Pix, débito e crédito não entram na gaveta:
  confira com o extrato do banco e da maquininha.
- **Estorno (só o dono):** lança valores negativos, sem apagar o histórico, e devolve o pedido para "A receber".
  Pedido pago **não pode ser cancelado** sem estornar antes.
- Atendente só enxerga o turno aberto; o histórico de caixas fechados é do dono.

## Fase 3: financeiro e painel de vendas (só o dono)

| Tela | O que faz |
|---|---|
| **Painel** | Faturamento, pedidos, ticket médio, mais vendidos, horários de pico e canais; por dia, semana ou mês |
| **Financeiro → Resumo** | Resultado do período (entradas − saídas), entradas e saídas por dia, saídas por categoria, contas em aberto |
| **Financeiro → Contas a pagar / a receber** | Lançamentos com vencimento e categoria, **repetição mensal** (aluguel de 12 meses), baixa com forma, valor e data, reabrir |
| **Financeiro → Categorias** | Categorias de despesas e de receitas (editáveis) |

- **Regime de caixa:** o resultado conta o dinheiro na data em que **entrou** (vendas recebidas no caixa, já descontados
  estornos, e outras receitas) ou **saiu** (contas pagas). Pedido ainda não pago e conta ainda não paga não entram.
- **Integração com o caixa:** ao pagar uma conta em dinheiro, dá para marcar "saiu da gaveta": o sistema lança a
  **sangria** sozinho (e o contrário para receitas, como suprimento). Reabrir a conta devolve o dinheiro.
- **Painel × Financeiro:** o painel mostra o que foi **vendido** (pedidos não cancelados, pagos ou não); o financeiro
  mostra o que foi **recebido e pago**. Os números podem diferir por causa de pedidos ainda não pagos.
- Valores do custo dos ingredientes só aparecem quando a compra é lançada como despesa (ainda não há estoque/fichas
  técnicas).

## Cardápio online (cliente pede sozinho)

Página pública, **sem login**: `/pedir` (retirada e delivery) e `/pedir?mesa=<código>` (QR de cada mesa). O cliente
escolhe os itens, informa nome e telefone (e endereço, no delivery), envia e **acompanha o andamento** em
`/pedir/pedido/<id>`. O pedido cai na cozinha e no caixa como qualquer outro, com a etiqueta **🌐 Online**.

- **Desligado por padrão.** O dono liga em **Configurações → Pedidos online** ("Aceitando pedidos online") e escolhe
  quais modalidades aceitar (retirada, delivery, pedido pela mesa) e o pedido mínimo.
- **QR codes** (`/qr`, só o dono): um geral e um por mesa, prontos para imprimir. Cada mesa tem um código secreto; "Trocar
  código" invalida o QR antigo.
- **Delivery é a prioridade:** vem marcado ao abrir o cardápio, com a **taxa de entrega** à vista no topo, na barra do carrinho
  e no resumo do pedido (sempre somada no total, calculada no servidor). Retirada mostra "não enviamos" e sem taxa.
- **Forma de pagamento** (Pix, dinheiro com troco ou cartão) escolhida pelo cliente. Com **Pix**, depois de enviar o pedido
  a página de acompanhamento mostra o **QR Code e o "copia e cola"** com o valor exato (BR Code estático, CRC conferido em
  teste). O dono cadastra a chave em **Configurações → Pix no cardápio online** (com QR de teste). **O sistema não recebe
  aviso do banco**: o restaurante confere o Pix no extrato e dá baixa no Caixa. A chave só é entregue a quem fez um pedido
  Pix ainda não pago.
- **Clareza para a equipe** (contra "esperto"): Esteira, Lista, Cozinha e Caixa mostram etiquetas grandes — `🛵 DELIVERY · taxa
  R$ 5,00` ou `🛍️ RETIRADA · não entregar` — e o pagamento declarado (`⚡ Pix · confira no banco`, `💵 troco p/ R$ 50`, `💳 Cartão`).
  Ao receber no Caixa, a forma escolhida vem pré-selecionada, com aviso para só dar baixa do Pix depois de ver o extrato.
- **Segurança.** Quem não tem login só acessa 3 funções do banco: `public_menu_v2`, `place_public_order_v2` e
  `public_order_status_v2` (as versões sem Pix continuam no banco); as tabelas continuam fechadas. O cliente envia apenas produto, quantidade e observação (o preço
  vem do banco), com limites de tamanho e de valor (teto de R$ 3.000 por pedido). **Limites contra abuso:** 4 pedidos por
  telefone por hora, 8 por aparelho (IP) a cada 10 minutos, 6 por mesa a cada 10 minutos e 60 no total a cada 10
  minutos. O acompanhamento só mostra itens e andamento (nunca telefone ou endereço) e só funciona para pedidos online.
- Se alguém abusar, cancele o pedido em **Pedidos** e desligue o recurso em Configurações.

## Primeiro acesso

1. Abra o sistema e clique em **Primeiro acesso? Criar conta**. **A primeira conta criada vira a do dono.**
   Faça isso antes de divulgar o endereço a qualquer pessoa.
2. Em **Configurações**: confira o nome, defina a taxa de entrega e crie as mesas.
3. Em **Cardápio**: crie as categorias e os produtos.
4. Cada funcionário cria a própria conta; o dono libera em **Configurações → Equipe** e escolhe a função
   (Atendente ou Cozinha).

## Rodando

```bash
npm install
cp .env.example .env.local   # preencha com URL e chave "publishable" do projeto Supabase
npm run dev                  # http://localhost:5173
```

```bash
npm run build       # typecheck + build de produção
npm test            # testes de unidade (dinheiro, carrinho, datas)
npm run test:e2e    # testes de navegador (rede simulada; precisa do Chromium do Playwright)
```

## Publicação (GitHub Pages)

Endereço: `https://israelbrunopinheiro.github.io/restaurante-sistema/`

**Caminho atual: branch `gh-pages`** (não depende do GitHub Actions). Para publicar uma versão nova, na raiz do projeto:

```bash
bash scripts/publicar-branch.sh   # gera o build com o endereço certo e envia para a branch gh-pages
```

Uso único, no GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, Branch `gh-pages`,
pasta `/ (root)`.

O workflow `.github/workflows/publicar.yml` (GitHub Actions) continua no repositório, mas só roda à mão: a fila de
execução do GitHub travou mais de uma vez. Para voltar a ele, veja o comentário no topo do arquivo.

Para hospedar em outro lugar (domínio próprio, cPanel, Vercel, Netlify), gere o build e envie a pasta `dist/`:

```bash
VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... npm run build        # na raiz do domínio
VITE_BASE=/subpasta/ VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... npm run build   # em subpasta
```

O servidor precisa mandar qualquer endereço desconhecido para o `index.html` (senão atualizar a página em `/caixa`
dá erro 404) e usar HTTPS. No Supabase, em *Authentication → URL Configuration*, coloque o endereço do site em
**Site URL** e em **Redirect URLs**.

## Banco de dados (Supabase)

Migrações em `supabase/migrations/`, aplicadas em ordem. Pontos importantes:

- **Dinheiro em centavos** (inteiro). Fuso do restaurante: `America/Manaus`; a numeração dos pedidos reinicia a cada dia.
- **RLS em todas as tabelas.** Sem login não se lê nada. O cardápio só o dono altera. Pedidos **não** são gravados
  direto: passam por `create_order` e `set_order_status`, que validam perfil, itens, preços e transições de status.
- **Cardápio online:** `settings.online_*`, `dining_tables.qr_token`, `orders.source`/`client_hash`; funções públicas
  (únicas liberadas para `anon`) em `20261006000008_online_funcoes.sql`; Pix e forma de pagamento em `…09` e `…10`
  (`settings.pix_*`, `orders.pay_with`/`change_for_cents`).
- **Financeiro:** `finance_categories` e `finance_entries` (só o dono lê). Lançamentos são criados por
  `create_finance_entry` (com repetição mensal) e baixados por `pay_finance_entry` / `reopen_finance_entry`; edição e
  exclusão diretas só valem para lançamentos **não baixados**. `finance_summary` e `sales_report` geram os relatórios.
- **Caixa:** `open_cash_session`, `add_cash_movement`, `pay_orders`, `refund_order`, `close_cash_session` e
  `cash_session_summary`. As tabelas `cash_sessions`, `payments` e `cash_movements` não aceitam escrita direta; um índice
  único garante **um só caixa aberto**. Cada linha de pagamento fica ligada a **um** pedido (pagamento dividido ou conta
  de mesa são distribuídos entre eles), então o estorno é exato por pedido.
- Status: `new → preparing → ready → delivered`, com volta de um passo e `cancelled` (a cozinha não cancela).
- `private.create_order_internal` é a mesma criação de pedido **sem checagem de usuário**, reservada para o atendente
  de WhatsApp (Fase 1.5), que vai rodar no servidor.
- Tempo real: `orders` e `order_items` estão na publicação `supabase_realtime`. Se a conexão cair, as telas
  recarregam sozinhas ao voltar para a aba, ao reconectar e a cada 30 s.

## Próximas fases

- Confirmação automática do Pix (exige conta de pagamentos com API/webhook), horário de funcionamento automático e bloqueio de telefones.
- **1.5** Atendente de WhatsApp com IA (API oficial do WhatsApp Business): lê a mensagem, confirma o pedido com o
  cliente e lança direto na cozinha.
- Depois: taxa de serviço (10%) e desconto na conta, editar pedido já enviado, impressão de comanda, fichas
  técnicas/estoque, reservas.
