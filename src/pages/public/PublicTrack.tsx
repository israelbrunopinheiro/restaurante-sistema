import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PublicShell from '../../components/public/PublicShell'
import { Badge, Card, ErrorBox, Spinner, errorMessage } from '../../components/ui'
import { getPublicMenu, getPublicOrderStatus } from '../../lib/api'
import { formatBRL } from '../../lib/money'
import { elapsedLabel } from '../../lib/orders'
import {
  TRACK_STEPS,
  isFinal,
  paymentNote,
  statusMessage,
  trackStepIndex,
  type PublicOrderStatus,
} from '../../lib/publicOrder'

const channelText = { table: 'Mesa', pickup: 'Retirada', delivery: 'Delivery', whatsapp: 'WhatsApp' } as const

export default function PublicTrack() {
  const { id = '' } = useParams()
  const [order, setOrder] = useState<PublicOrderStatus | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState<string | undefined>()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    async function load() {
      try {
        const o = await getPublicOrderStatus(id)
        if (cancelled) return
        setOrder(o)
        setError(null)
        if (o && !isFinal(o.status)) timer = setTimeout(load, 8000)
      } catch (e) {
        if (cancelled) return
        setError(errorMessage(e))
        timer = setTimeout(load, 15000) // internet instável: tenta de novo sem avisar a cada vez
      }
    }
    void load()
    const tick = setInterval(() => setNow(Date.now()), 30000)
    return () => {
      cancelled = true
      clearTimeout(timer)
      clearInterval(tick)
    }
  }, [id])

  useEffect(() => {
    getPublicMenu(null)
      .then((m) => setName(m.restaurant_name))
      .catch(() => undefined)
  }, [])

  let backTo = '/pedir'
  try {
    const t = sessionStorage.getItem('mesa-token')
    if (t) backTo = `/pedir?mesa=${encodeURIComponent(t)}`
  } catch {
    /* sem armazenamento */
  }

  if (order === undefined) {
    return (
      <PublicShell name={name}>
        {error ? <ErrorBox>Não foi possível consultar o pedido. Tentando de novo… ({error})</ErrorBox> : <Spinner />}
      </PublicShell>
    )
  }
  if (order === null) {
    return (
      <PublicShell name={name}>
        <Card className="mt-6 text-center">
          <h1 className="text-xl font-bold">Pedido não encontrado</h1>
          <p className="mt-2 text-stone-600">Confira o endereço ou fale com o restaurante.</p>
          <Link to="/pedir" className="mt-4 inline-block font-semibold text-brand-700 underline">
            Fazer um pedido
          </Link>
        </Card>
      </PublicShell>
    )
  }

  const step = trackStepIndex(order.status)
  const cancelled = order.status === 'cancelled'

  return (
    <PublicShell name={name}>
      <div className="space-y-4">
        <Card className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm text-stone-500">Pedido</div>
              <h1 className="text-3xl font-extrabold" data-testid="track-number">
                #{order.order_number}
              </h1>
              <div className="text-sm text-stone-600">
                {order.channel === 'table' && order.table_label ? order.table_label : channelText[order.channel]} · há{' '}
                {elapsedLabel(order.created_at, now)}
              </div>
            </div>
            <Badge className={cancelled ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}>
              {cancelled ? 'Cancelado' : TRACK_STEPS[Math.max(0, step)].label}
            </Badge>
          </div>

          <p className="text-lg font-semibold" role="status" data-testid="track-message">
            {statusMessage(order.channel, order.status)}
          </p>

          {!cancelled && (
            <ol className="flex items-center gap-1" aria-label="Andamento do pedido">
              {TRACK_STEPS.map((s, i) => (
                <li key={s.status} className="flex flex-1 flex-col items-center gap-1 text-center">
                  <span
                    aria-current={i === step ? 'step' : undefined}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      i <= step ? 'bg-brand-600 text-white' : 'bg-stone-200 text-stone-500'
                    }`}
                  >
                    {i < step ? '✓' : i + 1}
                  </span>
                  <span className={`text-[11px] ${i <= step ? 'font-semibold text-stone-800' : 'text-stone-500'}`}>{s.label}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="space-y-2">
          <h2 className="font-bold">Itens</h2>
          <ul className="space-y-1.5">
            {order.items.map((it, i) => (
              <li key={i}>
                <span className="font-bold">{it.quantity}×</span> {it.name}
                {it.notes && <div className="text-sm text-stone-500">📝 {it.notes}</div>}
              </li>
            ))}
          </ul>
          <div className="space-y-0.5 border-t border-stone-100 pt-2 text-sm">
            {order.delivery_fee_cents > 0 && (
              <div className="flex justify-between text-stone-600">
                <span>Taxa de entrega</span>
                <span>{formatBRL(order.delivery_fee_cents)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-extrabold">
              <span>Total</span>
              <span>{formatBRL(order.total_cents)}</span>
            </div>
          </div>
          <p className="text-sm text-stone-600">{order.paid ? '✓ Pagamento recebido.' : `💵 ${paymentNote(order.channel)}`}</p>
        </Card>

        {error && <p className="text-xs text-stone-500">Sem conexão no momento; vamos tentar de novo.</p>}
        <div className="text-center">
          <Link to={backTo} className="font-semibold text-brand-700 underline">
            Fazer outro pedido
          </Link>
        </div>
      </div>
    </PublicShell>
  )
}
