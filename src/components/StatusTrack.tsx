import type { OrderStatus } from '../lib/orders'

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'new', label: 'Novo' },
  { status: 'preparing', label: 'Preparo' },
  { status: 'ready', label: 'Pronto' },
  { status: 'delivered', label: 'Entregue' },
]

const dot: Record<string, string> = {
  new: 'bg-sky-600',
  preparing: 'bg-amber-600',
  ready: 'bg-emerald-600',
  delivered: 'bg-stone-600',
}

/** Trilha do pedido: Novo → Preparo → Pronto → Entregue, com o ponto atual destacado. */
export default function StatusTrack({ status, compact = false }: { status: OrderStatus; compact?: boolean }) {
  if (status === 'cancelled') {
    return (
      <div className="flex items-center gap-2 text-xs font-semibold text-red-800">
        <span aria-hidden>✕</span> Pedido cancelado
      </div>
    )
  }
  const current = STEPS.findIndex((s) => s.status === status)
  return (
    <ol className="flex items-center" aria-label={`Andamento: ${STEPS[current].label}`}>
      {STEPS.map((s, i) => {
        const reached = i <= current
        const isCurrent = i === current
        return (
          <li key={s.status} className="flex flex-1 items-center last:flex-none" aria-current={isCurrent ? 'step' : undefined}>
            <span className="flex flex-col items-center gap-0.5">
              <span
                className={`flex items-center justify-center rounded-full text-[10px] font-bold text-white ${
                  compact ? 'h-4 w-4' : 'h-5 w-5'
                } ${reached ? dot[s.status] : 'bg-stone-200 text-stone-400'} ${
                  isCurrent ? 'ring-2 ring-offset-1 ring-stone-400' : ''
                }`}
              >
                {i < current ? '✓' : ''}
              </span>
              <span className={`text-[10px] leading-none ${isCurrent ? 'font-bold text-stone-900' : reached ? 'text-stone-600' : 'text-stone-400'}`}>
                {s.label}
              </span>
            </span>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden
                className={`mx-1 mb-3 h-0.5 flex-1 rounded ${i < current ? dot[STEPS[i + 1].status] : 'bg-stone-200'}`}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
