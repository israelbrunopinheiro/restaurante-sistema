import type { Tables } from './database.types'

// ───────── Datas (sempre texto AAAA-MM-DD, sem fuso: o dia de negócio já vem do banco) ─────────

function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12))
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(iso: string, n: number): string {
  const d = parse(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return fmt(d)
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parse(toIso).getTime() - parse(fromIso).getTime()) / 86400000)
}

/** "2026-10-05" → "05/10/2026" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** "2026-10-05" → "05/10" */
export function formatDayMonth(iso: string): string {
  return formatDate(iso).slice(0, 5)
}

export type PeriodPreset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'last_month'

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  month: 'Este mês',
  last_month: 'Mês passado',
}

export function periodRange(preset: PeriodPreset, today: string): { from: string; to: string } {
  const monthStart = `${today.slice(0, 8)}01`
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const y = addDays(today, -1)
      return { from: y, to: y }
    }
    case '7d':
      return { from: addDays(today, -6), to: today }
    case '30d':
      return { from: addDays(today, -29), to: today }
    case 'month':
      return { from: monthStart, to: today }
    case 'last_month': {
      const lastEnd = addDays(monthStart, -1)
      return { from: `${lastEnd.slice(0, 8)}01`, to: lastEnd }
    }
  }
}

// ───────── Lançamentos (contas a pagar / a receber) ─────────

export type EntryKind = Tables<'finance_entries'>['kind']
export type FinanceEntry = Tables<'finance_entries'> & { finance_categories: { name: string } | null }

export const ENTRY_METHODS = ['cash', 'pix', 'boleto', 'transfer', 'card'] as const
export type EntryMethod = (typeof ENTRY_METHODS)[number]

export const entryMethodLabel: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  boleto: 'Boleto',
  transfer: 'Transferência',
  card: 'Cartão',
}

export type EntryStatus = 'paid' | 'overdue' | 'today' | 'soon' | 'open'

export const entryStatusInfo: Record<EntryStatus, { label: string; style: string }> = {
  paid: { label: '✓ Pago', style: 'bg-emerald-600 text-white' },
  overdue: { label: '⚠ Vencida', style: 'bg-red-100 text-red-800' },
  today: { label: 'Vence hoje', style: 'bg-amber-100 text-amber-900' },
  soon: { label: 'Vence em breve', style: 'bg-sky-100 text-sky-800' },
  open: { label: 'Em aberto', style: 'bg-stone-200 text-stone-700' },
}

/** Situação de um lançamento num dia. "Em breve" = vence nos próximos 7 dias. */
export function entryStatus(e: Pick<Tables<'finance_entries'>, 'paid_at' | 'due_date'>, today: string): EntryStatus {
  if (e.paid_at) return 'paid'
  if (e.due_date < today) return 'overdue'
  if (e.due_date === today) return 'today'
  if (e.due_date <= addDays(today, 7)) return 'soon'
  return 'open'
}

export type EntryFilter = 'open' | 'overdue' | 'paid' | 'all'

export function filterEntries(entries: FinanceEntry[], filter: EntryFilter, today: string): FinanceEntry[] {
  const list = entries.filter((e) => {
    if (filter === 'all') return true
    if (filter === 'paid') return e.paid_at !== null
    if (filter === 'overdue') return e.paid_at === null && e.due_date < today
    return e.paid_at === null
  })
  // em aberto: o que vence primeiro vem primeiro; pagos/todas: o mais recente primeiro
  return filter === 'open' || filter === 'overdue'
    ? list.sort((a, b) => a.due_date.localeCompare(b.due_date) || a.created_at.localeCompare(b.created_at))
    : list.sort((a, b) => (b.paid_date ?? b.due_date).localeCompare(a.paid_date ?? a.due_date))
}

export function entryTotals(entries: FinanceEntry[], today: string) {
  let open = 0
  let overdue = 0
  let overdueCount = 0
  for (const e of entries) {
    if (e.paid_at) continue
    open += e.amount_cents
    if (e.due_date < today) {
      overdue += e.amount_cents
      overdueCount++
    }
  }
  return { openCents: open, overdueCents: overdue, overdueCount }
}

// ───────── Respostas dos relatórios (jsonb do banco) ─────────

export type FinanceSummary = {
  sales: { cash_cents: number; pix_cents: number; debit_cents: number; credit_cents: number; total_cents: number }
  other_income_cents: number
  expenses_cents: number
  result_cents: number
  expenses_by_category: { category: string; cents: number }[]
  days: { date: string; income_cents: number; expense_cents: number }[]
  pending: {
    payables_open_cents: number
    payables_overdue_cents: number
    payables_next7_cents: number
    receivables_open_cents: number
    receivables_overdue_cents: number
  }
  loose_withdrawals_cents: number
}

export type SalesReport = {
  orders: number
  revenue_cents: number
  average_ticket_cents: number
  cancelled: number
  cancelled_cents: number
  unpaid_cents: number
  by_channel: { channel: 'table' | 'pickup' | 'delivery' | 'whatsapp'; count: number; cents: number }[]
  top_products: { name: string; quantity: number; cents: number }[]
  by_hour: { hour: number; count: number }[]
  days: { date: string; count: number; cents: number }[]
}
