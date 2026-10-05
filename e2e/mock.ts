/** Rede simulada (Supabase) usada pelos testes de navegador. */
import type { Page, Route } from '@playwright/test'

export const REF = 'arrbtzafwluqyghvzudx'
export const USER_ID = '11111111-1111-1111-1111-111111111111'

export type Role = 'owner' | 'attendant' | 'kitchen'

const T0 = '2026-10-01T10:00:00Z'
export const category = { id: 'c1', name: 'Pratos', position: 0, active: true, created_at: T0 }
export const products = [
  { id: 'p1', category_id: 'c1', name: 'Feijoada', description: 'Com arroz e farofa', price_cents: 3500, active: true, position: 0, created_at: T0, updated_at: T0 },
  { id: 'p2', category_id: 'c1', name: 'Suco de cupuaçu', description: null, price_cents: 800, active: true, position: 1, created_at: T0, updated_at: T0 },
]
export const tables = [
  { id: 't1', label: 'Mesa 1', seats: 4, active: true, created_at: T0, qr_token: 'tokmesa1aaaaaaaaaaaaaaaa' },
  { id: 't2', label: 'Mesa 2', seats: 4, active: true, created_at: T0, qr_token: 'tokmesa2bbbbbbbbbbbbbbbb' },
  { id: 't10', label: 'Mesa 10', seats: 4, active: true, created_at: T0, qr_token: 'tokmesa10cccccccccccccc' },
]

export const seedOrder = {
  id: 'o-seed', business_date: '2026-10-01', order_number: 7, channel: 'table', status: 'new',
  dining_table_id: 't2', customer_name: null, customer_phone: null, delivery_address: null, notes: 'Cliente com pressa',
  subtotal_cents: 3500, delivery_fee_cents: 0, total_cents: 3500, cancel_reason: null, created_by: USER_ID, paid_at: null, source: 'staff', client_hash: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(), status_changed_at: new Date().toISOString(),
  order_items: [{ id: 'i1', order_id: 'o-seed', product_id: 'p1', product_name: 'Feijoada', unit_price_cents: 3500, quantity: 2, notes: 'sem cebola', created_at: new Date().toISOString() }],
  dining_tables: { label: 'Mesa 2' },
}

export const manausDate = (d: Date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Manaus' }).format(d)
export const addDaysIso = (iso: string, n: number) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const addMonths = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + n, d, 12))
  if (dt.getUTCDate() !== d) dt.setUTCDate(0) // 31/01 + 1 mês → 28/02
  return dt.toISOString().slice(0, 10)
}

/** Pedido de mesa já pronto, ainda não pago. */
export function tableOrder(id: string, number: number, totalCents: number, minutesAgo: number, tableId = 't1') {
  const at = new Date(Date.now() - minutesAgo * 60000).toISOString()
  return {
    ...seedOrder, id, order_number: number, business_date: manausDate(), status: 'ready', notes: null, dining_table_id: tableId,
    dining_tables: { label: tables.find((t) => t.id === tableId)!.label },
    subtotal_cents: totalCents, total_cents: totalCents, created_at: at, updated_at: at, status_changed_at: at,
    order_items: [{ id: `${id}-i`, order_id: id, product_id: 'p1', product_name: 'Feijoada', unit_price_cents: totalCents, quantity: 1, notes: null, created_at: at }],
  }
}

type Json = Record<string, unknown>
export type Calls = { rpc: { name: string; body: Json }[] }

type CashOptions = { open?: boolean; opening_cents?: number }

export async function setup(
  page: Page,
  opts: { role: Role; active?: boolean; orders?: unknown[]; cash?: CashOptions; entries?: unknown[]; online?: { open?: boolean; pickup?: boolean; delivery?: boolean; table?: boolean; min_cents?: number } },
) {
  const calls: Calls = { rpc: [] }
  const orders = (opts.orders ? structuredClone(opts.orders) : []) as Json[] // cópia: cada teste começa do zero
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  // ───── estado do caixa simulado ─────
  let session: Json | null = opts.cash?.open
    ? { id: 's1', opened_at: new Date().toISOString(), opened_by: USER_ID, opened_by_name: 'Ana Teste', opening_cents: opts.cash.opening_cents ?? 10000,
        closed_at: null, closed_by: null, closed_by_name: null, expected_cash_cents: null, counted_cents: null, difference_cents: null, totals: null, notes: null }
    : null
  const fcats: Json[] = [
    { id: 'fc-alu', name: 'Aluguel', kind: 'payable', active: true, created_at: T0 },
    { id: 'fc-gas', name: 'Gás', kind: 'payable', active: true, created_at: T0 },
    { id: 'fc-ing', name: 'Ingredientes e insumos', kind: 'payable', active: true, created_at: T0 },
    { id: 'fc-evt', name: 'Eventos e encomendas', kind: 'receivable', active: true, created_at: T0 },
  ]
  const entries: Json[] = opts.entries ? (structuredClone(opts.entries) as Json[]) : []
  const catName = (id: unknown) => (fcats.find((c) => c.id === id)?.name as string) ?? ''
  const settingsState: Json = {
    id: true, restaurant_name: "Cordeiro's Refeições", delivery_fee_cents: 500, updated_at: T0,
    online_open: opts.online?.open ?? false, online_pickup: opts.online?.pickup ?? true, online_delivery: opts.online?.delivery ?? true,
    online_table: opts.online?.table ?? true, online_min_cents: opts.online?.min_cents ?? 0,
  }
  const tablesState: Json[] = structuredClone(tables) as Json[]
  const closedSessions: Json[] = []
  const payments: Json[] = []
  const movements: Json[] = []

  const sumBy = (rows: Json[], pred: (r: Json) => boolean) =>
    rows.filter(pred).reduce((s, r) => s + (r.amount_cents as number), 0)
  const totals = () => {
    const cash = sumBy(payments, (p) => p.method === 'cash')
    const pix = sumBy(payments, (p) => p.method === 'pix')
    const debit = sumBy(payments, (p) => p.method === 'debit')
    const credit = sumBy(payments, (p) => p.method === 'credit')
    const sup = sumBy(movements, (m) => m.kind === 'supply')
    const wd = sumBy(movements, (m) => m.kind === 'withdrawal')
    const opening = (session?.opening_cents as number) ?? 0
    return {
      opening_cents: opening, cash_cents: cash, pix_cents: pix, debit_cents: debit, credit_cents: credit,
      received_cents: cash + pix + debit + credit, supplies_cents: sup, withdrawals_cents: wd,
      expected_cash_cents: opening + cash + sup - wd,
    }
  }
  const orderEmbed = (id: string) => {
    const o = orders.find((x) => x.id === id) as Json
    return { order_number: o.order_number, channel: o.channel, customer_name: o.customer_name, dining_tables: o.dining_tables }
  }

  await page.addInitScript(
    ([ref, uid]) => {
      localStorage.setItem(
        `sb-${ref}-auth-token`,
        JSON.stringify({
          access_token: 'fake.access.token', refresh_token: 'fake-refresh', token_type: 'bearer', expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'teste@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T10:00:00Z' },
        }),
      )
    },
    [REF, USER_ID],
  )

  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const fail = (route: Route, message: string) => json(route, { code: '22023', message, details: null, hint: null }, 400)

  await page.route(/\/realtime\/v1\//, (r) => r.abort())
  await page.route(/\/auth\/v1\//, (r) => (r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: cors }) : json(r, {})))

  await page.route(/\/rest\/v1\//, async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const url = new URL(req.url())
    const name = url.pathname.split('/rest/v1/')[1]

    if (name.startsWith('rpc/')) {
      const fn = name.slice(4)
      const body = (req.postDataJSON() ?? {}) as Json
      calls.rpc.push({ name: fn, body })

      if (fn === 'create_order') {
        const items = body.p_items as { product_id: string; quantity: number; notes: string | null }[]
        const order = {
          id: `o${orders.length + 1}`, business_date: '2026-10-01', order_number: orders.length + 1,
          channel: body.p_channel, status: 'new', dining_table_id: body.p_dining_table_id ?? null,
          customer_name: body.p_customer_name ?? null, customer_phone: body.p_customer_phone ?? null,
          delivery_address: body.p_delivery_address ?? null, notes: body.p_notes ?? null,
          subtotal_cents: 0, delivery_fee_cents: 0, total_cents: 0, cancel_reason: null, created_by: USER_ID, paid_at: null, source: 'staff', client_hash: null,
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
        const o = orders.find((x) => x.id === body.p_order_id) as Json
        o.status = body.p_status
        o.status_changed_at = new Date().toISOString()
        return json(route, o)
      }

      // ───── caixa ─────
      if (fn === 'cash_session_summary') return json(route, session ? { session, totals: totals() } : null)
      if (fn === 'open_cash_session') {
        if (session) return fail(route, 'Já existe um caixa aberto. Feche-o antes de abrir outro.')
        session = { id: 's1', opened_at: new Date().toISOString(), opened_by: USER_ID, opened_by_name: 'Ana Teste', opening_cents: body.p_opening_cents,
          closed_at: null, closed_by: null, closed_by_name: null, expected_cash_cents: null, counted_cents: null, difference_cents: null, totals: null, notes: null }
        return json(route, session)
      }
      if (fn === 'add_cash_movement') {
        if (!session) return fail(route, 'Abra o caixa primeiro.')
        const m = { id: `m${movements.length + 1}`, session_id: 's1', kind: body.p_kind, amount_cents: body.p_amount_cents, reason: body.p_reason, created_by: USER_ID, created_at: new Date().toISOString() }
        movements.push(m)
        return json(route, m)
      }
      if (fn === 'pay_orders') {
        if (!session) return fail(route, 'Abra o caixa antes de receber pagamentos.')
        const ids = body.p_order_ids as string[]
        const pays = (body.p_payments as { method: string; amount_cents: number }[]).map((p) => ({ ...p }))
        const targets = ids.map((id) => orders.find((o) => o.id === id) as Json)
        const due = targets.reduce((s, o) => s + (o.total_cents as number), 0)
        const sum = pays.reduce((s, p) => s + p.amount_cents, 0)
        if (sum !== due) return fail(route, `Os pagamentos somam ${sum}, mas a conta é ${due}.`)
        let i = 0
        for (const o of targets) {
          let need = o.total_cents as number
          while (need > 0) {
            while (pays[i].amount_cents === 0) i++
            const take = Math.min(need, pays[i].amount_cents)
            payments.push({ id: `pay${payments.length + 1}`, session_id: 's1', order_id: o.id, method: pays[i].method, amount_cents: take, note: null, created_by: USER_ID, created_at: new Date().toISOString() })
            pays[i].amount_cents -= take
            need -= take
          }
          o.paid_at = new Date().toISOString()
        }
        return json(route, { orders: targets.length, total_cents: due })
      }
      if (fn === 'refund_order') {
        if (opts.role !== 'owner') return json(route, { code: '42501', message: 'Só o dono pode estornar pagamentos.' }, 403)
        const o = orders.find((x) => x.id === body.p_order_id) as Json
        const byMethod = new Map<string, number>()
        for (const p of payments.filter((p) => p.order_id === o.id)) byMethod.set(p.method as string, (byMethod.get(p.method as string) ?? 0) + (p.amount_cents as number))
        for (const [method, amt] of byMethod) if (amt !== 0) payments.push({ id: `pay${payments.length + 1}`, session_id: 's1', order_id: o.id, method, amount_cents: -amt, note: body.p_reason, created_by: USER_ID, created_at: new Date().toISOString() })
        o.paid_at = null
        return json(route, o)
      }
      if (fn === 'close_cash_session') {
        if (!session) return fail(route, 'Não há caixa aberto.')
        const t = totals()
        const diff = (body.p_counted_cents as number) - t.expected_cash_cents
        if (diff !== 0 && !body.p_notes) return fail(route, 'Há uma diferença no caixa. Explique o motivo nas observações.')
        session = { ...session, closed_at: new Date().toISOString(), closed_by: USER_ID, closed_by_name: 'Ana Teste', expected_cash_cents: t.expected_cash_cents,
          counted_cents: body.p_counted_cents, difference_cents: diff, totals: t, notes: body.p_notes ?? null }
        const closed = session
        closedSessions.push(closed)
        session = null
        return json(route, closed)
      }


      // ───── cardápio online (público) ─────
      if (fn === 'public_menu') {
        if (!settingsState.online_open) return json(route, { open: false, restaurant_name: settingsState.restaurant_name })
        const tok = body.p_table_token as string | undefined
        const tb = tok ? tablesState.find((t) => t.qr_token === tok && t.active) : undefined
        return json(route, {
          open: true, restaurant_name: settingsState.restaurant_name, pickup: settingsState.online_pickup, delivery: settingsState.online_delivery,
          delivery_fee_cents: settingsState.delivery_fee_cents, min_cents: settingsState.online_min_cents, table_requested: !!tok,
          table: tb && settingsState.online_table ? { label: tb.label } : null,
          categories: [{ id: category.id, name: category.name, products: products.map((p) => ({ id: p.id, name: p.name, description: p.description, price_cents: p.price_cents })) }],
        })
      }
      if (fn === 'place_public_order') {
        if (!settingsState.online_open) return fail(route, 'O restaurante não está recebendo pedidos online agora.')
        const ch = body.p_channel as string
        const tb = ch === 'table' ? tablesState.find((t) => t.qr_token === body.p_table_token) : undefined
        if (ch === 'table' && !tb) return fail(route, 'QR code da mesa inválido. Chame o atendente.')
        const items = body.p_items as { product_id: string; quantity: number; notes: string | null }[]
        const sub = items.reduce((a, it) => a + products.find((p) => p.id === it.product_id)!.price_cents * it.quantity, 0)
        if (ch !== 'table' && sub < (settingsState.online_min_cents as number)) return fail(route, 'O pedido mínimo é mínimo.')
        const fee = ch === 'delivery' ? (settingsState.delivery_fee_cents as number) : 0
        const id = `o${orders.length + 1}`
        const now = new Date().toISOString()
        orders.push({
          id, business_date: manausDate(), order_number: orders.length + 1, channel: ch, status: 'new', dining_table_id: tb?.id ?? null,
          customer_name: body.p_customer_name, customer_phone: String(body.p_customer_phone).replace(/\D/g, ''), delivery_address: body.p_delivery_address ?? null,
          notes: body.p_notes ?? null, subtotal_cents: sub, delivery_fee_cents: fee, total_cents: sub + fee, cancel_reason: null, created_by: null, paid_at: null,
          source: 'online', client_hash: 'h', created_at: now, updated_at: now, status_changed_at: now,
          order_items: items.map((it, i) => { const p = products.find((x) => x.id === it.product_id)!; return { id: `${id}-${i}`, order_id: id, product_id: p.id, product_name: p.name, unit_price_cents: p.price_cents, quantity: it.quantity, notes: it.notes, created_at: now } }),
          dining_tables: tb ? { label: tb.label } : null,
        })
        return json(route, { id, order_number: orders.length, total_cents: sub + fee })
      }
      if (fn === 'public_order_status') {
        const o = orders.find((x) => x.id === body.p_order_id && x.source === 'online') as Json | undefined
        if (!o) return json(route, null)
        return json(route, {
          order_number: o.order_number, status: o.status, channel: o.channel, total_cents: o.total_cents, delivery_fee_cents: o.delivery_fee_cents,
          created_at: o.created_at, paid: o.paid_at !== null, table_label: (o.dining_tables as Json | null)?.label ?? null,
          items: (o.order_items as Json[]).map((it) => ({ name: it.product_name, quantity: it.quantity, notes: it.notes })),
        })
      }

      // ───── financeiro ─────
      if (fn === 'create_finance_entry') {
        if (opts.role !== 'owner') return json(route, { code: '42501', message: 'Só o dono pode acessar o financeiro.' }, 403)
        const n = (body.p_repeat_months as number) ?? 1
        for (let i = 0; i < n; i++) {
          entries.push({
            id: `e${entries.length + 1}`, kind: body.p_kind, category_id: body.p_category_id, description: body.p_description,
            party: body.p_party ?? null, amount_cents: body.p_amount_cents, due_date: addMonths(body.p_due_date as string, i), notes: body.p_notes ?? null,
            series_id: n > 1 ? 'series-1' : null, installment: n > 1 ? i + 1 : null, installments: n > 1 ? n : null,
            paid_at: null, paid_date: null, paid_amount_cents: null, paid_method: null, paid_from_drawer: false,
            created_by: USER_ID, created_at: new Date(Date.now() + entries.length).toISOString(), updated_at: T0,
          })
        }
        return json(route, n)
      }
      if (fn === 'pay_finance_entry') {
        const en = entries.find((x) => x.id === body.p_entry_id) as Json
        if (body.p_from_drawer) {
          if (!session) return fail(route, 'Abra o caixa para usar o dinheiro da gaveta.')
          movements.push({ id: `m${movements.length + 1}`, session_id: 's1', kind: en.kind === 'payable' ? 'withdrawal' : 'supply',
            amount_cents: body.p_amount_cents ?? en.amount_cents, reason: `${en.kind === 'payable' ? 'Pagamento' : 'Recebimento'}: ${en.description}`,
            created_by: USER_ID, created_at: new Date().toISOString(), entry_id: en.id })
        }
        Object.assign(en, { paid_at: new Date().toISOString(), paid_date: (body.p_paid_date as string) ?? manausDate(),
          paid_amount_cents: body.p_amount_cents ?? en.amount_cents, paid_method: body.p_method, paid_from_drawer: !!body.p_from_drawer })
        return json(route, en)
      }
      if (fn === 'reopen_finance_entry') {
        const en = entries.find((x) => x.id === body.p_entry_id) as Json
        Object.assign(en, { paid_at: null, paid_date: null, paid_amount_cents: null, paid_method: null, paid_from_drawer: false })
        return json(route, en)
      }
      if (fn === 'finance_summary') {
        if (opts.role !== 'owner') return json(route, { code: '42501', message: 'Só o dono pode acessar o financeiro.' }, 403)
        const from = body.p_from as string, to = body.p_to as string
        const inRange = (d: string) => d >= from && d <= to
        const pays = payments.filter((p) => inRange(manausDate(new Date(p.created_at as string))))
        const sum = (m: string) => pays.filter((p) => p.method === m).reduce((a, p) => a + (p.amount_cents as number), 0)
        const total = pays.reduce((a, p) => a + (p.amount_cents as number), 0)
        const paid = (k: string) => entries.filter((e) => e.kind === k && e.paid_at && inRange(e.paid_date as string))
        const other = paid('receivable').reduce((a, e) => a + (e.paid_amount_cents as number), 0)
        const exp = paid('payable').reduce((a, e) => a + (e.paid_amount_cents as number), 0)
        const byCat = new Map<string, number>()
        for (const e of paid('payable')) byCat.set(catName(e.category_id), (byCat.get(catName(e.category_id)) ?? 0) + (e.paid_amount_cents as number))
        const days: Json[] = []
        for (let d = from; d <= to; d = addMonths(d, 0) === d ? new Date(Date.parse(d + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10) : d) {
          days.push({ date: d,
            income_cents: pays.filter((p) => manausDate(new Date(p.created_at as string)) === d).reduce((a, p) => a + (p.amount_cents as number), 0)
              + paid('receivable').filter((e) => e.paid_date === d).reduce((a, e) => a + (e.paid_amount_cents as number), 0),
            expense_cents: paid('payable').filter((e) => e.paid_date === d).reduce((a, e) => a + (e.paid_amount_cents as number), 0) })
          if (days.length > 400) break
        }
        const today = manausDate()
        const open = (k: string) => entries.filter((e) => e.kind === k && !e.paid_at)
        const plus7 = new Date(Date.parse(today + 'T12:00:00Z') + 7 * 86400000).toISOString().slice(0, 10)
        const s = (l: Json[]) => l.reduce((a, e) => a + (e.amount_cents as number), 0)
        return json(route, {
          sales: { cash_cents: sum('cash'), pix_cents: sum('pix'), debit_cents: sum('debit'), credit_cents: sum('credit'), total_cents: total },
          other_income_cents: other, expenses_cents: exp, result_cents: total + other - exp,
          expenses_by_category: [...byCat].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents),
          days,
          pending: {
            payables_open_cents: s(open('payable')), payables_overdue_cents: s(open('payable').filter((e) => (e.due_date as string) < today)),
            payables_next7_cents: s(open('payable').filter((e) => (e.due_date as string) >= today && (e.due_date as string) <= plus7)),
            receivables_open_cents: s(open('receivable')), receivables_overdue_cents: s(open('receivable').filter((e) => (e.due_date as string) < today)),
          },
          loose_withdrawals_cents: movements.filter((m) => m.kind === 'withdrawal' && !m.entry_id).reduce((a, m) => a + (m.amount_cents as number), 0),
        })
      }
      if (fn === 'sales_report') {
        if (opts.role !== 'owner') return json(route, { code: '42501', message: 'Só o dono pode acessar o financeiro.' }, 403)
        const from = body.p_from as string, to = body.p_to as string
        const os = orders.filter((o) => (o.business_date as string) >= from && (o.business_date as string) <= to)
        const ok = os.filter((o) => o.status !== 'cancelled')
        const revenue = ok.reduce((a, o) => a + (o.total_cents as number), 0)
        const by = <T,>(key: (o: Json) => T) => {
          const m = new Map<T, { n: number; c: number }>()
          for (const o of ok) m.set(key(o), { n: (m.get(key(o))?.n ?? 0) + 1, c: (m.get(key(o))?.c ?? 0) + (o.total_cents as number) })
          return m
        }
        const prod = new Map<string, { q: number; c: number }>()
        for (const o of ok) for (const it of o.order_items as Json[]) {
          const k = it.product_name as string
          prod.set(k, { q: (prod.get(k)?.q ?? 0) + (it.quantity as number), c: (prod.get(k)?.c ?? 0) + (it.quantity as number) * (it.unit_price_cents as number) })
        }
        const hours = new Map<number, number>()
        for (const o of ok) { const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'America/Manaus' }).format(new Date(o.created_at as string))); hours.set(h, (hours.get(h) ?? 0) + 1) }
        const dayList: Json[] = []
        for (let d = from; d <= to; d = new Date(Date.parse(d + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10)) {
          const od = ok.filter((o) => o.business_date === d)
          dayList.push({ date: d, count: od.length, cents: od.reduce((a, o) => a + (o.total_cents as number), 0) })
          if (dayList.length > 400) break
        }
        return json(route, {
          orders: ok.length, revenue_cents: revenue, average_ticket_cents: ok.length ? Math.round(revenue / ok.length) : 0,
          cancelled: os.length - ok.length, cancelled_cents: os.filter((o) => o.status === 'cancelled').reduce((a, o) => a + (o.total_cents as number), 0),
          unpaid_cents: ok.filter((o) => o.paid_at === null).reduce((a, o) => a + (o.total_cents as number), 0),
          by_channel: [...by((o) => o.channel as string)].map(([channel, v]) => ({ channel, count: v.n, cents: v.c })).sort((a, b) => b.cents - a.cents),
          top_products: [...prod].map(([name, v]) => ({ name, quantity: v.q, cents: v.c })).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
          by_hour: [...hours].map(([hour, count]) => ({ hour, count })).sort((a, b) => a.hour - b.hour),
          days: dayList,
        })
      }
      return json(route, { message: 'rpc desconhecida' }, 404)
    }

    switch (name) {
      case 'profiles':
        return json(route, [{ id: USER_ID, full_name: 'Ana Teste', role: opts.role, active: opts.active ?? true, created_at: T0 }])
      case 'settings':
        if (req.method() === 'PATCH') { Object.assign(settingsState, req.postDataJSON()); return route.fulfill({ status: 204, headers: cors }) }
        return json(route, [settingsState])
      case 'categories':
        return json(route, [category])
      case 'products':
        return json(route, products)
      case 'dining_tables': {
        if (req.method() === 'PATCH') { const id = (url.searchParams.get('id') ?? '').slice(3); Object.assign(tablesState.find((t) => t.id === id) ?? {}, req.postDataJSON()); return route.fulfill({ status: 204, headers: cors }) }
        return json(route, tablesState)
      }
      case 'finance_categories': {
        if (req.method() === 'POST') { const b = req.postDataJSON() as Json; fcats.push({ id: `fc${fcats.length + 1}`, active: true, created_at: T0, ...b }); return json(route, [], 201) }
        if (req.method() === 'PATCH') { const id = (url.searchParams.get('id') ?? '').slice(3); Object.assign(fcats.find((c) => c.id === id) ?? {}, req.postDataJSON()); return route.fulfill({ status: 204, headers: cors }) }
        let list = fcats
        const kind = url.searchParams.get('kind'); if (kind?.startsWith('eq.')) list = list.filter((c) => c.kind === kind.slice(3))
        if (url.searchParams.get('active') === 'eq.true') list = list.filter((c) => c.active)
        return json(route, list)
      }
      case 'finance_entries': {
        const id = (url.searchParams.get('id') ?? '').slice(3)
        if (req.method() === 'PATCH') { Object.assign(entries.find((e) => e.id === id) ?? {}, req.postDataJSON()); return route.fulfill({ status: 204, headers: cors }) }
        if (req.method() === 'DELETE') { const i = entries.findIndex((e) => e.id === id); if (i >= 0) entries.splice(i, 1); return route.fulfill({ status: 204, headers: cors }) }
        let list = entries
        const kind = url.searchParams.get('kind'); if (kind?.startsWith('eq.')) list = list.filter((e) => e.kind === kind.slice(3))
        return json(route, list.map((e) => ({ ...e, finance_categories: { name: catName(e.category_id) } })))
      }
      case 'cash_movements':
        return json(route, [...movements].reverse())
      case 'payments':
        return json(route, [...payments].reverse().map((p) => ({ ...p, orders: orderEmbed(p.order_id as string) })))
      case 'cash_sessions':
        return json(route, [...closedSessions].reverse())
      case 'orders': {
        let list = orders
        const status = url.searchParams.get('status')
        if (status?.startsWith('in.(')) {
          const wanted = status.slice(4, -1).split(',')
          list = list.filter((o) => wanted.includes(o.status as string))
        } else if (status?.startsWith('neq.')) {
          list = list.filter((o) => o.status !== status.slice(4))
        }
        if (url.searchParams.get('paid_at') === 'is.null') list = list.filter((o) => o.paid_at === null)
        return json(route, list)
      }
      default:
        return json(route, [])
    }
  })

  return { calls, orders, payments, movements, entries, settingsState, tablesState, pageErrors }
}
