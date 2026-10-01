import { useState, type FormEvent } from 'react'
import Modal from '../Modal'
import { Button, ErrorBox, Field, errorMessage, inputClass } from '../ui'
import { addCashMovement } from '../../lib/api'
import { formatBRL, parseBRLToCents } from '../../lib/money'

/** Sangria (tirar dinheiro do caixa) ou suprimento (colocar). O motivo é obrigatório. */
export default function MovementModal({
  kind,
  cashInDrawerCents,
  onClose,
  onDone,
}: {
  kind: 'supply' | 'withdrawal'
  cashInDrawerCents: number
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isWithdrawal = kind === 'withdrawal'

  async function submit(e: FormEvent) {
    e.preventDefault()
    const cents = parseBRLToCents(amount)
    if (cents === null || cents <= 0) return setError('Informe um valor maior que zero. Ex.: 50,00')
    if (!reason.trim()) return setError('Informe o motivo.')
    if (isWithdrawal && cents > cashInDrawerCents) {
      return setError(`Só há ${formatBRL(cashInDrawerCents)} em dinheiro no caixa.`)
    }
    setBusy(true)
    setError(null)
    try {
      await addCashMovement(kind, cents, reason)
      onDone(`${isWithdrawal ? 'Sangria' : 'Suprimento'} de ${formatBRL(cents)} registrado.`)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={isWithdrawal ? 'Sangria (retirar dinheiro)' : 'Suprimento (colocar dinheiro)'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-stone-600">
          Dinheiro no caixa agora: <strong>{formatBRL(cashInDrawerCents)}</strong>
        </p>
        {error && <ErrorBox>{error}</ErrorBox>}
        <Field label="Valor (R$)">
          <input
            className={inputClass}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="50,00"
          />
        </Field>
        <Field label="Motivo">
          <input
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={isWithdrawal ? 'Ex.: pagamento do gás, compra de gelo' : 'Ex.: mais troco'}
          />
        </Field>
        <div className="flex gap-2">
          <Button variant="ghost" size="lg" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" size="lg" className="flex-1" disabled={busy}>
            {busy ? 'Registrando…' : 'Registrar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
