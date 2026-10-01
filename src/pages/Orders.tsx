import { useMemo, useState } from 'react'
import { Badge, Button, Card, EmptyState, ErrorBox, Spinner, errorMessage } from '../components/ui'
import OrderItems from '../components/OrderItems'
import { useNow } from '../hooks/useNow'
import { useOrders } from '../hooks/useOrders'
import { setOrderStatus } from '../lib/api'
import { formatBRL } from '../lib/money'
import {
  OPEN_STATUSES,
  channelIcon,
  channelLabel,
  elapsedLabel,
  formatTime,
  orderTitle,
  statusLabel,
  statusStyle,
  todayInManaus,
  type OrderStatus,
  type OrderWithItems,
} from '../lib/orders'

type Filter = 'open' | 'delivered' | 'cancelled' | 'all'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'open', label: 'Em andamento' },
  { id: 'delivered', label: 'Entregues' },
  { id: 'cancelled', label: 'Cancelados' },
  { id: 'all', label: 'Todos' },
]

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  new: { to: 'preparing', label: 'Iniciar preparo' },
  preparing: { to: 'ready', label: 'Marcar pronto' },
  ready: { to: 'delivered', label: 'Marcar entregue' },
}

function matches(o: OrderWithItems, f: Filter): boolean {
  if (f === 'all') return true
  if (f === 'open') return OPEN_STATUSES.includes(o.status)
  return o.status === f
}

export default function Orders() {
  const { orders, loading, error, live, reload } = useOrders('today')
  const now = useNow()
  const [filter, setFilter] = useState<Filter>('open')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const today = todayInManaus()
  const summary = useMemo(() => {
    const todays = orders.filter((o) => o.business_date === today && o.status !== 'cancelled')
    return { count: todays.length, total: todays.reduce((s, o) => s + o.total_cents, 0) }
  }, [orders, today])

  const shown = useMemo(() => {
    const list = orders.filter((o) => matches(o, filter))
    // fila: o mais antigo primeiro; histórico: o mais recente primeiro
    return filter === 'open' ? list : [...list].reverse()
  }, [orders, filter])

  async function change(o: OrderWithItems, to: OrderStatus) {
    let reason: string | undefined
    if (to === 'cancelled') {
      const answer = window.prompt(`Cancelar o pedido #${o.order_number}?\nMotivo (opcional):`)
      if (answer === null) return
      reason = answer
    }
    setBusyId(o.id)
    setActionError(null)
    try {
      await setOrderStatus(o.id, to, reason)
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
        <div>
          <h1 className="text-xl font-bold">Pedidos</h1>
          <p className="text-sm text-stone-600">
            Hoje: <strong>{summary.count}</strong> {summary.count === 1 ? 'pedido' : 'pedidos'} ·{' '}
            <strong>{formatBRL(summary.total)}</strong>
          </p>
        </div>
        <span className={`text-xs font-medium ${live ? 'text-emerald-700' : 'text-amber-700'}`}>
          {live ? '● ao vivo' : '○ reconectando…'}
        </span>
      </div>

      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
        {FILTERS.map((f) => {
          const n = orders.filter((o) => matches(o, f.id)).length
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
                filter === f.id ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
              }`}
            >
              {f.label} <span className="opacity-70">({n})</span>
            </button>
          )
        })}
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}
      {actionError && <ErrorBox>{actionError}</ErrorBox>}
      {loading ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState>Nenhum pedido aqui.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((o) => {
            const next = NEXT[o.status]
            const canCancel = OPEN_STATUSES.includes(o.status)
            return (
              <Card key={o.id} className="flex flex-col gap-3" data-testid={`order-${o.order_number}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-extrabold">#{o.order_number}</span>
                      <span aria-hidden>{channelIcon[o.channel]}</span>
                      <span className="truncate font-semibold">{orderTitle(o)}</span>
                    </div>
                    <div className="text-xs text-stone-500">
                      {channelLabel[o.channel]} · {formatTime(o.created_at)}
                      {OPEN_STATUSES.includes(o.status) && ` · há ${elapsedLabel(o.created_at, now)}`}
                      {o.business_date !== today && ` · ${o.business_date.split('-').reverse().join('/')}`}
                    </div>
                  </div>
                  <Badge className={statusStyle[o.status]}>{statusLabel[o.status]}</Badge>
                </div>

                <OrderItems items={o.order_items} showPrices />

                {o.notes && <div className="rounded-lg bg-stone-100 px-3 py-2 text-sm">📝 {o.notes}</div>}
                {(o.channel === 'delivery' || o.customer_phone) && (
                  <div className="space-y-0.5 text-sm text-stone-700">
                    {o.customer_phone && (
                      <div>
                        📞{' '}
                        <a className="font-medium text-brand-700 underline" href={`tel:${o.customer_phone}`}>
                          {o.customer_phone}
                        </a>
                      </div>
                    )}
                    {o.delivery_address && <div>📍 {o.delivery_address}</div>}
                  </div>
                )}
                {o.status === 'cancelled' && o.cancel_reason && (
                  <div className="text-sm text-red-700">Motivo: {o.cancel_reason}</div>
                )}

                <div className="mt-auto space-y-1 border-t border-stone-100 pt-3">
                  {o.delivery_fee_cents > 0 && (
                    <div className="flex justify-between text-sm text-stone-500">
                      <span>Taxa de entrega</span>
                      <span>{formatBRL(o.delivery_fee_cents)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold">{formatBRL(o.total_cents)}</span>
                    <div className="flex gap-2">
                      {canCancel && (
                        <Button variant="danger" size="sm" disabled={busyId === o.id} onClick={() => void change(o, 'cancelled')}>
                          Cancelar
                        </Button>
                      )}
                      {next && (
                        <Button size="sm" disabled={busyId === o.id} onClick={() => void change(o, next.to)}>
                          {next.label}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
