import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, EmptyState, ErrorBox, Notice, Spinner, errorMessage } from '../ui'
import EntryForm from './EntryForm'
import PayEntryModal from './PayEntryModal'
import { reopenFinanceEntry } from '../../lib/api'
import type { Tables } from '../../lib/database.types'
import {
  entryMethodLabel,
  entryStatus,
  entryStatusInfo,
  entryTotals,
  filterEntries,
  formatDate,
  type EntryFilter,
  type EntryKind,
  type FinanceEntry,
} from '../../lib/finance'
import { formatBRL } from '../../lib/money'
import { todayInManaus } from '../../lib/orders'
import { supabase } from '../../lib/supabase'

const FILTERS: { id: EntryFilter; label: string }[] = [
  { id: 'open', label: 'Em aberto' },
  { id: 'overdue', label: 'Vencidas' },
  { id: 'paid', label: 'Pagas' },
  { id: 'all', label: 'Todas' },
]

type Modal = { kind: 'new' } | { kind: 'edit'; entry: FinanceEntry } | { kind: 'pay'; entry: FinanceEntry } | null

export default function EntriesTab({ kind }: { kind: EntryKind }) {
  const isPayable = kind === 'payable'
  const today = todayInManaus()
  const [entries, setEntries] = useState<FinanceEntry[]>([])
  const [categories, setCategories] = useState<Tables<'finance_categories'>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState<EntryFilter>('open')
  const [modal, setModal] = useState<Modal>(null)

  const load = useCallback(async () => {
    const [e, c] = await Promise.all([
      supabase
        .from('finance_entries')
        .select('*, finance_categories(name)')
        .eq('kind', kind)
        .order('due_date', { ascending: true })
        .limit(1000),
      supabase.from('finance_categories').select('*').eq('kind', kind).eq('active', true).order('name'),
    ])
    const err = e.error ?? c.error
    setError(err ? errorMessage(err) : null)
    setEntries((e.data ?? []) as FinanceEntry[])
    setCategories(c.data ?? [])
    setLoading(false)
  }, [kind])

  useEffect(() => {
    setLoading(true)
    setFilter('open')
    setNotice(null)
    void load()
  }, [load])

  const totals = useMemo(() => entryTotals(entries, today), [entries, today])
  const shown = useMemo(() => filterEntries([...entries], filter, today), [entries, filter, today])
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, filterEntries([...entries], f.id, today).length])) as Record<EntryFilter, number>,
    [entries, today],
  )

  async function reopen(e: FinanceEntry) {
    if (!window.confirm(`Reabrir "${e.description}"? Ele volta para a lista de contas em aberto.`)) return
    try {
      await reopenFinanceEntry(e.id)
      setNotice('Lançamento reaberto.')
      setError(null)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function remove(e: FinanceEntry) {
    const extra = e.series_id ? '\n(Só este mês; os outros meses continuam.)' : ''
    if (!window.confirm(`Excluir "${e.description}" (${formatBRL(e.amount_cents)})?${extra}`)) return
    const { error } = await supabase.from('finance_entries').delete().eq('id', e.id)
    if (error) setError(errorMessage(error))
    else {
      setNotice('Lançamento excluído.')
      setError(null)
      await load()
    }
  }

  const done = (msg: string) => {
    setModal(null)
    setNotice(msg)
    void load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-6">
          <div>
            <div className="text-xs text-stone-500">{isPayable ? 'A pagar em aberto' : 'A receber em aberto'}</div>
            <div className="text-2xl font-extrabold" data-testid="open-total">
              {formatBRL(totals.openCents)}
            </div>
          </div>
          {totals.overdueCount > 0 && (
            <div>
              <div className="text-xs text-red-800">⚠ Vencidas ({totals.overdueCount})</div>
              <div className="text-2xl font-extrabold text-red-800" data-testid="overdue-total">
                {formatBRL(totals.overdueCents)}
              </div>
            </div>
          )}
        </div>
        <Button onClick={() => setModal({ kind: 'new' })}>+ {isPayable ? 'Nova conta a pagar' : 'Nova conta a receber'}</Button>
      </div>

      {notice && <Notice>{notice}</Notice>}
      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1" role="radiogroup" aria-label="Filtro">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
              filter === f.id ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            }`}
          >
            {f.label} <span className="opacity-70">({counts[f.id]})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState>
          {filter === 'open' ? 'Nenhuma conta em aberto.' : 'Nada por aqui.'}
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {shown.map((e) => {
            const st = entryStatus(e, today)
            const info = entryStatusInfo[st]
            return (
              <Card key={e.id} className="space-y-2 !p-3" data-testid={`entry-${e.description}-${e.installment ?? 1}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {e.description}
                      {e.installments && (
                        <span className="ml-2 text-xs font-normal text-stone-500">
                          {e.installment}/{e.installments}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-stone-500">
                      {[e.finance_categories?.name, e.party].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-extrabold">{formatBRL(e.paid_amount_cents ?? e.amount_cents)}</div>
                    <Badge className={info.style}>{info.label}</Badge>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-600">
                  <span>
                    {e.paid_at
                      ? `Pago em ${formatDate(e.paid_date!)} · ${entryMethodLabel[e.paid_method ?? ''] ?? e.paid_method}${
                          e.paid_from_drawer ? ' (pela gaveta)' : ''
                        }${e.paid_amount_cents !== e.amount_cents ? ` · previsto ${formatBRL(e.amount_cents)}` : ''}`
                      : `Vence em ${formatDate(e.due_date)}`}
                  </span>
                  <span className="flex gap-1">
                    {e.paid_at ? (
                      <Button variant="secondary" size="sm" onClick={() => void reopen(e)}>
                        Reabrir
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" onClick={() => setModal({ kind: 'pay', entry: e })}>
                          {isPayable ? 'Pagar' : 'Receber'}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setModal({ kind: 'edit', entry: e })}>
                          Editar
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => void remove(e)}>
                          Excluir
                        </Button>
                      </>
                    )}
                  </span>
                </div>
                {e.notes && <div className="text-xs text-stone-500">📝 {e.notes}</div>}
              </Card>
            )
          })}
        </div>
      )}

      {modal?.kind === 'new' && (
        <EntryForm kind={kind} categories={categories} onClose={() => setModal(null)} onSaved={done} />
      )}
      {modal?.kind === 'edit' && (
        <EntryForm kind={kind} categories={categories} initial={modal.entry} onClose={() => setModal(null)} onSaved={done} />
      )}
      {modal?.kind === 'pay' && <PayEntryModal entry={modal.entry} onClose={() => setModal(null)} onDone={done} />}
    </div>
  )
}
