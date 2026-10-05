import { Badge } from './ui'
import { formatBRL } from '../lib/money'
import type { OrderWithItems } from '../lib/orders'

/**
 * Etiquetas bem visíveis do tipo do pedido (Delivery, Retirada, Mesa) e do pagamento que o cliente declarou.
 * Servem para a equipe nunca confundir o que foi pedido, mesmo que o cliente "mude de ideia" no balcão.
 */
export default function OrderTags({ order: o, large = false }: { order: OrderWithItems; large?: boolean }) {
  const size = large ? '!px-3 !py-1 !text-sm' : ''
  const closed = o.status === 'delivered' || o.status === 'cancelled'
  return (
    <div className="flex flex-wrap items-center gap-1" data-testid={`tags-${o.order_number}`}>
      {o.channel === 'delivery' && (
        <Badge className={`bg-amber-500 font-extrabold uppercase text-white ${size}`}>
          🛵 Delivery · taxa {o.delivery_fee_cents > 0 ? formatBRL(o.delivery_fee_cents) : 'grátis'}
        </Badge>
      )}
      {o.channel === 'pickup' && (
        <Badge className={`bg-stone-800 font-extrabold uppercase text-white ${size}`}>🛍️ Retirada · não entregar</Badge>
      )}
      {o.channel === 'table' && (
        <Badge className={`bg-sky-700 font-extrabold uppercase text-white ${size}`}>🍽️ {o.dining_tables?.label ?? 'Mesa'}</Badge>
      )}
      {o.source === 'online' && <Badge className={`bg-violet-100 text-violet-800 ${size}`}>🌐 Online</Badge>}
      {o.status !== 'cancelled' && o.paid_at && <Badge className={`bg-emerald-600 text-white ${size}`}>✓ Pago</Badge>}
      {o.status !== 'cancelled' && !o.paid_at && o.pay_with === 'pix' && (
        <Badge className={`bg-orange-100 text-orange-900 ${size}`}>
          ⚡ Pix{closed ? '' : ' · confira no banco'} · {formatBRL(o.total_cents)}
        </Badge>
      )}
      {o.status !== 'cancelled' && !o.paid_at && o.pay_with === 'cash' && (
        <Badge className={`bg-orange-100 text-orange-900 ${size}`}>
          💵 Dinheiro ·{' '}
          {o.change_for_cents
            ? `troco p/ ${formatBRL(o.change_for_cents)} (levar ${formatBRL(o.change_for_cents - o.total_cents)})`
            : 'sem troco'}
        </Badge>
      )}
      {o.status !== 'cancelled' && !o.paid_at && o.pay_with === 'card' && (
        <Badge className={`bg-orange-100 text-orange-900 ${size}`}>💳 Cartão · {o.channel === 'delivery' ? 'levar máquina' : 'na máquina'}</Badge>
      )}
      {o.status !== 'cancelled' && !o.paid_at && !o.pay_with && <Badge className={`bg-orange-100 text-orange-800 ${size}`}>A receber</Badge>}
    </div>
  )
}
