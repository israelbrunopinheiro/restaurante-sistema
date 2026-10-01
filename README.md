# Cordeiro's Refeições — sistema de gestão

Sistema web (funciona no celular, tablet e computador) para pedidos, cozinha e, nas próximas fases, caixa e financeiro.
Projeto independente, com banco e repositório próprios.

## Fase 1 (esta entrega): pedidos sem erro

| Tela | Quem usa | O que faz |
|---|---|---|
| **Novo pedido** | dono, atendente | Pedido de **mesa, retirada, delivery ou WhatsApp**, com observação por item ("sem cebola") |
| **Pedidos** | dono, atendente | Fila do dia, avançar status, cancelar com motivo, total do dia |
| **Cozinha** | dono, cozinha | Pedidos entrando ao vivo em 3 colunas, observações em destaque, aviso sonoro, alerta de atraso |
| **Cardápio** | dono | Categorias e produtos, preço, pausar/reativar |
| **Configurações** | dono | Nome, taxa de entrega, mesas, aprovação da equipe |

Como o app evita pedido errado: o pedido é digitado **uma vez** e aparece na tela da cozinha; **preços e totais são
calculados no banco** (o app só envia produto, quantidade e observação); cada pedido guarda o nome e o preço da época.

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

## Banco de dados (Supabase)

Migrações em `supabase/migrations/`, aplicadas em ordem. Pontos importantes:

- **Dinheiro em centavos** (inteiro). Fuso do restaurante: `America/Manaus`; a numeração dos pedidos reinicia a cada dia.
- **RLS em todas as tabelas.** Sem login não se lê nada. O cardápio só o dono altera. Pedidos **não** são gravados
  direto: passam por `create_order` e `set_order_status`, que validam perfil, itens, preços e transições de status.
- Status: `new → preparing → ready → delivered`, com volta de um passo e `cancelled` (a cozinha não cancela).
- `private.create_order_internal` é a mesma criação de pedido **sem checagem de usuário**, reservada para o atendente
  de WhatsApp (Fase 1.5), que vai rodar no servidor.
- Tempo real: `orders` e `order_items` estão na publicação `supabase_realtime`. Se a conexão cair, as telas
  recarregam sozinhas ao voltar para a aba, ao reconectar e a cada 30 s.

## Próximas fases

- **1.5** Atendente de WhatsApp com IA (API oficial do WhatsApp Business): lê a mensagem, confirma o pedido com o
  cliente e lança direto na cozinha.
- **2** Caixa: abertura/fechamento, sangria, formas de pagamento, fechamento de conta da mesa (soma dos pedidos).
- **3** Financeiro: contas a pagar/receber, fluxo de caixa, resultado do mês, painel.
- Depois: editar pedido já enviado, impressão de comanda, fichas técnicas/estoque, reservas.
