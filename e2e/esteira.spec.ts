/** Esteira de pedidos (visão em colunas) na tela Pedidos — com a rede simulada. */
import { expect, test } from '@playwright/test'
import { manausDate, seedOrder, setup, tableOrder } from './mock'

const hoje = manausDate()
const noAr = (id: string, n: number, status: string, minAtras: number, extra: Record<string, unknown> = {}) => ({
  ...tableOrder(id, n, 3500, minAtras, 't1'), status, ...extra,
})

test('esteira: pedidos em colunas, na ordem do fluxo, com contagem e trilha de status', async ({ page }) => {
  const orders = [
    noAr('a', 1, 'new', 4), noAr('b', 2, 'new', 20, { notes: 'Cliente com pressa' }),
    noAr('c', 3, 'preparing', 12), noAr('d', 4, 'ready', 3, { source: 'online' }), noAr('e', 5, 'delivered', 40),
    { ...noAr('f', 6, 'cancelled', 50) },
  ]
  const { pageErrors } = await setup(page, { role: 'attendant', orders })
  await page.goto('/pedidos')

  await expect(page.getByRole('group', { name: 'Esteira de pedidos' })).toBeVisible()
  await expect(page.getByTestId('belt-count-new')).toHaveText('2')
  await expect(page.getByTestId('belt-count-preparing')).toHaveText('1')
  await expect(page.getByTestId('belt-count-ready')).toHaveText('1')
  await expect(page.getByTestId('belt-count-delivered')).toHaveText('1')

  // colunas na ordem do fluxo
  const titulos = await page.getByRole('group', { name: 'Esteira de pedidos' }).getByRole('heading').allTextContents()
  expect(titulos.map((t) => t.replace(/\d+$/, '').replace(/^\d/, '').trim())).toEqual(['Novos', 'Preparando', 'Prontos', 'Entregues hoje'])

  // o mais antigo primeiro dentro da coluna
  const novos = page.getByRole('region', { name: 'Novos' }).locator('[data-testid^="belt-order-"]')
  expect(await novos.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))).toEqual(['belt-order-2', 'belt-order-1'])

  // cartão: trilha, etiquetas, observação
  const online = page.getByTestId('belt-order-4')
  await expect(online).toContainText('🌐 Online')
  await expect(online.getByRole('list', { name: 'Andamento: Pronto' })).toBeVisible()
  await expect(page.getByTestId('belt-order-2')).toContainText('📝 Cliente com pressa')
  await expect(page.getByText('1 pedido cancelado hoje')).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('esteira: avançar leva o pedido para a próxima coluna e cancelar pede motivo', async ({ page }) => {
  const { calls } = await setup(page, { role: 'attendant', orders: [noAr('a', 1, 'new', 4), noAr('b', 2, 'preparing', 9)] })
  await page.goto('/pedidos')

  await page.getByTestId('belt-order-1').getByRole('button', { name: /Iniciar preparo/ }).click()
  await expect(page.getByRole('region', { name: 'Preparando' }).getByTestId('belt-order-1')).toBeVisible()
  await expect(page.getByTestId('belt-count-new')).toHaveText('0')
  await expect(page.getByTestId('belt-count-preparing')).toHaveText('2')
  expect(calls.rpc.at(-1)).toMatchObject({ name: 'set_order_status', body: { p_order_id: 'a', p_status: 'preparing' } })

  await page.getByTestId('belt-order-2').getByRole('button', { name: /Marcar pronto/ }).click()
  await expect(page.getByRole('region', { name: 'Prontos' }).getByTestId('belt-order-2')).toBeVisible()
  await page.getByTestId('belt-order-2').getByRole('button', { name: /Marcar entregue/ }).click()
  await expect(page.getByRole('region', { name: 'Entregues hoje' }).getByTestId('belt-order-2')).toBeVisible()
  await expect(page.getByTestId('belt-order-2').getByRole('button')).toHaveCount(0) // entregue: sem ações

  page.once('dialog', (d) => void d.accept('cliente desistiu'))
  await page.getByTestId('belt-order-1').getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByTestId('belt-order-1')).toHaveCount(0)
  expect(calls.rpc.at(-1)).toMatchObject({ body: { p_order_id: 'a', p_status: 'cancelled', p_reason: 'cliente desistiu' } })
  await expect(page.getByText('1 pedido cancelado hoje')).toBeVisible()
})

test('esteira: troca para a lista (lembra a escolha) e entregues em excesso vão para a lista', async ({ page }) => {
  const entregues = Array.from({ length: 8 }, (_, i) => noAr(`d${i}`, 10 + i, 'delivered', 30 + i))
  await setup(page, { role: 'attendant', orders: [noAr('a', 1, 'new', 4), ...entregues] })
  await page.goto('/pedidos')

  await expect(page.getByRole('region', { name: 'Entregues hoje' }).locator('[data-testid^="belt-order-"]')).toHaveCount(6)
  await page.getByRole('button', { name: /\+ 2 entregues · ver todos/ }).click()
  // foi para a lista, já filtrada em "Entregues"
  await expect(page.getByRole('radio', { name: /Lista/ })).toBeChecked()
  await expect(page.getByTestId('order-10')).toBeVisible()
  await expect(page.getByTestId('order-17')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Andamento: Entregue' }).first()).toBeVisible() // trilha também na lista

  await page.reload()
  await expect(page.getByRole('radio', { name: /Lista/ })).toBeChecked() // lembrou a escolha
  await page.getByRole('radio', { name: /Esteira/ }).click()
  await expect(page.getByRole('group', { name: 'Esteira de pedidos' })).toBeVisible()
})

test('versão do app aparece no rodapé da equipe, do login e da página do cliente', async ({ page }) => {
  await setup(page, { role: 'attendant', orders: [{ ...seedOrder }], online: { open: true } })
  await page.goto('/pedidos')
  await expect(page.getByTestId('versao')).toContainText(/versão .+ · \d\d\/\d\d,? \d\d:\d\d/)
  await page.goto('/pedir')
  await expect(page.getByTestId('versao')).toContainText('versão')
  void hoje
})
