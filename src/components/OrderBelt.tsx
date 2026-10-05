import { Button } from './ui'
import OrderTags from './OrderTags'
import StatusTrack from './StatusTrack'
import { formatBRL } from '../lib/money'
import {
  OPEN_STATUSES,
  channelIcon,
  elapsedLabel,
  elapsedMinutes,
  formatTime,
  orderTitle,
  type OrderStatus,
  type OrderWithItems,
} from '../lib/orders'

type Stage = {
  status: Extract<OrderStatus, 'new' | 'preparing' | 'ready' | 'delivered'>
  title: string
  header: string
  next?: { to: OrderStatus; label: string }
}

const STAGES: Stage[] = [
  { status: 'new', title: 'Novos', header: 'bg-sky-600', next: { to: 'preparing', label: 'Iniciar preparo' } },
  { status: 'preparing', title: 'Preparando', header: 'bg-amber-600', next: { to: 'ready', label: 'Marcar pronto' } },
  { status: 'ready', title: 'Prontos', header: 'bg-emerald-600', next: { to: 'delivered', label: 'Marcar entregue' } },
  { status: 'delivered', title: 'Entregues hoje', header: 'bg-stone-600' },
]

const DELIVERED_LIMIT = 6

/**
 * Esteira de pedidos: uma coluna por etapa, na ordem em que o pedido anda.
 * No celular as colunas deslizam para o lado; no computador aparecem todas juntas.
 */
export default function OrderBelt({
  orders,
  today,
  now,
  busyId,
  onChange,
  onShowList,
}: {
  orders: OrderWithItems[]
  today: string
  now: number
  busyId: string | null
  onChange: (o: OrderWithItems, to: OrderStatus) => void
  onShowList: (filter: 'delivered' | 'cancelled') => void
}) {
  const byStage = (s: Stage['status']) => {
    const list = orders.filter((o) => o.status === s && (s !== 'delivered' || o.business_date === today))
    // fila: o mais antigo primeiro (é o que precisa sair antes); entregues: o mais recente primeiro
    return s === 'delivered'
      ? [...list].sort((a, b) => b.status_changed_at.localeCompare(a.status_changed_at))
      : [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))
  }
  const cancelledToday = orders.filter((o) => o.status === 'cancelled' && o.business_date === today).length

  return (
    <div className="space-y-3">
      <div
        className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0"
        role="group"
        aria-label="Esteira de pedidos"
      >
        {STAGES.map((stage, idx) => {
          const all = byStage(stage.status)
          const list = stage.status === 'delivered' ? all.slice(0, DELIVERED_LIMIT) : all
          return (
            <section
              key={stage.status}
              aria-label={stage.title}
              className="w-[82vw] max-w-sm shrink-0 snap-start lg:w-auto lg:max-w-none"
            >
              <h2
                className={`flex items-center justify-between rounded-t-xl px-3 py-2 text-base font-bold text-white ${stage.header}`}
              >
                <span>
                  <span className="mr-1.5 opacity-80">{idx + 1}</span>
                  {stage.title}
                </span>
                <span className="rounded-full bg-white/25 px-2 text-sm" data-testid={`belt-count-${stage.status}`}>
                  {all.length}
                </span>
              </h2>
              <div className="min-h-24 space-y-2 rounded-b-xl bg-stone-100 p-2">
                {list.length === 0 && <p className="py-6 text-center text-sm text-stone-400">Nenhum pedido</p>}
                {list.map((o) => {
                  const open = OPEN_STATUSES.includes(o.status)
                  const mins = o.status === 'ready' || o.status === 'delivered' ? 0 : elapsedMinutes(o.created_at, now)
                  const since =
                    o.status === 'delivered'
                      ? `às ${formatTime(o.status_changed_at)}`
                      : `há ${elapsedLabel(o.status === 'ready' ? o.status_changed_at : o.created_at, now)}`
                  const shownItems = o.order_items.slice(0, 3)
                  const hidden = o.order_items.length - shownItems.length
                  return (
                    <article
                      key={o.id}
                      data-testid={`belt-order-${o.order_number}`}
                      className={`space-y-2 rounded-xl border-2 bg-white p-3 shadow-sm ${
                        mins >= 25 ? 'border-red-400' : mins >= 15 ? 'border-amber-400' : 'border-transparent'
                      }`}
                    >
                      <header className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-xl font-extrabold">#{o.order_number}</span>
                            <span aria-hidden>{channelIcon[o.channel]}</span>
                          </div>
                          <div className="truncate text-sm font-semibold">{orderTitle(o)}</div>
                        </div>
                        <span
                          className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-bold ${
                            mins >= 25
                              ? 'bg-red-100 text-red-800'
                              : mins >= 15
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-stone-100 text-stone-600'
                          }`}
                        >
                          {since}
                        </span>
                      </header>

                      <StatusTrack status={o.status} compact />

                      <ul className="space-y-0.5 text-sm">
                        {shownItems.map((it) => (
                          <li key={it.id} className="flex gap-1">
                            <span className="font-bold">{it.quantity}×</span>
                            <span className="min-w-0 truncate">{it.product_name}</span>
                            {it.notes && (
                              <span className="shrink-0 text-yellow-700" title={it.notes} aria-label={`observação: ${it.notes}`}>
                                ⚠
                              </span>
                            )}
                          </li>
                        ))}
                        {hidden > 0 && <li className="text-xs text-stone-500">+ {hidden} {hidden === 1 ? 'item' : 'itens'}</li>}
                      </ul>
                      {o.notes && <div className="truncate rounded bg-yellow-50 px-2 py-0.5 text-xs text-yellow-900">📝 {o.notes}</div>}

                      {o.channel === 'delivery' && o.delivery_address && (
                        <div className="truncate text-xs text-stone-700" title={o.delivery_address}>
                          📍 {o.delivery_address}
                        </div>
                      )}
                      <OrderTags order={o} />

                      <div className="flex items-center justify-between gap-2 border-t border-stone-100 pt-2">
                        <span className="font-bold">{formatBRL(o.total_cents)}</span>
                        <span className="flex gap-1.5">
                          {open && (
                            <Button variant="danger" size="sm" disabled={busyId === o.id} onClick={() => onChange(o, 'cancelled')}>
                              Cancelar
                            </Button>
                          )}
                          {stage.next && (
                            <Button size="sm" disabled={busyId === o.id} onClick={() => onChange(o, stage.next!.to)}>
                              {stage.next.label} →
                            </Button>
                          )}
                        </span>
                      </div>
                    </article>
                  )
                })}
                {stage.status === 'delivered' && all.length > DELIVERED_LIMIT && (
                  <button
                    type="button"
                    className="w-full rounded-lg py-2 text-sm font-semibold text-stone-600 hover:bg-stone-200"
                    onClick={() => onShowList('delivered')}
                  >
                    + {all.length - DELIVERED_LIMIT} entregues · ver todos
                  </button>
                )}
              </div>
            </section>
          )
        })}
      </div>
      {cancelledToday > 0 && (
        <button type="button" className="text-sm text-stone-500 underline" onClick={() => onShowList('cancelled')}>
          {cancelledToday} {cancelledToday === 1 ? 'pedido cancelado' : 'pedidos cancelados'} hoje · ver
        </button>
      )}
    </div>
  )
}
