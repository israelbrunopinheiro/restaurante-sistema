import { useState, type FormEvent } from 'react'
import Modal from '../Modal'
import { Button, ErrorBox, Field, errorMessage, inputClass } from '../ui'
import { createFinanceEntry } from '../../lib/api'
import type { Tables } from '../../lib/database.types'
import { todayInManaus } from '../../lib/orders'
import { centsToInput, parseBRLToCents } from '../../lib/money'
import type { EntryKind, FinanceEntry } from '../../lib/finance'
import { supabase } from '../../lib/supabase'

/** Criar ou editar uma conta a pagar / a receber. Só lançamentos ainda não baixados podem ser editados. */
export default function EntryForm({
  kind,
  categories,
  initial,
  onClose,
  onSaved,
}: {
  kind: EntryKind
  categories: Tables<'finance_categories'>[]
  initial?: FinanceEntry
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const isPayable = kind === 'payable'
  const [description, setDescription] = useState(initial?.description ?? '')
  const [party, setParty] = useState(initial?.party ?? '')
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? categories[0]?.id ?? '')
  const [amount, setAmount] = useState(initial ? centsToInput(initial.amount_cents) : '')
  const [dueDate, setDueDate] = useState(initial?.due_date ?? todayInManaus())
  const [repeat, setRepeat] = useState('1')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const cents = parseBRLToCents(amount)
    const months = Number(repeat)
    if (!description.trim()) return setError('Informe a descrição.')
    if (!categoryId) return setError('Escolha a categoria.')
    if (cents === null || cents <= 0) return setError('Valor inválido. Use o formato 1.200,00')
    if (!dueDate) return setError('Informe a data de vencimento.')
    if (!initial && (!Number.isInteger(months) || months < 1 || months > 36)) {
      return setError('A repetição vai de 1 a 36 meses.')
    }
    setBusy(true)
    setError(null)
    try {
      if (initial) {
        const { error } = await supabase
          .from('finance_entries')
          .update({
            description: description.trim(),
            party: party.trim() || null,
            category_id: categoryId,
            amount_cents: cents,
            due_date: dueDate,
            notes: notes.trim() || null,
          })
          .eq('id', initial.id)
        if (error) throw error
        onSaved('Lançamento atualizado.')
      } else {
        const n = await createFinanceEntry({
          kind,
          categoryId,
          description,
          party,
          amountCents: cents,
          dueDate,
          notes,
          repeatMonths: months,
        })
        onSaved(n > 1 ? `${n} lançamentos criados (um por mês).` : 'Lançamento criado.')
      }
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={`${initial ? 'Editar' : 'Nova'} ${isPayable ? 'conta a pagar' : 'conta a receber'}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <ErrorBox>{error}</ErrorBox>}
        <Field label="Descrição">
          <input
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={isPayable ? 'Ex.: Aluguel do salão, conta de energia' : 'Ex.: Evento da empresa X'}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={isPayable ? 'Fornecedor (opcional)' : 'Cliente (opcional)'}>
            <input className={inputClass} value={party} onChange={(e) => setParty(e.target.value)} />
          </Field>
          <Field label="Categoria">
            <select className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Valor (R$)">
            <input
              className={inputClass}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1.200,00"
            />
          </Field>
          <Field label="Vencimento">
            <input className={inputClass} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        {!initial && (
          <Field
            label="Repetir por quantos meses?"
            hint="1 = só este mês. Para aluguel e contas fixas, use 12: o sistema cria um lançamento por mês."
          >
            <input
              className={inputClass}
              inputMode="numeric"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </Field>
        )}
        <Field label="Observações (opcional)">
          <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex gap-2 pt-1">
          <Button variant="ghost" size="lg" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" size="lg" className="flex-1" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
