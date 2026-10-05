import { useState } from 'react'
import Modal from '../Modal'
import { Button, ErrorBox, inputClass, errorMessage } from '../ui'
import { payOrders } from '../../lib/api'
import {
  METHODS,
  canConfirm,
  cashAppliedCents,
  changeDue,
  methodIcon,
  methodLabel,
  remainingCents,
  singleRow,
  type PaymentMethod,
  type PaymentRow,
  type Receivable,
} from '../../lib/cash'
import { centsToInput, formatBRL, parseBRLToCents } from '../../lib/money'

const newKey = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)

/** Receber a conta: um ou vários pedidos, em uma ou várias formas de pagamento. */
export default function PayModal({
  group,
  onClose,
  onPaid,
}: {
  group: Receivable
  onClose: () => void
  onPaid: (message: string) => void
}) {
  const total = group.totalCents
  // O que o cliente declarou no cardápio online (só quando todos os pedidos da conta dizem o mesmo)
  const declared = group.orders.every((o) => o.pay_with && o.pay_with === group.orders[0].pay_with) ? group.orders[0].pay_with : null
  const declaredChange = declared === 'cash' && group.orders.length === 1 ? group.orders[0].change_for_cents : null
  const [rows, setRows] = useState<PaymentRow[]>(() =>
    singleRow(declared === 'pix' ? 'pix' : declared === 'card' ? 'credit' : 'cash', total, newKey()),
  )
  const [received, setReceived] = useState(declaredChange ? centsToInput(declaredChange) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remaining = remainingCents(total, rows)
  const ok = canConfirm(total, rows)
  const cashApplied = cashAppliedCents(rows)
  const receivedCents = parseBRLToCents(received)
  const change = receivedCents !== null && cashApplied > 0 ? changeDue(receivedCents, cashApplied) : 0
  const shortCash = receivedCents !== null && cashApplied > 0 && receivedCents < cashApplied

  function setRow(key: string, patch: Partial<PaymentRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await payOrders(
        group.orders.map((o) => o.id),
        rows,
      )
      onPaid(
        `Recebido ${formatBRL(total)} — ${group.title}.${change > 0 ? ` Troco: ${formatBRL(change)}.` : ''}`,
      )
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <Modal title={`Receber · ${group.title}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl bg-stone-100 p-3">
          <ul className="mb-2 space-y-0.5 text-sm text-stone-600">
            {group.orders.map((o) => (
              <li key={o.id} className="flex justify-between gap-3">
                <span>
                  Pedido #{o.order_number}
                  {o.channel === 'delivery' && o.delivery_fee_cents > 0 ? ' (com taxa de entrega)' : ''}
                </span>
                <span>{formatBRL(o.total_cents)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between border-t border-stone-300 pt-2">
            <span className="font-semibold">Total da conta</span>
            <span className="text-3xl font-extrabold">{formatBRL(total)}</span>
          </div>
        </div>

        {declared && (
          <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900" data-testid="declared-pay">
            O cliente escolheu pagar com{' '}
            <strong>{declared === 'pix' ? '⚡ Pix' : declared === 'cash' ? '💵 Dinheiro' : '💳 Cartão'}</strong>.{' '}
            {declared === 'pix' && <strong>Só marque como recebido depois de ver o Pix no extrato do banco.</strong>}
            {declared === 'cash' && (declaredChange ? `Troco para ${formatBRL(declaredChange)}.` : 'Sem troco.')}
            {declared === 'card' && 'Escolha débito ou crédito abaixo.'}
          </div>
        )}

        <div>
          <div className="mb-2 text-sm font-medium text-stone-700">Forma de pagamento (um toque paga a conta toda)</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setRows(singleRow(m, total, newKey()))
                  setReceived('')
                }}
                className={`min-h-14 rounded-xl border-2 px-2 text-sm font-semibold ${
                  rows.length === 1 && rows[0].method === m
                    ? 'border-brand-600 bg-brand-50 text-brand-800'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                }`}
              >
                <span aria-hidden>{methodIcon[m]}</span> {methodLabel[m]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.key} className="flex items-center gap-2">
              <select
                className={`${inputClass} !w-36 shrink-0`}
                value={r.method}
                aria-label={`Forma do pagamento ${i + 1}`}
                onChange={(e) => setRow(r.key, { method: e.target.value as PaymentMethod })}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {methodLabel[m]}
                  </option>
                ))}
              </select>
              <input
                className={inputClass}
                inputMode="decimal"
                value={r.amount}
                aria-label={`Valor do pagamento ${i + 1}`}
                onChange={(e) => setRow(r.key, { amount: e.target.value })}
              />
              {rows.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remover pagamento ${i + 1}`}
                  className="h-11 w-11 shrink-0 rounded-xl text-red-700 hover:bg-red-50"
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setRows((rs) => [
                ...rs,
                { key: newKey(), method: 'pix', amount: remaining > 0 ? centsToInput(remaining) : '' },
              ])
            }
          >
            + Dividir em outra forma
          </Button>
        </div>

        {cashApplied > 0 && (
          <div className="rounded-xl border border-stone-200 p-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-stone-700">
                Dinheiro recebido do cliente (para calcular o troco)
              </span>
              <input
                className={inputClass}
                inputMode="decimal"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                placeholder={`Ex.: ${centsToInput(Math.ceil(cashApplied / 1000) * 1000)}`}
              />
            </label>
            {shortCash && <p className="mt-2 text-sm text-red-700">O valor recebido é menor que o dinheiro da conta.</p>}
            {change > 0 && (
              <p className="mt-2 text-2xl font-extrabold text-emerald-700" role="status">
                Troco: {formatBRL(change)}
              </p>
            )}
          </div>
        )}

        {remaining !== 0 && (
          <p className={`text-sm font-semibold ${remaining > 0 ? 'text-amber-700' : 'text-red-700'}`} role="status">
            {remaining > 0 ? `Falta receber ${formatBRL(remaining)}` : `Passou ${formatBRL(-remaining)} da conta`}
          </p>
        )}
        {error && <ErrorBox>{error}</ErrorBox>}

        <div className="flex gap-2">
          <Button variant="ghost" size="lg" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button size="lg" className="flex-1" disabled={!ok || busy} onClick={() => void confirm()}>
            {busy ? 'Registrando…' : `Confirmar ${formatBRL(total)}`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
