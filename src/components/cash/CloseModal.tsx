import { useState, type FormEvent } from 'react'
import Modal from '../Modal'
import { Button, ErrorBox, Field, errorMessage, inputClass } from '../ui'
import { closeCashSession } from '../../lib/api'
import type { CashSession, SessionTotals } from '../../lib/cash'
import { formatBRL, parseBRLToCents } from '../../lib/money'

/** Fechar o caixa: conta o dinheiro da gaveta e compara com o esperado. Diferença exige explicação. */
export default function CloseModal({
  totals,
  onClose,
  onClosed,
}: {
  totals: SessionTotals
  onClose: () => void
  onClosed: (session: CashSession) => void
}) {
  const [counted, setCounted] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const countedCents = parseBRLToCents(counted)
  const diff = countedCents === null ? null : countedCents - totals.expected_cash_cents

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (countedCents === null) return setError('Informe quanto dinheiro há na gaveta. Se não há nada, digite 0.')
    if (diff !== 0 && !notes.trim()) return setError('Há diferença no caixa. Explique o motivo nas observações.')
    setBusy(true)
    setError(null)
    try {
      onClosed(await closeCashSession(countedCents, notes))
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title="Fechar o caixa" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-stone-100 p-3 text-sm">
          <div className="flex justify-between">
            <span>Troco inicial</span>
            <span>{formatBRL(totals.opening_cents)}</span>
          </div>
          <div className="flex justify-between">
            <span>+ Vendas em dinheiro</span>
            <span>{formatBRL(totals.cash_cents)}</span>
          </div>
          <div className="flex justify-between">
            <span>+ Suprimentos</span>
            <span>{formatBRL(totals.supplies_cents)}</span>
          </div>
          <div className="flex justify-between">
            <span>− Sangrias</span>
            <span>{formatBRL(totals.withdrawals_cents)}</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between border-t border-stone-300 pt-2">
            <span className="font-semibold">Dinheiro esperado na gaveta</span>
            <span className="text-2xl font-extrabold">{formatBRL(totals.expected_cash_cents)}</span>
          </div>
        </div>

        {error && <ErrorBox>{error}</ErrorBox>}

        <Field label="Dinheiro contado na gaveta (R$)" hint="Conte as notas e moedas, sem olhar o valor esperado.">
          <input
            className={inputClass}
            inputMode="decimal"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            placeholder="0,00"
          />
        </Field>

        {diff !== null && (
          <p
            role="status"
            className={`text-lg font-bold ${diff === 0 ? 'text-emerald-700' : diff > 0 ? 'text-amber-700' : 'text-red-700'}`}
          >
            {diff === 0
              ? '✓ Caixa batendo'
              : diff > 0
                ? `Sobrando ${formatBRL(diff)}`
                : `Faltando ${formatBRL(-diff)}`}
          </p>
        )}

        <Field label={diff !== null && diff !== 0 ? 'Observações (obrigatório: explique a diferença)' : 'Observações (opcional)'}>
          <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <p className="text-xs text-stone-500">
          Pix, débito e crédito não entram na gaveta: confira esses valores com o extrato do banco e da maquininha.
        </p>

        <div className="flex gap-2">
          <Button variant="ghost" size="lg" onClick={onClose} disabled={busy}>
            Voltar
          </Button>
          <Button type="submit" size="lg" className="flex-1" disabled={busy}>
            {busy ? 'Fechando…' : 'Fechar o caixa'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
