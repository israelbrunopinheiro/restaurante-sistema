import { describe, expect, it } from 'vitest'
import {
  canConfirm,
  cashAppliedCents,
  changeDue,
  groupPaymentsByOrder,
  groupReceivables,
  remainingCents,
  singleRow,
  sumRows,
  toRpcPayments,
  type PaymentRow,
  type PaymentWithOrder,
} from './cash'
import type { OrderWithItems } from './orders'

function order(over: Partial<OrderWithItems> & { id: string }): OrderWithItems {
  return {
    business_date: '2026-10-01',
    order_number: 1,
    channel: 'table',
    status: 'ready',
    dining_table_id: 't1',
    customer_name: null,
    customer_phone: null,
    delivery_address: null,
    notes: null,
    subtotal_cents: 1000,
    delivery_fee_cents: 0,
    total_cents: 1000,
    cancel_reason: null,
    created_by: null,
    created_at: '2026-10-01T12:00:00Z',
    updated_at: '2026-10-01T12:00:00Z',
    status_changed_at: '2026-10-01T12:00:00Z',
    paid_at: null,
    source: 'staff',
    client_hash: null,
    pay_with: null,
    change_for_cents: null,
    order_items: [],
    dining_tables: { label: 'Mesa 1' },
    ...over,
  }
}

describe('groupReceivables', () => {
  it('agrupa os pedidos da mesma mesa e soma o total', () => {
    const groups = groupReceivables([
      order({ id: 'a', order_number: 1, total_cents: 7800, created_at: '2026-10-01T12:00:00Z' }),
      order({ id: 'b', order_number: 2, total_cents: 3500, created_at: '2026-10-01T12:30:00Z' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].title).toBe('Mesa 1')
    expect(groups[0].totalCents).toBe(11300)
    expect(groups[0].orders.map((o) => o.id)).toEqual(['a', 'b'])
  })

  it('mesas diferentes e pedidos de outros canais ficam separados', () => {
    const groups = groupReceivables([
      order({ id: 'a', dining_table_id: 't1', created_at: '2026-10-01T12:00:00Z' }),
      order({ id: 'b', dining_table_id: 't2', dining_tables: { label: 'Mesa 2' }, created_at: '2026-10-01T12:01:00Z' }),
      order({ id: 'c', channel: 'pickup', dining_table_id: null, dining_tables: null, customer_name: 'Maria', order_number: 9, created_at: '2026-10-01T12:02:00Z' }),
      order({ id: 'd', channel: 'pickup', dining_table_id: null, dining_tables: null, customer_name: 'João', order_number: 10, created_at: '2026-10-01T12:03:00Z' }),
    ])
    expect(groups.map((g) => g.title)).toEqual(['Mesa 1', 'Mesa 2', '#9 · Retirada · Maria', '#10 · Retirada · João'])
  })

  it('ignora pedidos pagos e cancelados e ordena do mais antigo', () => {
    const groups = groupReceivables([
      order({ id: 'novo', channel: 'pickup', dining_table_id: null, dining_tables: null, customer_name: 'B', created_at: '2026-10-01T13:00:00Z' }),
      order({ id: 'pago', paid_at: '2026-10-01T12:10:00Z' }),
      order({ id: 'cancelado', status: 'cancelled' }),
      order({ id: 'velho', channel: 'pickup', dining_table_id: null, dining_tables: null, customer_name: 'A', created_at: '2026-10-01T11:00:00Z' }),
    ])
    expect(groups.map((g) => g.orders[0].id)).toEqual(['velho', 'novo'])
  })
})

describe('linhas de pagamento', () => {
  const rows = (...r: [string, string][]): PaymentRow[] =>
    r.map(([method, amount], i) => ({ key: String(i), method: method as PaymentRow['method'], amount }))

  it('só confirma quando a soma bate exatamente com a conta', () => {
    expect(canConfirm(11300, rows(['pix', '50,00'], ['cash', '63,00']))).toBe(true)
    expect(canConfirm(11300, rows(['pix', '50,00'], ['cash', '62,99']))).toBe(false)
    expect(canConfirm(11300, rows(['pix', '50,00'], ['cash', '63,01']))).toBe(false)
    expect(canConfirm(11300, [])).toBe(false)
  })

  it('linha vazia, inválida ou zerada impede a confirmação', () => {
    expect(canConfirm(1000, rows(['cash', '']))).toBe(false)
    expect(canConfirm(1000, rows(['cash', 'abc']))).toBe(false)
    expect(canConfirm(1000, rows(['cash', '10,00'], ['pix', '0']))).toBe(false)
    expect(sumRows(rows(['cash', '10,00'], ['pix', 'x']))).toEqual({ cents: 1000, invalid: true })
  })

  it('calcula o que falta (e quando passa)', () => {
    expect(remainingCents(11300, rows(['pix', '50'], ['cash', '30']))).toBe(3300)
    expect(remainingCents(1000, rows(['cash', '12,50']))).toBe(-250)
  })

  it('troco: só do que é dinheiro, nunca negativo', () => {
    const r = rows(['pix', '50,00'], ['cash', '63,00'])
    expect(cashAppliedCents(r)).toBe(6300)
    expect(changeDue(10000, cashAppliedCents(r))).toBe(3700)
    expect(changeDue(6300, 6300)).toBe(0)
    expect(changeDue(5000, 6300)).toBe(0)
  })

  it('monta o corpo do RPC em centavos', () => {
    expect(toRpcPayments(rows(['pix', '50,00'], ['cash', '63']))).toEqual([
      { method: 'pix', amount_cents: 5000 },
      { method: 'cash', amount_cents: 6300 },
    ])
    expect(singleRow('pix', 11300, 'k')).toEqual([{ key: 'k', method: 'pix', amount: '113,00' }])
  })
})

describe('groupPaymentsByOrder', () => {
  const pay = (over: Partial<PaymentWithOrder> & { id: string; order_id: string; method: PaymentWithOrder['method']; amount_cents: number }): PaymentWithOrder => ({
    session_id: 's1',
    note: null,
    created_by: null,
    created_at: '2026-10-01T12:00:00Z',
    orders: { order_number: 1, channel: 'table', customer_name: null, dining_tables: { label: 'Mesa 1' } },
    ...over,
  })

  it('soma por pedido e por forma de pagamento', () => {
    const lines = groupPaymentsByOrder([
      pay({ id: '1', order_id: 'a', method: 'pix', amount_cents: 5000 }),
      pay({ id: '2', order_id: 'a', method: 'cash', amount_cents: 2800 }),
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0].netCents).toBe(7800)
    expect(lines[0].title).toBe('Mesa 1')
    expect(lines[0].methods).toEqual([
      { method: 'pix', cents: 5000 },
      { method: 'cash', cents: 2800 },
    ])
  })

  it('estorno zera o pedido e some das formas de pagamento', () => {
    const lines = groupPaymentsByOrder([
      pay({ id: '1', order_id: 'a', method: 'pix', amount_cents: 5000 }),
      pay({ id: '2', order_id: 'a', method: 'cash', amount_cents: 2800 }),
      pay({ id: '3', order_id: 'a', method: 'pix', amount_cents: -5000, created_at: '2026-10-01T13:00:00Z' }),
      pay({ id: '4', order_id: 'a', method: 'cash', amount_cents: -2800, created_at: '2026-10-01T13:00:00Z' }),
    ])
    expect(lines[0].netCents).toBe(0)
    expect(lines[0].methods).toEqual([])
  })

  it('mais recente primeiro', () => {
    const lines = groupPaymentsByOrder([
      pay({ id: '1', order_id: 'a', method: 'cash', amount_cents: 100, created_at: '2026-10-01T12:00:00Z' }),
      pay({ id: '2', order_id: 'b', method: 'cash', amount_cents: 100, created_at: '2026-10-01T14:00:00Z' }),
    ])
    expect(lines.map((l) => l.orderId)).toEqual(['b', 'a'])
  })
})
