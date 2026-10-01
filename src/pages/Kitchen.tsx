import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, EmptyState, ErrorBox, Spinner, errorMessage } from '../components/ui'
import OrderItems from '../components/OrderItems'
import { useBeep } from '../hooks/useBeep'
import { useNow } from '../hooks/useNow'
import { useOrders } from '../hooks/useOrders'
import { setOrderStatus } from '../lib/api'
import {
  channelIcon,
  channelLabel,
  elapsedLabel,
  elapsedMinutes,
  formatTime,
  orderTitle,
  type OrderStatus,
  type OrderWithItems,
} from '../lib/orders'

type Column = {
  status: Extract<OrderStatus, 'new' | 'preparing' | 'ready'>
  title: string
  header: string
  forward?: { to: OrderStatus; label: string }
  back?: { to: OrderStatus; label: string }
}

const COLUMNS: Column[] = [
  { status: 'new', title: 'Novos', header: 'bg-sky-600', forward: { to: 'preparing', label: '▶ Começar' } },
  {
    status: 'preparing',
    title: 'Preparando',
    header: 'bg-amber-600',
    forward: { to: 'ready', label: '✓ Pronto' },
    back: { to: 'new', label: '↩ Voltar' },
  },
  {
    status: 'ready',
    title: 'Prontos',
    header: 'bg-emerald-600',
    forward: { to: 'delivered', label: 'Entregue' },
    back: { to: 'preparing', label: '↩ Voltar' },
  },
]

export default function Kitchen() {
  const { orders, loading, error, live, reload } = useOrders('open')
  const now = useNow(20000)
  const beep = useBeep()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Toca o aviso quando chega um pedido novo (não no primeiro carregamento).
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (loading) return
    if (seen.current === null) {
      seen.current = new Set(orders.map((o) => o.id))
      return
    }
    let arrived = false
    for (const o of orders) {
      if (!seen.current.has(o.id)) {
        seen.current.add(o.id)
        if (o.status === 'new') arrived = true
      }
    }
    if (arrived) beep.playIfEnabled()
  }, [orders, loading, beep])

  const byStatus = useMemo(() => {
    const m: Record<string, OrderWithItems[]> = { new: [], preparing: [], ready: [] }
    for (const o of orders) m[o.status]?.push(o)
    return m
  }, [orders])

  async function move(o: OrderWithItems, to: OrderStatus) {
    setBusyId(o.id)
    setActionError(null)
    try {
      await setOrderStatus(o.id, to)
      await reload()
    } catch (e) {
      setActionError(errorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Cozinha</h1>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium ${live ? 'text-emerald-700' : 'text-amber-700'}`}>
            {live ? '● ao vivo' : '○ reconectando…'}
          </span>
          <Button variant={beep.enabled ? 'primary' : 'secondary'} size="sm" onClick={beep.toggle}>
            {beep.enabled ? '🔔 Som ligado' : '🔕 Ativar som'}
          </Button>
        </div>
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}
      {actionError && <ErrorBox>{actionError}</ErrorBox>}

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => (
            <section key={col.status} aria-label={col.title} className="min-w-0">
              <h2 className={`rounded-t-xl px-4 py-2 text-lg font-bold text-white ${col.header}`}>
                {col.title} <span className="opacity-80">({byStatus[col.status].length})</span>
              </h2>
              <div className="space-y-3 rounded-b-xl bg-stone-100 p-2">
                {byStatus[col.status].length === 0 && (
                  <EmptyState>Nada aqui.</EmptyState>
                )}
                {byStatus[col.status].map((o) => {
                  const since = col.status === 'ready' ? o.status_changed_at : o.created_at
                  const late = col.status !== 'ready' ? elapsedMinutes(o.created_at, now) : 0
                  const border = late >= 25 ? 'border-red-500' : late >= 15 ? 'border-amber-500' : 'border-stone-200'
                  return (
                    <article
                      key={o.id}
                      data-testid={`kitchen-order-${o.order_number}`}
                      className={`space-y-3 rounded-xl border-2 bg-white p-3 shadow-sm ${border}`}
                    >
                      <header className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-extrabold">#{o.order_number}</span>
                            <span aria-hidden className="text-xl">
                              {channelIcon[o.channel]}
                            </span>
                          </div>
                          <div className="truncate text-lg font-bold">{orderTitle(o)}</div>
                          <div className="text-xs text-stone-500">
                            {channelLabel[o.channel]} · entrou às {formatTime(o.created_at)}
                          </div>
                        </div>
                        <div
                          className={`shrink-0 rounded-lg px-2 py-1 text-sm font-bold ${
                            late >= 25
                              ? 'bg-red-100 text-red-800'
                              : late >= 15
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-stone-100 text-stone-700'
                          }`}
                        >
                          {elapsedLabel(since, now)}
                        </div>
                      </header>

                      <OrderItems items={o.order_items} size="lg" />

                      {o.notes && (
                        <div className="rounded-lg bg-yellow-100 px-3 py-2 text-lg font-semibold text-yellow-900">
                          📝 {o.notes}
                        </div>
                      )}

                      <div className="flex gap-2">
                        {col.back && (
                          <Button
                            variant="secondary"
                            size="lg"
                            disabled={busyId === o.id}
                            onClick={() => void move(o, col.back!.to)}
                          >
                            {col.back.label}
                          </Button>
                        )}
                        {col.forward && (
                          <Button
                            size="lg"
                            className="flex-1"
                            disabled={busyId === o.id}
                            onClick={() => void move(o, col.forward!.to)}
                          >
                            {col.forward.label}
                          </Button>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
