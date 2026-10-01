/**
 * Testes de navegador com a rede simulada (nenhum dado real é tocado).
 * Verificam telas, validações, permissões por perfil e o que é enviado ao banco.
 * As regras do banco em si (RLS, preços, transições) são testadas direto no Postgres.
 */
import { expect, test, type Page, type Route } from '@playwright/test'

const REF = 'arrbtzafwluqyghvzudx'
const USER_ID = '11111111-1111-1111-1111-111111111111'

type Role = 'owner' | 'attendant' | 'kitchen'

const category = { id: 'c1', name: 'Pratos', position: 0, active: true, created_at: '2026-10-01T10:00:00Z' }
const products = [
  { id: 'p1', category_id: 'c1', name: 'Feijoada', description: 'Com arroz e farofa', price_cents: 3500, active: true, position: 0, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' },
  { id: 'p2', category_id: 'c1', name: 'Suco de cupuaçu', description: null, price_cents: 800, active: true, position: 1, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' },
]
const tables = [
  { id: 't1', label: 'Mesa 1', seats: 4, active: true, created_at: '2026-10-01T10:00:00Z' },
  { id: 't2', label: 'Mesa 2', seats: 4, active: true, created_at: '2026-10-01T10:00:00Z' },
  { id: 't10', label: 'Mesa 10', seats: 4, active: true, created_at: '2026-10-01T10:00:00Z' },
]

type Calls = { rpc: { name: string; body: Record<string, unknown> }[] }

async function setup(page: Page, opts: { role: Role; active?: boolean; orders?: unknown[] }) {
  const calls: Calls = { rpc: [] }
  const orders = opts.orders ? structuredClone(opts.orders) : [] // cópia: cada teste começa do zero
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await page.addInitScript(
    ([ref, uid]) => {
      localStorage.setItem(
        `sb-${ref}-auth-token`,
        JSON.stringify({
          access_token: 'fake.access.token',
          refresh_token: 'fake-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'teste@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T10:00:00Z' },
        }),
      )
    },
    [REF, USER_ID],
  )

  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
  }
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })

  await page.route(/\/realtime\/v1\//, (r) => r.abort())
  await page.route(/\/auth\/v1\//, (r) => (r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: cors }) : json(r, {})))

  await page.route(/\/rest\/v1\//, async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const url = new URL(req.url())
    const name = url.pathname.split('/rest/v1/')[1]

    if (name.startsWith('rpc/')) {
      const fn = name.slice(4)
      const body = req.postDataJSON() as Record<string, unknown>
      calls.rpc.push({ name: fn, body })
      if (fn === 'create_order') {
        const items = body.p_items as { product_id: string; quantity: number; notes: string | null }[]
        const order = {
          id: `o${orders.length + 1}`, business_date: '2026-10-01', order_number: orders.length + 1,
          channel: body.p_channel, status: 'new', dining_table_id: body.p_dining_table_id ?? null,
          customer_name: body.p_customer_name ?? null, customer_phone: body.p_customer_phone ?? null,
          delivery_address: body.p_delivery_address ?? null, notes: body.p_notes ?? null,
          subtotal_cents: 0, delivery_fee_cents: 0, total_cents: 0, cancel_reason: null, created_by: USER_ID,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(), status_changed_at: new Date().toISOString(),
          order_items: items.map((it, i) => {
            const p = products.find((x) => x.id === it.product_id)!
            return { id: `i${orders.length}-${i}`, order_id: `o${orders.length + 1}`, product_id: p.id, product_name: p.name, unit_price_cents: p.price_cents, quantity: it.quantity, notes: it.notes, created_at: new Date().toISOString() }
          }),
          dining_tables: tables.find((t) => t.id === body.p_dining_table_id) ? { label: tables.find((t) => t.id === body.p_dining_table_id)!.label } : null,
        }
        orders.push(order)
        return json(route, order)
      }
      if (fn === 'set_order_status') {
        const o = orders.find((x) => (x as { id: string }).id === body.p_order_id) as Record<string, unknown>
        o.status = body.p_status
        o.status_changed_at = new Date().toISOString()
        return json(route, o)
      }
      return json(route, { message: 'rpc desconhecida' }, 404)
    }

    switch (name) {
      case 'profiles':
        return json(route, [{ id: USER_ID, full_name: 'Ana Teste', role: opts.role, active: opts.active ?? true, created_at: '2026-10-01T10:00:00Z' }])
      case 'settings':
        return json(route, [{ id: true, restaurant_name: "Cordeiro's Refeições", delivery_fee_cents: 500, updated_at: '2026-10-01T10:00:00Z' }])
      case 'categories':
        return json(route, [category])
      case 'products':
        return json(route, products)
      case 'dining_tables':
        return json(route, tables)
      case 'orders': {
        const status = url.searchParams.get('status')
        const wanted = status?.startsWith('in.(') ? status.slice(4, -1).split(',') : null
        return json(route, wanted ? orders.filter((o) => wanted.includes((o as { status: string }).status)) : orders)
      }
      default:
        return json(route, [])
    }
  })

  return { calls, orders, pageErrors }
}

const seedOrder = {
  id: 'o-seed', business_date: '2026-10-01', order_number: 7, channel: 'table', status: 'new',
  dining_table_id: 't2', customer_name: null, customer_phone: null, delivery_address: null, notes: 'Cliente com pressa',
  subtotal_cents: 3500, delivery_fee_cents: 0, total_cents: 3500, cancel_reason: null, created_by: USER_ID,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(), status_changed_at: new Date().toISOString(),
  order_items: [{ id: 'i1', order_id: 'o-seed', product_id: 'p1', product_name: 'Feijoada', unit_price_cents: 3500, quantity: 2, notes: 'sem cebola', created_at: new Date().toISOString() }],
  dining_tables: { label: 'Mesa 2' },
}

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
  await expect(page2.getByRole('navigation', { name: 'Principal' }).getByRole('link')).toHaveCount(2)
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
