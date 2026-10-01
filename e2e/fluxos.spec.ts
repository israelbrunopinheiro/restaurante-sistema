/**
 * Testes de navegador com a rede simulada (nenhum dado real é tocado).
 * Verificam telas, validações, permissões por perfil e o que é enviado ao banco.
 * As regras do banco em si (RLS, preços, transições, caixa) são testadas direto no Postgres.
 */
import { expect, test } from '@playwright/test'
import { seedOrder, setup } from './mock'

test('sem login, vai para a tela de entrar', async ({ page }) => {
  await page.route(/supabase\.co/, (r) => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: '[]' }))
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
  await page.getByRole('button', { name: 'Primeiro acesso? Criar conta' }).click()
  await expect(page.getByLabel('Seu nome')).toBeVisible()
  await expect(page.getByText('A primeira conta criada vira a do dono')).toBeVisible()
})

test('conta ainda não aprovada vê a tela de espera', async ({ page }) => {
  await setup(page, { role: 'attendant', active: false })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Aguardando aprovação' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Novo pedido' })).toHaveCount(0)
})

test('dono vê todas as abas; atendente não vê cardápio nem configurações', async ({ page }) => {
  const { pageErrors } = await setup(page, { role: 'owner' })
  await page.goto('/')
  await expect(page).toHaveURL(/\/novo-pedido$/)
  const nav = page.getByRole('navigation', { name: 'Principal' })
  for (const tab of ['Novo pedido', 'Pedidos', 'Cozinha', 'Cardápio', 'Configurações']) {
    await expect(nav.getByRole('link', { name: tab })).toBeVisible()
  }
  await expect(page.getByText("Cordeiro's Refeições").first()).toBeVisible()
  expect(pageErrors).toEqual([])

  const page2 = await page.context().newPage()
  await setup(page2, { role: 'attendant' })
  await page2.goto('/cardapio')
  await expect(page2).toHaveURL(/\/novo-pedido$/)
  await expect(page2.getByRole('navigation', { name: 'Principal' }).getByRole('link')).toHaveCount(3)
})

test('cozinha só enxerga a própria tela', async ({ page }) => {
  await setup(page, { role: 'kitchen' })
  await page.goto('/')
  await expect(page).toHaveURL(/\/cozinha$/)
  await page.goto('/novo-pedido')
  await expect(page).toHaveURL(/\/cozinha$/)
  await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link')).toHaveCount(1)
})

test('lançar pedido de mesa envia itens e observações, sem preço', async ({ page }) => {
  const { calls, pageErrors } = await setup(page, { role: 'attendant' })
  await page.goto('/novo-pedido')

  // mesas em ordem natural: 1, 2, 10
  const mesas = page.getByRole('radiogroup', { name: 'Mesa' }).getByRole('radio')
  await expect(mesas).toHaveCount(3)
  expect(await mesas.allTextContents()).toEqual(['Mesa 1', 'Mesa 2', 'Mesa 10'])

  await page.getByRole('radio', { name: 'Mesa 2' }).click()
  await page.getByTestId('product-p1').click()
  await page.getByTestId('product-p1').click()
  await page.getByTestId('product-p2').click()
  await page.getByLabel('Observação de Feijoada').fill('sem cebola')

  await expect(page.getByText('3 itens')).toBeVisible()
  await expect(page.getByText(/R\$\s*78,00/).last()).toBeVisible()

  await page.getByRole('button', { name: 'Enviar para a cozinha' }).click()
  await expect(page.getByText(/Pedido #1/)).toBeVisible()

  expect(calls.rpc).toHaveLength(1)
  const body = calls.rpc[0].body
  expect(calls.rpc[0].name).toBe('create_order')
  expect(body.p_channel).toBe('table')
  expect(body.p_dining_table_id).toBe('t2')
  expect(body.p_items).toEqual([
    { product_id: 'p1', quantity: 2, notes: 'sem cebola' },
    { product_id: 'p2', quantity: 1, notes: null },
  ])
  expect(JSON.stringify(body)).not.toMatch(/price/i)
  // carrinho esvaziado depois de enviar
  await expect(page.getByText('Toque nos produtos acima para adicionar.')).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('validações: mesa, telefone e endereço são exigidos antes de enviar', async ({ page }) => {
  const { calls } = await setup(page, { role: 'attendant' })
  await page.goto('/novo-pedido')

  await page.getByTestId('product-p1').click()
  await page.getByRole('button', { name: 'Enviar para a cozinha' }).click()
  await expect(page.getByRole('alert')).toContainText('Escolha a mesa')

  await page.getByRole('radio', { name: /Delivery/ }).click()
  await page.getByRole('button', { name: 'Enviar para a cozinha' }).click()
  await expect(page.getByRole('alert')).toContainText('telefone')

  await page.getByLabel(/Telefone/).fill('92999990000')
  await page.getByRole('button', { name: 'Enviar para a cozinha' }).click()
  await expect(page.getByRole('alert')).toContainText('endereço')

  // delivery mostra a taxa e o total com ela
  await expect(page.getByText('Taxa de entrega')).toBeVisible()
  await expect(page.getByText(/R\$\s*40,00/).last()).toBeVisible()

  await page.getByLabel(/Endereço de entrega/).fill('Rua A, 10')
  await page.getByRole('button', { name: 'Enviar para a cozinha' }).click()
  await expect(page.getByText(/Pedido #1/)).toBeVisible()
  expect(calls.rpc).toHaveLength(1)
  expect(calls.rpc[0].body).toMatchObject({ p_channel: 'delivery', p_customer_phone: '92999990000', p_delivery_address: 'Rua A, 10' })
})

test('lista de pedidos mostra observações em destaque e avança o status', async ({ page }) => {
  const { calls, pageErrors } = await setup(page, { role: 'attendant', orders: [seedOrder] })
  await page.goto('/pedidos')

  const card = page.getByTestId('order-7')
  await expect(card).toContainText('Mesa 2')
  await expect(card).toContainText('2× Feijoada')
  await expect(card).toContainText('⚠ sem cebola')
  await expect(card).toContainText('Cliente com pressa')
  await expect(card.getByText('Novo')).toBeVisible()

  await card.getByRole('button', { name: 'Iniciar preparo' }).click()
  await expect.poll(() => calls.rpc.map((c) => c.name)).toContain('set_order_status')
  expect(calls.rpc.at(-1)?.body).toMatchObject({ p_order_id: 'o-seed', p_status: 'preparing' })
  expect(pageErrors).toEqual([])
})

test('cozinha: pedido novo aparece em destaque e vai para "Preparando"', async ({ page }) => {
  const { calls, pageErrors } = await setup(page, { role: 'kitchen', orders: [seedOrder] })
  await page.goto('/cozinha')

  const news = page.getByRole('region', { name: 'Novos' })
  const card = news.getByTestId('kitchen-order-7')
  await expect(card).toContainText('#7')
  await expect(card).toContainText('Mesa 2')
  await expect(card).toContainText('⚠ sem cebola')

  await card.getByRole('button', { name: /Começar/ }).click()
  await expect.poll(() => calls.rpc.length).toBe(1)
  expect(calls.rpc[0]).toMatchObject({ name: 'set_order_status', body: { p_order_id: 'o-seed', p_status: 'preparing' } })
  await expect(page.getByRole('region', { name: 'Preparando' }).getByTestId('kitchen-order-7')).toBeVisible()
  expect(pageErrors).toEqual([])
})
