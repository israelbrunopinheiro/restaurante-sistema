import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  entryStatus,
  entryTotals,
  filterEntries,
  formatDate,
  formatDayMonth,
  periodRange,
  type FinanceEntry,
} from './finance'

describe('datas', () => {
  it('soma dias atravessando mês e ano', () => {
    expect(addDays('2026-10-05', 1)).toBe('2026-10-06')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })
  it('conta dias e formata', () => {
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30)
    expect(formatDate('2026-10-05')).toBe('05/10/2026')
    expect(formatDayMonth('2026-10-05')).toBe('05/10')
  })
})

describe('periodRange', () => {
  const today = '2026-10-05'
  it('presets', () => {
    expect(periodRange('today', today)).toEqual({ from: '2026-10-05', to: '2026-10-05' })
    expect(periodRange('yesterday', today)).toEqual({ from: '2026-10-04', to: '2026-10-04' })
    expect(periodRange('7d', today)).toEqual({ from: '2026-09-29', to: '2026-10-05' })
    expect(periodRange('30d', today)).toEqual({ from: '2026-09-06', to: '2026-10-05' })
    expect(periodRange('month', today)).toEqual({ from: '2026-10-01', to: '2026-10-05' })
    expect(periodRange('last_month', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })
  it('mês passado em janeiro e em março bissexto', () => {
    expect(periodRange('last_month', '2027-01-10')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(periodRange('last_month', '2028-03-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })
  it('1º dia do mês: "este mês" é só hoje', () => {
    expect(periodRange('month', '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-01' })
  })
})

function entry(over: Partial<FinanceEntry> & { id: string }): FinanceEntry {
  return {
    kind: 'payable', category_id: 'c', description: 'x', party: null, amount_cents: 1000, due_date: '2026-10-10', notes: null,
    series_id: null, installment: null, installments: null, paid_at: null, paid_date: null, paid_amount_cents: null,
    paid_method: null, paid_from_drawer: false, created_by: null, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z',
    finance_categories: { name: 'Aluguel' }, ...over,
  }
}

describe('lançamentos', () => {
  const today = '2026-10-05'
  it('situação', () => {
    expect(entryStatus({ paid_at: '2026-10-01T10:00:00Z', due_date: '2026-09-01' }, today)).toBe('paid')
    expect(entryStatus({ paid_at: null, due_date: '2026-10-04' }, today)).toBe('overdue')
    expect(entryStatus({ paid_at: null, due_date: '2026-10-05' }, today)).toBe('today')
    expect(entryStatus({ paid_at: null, due_date: '2026-10-12' }, today)).toBe('soon')
    expect(entryStatus({ paid_at: null, due_date: '2026-10-13' }, today)).toBe('open')
  })

  const list = [
    entry({ id: 'a', due_date: '2026-10-20', amount_cents: 500 }),
    entry({ id: 'b', due_date: '2026-10-01', amount_cents: 300 }),
    entry({ id: 'c', due_date: '2026-09-15', amount_cents: 200, paid_at: '2026-09-15T10:00:00Z', paid_date: '2026-09-15', paid_amount_cents: 200, paid_method: 'pix' }),
    entry({ id: 'd', due_date: '2026-10-03', amount_cents: 100, paid_at: '2026-10-03T10:00:00Z', paid_date: '2026-10-04', paid_amount_cents: 100, paid_method: 'cash' }),
  ]

  it('filtros e ordem', () => {
    expect(filterEntries(list, 'open', today).map((e) => e.id)).toEqual(['b', 'a'])
    expect(filterEntries(list, 'overdue', today).map((e) => e.id)).toEqual(['b'])
    expect(filterEntries(list, 'paid', today).map((e) => e.id)).toEqual(['d', 'c'])
    expect(filterEntries(list, 'all', today)).toHaveLength(4)
  })

  it('totais ignoram o que já foi pago', () => {
    expect(entryTotals(list, today)).toEqual({ openCents: 800, overdueCents: 300, overdueCount: 1 })
  })
})
