/** Financeiro e painel de vendas — com a rede simulada. */
import { expect, test } from '@playwright/test'
import { addDaysIso, manausDate, setup, tableOrder } from './mock'

const hoje = manausDate()

test('conta a pagar repetida: cria uma por mês, paga uma e atualiza os totais', async ({ page }) => {
  const { calls, pageErrors } = await setup(page, { role: 'owner' })
  await page.goto('/financeiro')
  await page.getByRole('tab', { name: 'Contas a pagar' }).click()
  await expect(page.getByText('Nenhuma conta em aberto.')).toBeVisible()

  await page.getByRole('button', { name: '+ Nova conta a pagar' }).click()
  const d = page.getByRole('dialog')
  await d.getByLabel('Descrição').fill('Aluguel do salão')
  await d.getByLabel(/Fornecedor/).fill('Imobiliária Rio')
  await d.getByLabel('Categoria').selectOption({ label: 'Aluguel' })
  await d.getByLabel('Valor (R$)').fill('1.200,00')
  await d.getByLabel('Vencimento').fill(addDaysIso(hoje, 10))
  await d.getByLabel(/Repetir por quantos meses/).fill('3')
  await d.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText('3 lançamentos criados (um por mês).')).toBeVisible()
  await expect(page.getByTestId('open-total')).toHaveText(/R\$\s*3\.600,00/)
  await expect(page.getByTestId('entry-Aluguel do salão-1')).toContainText('1/3')
  await expect(page.getByTestId('entry-Aluguel do salão-3')).toContainText('3/3')
  expect(calls.rpc.find((c) => c.name === 'create_finance_entry')!.body).toMatchObject({
    p_kind: 'payable', p_amount_cents: 120000, p_repeat_months: 3, p_party: 'Imobiliária Rio',
  })

  // paga a primeira pelo Pix
  await page.getByTestId('entry-Aluguel do salão-1').getByRole('button', { name: 'Pagar' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText(/Pagamento de R\$\s*1\.200,00 registrado/)).toBeVisible()
  await expect(page.getByTestId('open-total')).toHaveText(/R\$\s*2\.400,00/)
  await page.getByRole('radio', { name: /Pagas/ }).click()
  await expect(page.getByTestId('entry-Aluguel do salão-1')).toContainText('Pago em')
  await expect(page.getByTestId('entry-Aluguel do salão-1')).toContainText('Pix')
  expect(pageErrors).toEqual([])
})

test('pagar pela gaveta registra sangria; com o caixa fechado mostra o erro', async ({ page }) => {
  const entry = {
    id: 'g1', kind: 'payable', category_id: 'fc-gas', description: 'Botijão de gás', party: null, amount_cents: 8000, due_date: hoje, notes: null,
    series_id: null, installment: null, installments: null, paid_at: null, paid_date: null, paid_amount_cents: null, paid_method: null,
    paid_from_drawer: false, created_by: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
  const { calls, movements } = await setup(page, { role: 'owner', entries: [entry], cash: { open: false } })
  await page.goto('/financeiro')
  await page.getByRole('tab', { name: 'Contas a pagar' }).click()
  const row = page.getByTestId('entry-Botijão de gás-1')
  await expect(row).toContainText('Vence hoje')

  await row.getByRole('button', { name: 'Pagar' }).click()
  const d = page.getByRole('dialog')
  await expect(d.getByText(/Saiu do dinheiro da gaveta/)).toHaveCount(0) // só aparece com forma = dinheiro
  await d.getByLabel('Forma de pagamento').selectOption('cash')
  await d.getByLabel(/Saiu do dinheiro da gaveta/).check()
  await d.getByRole('button', { name: 'Confirmar' }).click()
  await expect(d.getByRole('alert')).toContainText('Abra o caixa')
  expect(movements).toHaveLength(0)
  await d.getByLabel(/Saiu do dinheiro da gaveta/).uncheck()
  await d.getByLabel('Forma de pagamento').selectOption('pix')
  await expect(d.getByLabel(/Saiu do dinheiro da gaveta/)).toHaveCount(0)
  await d.getByRole('button', { name: 'Cancelar' }).click()
  expect(calls.rpc.filter((c) => c.name === 'pay_finance_entry').at(-1)!.body).toMatchObject({ p_from_drawer: true, p_method: 'cash' })
})

test('com o caixa aberto, a baixa pela gaveta lança a sangria e o esperado cai', async ({ page }) => {
  const entry = {
    id: 'g1', kind: 'payable', category_id: 'fc-gas', description: 'Botijão de gás', party: null, amount_cents: 8000, due_date: hoje, notes: null,
    series_id: null, installment: null, installments: null, paid_at: null, paid_date: null, paid_amount_cents: null, paid_method: null,
    paid_from_drawer: false, created_by: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
  const { movements } = await setup(page, { role: 'owner', entries: [entry], cash: { open: true, opening_cents: 20000 } })
  await page.goto('/financeiro')
  await page.getByRole('tab', { name: 'Contas a pagar' }).click()
  await page.getByTestId('entry-Botijão de gás-1').getByRole('button', { name: 'Pagar' }).click()
  const d = page.getByRole('dialog')
  await d.getByLabel('Forma de pagamento').selectOption('cash')
  await d.getByLabel(/Saiu do dinheiro da gaveta/).check()
  await d.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText(/sangria lançado no caixa/)).toBeVisible()
  expect(movements).toMatchObject([{ kind: 'withdrawal', amount_cents: 8000, entry_id: 'g1' }])

  await page.goto('/caixa')
  await expect(page.getByTestId('expected-cash')).toHaveText(/R\$\s*120,00/) // 200 − 80
})

test('contas vencidas aparecem em destaque, com texto e não só cor', async ({ page }) => {
  const base = { kind: 'payable', category_id: 'fc-ing', party: 'Mercado', notes: null, series_id: null, installment: null, installments: null,
    paid_at: null, paid_date: null, paid_amount_cents: null, paid_method: null, paid_from_drawer: false, created_by: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  await setup(page, { role: 'owner', entries: [
    { ...base, id: 'v1', description: 'Compra de carne', amount_cents: 30000, due_date: addDaysIso(hoje, -3) },
    { ...base, id: 'v2', description: 'Compra de arroz', amount_cents: 5000, due_date: addDaysIso(hoje, 2) },
    { ...base, id: 'v3', description: 'Compra de óleo', amount_cents: 7000, due_date: addDaysIso(hoje, 30) },
  ] })
  await page.goto('/financeiro')
  await page.getByRole('tab', { name: 'Contas a pagar' }).click()
  await expect(page.getByTestId('open-total')).toHaveText(/R\$\s*420,00/)
  await expect(page.getByTestId('overdue-total')).toHaveText(/R\$\s*300,00/)
  await expect(page.getByTestId('entry-Compra de carne-1')).toContainText('⚠ Vencida')
  await expect(page.getByTestId('entry-Compra de arroz-1')).toContainText('Vence em breve')
  await expect(page.getByTestId('entry-Compra de óleo-1')).toContainText('Em aberto')
  const ordem = await page.locator('[data-testid^="entry-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
  expect(ordem).toEqual(['entry-Compra de carne-1', 'entry-Compra de arroz-1', 'entry-Compra de óleo-1']) // vence primeiro, aparece primeiro
  await page.getByRole('radio', { name: /Vencidas/ }).click()
  await expect(page.locator('[data-testid^="entry-"]')).toHaveCount(1)
})

test('resumo: entradas (vendas + outras), saídas, resultado, gráfico com dica e tabela', async ({ page }) => {
  const orders = [tableOrder('a', 1, 7800, 30, 't1'), tableOrder('b', 2, 3500, 20, 't2')]
  const receita = { id: 'r1', kind: 'receivable', category_id: 'fc-evt', description: 'Evento da empresa X', party: 'Empresa X', amount_cents: 50000, due_date: hoje,
    notes: null, series_id: null, installment: null, installments: null, paid_at: null, paid_date: null, paid_amount_cents: null, paid_method: null,
    paid_from_drawer: false, created_by: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  const despesa = { ...receita, id: 'd1', kind: 'payable', category_id: 'fc-alu', description: 'Aluguel', party: null, amount_cents: 118000 }
  await setup(page, { role: 'owner', orders, entries: [receita, despesa], cash: { open: true, opening_cents: 10000 } })

  // recebe a conta da mesa 1 (R$ 78) e da mesa 2 (R$ 35) no caixa
  await page.goto('/caixa')
  for (const t of ['t1', 't2']) {
    await page.getByTestId(`receivable-table:${t}`).getByRole('button', { name: /Receber/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Pix/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Confirmar/ }).click()
  }
  await expect(page.getByTestId('total-pix')).toHaveText(/R\$\s*113,00/)

  await page.goto('/financeiro')
  await page.getByRole('tab', { name: 'Contas a receber' }).click()
  await page.getByTestId('entry-Evento da empresa X-1').getByRole('button', { name: 'Receber' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click()
  await page.getByRole('tab', { name: 'Contas a pagar' }).click()
  await page.getByTestId('entry-Aluguel-1').getByRole('button', { name: 'Pagar' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click()

  await page.getByRole('tab', { name: 'Resumo' }).click()
  await page.getByRole('radio', { name: 'Hoje' }).click()
  await expect(page.getByTestId('income')).toHaveText(/R\$\s*613,00/) // 113 de vendas + 500 do evento
  await expect(page.getByTestId('expenses')).toHaveText(/R\$\s*1\.180,00/)
  await expect(page.getByTestId('result')).toHaveText(/−\s*R\$\s*567,00/)
  await expect(page.getByText('▼ Saiu mais do que entrou')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Saídas por categoria' })).toContainText('Aluguel')

  // período de vários dias: aparece o gráfico de entradas × saídas, com legenda, dica e tabela
  await page.getByRole('radio', { name: 'Últimos 7 dias' }).click()
  const chart = page.getByRole('region', { name: 'Entradas e saídas por dia' })
  await expect(chart.getByText('Entradas', { exact: true })).toBeVisible()
  await expect(chart.getByText('Saídas', { exact: true })).toBeVisible()
  const hojeCol = chart.getByRole('button', { name: new RegExp(`^${hoje.slice(8)}/${hoje.slice(5, 7)}: Entradas`) })
  await hojeCol.hover()
  await expect(chart.getByRole('tooltip')).toContainText('R$ 613,00')
  await expect(chart.getByRole('tooltip')).toContainText('R$ 1.180,00')
  await chart.getByRole('button', { name: 'Ver tabela' }).click()
  await expect(chart.getByRole('table')).toContainText('R$ 613,00')
  await chart.getByRole('button', { name: 'Ver gráfico' }).click()
  await expect(hojeCol).toBeVisible()
})

test('painel de vendas: faturamento, ticket médio, mais vendidos, horários e canais', async ({ page }) => {
  const orders = [tableOrder('a', 1, 7800, 30, 't1'), tableOrder('b', 2, 3500, 20, 't2'), { ...tableOrder('c', 3, 4000, 10, 't1'), status: 'cancelled' }]
  const { pageErrors } = await setup(page, { role: 'owner', orders })
  await page.goto('/painel')
  await expect(page.getByRole('heading', { name: 'Painel de vendas' })).toBeVisible()
  await expect(page.getByText('R$ 113,00').first()).toBeVisible() // faturamento (cancelado fora)
  await expect(page.getByText('2 pedidos').first()).toBeVisible()
  await expect(page.getByText('R$ 56,50').first()).toBeVisible() // ticket médio
  await expect(page.getByText(/1 pedido cancelado \(R\$\s*40,00\)/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Mais vendidos' })).toContainText('Feijoada')
  await expect(page.getByRole('region', { name: 'Canais' })).toContainText('Mesa')
  await expect(page.getByRole('region', { name: 'Pedidos por horário' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Faturamento por dia' })).toHaveCount(0) // dia único: sem gráfico por dia

  await page.getByRole('radio', { name: 'Últimos 7 dias' }).click()
  const porDia = page.getByRole('region', { name: 'Faturamento por dia' })
  await expect(porDia).toBeVisible()
  await porDia.getByRole('button', { name: 'Ver tabela' }).click()
  await expect(porDia.getByRole('table')).toContainText('R$ 113,00')

  await page.getByRole('radio', { name: 'Ontem' }).click()
  await expect(page.getByText('Nenhum pedido neste período.')).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('atendente e cozinha não entram em Painel nem Financeiro', async ({ page, context }) => {
  await setup(page, { role: 'attendant' })
  await page.goto('/financeiro')
  await expect(page).toHaveURL(/\/novo-pedido$/)
  await page.goto('/painel')
  await expect(page).toHaveURL(/\/novo-pedido$/)
  const nav = page.getByRole('navigation', { name: 'Principal' })
  await expect(nav.getByRole('link', { name: 'Financeiro' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Painel' })).toHaveCount(0)

  const outra = await context.newPage()
  await setup(outra, { role: 'kitchen' })
  await outra.goto('/financeiro')
  await expect(outra).toHaveURL(/\/cozinha$/)

  const dono = await context.newPage()
  await setup(dono, { role: 'owner' })
  await dono.goto('/')
  await expect(dono.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Financeiro' })).toBeVisible()
  await expect(dono.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Painel' })).toBeVisible()
})
