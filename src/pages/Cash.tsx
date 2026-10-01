import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import PayModal from '../components/cash/PayModal'
import MovementModal from '../components/cash/MovementModal'
import CloseModal from '../components/cash/CloseModal'
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Notice, SectionTitle, Spinner, errorMessage, inputClass } from '../components/ui'
import { useOrders } from '../hooks/useOrders'
import { getCashSummary, openCashSession, refundOrder } from '../lib/api'
import {
  METHODS,
  groupPaymentsByOrder,
  groupReceivables,
  methodIcon,
  methodLabel,
  type CashSession,
  type CashSummary,
  type PaymentWithOrder,
  type Receivable,
} from '../lib/cash'
import type { Tables } from '../lib/database.types'
import { formatBRL, parseBRLToCents } from '../lib/money'
import { elapsedLabel, formatDateTime, formatTime } from '../lib/orders'
import { supabase } from '../lib/supabase'
import { useNow } from '../hooks/useNow'

type Movement = Tables<'cash_movements'>

type ModalState =
  | { kind: 'pay'; group: Receivable }
  | { kind: 'move'; type: 'supply' | 'withdrawal' }
  | { kind: 'close' }
  | null

const totalsKey = {
  cash: 'cash_cents',
  pix: 'pix_cents',
  debit: 'debit_cents',
  credit: 'credit_cents',
} as const

function OpenForm({ onOpened }: { onOpened: () => void }) {
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const cents = parseBRLToCents(amount === '' ? '0' : amount)
    if (cents === null) return setError('Valor inválido. Use o formato 100,00 (ou 0 se não houver troco).')
    setBusy(true)
    setError(null)
    try {
      await openCashSession(cents)
      onOpened()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">🔒 Caixa fechado</h2>
          <p className="text-sm text-stone-600">Abra o caixa para começar a receber os pagamentos do dia.</p>
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
        <Field label="Troco inicial na gaveta (R$)" hint="Quanto de dinheiro você está deixando no caixa para dar troco. Pode ser 0.">
          <input
            className={inputClass}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100,00"
          />
        </Field>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? 'Abrindo…' : 'Abrir o caixa'}
        </Button>
      </form>
    </Card>
  )
}

export default function Cash() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const now = useNow()

  const { orders: unpaid, loading: loadingOrders, error: ordersError, reload: reloadOrders } = useOrders('unpaid')
  const [summary, setSummary] = useState<CashSummary | null | undefined>(undefined) // undefined = carregando
  const [movements, setMovements] = useState<Movement[]>([])
  const [payments, setPayments] = useState<PaymentWithOrder[]>([])
  const [history, setHistory] = useState<CashSession[]>([])
  const [modal, setModal] = useState<ModalState>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [closedReport, setClosedReport] = useState<CashSession | null>(null)

  const loadCash = useCallback(async () => {
    try {
      const s = await getCashSummary()
      setSummary(s)
      if (s) {
        const [m, p] = await Promise.all([
          supabase.from('cash_movements').select('*').eq('session_id', s.session.id).order('created_at', { ascending: false }),
          supabase
            .from('payments')
            .select('*, orders(order_number, channel, customer_name, dining_tables(label))')
            .eq('session_id', s.session.id)
            .order('created_at', { ascending: false }),
        ])
        if (m.error ?? p.error) throw m.error ?? p.error
        setMovements(m.data ?? [])
        setPayments((p.data ?? []) as PaymentWithOrder[])
      } else {
        setMovements([])
        setPayments([])
      }
      if (isOwner) {
        const h = await supabase
          .from('cash_sessions')
          .select('*')
          .not('closed_at', 'is', null)
          .order('closed_at', { ascending: false })
          .limit(30)
        if (!h.error) setHistory(h.data ?? [])
      }
      setError(null)
    } catch (e) {
      setError(errorMessage(e))
      setSummary((prev) => (prev === undefined ? null : prev))
    }
  }, [isOwner])

  useEffect(() => {
    void loadCash()
    const t = setInterval(() => void loadCash(), 30000)
    return () => clearInterval(t)
  }, [loadCash])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadCash(), reloadOrders()])
  }, [loadCash, reloadOrders])

  const receivables = useMemo(() => groupReceivables(unpaid), [unpaid])
  const paidLines = useMemo(() => groupPaymentsByOrder(payments), [payments])
  const isOpen = !!summary

  async function refund(orderId: string, label: string) {
    const reason = window.prompt(`Estornar o pagamento de ${label}?\nMotivo (obrigatório):`)
    if (reason === null) return
    if (!reason.trim()) {
      setError('Informe o motivo do estorno.')
      return
    }
    try {
      await refundOrder(orderId, reason)
      setNotice(`Pagamento de ${label} estornado. O pedido voltou para "A receber".`)
      setError(null)
      await refreshAll()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  if (summary === undefined) return <Spinner />

  const t = summary?.totals

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Caixa</h1>

      {notice && <Notice>{notice}</Notice>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {ordersError && <ErrorBox>{ordersError}</ErrorBox>}

      {closedReport && !isOpen && (
        <Card className="space-y-1" data-testid="closed-report">
          <h2 className="text-lg font-bold">✅ Caixa fechado</h2>
          <div className="text-sm text-stone-700">
            Esperado {formatBRL(closedReport.expected_cash_cents ?? 0)} · contado {formatBRL(closedReport.counted_cents ?? 0)}
          </div>
          <div
            className={`font-bold ${
              (closedReport.difference_cents ?? 0) === 0 ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {(closedReport.difference_cents ?? 0) === 0
              ? 'Caixa batendo, sem diferença.'
              : `${(closedReport.difference_cents ?? 0) > 0 ? 'Sobra' : 'Falta'} de ${formatBRL(Math.abs(closedReport.difference_cents ?? 0))}.`}
          </div>
        </Card>
      )}

      {!isOpen && (
        <OpenForm
          onOpened={() => {
            setClosedReport(null)
            setNotice(null)
            void refreshAll()
          }}
        />
      )}

      {isOpen && summary && t && (
        <section aria-label="Turno aberto" className="space-y-3">
          <Card className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">🔓 Caixa aberto</h2>
                <p className="text-sm text-stone-600">
                  Desde {formatTime(summary.session.opened_at)} ({elapsedLabel(summary.session.opened_at, now)}) por{' '}
                  {summary.session.opened_by_name || '—'} · troco inicial {formatBRL(t.opening_cents)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setModal({ kind: 'move', type: 'supply' })}>
                  + Suprimento
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setModal({ kind: 'move', type: 'withdrawal' })}>
                  − Sangria
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {METHODS.map((m) => (
                <div key={m} className="rounded-xl bg-stone-100 p-3">
                  <div className="text-xs text-stone-500">
                    {methodIcon[m]} {methodLabel[m]}
                  </div>
                  <div className="text-lg font-bold" data-testid={`total-${m}`}>
                    {formatBRL(t[totalsKey[m]])}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-brand-50 p-3">
              <div>
                <div className="text-xs text-stone-600">Total recebido no turno</div>
                <div className="text-2xl font-extrabold" data-testid="total-received">
                  {formatBRL(t.received_cents)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-stone-600">Dinheiro que deve estar na gaveta</div>
                <div className="text-2xl font-extrabold text-brand-800" data-testid="expected-cash">
                  {formatBRL(t.expected_cash_cents)}
                </div>
              </div>
            </div>

            <Button variant="danger" size="lg" className="w-full" onClick={() => setModal({ kind: 'close' })}>
              Fechar o caixa
            </Button>
          </Card>
        </section>
      )}

      <section aria-label="A receber">
        <SectionTitle aside={<span className="text-sm text-stone-500">{receivables.length} em aberto</span>}>
          A receber
        </SectionTitle>
        {!isOpen && receivables.length > 0 && (
          <p className="mb-2 text-sm text-amber-700">Abra o caixa para poder receber.</p>
        )}
        {loadingOrders ? (
          <Spinner />
        ) : receivables.length === 0 ? (
          <EmptyState>Nenhuma conta em aberto.</EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {receivables.map((g) => (
              <Card key={g.key} className="flex flex-col gap-2" data-testid={`receivable-${g.key}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-bold">{g.title}</div>
                    <div className="text-xs text-stone-500">
                      {g.orders.length === 1
                        ? `Pedido #${g.orders[0].order_number}`
                        : `${g.orders.length} pedidos (#${g.orders.map((o) => o.order_number).join(', #')})`}{' '}
                      · desde {formatTime(g.orders[0].created_at)}
                    </div>
                  </div>
                  <div className="text-xl font-extrabold">{formatBRL(g.totalCents)}</div>
                </div>
                <ul className="text-sm text-stone-600">
                  {g.orders
                    .flatMap((o) => o.order_items)
                    .slice(0, 4)
                    .map((it) => (
                      <li key={it.id}>
                        {it.quantity}× {it.product_name}
                      </li>
                    ))}
                  {g.orders.flatMap((o) => o.order_items).length > 4 && <li>…</li>}
                </ul>
                <Button disabled={!isOpen} onClick={() => setModal({ kind: 'pay', group: g })}>
                  Receber {formatBRL(g.totalCents)}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      {isOpen && (
        <>
          <section aria-label="Pagamentos do turno">
            <SectionTitle>Recebido neste turno</SectionTitle>
            {paidLines.length === 0 ? (
              <EmptyState>Nenhum pagamento ainda.</EmptyState>
            ) : (
              <Card className="divide-y divide-stone-100 !p-0">
                {paidLines.map((l) => (
                  <div key={l.orderId} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid={`paid-${l.orderNumber}`}>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">
                        #{l.orderNumber} · {l.title}
                      </div>
                      <div className="text-xs text-stone-500">
                        {formatTime(l.lastAt)} ·{' '}
                        {l.netCents === 0
                          ? 'estornado'
                          : l.methods.map((m) => `${methodLabel[m.method]} ${formatBRL(m.cents)}`).join(' + ')}
                      </div>
                    </div>
                    {l.netCents === 0 ? (
                      <Badge className="bg-stone-200 text-stone-700">Estornado</Badge>
                    ) : (
                      <>
                        <div className="font-bold">{formatBRL(l.netCents)}</div>
                        {isOwner && (
                          <Button variant="danger" size="sm" onClick={() => void refund(l.orderId, `#${l.orderNumber}`)}>
                            Estornar
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </Card>
            )}
          </section>

          {movements.length > 0 && (
            <section aria-label="Sangrias e suprimentos">
              <SectionTitle>Sangrias e suprimentos</SectionTitle>
              <Card className="divide-y divide-stone-100 !p-0">
                {movements.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="font-medium">{m.kind === 'supply' ? 'Suprimento' : 'Sangria'}</div>
                      <div className="truncate text-xs text-stone-500">
                        {formatTime(m.created_at)} · {m.reason}
                      </div>
                    </div>
                    <div className={`font-bold ${m.kind === 'supply' ? 'text-emerald-700' : 'text-red-700'}`}>
                      {m.kind === 'supply' ? '+' : '−'} {formatBRL(m.amount_cents)}
                    </div>
                  </div>
                ))}
              </Card>
            </section>
          )}
        </>
      )}

      {isOwner && (
        <section aria-label="Histórico de caixas">
          <SectionTitle>Histórico de caixas</SectionTitle>
          {history.length === 0 ? (
            <EmptyState>Nenhum caixa fechado ainda.</EmptyState>
          ) : (
            <Card className="overflow-x-auto !p-0">
              <table className="w-full text-left text-sm">
                <thead className="bg-stone-100 text-xs uppercase text-stone-500">
                  <tr>
                    <th className="px-3 py-2">Fechado em</th>
                    <th className="px-3 py-2">Operador</th>
                    <th className="px-3 py-2 text-right">Recebido</th>
                    <th className="px-3 py-2 text-right">Esperado</th>
                    <th className="px-3 py-2 text-right">Contado</th>
                    <th className="px-3 py-2 text-right">Diferença</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {history.map((h) => {
                    const diff = h.difference_cents ?? 0
                    const received = (h.totals as { received_cents?: number } | null)?.received_cents ?? 0
                    return (
                      <tr key={h.id} title={h.notes ?? undefined}>
                        <td className="px-3 py-2">{h.closed_at ? formatDateTime(h.closed_at) : '—'}</td>
                        <td className="px-3 py-2">{h.closed_by_name || h.opened_by_name}</td>
                        <td className="px-3 py-2 text-right">{formatBRL(received)}</td>
                        <td className="px-3 py-2 text-right">{formatBRL(h.expected_cash_cents ?? 0)}</td>
                        <td className="px-3 py-2 text-right">{formatBRL(h.counted_cents ?? 0)}</td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            diff === 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {diff === 0 ? '✓' : `${diff > 0 ? '+' : '−'} ${formatBRL(Math.abs(diff))}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      )}

      {modal?.kind === 'pay' && (
        <PayModal
          group={modal.group}
          onClose={() => setModal(null)}
          onPaid={(msg) => {
            setModal(null)
            setNotice(msg)
            void refreshAll()
          }}
        />
      )}
      {modal?.kind === 'move' && t && (
        <MovementModal
          kind={modal.type}
          cashInDrawerCents={t.expected_cash_cents}
          onClose={() => setModal(null)}
          onDone={(msg) => {
            setModal(null)
            setNotice(msg)
            void refreshAll()
          }}
        />
      )}
      {modal?.kind === 'close' && t && (
        <CloseModal
          totals={t}
          onClose={() => setModal(null)}
          onClosed={(s) => {
            setModal(null)
            setClosedReport(s)
            setNotice(null)
            void refreshAll()
          }}
        />
      )}
    </div>
  )
}
