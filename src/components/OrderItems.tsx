import type { OrderItem } from '../lib/orders'
import { formatBRL } from '../lib/money'

/** Lista de itens do pedido. As observações ficam em destaque: é onde os erros acontecem. */
export default function OrderItems({
  items,
  size = 'md',
  showPrices = false,
}: {
  items: OrderItem[]
  size?: 'md' | 'lg'
  showPrices?: boolean
}) {
  const sorted = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  const text = size === 'lg' ? 'text-xl' : 'text-base'
  return (
    <ul className="space-y-2">
      {sorted.map((it) => (
        <li key={it.id} className={text}>
          <div className="flex items-baseline justify-between gap-3">
            <span>
              <span className="font-bold">{it.quantity}×</span> {it.product_name}
            </span>
            {showPrices && (
              <span className="shrink-0 text-sm text-stone-500">{formatBRL(it.unit_price_cents * it.quantity)}</span>
            )}
          </div>
          {it.notes && (
            <div className="mt-0.5 rounded-md bg-yellow-100 px-2 py-1 text-[0.9em] font-semibold text-yellow-900">
              ⚠ {it.notes}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
