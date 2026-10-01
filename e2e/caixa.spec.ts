/** Caixa: abrir, receber (inclusive dividido), sangria, fechar e estornar — com a rede simulada. */
import { expect, test } from '@playwright/test'
import { setup, tableOrder } from './mock'

const mesa1 = () => [
  tableOrder('a', 1, 7800, 30, 't1'),
  tableOrder('b', 2, 3500, 20, 't1'),
  tableOrder('c', 3, 3500, 10, 't2'),
]

test('caixa fechado: mostra o que há a receber, mas só deixa receber depois de abrir', async ({ page }) => {
  const { calls, pageErrors } = await setup(page, { role: 'attendant', orders: mesa1() })
  await page.goto('/caixa')

  await expect(page.getByRole('heading', { name: /Caixa fechado/ })).toBeVisible()
  await expect(page.getByText('Abra o caixa para poder receber.')).toBeVisible()
  const mesa = page.getByTestId('receivable-table:t1')
  await expect(mesa).toContainText('Mesa 1')
  await expect(mesa).toContainText('2 pedidos (#1, #2)')
  await expect(mesa.getByRole('button', { name: /Receber/ })).toBeDisabled()

  await page.getByLabel(/Troco inicial/).fill('100,00')
  await page.getByRole('button', { name: 'Abrir o caixa' }).click()
  await expect(page.getByRole('heading', { name: /Caixa aberto/ })).toBeVisible()
  await expect(page.getByTestId('expected-cash')).toHaveText(/R\$\s*100,00/)
  await expect(mesa.getByRole('button', { name: /Receber/ })).toBeEnabled()

  expect(calls.rpc.find((c) => c.name === 'open_cash_session')?.body).toEqual({ p_opening_cents: 10000 })
  expect(pageErrors).toEqual([])
})

test('conta da mesa: soma os pedidos, divide em Pix + dinheiro e calcula o troco', async ({ page }) => {
  const { calls, pageErrors } = await setup(page, { role: 'attendant', orders: mesa1(), cash: { open: true, opening_cents: 10000 } })
  await page.goto('/caixa')

  await page.getByTestId('receivable-table:t1').getByRole('button', { name: /Receber/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Total da conta')
  await expect(dialog).toContainText(/R\$\s*113,00/)
  await expect(dialog.getByRole('button', { name: /Confirmar/ })).toBeEnabled() // começa com tudo em dinheiro

  // divide: Pix 50,00 + dinheiro 63,00
  await dialog.getByRole('button', { name: /Pix/ }).click()
  await dialog.getByRole('button', { name: '+ Dividir em outra forma' }).click()
  await dialog.getByLabel('Valor do pagamento 1').fill('50,00')
  await expect(dialog).toContainText(/Falta receber R\$\s*63,00/)
  await expect(dialog.getByRole('button', { name: /Confirmar/ })).toBeDisabled()

  await dialog.getByLabel('Valor do pagamento 2').fill('63,00')
  await dialog.getByLabel('Forma do pagamento 2').selectOption('cash')
  await expect(dialog.getByRole('button', { name: /Confirmar/ })).toBeEnabled()

  // cliente entrega R$ 100 em dinheiro para pagar R$ 63 → troco R$ 37
  await dialog.getByLabel(/Dinheiro recebido do cliente/).fill('100')
  await expect(dialog.getByRole('status').filter({ hasText: 'Troco' })).toContainText(/R\$\s*37,00/)

  await dialog.getByRole('button', { name: /Confirmar/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(/Recebido R\$\s*113,00 — Mesa 1\. Troco: R\$\s*37,00/)).toBeVisible()

  const pay = calls.rpc.find((c) => c.name === 'pay_orders')!
  expect(pay.body.p_order_ids).toEqual(['a', 'b'])
  expect(pay.body.p_payments).toEqual([
    { method: 'pix', amount_cents: 5000 },
    { method: 'cash', amount_cents: 6300 },
  ])

  await expect(page.getByTestId('total-pix')).toHaveText(/R\$\s*50,00/)
  await expect(page.getByTestId('total-cash')).toHaveText(/R\$\s*63,00/)
  await expect(page.getByTestId('total-received')).toHaveText(/R\$\s*113,00/)
  await expect(page.getByTestId('expected-cash')).toHaveText(/R\$\s*163,00/)
  await expect(page.getByTestId('receivable-table:t1')).toHaveCount(0) // saiu de "A receber"
  await expect(page.getByTestId('receivable-table:t2')).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('pagamento: um toque paga a conta toda no Pix', async ({ page }) => {
  const { calls } = await setup(page, { role: 'attendant', orders: mesa1(), cash: { open: true } })
  await page.goto('/caixa')
  await page.getByTestId('receivable-table:t2').getByRole('button', { name: /Receber/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Pix/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Confirmar/ }).click()
  await expect(page.getByText(/Recebido R\$\s*35,00/)).toBeVisible()
  expect(calls.rpc.find((c) => c.name === 'pay_orders')!.body).toEqual({
    p_order_ids: ['c'],
    p_payments: [{ method: 'pix', amount_cents: 3500 }],
  })
})

test('sangria: não deixa tirar mais do que há na gaveta, exige motivo e atualiza o esperado', async ({ page }) => {
  const { calls } = await setup(page, { role: 'attendant', cash: { open: true, opening_cents: 10000 } })
  await page.goto('/caixa')

  await page.getByRole('button', { name: '− Sangria' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Valor (R$)').fill('150,00')
  await dialog.getByLabel('Motivo').fill('gás')
  await dialog.getByRole('button', { name: 'Registrar' }).click()
  await expect(dialog.getByRole('alert')).toContainText(/Só há R\$\s*100,00 em dinheiro/)

  await dialog.getByLabel('Valor (R$)').fill('30,00')
  await dialog.getByLabel('Motivo').fill('')
  await dialog.getByRole('button', { name: 'Registrar' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Informe o motivo')

  await dialog.getByLabel('Motivo').fill('pagamento do gás')
  await dialog.getByRole('button', { name: 'Registrar' }).click()
  await expect(page.getByText(/Sangria de R\$\s*30,00 registrado/)).toBeVisible()
  await expect(page.getByTestId('expected-cash')).toHaveText(/R\$\s*70,00/)
  await expect(page.getByRole('region', { name: 'Sangrias e suprimentos' })).toContainText('pagamento do gás')
  expect(calls.rpc.filter((c) => c.name === 'add_cash_movement')).toHaveLength(1)
})

test('fechar o caixa: mostra diferença ao vivo e só fecha com explicação', async ({ page }) => {
  const { calls, pageErrors } = await setup(page, { role: 'attendant', orders: mesa1(), cash: { open: true, opening_cents: 10000 } })
  await page.goto('/caixa')

  await page.getByRole('button', { name: 'Fechar o caixa' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(/Dinheiro esperado na gaveta/)

  await dialog.getByLabel(/Dinheiro contado/).fill('100,00')
  await expect(dialog.getByRole('status')).toContainText('Caixa batendo')

  await dialog.getByLabel(/Dinheiro contado/).fill('95,50')
  await expect(dialog.getByRole('status')).toContainText(/Faltando R\$\s*4,50/)
  await dialog.getByRole('button', { name: 'Fechar o caixa' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Explique o motivo')
  expect(calls.rpc.some((c) => c.name === 'close_cash_session')).toBe(false)

  await dialog.getByLabel(/Observações/).fill('troco dado a mais na mesa 3')
  await dialog.getByRole('button', { name: 'Fechar o caixa' }).click()

  await expect(page.getByTestId('closed-report')).toContainText(/Esperado R\$\s*100,00 · contado R\$\s*95,50/)
  await expect(page.getByTestId('closed-report')).toContainText(/Falta de R\$\s*4,50/)
  await expect(page.getByRole('heading', { name: /Caixa fechado/ }).first()).toBeVisible()
  expect(calls.rpc.find((c) => c.name === 'close_cash_session')!.body).toEqual({
    p_counted_cents: 9550,
    p_notes: 'troco dado a mais na mesa 3',
  })
  expect(pageErrors).toEqual([])
})

test('estorno: só o dono vê o botão, exige motivo e devolve o pedido para "A receber"', async ({ page, context }) => {
  const dono = await setup(page, { role: 'owner', orders: mesa1(), cash: { open: true } })
  await page.goto('/caixa')
  await page.getByTestId('receivable-table:t2').getByRole('button', { name: /Receber/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Confirmar/ }).click()
  await expect(page.getByTestId('paid-3')).toContainText('#3 · Mesa 2')

  page.once('dialog', (d) => void d.accept('cliente reclamou da comida'))
  await page.getByTestId('paid-3').getByRole('button', { name: 'Estornar' }).click()
  await expect(page.getByText(/Pagamento de #3 estornado/)).toBeVisible()
  await expect(page.getByTestId('paid-3')).toContainText('Estornado')
  await expect(page.getByTestId('receivable-table:t2')).toBeVisible()
  expect(dono.calls.rpc.find((c) => c.name === 'refund_order')!.body).toEqual({
    p_order_id: 'c',
    p_reason: 'cliente reclamou da comida',
  })

  // atendente paga, mas não vê o botão de estornar
  const outra = await context.newPage()
  await setup(outra, { role: 'attendant', orders: mesa1(), cash: { open: true } })
  await outra.goto('/caixa')
  await outra.getByTestId('receivable-table:t2').getByRole('button', { name: /Receber/ }).click()
  await outra.getByRole('dialog').getByRole('button', { name: /Confirmar/ }).click()
  await expect(outra.getByTestId('paid-3')).toBeVisible()
  await expect(outra.getByRole('button', { name: 'Estornar' })).toHaveCount(0)
  await expect(outra.getByRole('region', { name: 'Histórico de caixas' })).toHaveCount(0)
})

test('cozinha não enxerga o caixa; atendente e dono sim', async ({ page }) => {
  await setup(page, { role: 'kitchen' })
  await page.goto('/caixa')
  await expect(page).toHaveURL(/\/cozinha$/)

  const page2 = await page.context().newPage()
  await setup(page2, { role: 'attendant' })
  await page2.goto('/')
  await expect(page2.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Caixa' })).toBeVisible()
})
