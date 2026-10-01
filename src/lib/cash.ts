import type { Enums, Tables } from './database.types'
import { centsToInput, parseBRLToCents } from './money'
import { orderTitle, type OrderChannel, type OrderWithItems } from './orders'

export type PaymentMethod = Enums<'payment_method'>

export const METHODS: PaymentMethod[] = ['cash', 'pix', 'debit', 'credit']

export const methodLabel: Record<PaymentMethod, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  debit: 'Débito',
  credit: 'Crédito',
}

export const methodIcon: Record<PaymentMethod, string> = {
  cash: '💵',
  pix: '⚡',
  debit: '💳',
  credit: '💳',
}

/** Totais calculados pelo banco (cash_session_summary). */
export type SessionTotals = {
  opening_cents: number
  cash_cents: number
  pix_cents: number
  debit_cents: number
  credit_cents: number
  received_cents: number
  supplies_cents: number
  withdrawals_cents: number
  expected_cash_cents: number
}

export type CashSession = Tables<'cash_sessions'>
export type CashSummary = { session: CashSession; totals: SessionTotals }

// ───────── A receber ─────────

export type Receivable = {
  key: string
  title: string
  orders: OrderWithItems[]
  totalCents: number
}

/**
 * Pedidos ainda não pagos, prontos para cobrar.
 * Os de MESA são agrupados (a conta da mesa soma todos os pedidos dela); os demais são cobrados um a um.
 * O grupo mais antigo vem primeiro.
 */
export function groupReceivables(orders: OrderWithItems[]): Receivable[] {
  const groups = new Map<string, Receivable>()
  const sorted = [...orders]
    .filter((o) => o.paid_at === null && o.status !== 'cancelled')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const o of sorted) {
    const key = o.channel === 'table' && o.dining_table_id ? `table:${o.dining_table_id}` : `order:${o.id}`
    const g = groups.get(key)
    if (g) {
      g.orders.push(o)
      g.totalCents += o.total_cents
    } else {
      const title = o.channel === 'table' ? (o.dining_tables?.label ?? 'Mesa') : `#${o.order_number} · ${orderTitle(o)}`
      groups.set(key, { key, title, orders: [o], totalCents: o.total_cents })
    }
  }
  return [...groups.values()]
}

// ───────── Linhas de pagamento (tela de receber) ─────────

export type PaymentRow = { key: string; method: PaymentMethod; amount: string }

/** Soma as linhas digitadas. `invalid` = alguma linha vazia, malformada ou zerada. */
export function sumRows(rows: PaymentRow[]): { cents: number; invalid: boolean } {
  let cents = 0
  let invalid = false
  for (const r of rows) {
    const c = parseBRLToCents(r.amount)
    if (c === null || c <= 0) invalid = true
    else cents += c
  }
  return { cents, invalid }
}

/** Quanto ainda falta cobrar (negativo = pagamentos passam da conta). */
export function remainingCents(totalCents: number, rows: PaymentRow[]): number {
  return totalCents - sumRows(rows).cents
}

/** Pode confirmar? Todas as linhas válidas e a soma exatamente igual à conta. */
export function canConfirm(totalCents: number, rows: PaymentRow[]): boolean {
  const { cents, invalid } = sumRows(rows)
  return rows.length > 0 && !invalid && cents === totalCents
}

/** Troco: o que o cliente entregou em dinheiro menos o que vale em dinheiro na conta. Nunca negativo. */
export function changeDue(receivedCents: number, cashAppliedCents: number): number {
  return Math.max(0, receivedCents - cashAppliedCents)
}

export function cashAppliedCents(rows: PaymentRow[]): number {
  return rows.reduce((sum, r) => {
    const c = r.method === 'cash' ? parseBRLToCents(r.amount) : null
    return sum + (c && c > 0 ? c : 0)
  }, 0)
}

export function toRpcPayments(rows: PaymentRow[]) {
  return rows.map((r) => ({ method: r.method, amount_cents: parseBRLToCents(r.amount) as number }))
}

/** Linha única com a conta toda numa forma de pagamento (atalho de um toque). */
export function singleRow(method: PaymentMethod, totalCents: number, key: string): PaymentRow[] {
  return [{ key, method, amount: centsToInput(totalCents) }]
}

// ───────── Pagamentos do turno ─────────

export type PaymentWithOrder = Tables<'payments'> & {
  orders: {
    order_number: number
    channel: OrderChannel
    customer_name: string | null
    dining_tables: { label: string } | null
  } | null
}

export type PaidOrderLine = {
  orderId: string
  orderNumber: number
  title: string
  /** líquido de estornos; 0 = totalmente estornado */
  netCents: number
  methods: { method: PaymentMethod; cents: number }[]
  lastAt: string
}

/** Agrupa os lançamentos do turno por pedido, já descontando estornos. Mais recente primeiro. */
export function groupPaymentsByOrder(payments: PaymentWithOrder[]): PaidOrderLine[] {
  const byOrder = new Map<string, PaidOrderLine>()
  for (const p of payments) {
    let line = byOrder.get(p.order_id)
    if (!line) {
      line = {
        orderId: p.order_id,
        orderNumber: p.orders?.order_number ?? 0,
        title: p.orders ? orderTitle(p.orders) : 'Pedido',
        netCents: 0,
        methods: [],
        lastAt: p.created_at,
      }
      byOrder.set(p.order_id, line)
    }
    line.netCents += p.amount_cents
    if (p.created_at > line.lastAt) line.lastAt = p.created_at
    const m = line.methods.find((x) => x.method === p.method)
    if (m) m.cents += p.amount_cents
    else line.methods.push({ method: p.method, cents: p.amount_cents })
  }
  return [...byOrder.values()]
    .map((l) => ({ ...l, methods: l.methods.filter((m) => m.cents !== 0) }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
}
