# Cordeiro's Refeições — sistema de gestão

Sistema web (funciona no celular, tablet e computador) para pedidos, cozinha e caixa; o financeiro vem na próxima fase.
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

A cada atualização da `main`, o workflow `.github/workflows/publicar.yml` roda os testes, gera o build e publica em
`https://israelbrunopinheiro.github.io/restaurante-sistema/`.

Uso único, no GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

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

- **1.5** Atendente de WhatsApp com IA (API oficial do WhatsApp Business): lê a mensagem, confirma o pedido com o
  cliente e lança direto na cozinha.
- **3** Financeiro: contas a pagar/receber, fluxo de caixa, resultado do mês, painel.
- Depois: taxa de serviço (10%) e desconto na conta, editar pedido já enviado, impressão de comanda, fichas
  técnicas/estoque, reservas.
