import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PublicShell from '../../components/public/PublicShell'
import QrImage from '../../components/QrImage'
import { Badge, Button, Card, ErrorBox, Spinner, errorMessage } from '../../components/ui'
import { getPublicMenu, getPublicOrderStatus } from '../../lib/api'
import { formatBRL } from '../../lib/money'
import { elapsedLabel } from '../../lib/orders'
import { pixPayload } from '../../lib/pix'
import {
  TRACK_STEPS,
  isFinal,
  paymentNote,
  statusMessage,
  trackStepIndex,
  type PublicOrderStatus,
} from '../../lib/publicOrder'

const channelText = { table: 'Mesa', pickup: '🛍️ Retirada no local', delivery: '🛵 Delivery', whatsapp: 'WhatsApp' } as const

function PixPay({ order }: { order: PublicOrderStatus & { pix: NonNullable<PublicOrderStatus['pix']> } }) {
  const [copied, setCopied] = useState(false)
  const code = pixPayload({ ...order.pix, amountCents: order.total_cents, txid: `PED${order.order_number}` })
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      window.prompt('Copie o código Pix:', code)
    }
  }
  return (
    <Card className="space-y-3 border-2 border-emerald-500" data-testid="pix-card">
      <h2 className="text-lg font-bold">⚡ Pague com Pix</h2>
      <p className="text-sm text-stone-700">
        Abra o app do seu banco, escolha <strong>Pix</strong> e leia o QR Code ou use o <strong>copia e cola</strong>. O valor já vem preenchido:
      </p>
      <div className="text-center text-3xl font-extrabold" data-testid="pix-amount">
        {formatBRL(order.total_cents)}
      </div>
      <div className="flex justify-center">
        <QrImage text={code} label={`QR Code Pix de ${formatBRL(order.total_cents)}`} size={220} />
      </div>
      <div className="space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Pix copia e cola</div>
        <textarea readOnly rows={3} value={code} onFocus={(e) => e.currentTarget.select()} className="w-full break-all rounded-lg border border-stone-300 bg-stone-50 p-2 font-mono text-xs" aria-label="Código Pix copia e cola" />
        <Button size="lg" className="w-full" onClick={() => void copy()}>
          {copied ? '✓ Código copiado' : 'Copiar código Pix'}
        </Button>
      </div>
      <p className="text-xs text-stone-600">
        Recebedor: <strong>{order.pix.name}</strong>. Se o nome não for esse, não pague. O restaurante confere o Pix no banco antes de liberar o pedido.
      </p>
    </Card>
  )
}

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
                <strong>{order.channel === 'table' && order.table_label ? order.table_label : channelText[order.channel]}</strong> · há{' '}
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

        {order.pix && !order.paid && !cancelled && <PixPay order={{ ...order, pix: order.pix }} />}

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
            {order.channel === 'delivery' && (
              <div className="flex justify-between font-semibold text-amber-900">
                <span>🛵 Taxa de entrega</span>
                <span>{order.delivery_fee_cents > 0 ? formatBRL(order.delivery_fee_cents) : 'Grátis'}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-extrabold">
              <span>Total</span>
              <span>{formatBRL(order.total_cents)}</span>
            </div>
          </div>
          <p className="text-sm text-stone-600">{order.paid ? '✓ Pagamento recebido.' : `💵 ${paymentNote(order.channel, order.pay_with, order.change_for_cents)}`}</p>
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
