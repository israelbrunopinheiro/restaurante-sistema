/** Cardápio online (cliente sem login) e os controles do dono — com a rede simulada. */
import { expect, test } from '@playwright/test'
import { setup, tables } from './mock'

const TOK1 = tables[0].qr_token

test('pedidos online fechados por padrão: o cliente vê o aviso, sem menu da equipe', async ({ page }) => {
  await setup(page, { role: 'owner' }) // mesmo com sessão do dono no aparelho, a rota é pública
  await page.goto('/pedir')
  await expect(page.getByRole('heading', { name: 'Pedidos online fechados' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(0)
  await expect(page.getByText("Cordeiro's Refeições").first()).toBeVisible()
})

test('QR da mesa: cliente monta o pedido, envia e acompanha', async ({ page }) => {
  const { calls, orders, pageErrors } = await setup(page, { role: 'attendant', online: { open: true } })
  await page.goto(`/pedir?mesa=${TOK1}`)
  await expect(page.getByText('Mesa 1', { exact: true })).toBeVisible()
  await expect(page.getByText('Seu pedido vai direto para a cozinha')).toBeVisible()

  await page.getByTestId('prod-p1').getByRole('button', { name: 'Adicionar' }).click()
  await page.getByRole('button', { name: 'Aumentar Feijoada' }).click()
  await page.getByTestId('prod-p2').getByRole('button', { name: 'Adicionar' }).click()
  await page.getByRole('button', { name: /Ver pedido · 3 itens · R\$\s*78,00/ }).click()

  const d = page.getByRole('dialog')
  await d.getByLabel('Observação de Feijoada').fill('sem cebola')
  await expect(d.getByTestId('checkout-total')).toHaveText(/R\$\s*78,00/)
  await expect(d.getByText(/Você paga no final, na mesa/)).toBeVisible()

  // faltam dados: o app avisa antes de ir ao servidor
  await d.getByRole('button', { name: /Enviar pedido/ }).click()
  await expect(d.getByRole('alert')).toContainText('Informe o seu nome')
  await d.getByLabel('Seu nome').fill('Carlos')
  await d.getByLabel('Telefone com DDD').fill('99999')
  await d.getByRole('button', { name: /Enviar pedido/ }).click()
  await expect(d.getByRole('alert')).toContainText('telefone válido')
  expect(calls.rpc.filter((c) => c.name === 'place_public_order')).toHaveLength(0)

  await d.getByLabel('Telefone com DDD').fill('(92) 97777-6666')
  await d.getByRole('button', { name: /Enviar pedido/ }).click()

  await expect(page).toHaveURL(/\/pedir\/pedido\/o1$/)
  await expect(page.getByTestId('track-number')).toHaveText('#1')
  await expect(page.getByTestId('track-message')).toContainText('Recebemos o seu pedido')
  await expect(page.getByText('2× Feijoada')).toBeVisible()
  await expect(page.getByText('📝 sem cebola')).toBeVisible()
  await expect(page.getByText(/Você paga no final, na mesa/)).toBeVisible()

  const body = calls.rpc.find((c) => c.name === 'place_public_order')!.body
  expect(body).toMatchObject({ p_channel: 'table', p_table_token: TOK1, p_customer_name: 'Carlos', p_customer_phone: '(92) 97777-6666' })
  expect(body.p_items).toEqual([
    { product_id: 'p1', quantity: 2, notes: 'sem cebola' },
    { product_id: 'p2', quantity: 1, notes: null },
  ])
  expect(JSON.stringify(body)).not.toMatch(/price/i) // o preço nunca vai do cliente

  // a cozinha avança o pedido; o cliente vê ao atualizar
  orders[0].status = 'preparing'
  await page.reload()
  await expect(page.getByTestId('track-message')).toContainText('sendo preparado')
  orders[0].status = 'ready'
  await page.reload()
  await expect(page.getByTestId('track-message')).toContainText('Já está indo para a sua mesa')
  orders[0].status = 'cancelled'
  await page.reload()
  await expect(page.getByTestId('track-message')).toContainText('cancelado')
  await expect(page.getByRole('list', { name: 'Andamento do pedido' })).toHaveCount(0)

  // o link "fazer outro pedido" mantém a mesa
  await expect(page.getByRole('link', { name: 'Fazer outro pedido' })).toHaveAttribute('href', new RegExp(`mesa=${TOK1}`))
  expect(pageErrors).toEqual([])
})

test('QR inválido: avisa, mas deixa pedir como retirada ou delivery', async ({ page }) => {
  await setup(page, { role: 'attendant', online: { open: true } })
  await page.goto('/pedir?mesa=codigo-que-nao-existe')
  await expect(page.getByText(/QR code da mesa não é válido/)).toBeVisible()
  await expect(page.getByRole('radio', { name: /Retirar no local/ })).toBeVisible()
})

test('delivery: mostra a taxa, exige endereço e respeita o pedido mínimo', async ({ page }) => {
  const { calls } = await setup(page, { role: 'attendant', online: { open: true, min_cents: 4000 } })
  await page.goto('/pedir')
  await expect(page.getByText('Pedido mínimo: R$ 40,00.')).toBeVisible()
  await page.getByRole('radio', { name: /Receber em casa/ }).click()
  await page.getByTestId('prod-p2').getByRole('button', { name: 'Adicionar' }).click()
  await page.getByRole('button', { name: /Ver pedido/ }).click()
  const d = page.getByRole('dialog')
  await expect(d.getByText(/Faltam R\$\s*32,00 para o pedido mínimo/)).toBeVisible()
  await expect(d.getByText('Taxa de entrega')).toBeVisible()
  await expect(d.getByTestId('checkout-total')).toHaveText(/R\$\s*13,00/) // 8 + taxa 5

  await d.getByRole('button', { name: 'Aumentar Suco de cupuaçu no pedido' }).click()
  for (let i = 0; i < 4; i++) await d.getByRole('button', { name: 'Aumentar Suco de cupuaçu no pedido' }).click()
  await d.getByLabel('Seu nome').fill('João')
  await d.getByLabel('Telefone com DDD').fill('92 98888-7777')
  await d.getByRole('button', { name: /Enviar pedido/ }).click()
  await expect(d.getByRole('alert')).toContainText('endereço')
  await d.getByLabel('Endereço de entrega').fill('Rua das Palmeiras, 120')
  await d.getByRole('button', { name: /Enviar pedido/ }).click()
  await expect(page).toHaveURL(/\/pedir\/pedido\/o1$/)
  expect(calls.rpc.find((c) => c.name === 'place_public_order')!.body).toMatchObject({
    p_channel: 'delivery', p_delivery_address: 'Rua das Palmeiras, 120',
  })
  await expect(page.getByText('Taxa de entrega')).toBeVisible()
  await expect(page.getByText(/Vamos entregar|Recebemos/)).toBeVisible()
})

test('o servidor pode recusar (limite, fechado): a mensagem aparece para o cliente', async ({ page, context }) => {
  const { settingsState } = await setup(page, { role: 'attendant', online: { open: true } })
  await page.goto('/pedir')
  await page.getByRole('radio', { name: /Retirar no local/ }).click()
  await page.getByTestId('prod-p1').getByRole('button', { name: 'Adicionar' }).click()
  await page.getByRole('button', { name: /Ver pedido/ }).click()
  const d = page.getByRole('dialog')
  await d.getByLabel('Seu nome').fill('Maria')
  await d.getByLabel('Telefone com DDD').fill('(92) 99999-0000')
  settingsState.online_open = false // o dono desligou enquanto o cliente montava o pedido
  await d.getByRole('button', { name: /Enviar pedido/ }).click()
  await expect(d.getByRole('alert')).toContainText('não está recebendo pedidos online agora')
  await expect(page).toHaveURL(/\/pedir$/)
  void context
})

test('pedido que não existe', async ({ page }) => {
  await setup(page, { role: 'attendant', online: { open: true } })
  await page.goto('/pedir/pedido/00000000-0000-0000-0000-000000000000')
  await expect(page.getByRole('heading', { name: 'Pedido não encontrado' })).toBeVisible()
})

test('dono liga os pedidos online, copia o link e imprime os QR codes das mesas', async ({ page }) => {
  const { settingsState, tablesState } = await setup(page, { role: 'owner' })
  await page.goto('/configuracoes')
  const section = page.getByText('Pedidos online', { exact: true }).first()
  await expect(section).toBeVisible()
  await expect(page.getByText('🔴 Pedidos online desligados')).toBeVisible()

  page.once('dialog', (dlg) => void dlg.accept())
  await page.getByLabel('Aceitando pedidos online').click()
  await expect(page.getByText('🟢 Aceitando pedidos online')).toBeVisible()
  expect(settingsState.online_open).toBe(true)

  await page.getByLabel(/Delivery/).click()
  await expect.poll(() => settingsState.online_delivery).toBe(false)
  await page.getByLabel(/Pedido mínimo/).fill('30,00')
  await page.getByRole('button', { name: 'Salvar' }).nth(1).click()
  await expect.poll(() => settingsState.online_min_cents).toBe(3000)
  await expect(page.getByTestId('online-link')).toContainText('/pedir')

  await page.getByRole('link', { name: /QR codes das mesas/ }).click()
  await expect(page).toHaveURL(/\/qr$/)
  await expect(page.getByTestId('qr-geral').getByRole('img')).toBeVisible()
  for (const t of ['Mesa 1', 'Mesa 2', 'Mesa 10']) await expect(page.getByTestId(`qr-${t}`).getByRole('img')).toBeVisible()
  // o código da mesa está dentro do QR (o link), nunca em texto na tela
  await expect(page.getByText(TOK1)).toHaveCount(0)

  const antigo = tablesState[0].qr_token
  page.once('dialog', (dlg) => void dlg.accept())
  await page.getByTestId('qr-Mesa 1').getByRole('button', { name: 'Trocar código' }).click()
  await expect(page.getByText(/Código da Mesa 1 trocado/)).toBeVisible()
  expect(tablesState[0].qr_token).toMatch(/^[0-9a-f]{24}$/)
  expect(tablesState[0].qr_token).not.toBe(antigo)
})

test('pedido online aparece para a equipe com etiqueta e telefone formatado', async ({ page, context }) => {
  const cliente = await context.newPage()
  const { orders } = await setup(cliente, { role: 'attendant', online: { open: true } })
  await cliente.goto(`/pedir?mesa=${TOK1}`)
  await cliente.getByTestId('prod-p1').getByRole('button', { name: 'Adicionar' }).click()
  await cliente.getByRole('button', { name: /Ver pedido/ }).click()
  await cliente.getByLabel('Seu nome').fill('Carlos')
  await cliente.getByLabel('Telefone com DDD').fill('92977776666')
  await cliente.getByRole('button', { name: /Enviar pedido/ }).click()
  await expect(cliente).toHaveURL(/\/pedir\/pedido\/o1$/)

  // a equipe vê o mesmo pedido (mesmo "banco" simulado: reaproveita a lista)
  await setup(page, { role: 'attendant', orders: [orders[0]], online: { open: true } })
  await page.goto('/pedidos')
  const card = page.getByTestId('order-1')
  await expect(card).toContainText('🌐 Online')
  await expect(card).toContainText('Mesa 1')
  await expect(card).toContainText('(92) 97777-6666')

  const cozinha = await context.newPage()
  await setup(cozinha, { role: 'kitchen', orders: [orders[0]], online: { open: true } })
  await cozinha.goto('/cozinha')
  await expect(cozinha.getByTestId('kitchen-order-1')).toContainText('🌐 online')
})

test('digitar nos campos do pedido (tecla por tecla) não rouba o foco para o "X"', async ({ page }) => {
  await setup(page, { role: 'attendant', online: { open: true } })
  await page.goto('/pedir')
  await page.getByRole('radio', { name: /Retirar no local/ }).click()
  await page.getByTestId('prod-p1').getByRole('button', { name: 'Adicionar' }).click()
  await page.getByRole('button', { name: /Ver pedido/ }).click()
  const d = page.getByRole('dialog')

  // digita como uma pessoa: uma tecla de cada vez (cada tecla atualiza a tela)
  const nome = d.getByLabel('Seu nome')
  await nome.click()
  await nome.pressSequentially('Maria da Silva', { delay: 20 })
  await expect(nome).toHaveValue('Maria da Silva')
  await expect(nome).toBeFocused()

  const tel = d.getByLabel('Telefone com DDD')
  await tel.click()
  await tel.pressSequentially('(92) 99999-0000', { delay: 20 })
  await expect(tel).toHaveValue('(92) 99999-0000')

  const obs = d.getByLabel('Observação de Feijoada')
  await obs.click()
  await obs.pressSequentially('sem cebola e sem pimenta', { delay: 20 })
  await expect(obs).toHaveValue('sem cebola e sem pimenta')
  await expect(obs).toBeFocused()

  // e a janela continua aberta (o foco no "X" + espaço/enter fecharia)
  await expect(d).toBeVisible()
  await expect(d.getByRole('button', { name: 'Fechar' })).not.toBeFocused()
})
