import { useState } from 'react'
import Modal from '../Modal'
import { Button, ErrorBox, Field, errorMessage, inputClass } from '../ui'
import { payFinanceEntry } from '../../lib/api'
import { ENTRY_METHODS, entryMethodLabel, formatDate, type FinanceEntry } from '../../lib/finance'
import { centsToInput, formatBRL, parseBRLToCents } from '../../lib/money'
import { todayInManaus } from '../../lib/orders'

/** Dar baixa: registrar que a conta foi paga (ou recebida), com forma, valor e data. */
export default function PayEntryModal({
  entry,
  onClose,
  onDone,
}: {
  entry: FinanceEntry
  onClose: () => void
  onDone: (message: string) => void
}) {
  const today = todayInManaus()
  const isPayable = entry.kind === 'payable'
  const [method, setMethod] = useState<string>('pix')
  const [amount, setAmount] = useState(centsToInput(entry.amount_cents))
  const [date, setDate] = useState(today)
  const [fromDrawer, setFromDrawer] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canUseDrawer = method === 'cash' && date === today
  const cents = parseBRLToCents(amount)

  async function confirm() {
    if (cents === null || cents <= 0) return setError('Valor inválido. Use o formato 1.200,00')
    setBusy(true)
    setError(null)
    try {
      await payFinanceEntry(entry.id, method, {
        amountCents: cents,
        paidDate: date,
        fromDrawer: canUseDrawer && fromDrawer,
      })
      onDone(
        `${isPayable ? 'Pagamento' : 'Recebimento'} de ${formatBRL(cents)} registrado${
          canUseDrawer && fromDrawer ? ` (${isPayable ? 'sangria' : 'suprimento'} lançado no caixa)` : ''
        }.`,
      )
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <Modal title={isPayable ? 'Pagar conta' : 'Receber conta'} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-xl bg-stone-100 p-3">
          <div className="font-semibold">{entry.description}</div>
          <div className="text-sm text-stone-600">
            {entry.party ? `${entry.party} · ` : ''}vence em {formatDate(entry.due_date)}
          </div>
          <div className="mt-1 text-2xl font-extrabold">{formatBRL(entry.amount_cents)}</div>
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Forma de pagamento">
            <select
              className={inputClass}
              value={method}
              onChange={(e) => {
                setMethod(e.target.value)
                if (e.target.value !== 'cash') setFromDrawer(false)
              }}
            >
              {ENTRY_METHODS.map((m) => (
                <option key={m} value={m}>
                  {entryMethodLabel[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data" hint="Pode ser uma data passada.">
            <input
              className={inputClass}
              type="date"
              max={today}
              value={date}
              onChange={(e) => {
                setDate(e.target.value)
                if (e.target.value !== today) setFromDrawer(false)
              }}
            />
          </Field>
        </div>
        <Field label={isPayable ? 'Valor pago (R$)' : 'Valor recebido (R$)'} hint="Mude se houve juros, multa ou desconto.">
          <input className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {canUseDrawer && (
          <label className="flex items-start gap-3 rounded-xl border border-stone-200 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0"
              checked={fromDrawer}
              onChange={(e) => setFromDrawer(e.target.checked)}
            />
            <span>
              {isPayable ? (
                <>
                  <strong>Saiu do dinheiro da gaveta do caixa.</strong> O sistema registra uma sangria e o dinheiro
                  esperado na gaveta diminui.
                </>
              ) : (
                <>
                  <strong>Entrou na gaveta do caixa.</strong> O sistema registra um suprimento e o dinheiro esperado na
                  gaveta aumenta.
                </>
              )}{' '}
              Exige o caixa aberto.
            </span>
          </label>
        )}
        <div className="flex gap-2 pt-1">
          <Button variant="ghost" size="lg" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button size="lg" className="flex-1" disabled={busy || cents === null} onClick={() => void confirm()}>
            {busy ? 'Registrando…' : 'Confirmar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
