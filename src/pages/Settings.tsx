import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Notice, SectionTitle, Spinner, errorMessage, inputClass } from '../components/ui'
import type { Tables } from '../lib/database.types'
import { centsToInput, parseBRLToCents } from '../lib/money'
import { roleLabel, type AppRole } from '../lib/orders'
import { supabase } from '../lib/supabase'

type DiningTable = Tables<'dining_tables'>
type Profile = Tables<'profiles'>

function RestaurantSection() {
  const { settings, reloadSettings } = useAuth()
  const [name, setName] = useState(settings?.restaurant_name ?? '')
  const [fee, setFee] = useState(centsToInput(settings?.delivery_fee_cents ?? 0))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    const cents = parseBRLToCents(fee)
    if (!name.trim()) return setError('Digite o nome do restaurante.')
    if (cents === null) return setError('Taxa de entrega inválida. Use o formato 5,00.')
    setBusy(true)
    setError(null)
    setSaved(false)
    const { error } = await supabase
      .from('settings')
      .update({ restaurant_name: name.trim(), delivery_fee_cents: cents })
      .eq('id', true)
    setBusy(false)
    if (error) return setError(errorMessage(error))
    await reloadSettings()
    setSaved(true)
  }

  return (
    <section>
      <SectionTitle>Restaurante</SectionTitle>
      <Card>
        <form onSubmit={save} className="space-y-3">
          {error && <ErrorBox>{error}</ErrorBox>}
          {saved && <Notice>Salvo!</Notice>}
          <Field label="Nome do restaurante">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Taxa de entrega (R$)" hint="Somada automaticamente aos pedidos de delivery.">
            <input className={inputClass} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Card>
    </section>
  )
}

function TablesSection() {
  const [tables, setTables] = useState<DiningTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [quantity, setQuantity] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('dining_tables').select('*')
    if (error) setError(errorMessage(error))
    setTables((data ?? []).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { numeric: true })))
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: PromiseLike<{ error: { message: string } | null }>, friendly?: string) {
    const { error } = await action
    if (error) setError(friendly ?? errorMessage(error))
    else {
      setError(null)
      await load()
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    await run(supabase.from('dining_tables').insert({ label: label.trim() }), 'Já existe uma mesa com esse nome.')
    setLabel('')
  }

  async function createMany(e: FormEvent) {
    e.preventDefault()
    const n = Number(quantity)
    if (!Number.isInteger(n) || n < 1 || n > 100) return setError('Digite uma quantidade de 1 a 100.')
    const existing = new Set(tables.map((t) => t.label))
    const rows: { label: string }[] = []
    for (let i = 1; rows.length < n && i < 1000; i++) {
      if (!existing.has(`Mesa ${i}`)) rows.push({ label: `Mesa ${i}` })
    }
    await run(supabase.from('dining_tables').insert(rows))
    setQuantity('')
  }

  async function remove(t: DiningTable) {
    if (!window.confirm(`Excluir "${t.label}"?`)) return
    await run(
      supabase.from('dining_tables').delete().eq('id', t.id),
      `"${t.label}" já foi usada em pedidos e não pode ser excluída. Use "Desativar".`,
    )
  }

  return (
    <section>
      <SectionTitle>Mesas</SectionTitle>
      <Card className="space-y-3">
        {error && <ErrorBox>{error}</ErrorBox>}
        <form onSubmit={createMany} className="flex gap-2">
          <input
            className={inputClass}
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Quantas mesas criar? (Mesa 1, Mesa 2…)"
            aria-label="Quantidade de mesas para criar"
          />
          <Button type="submit" variant="secondary" disabled={!quantity.trim()}>
            Criar
          </Button>
        </form>
        <form onSubmit={add} className="flex gap-2">
          <input
            className={inputClass}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ou uma mesa com nome próprio (ex.: Varanda 1)"
            aria-label="Nome da nova mesa"
          />
          <Button type="submit" variant="secondary" disabled={!label.trim()}>
            Adicionar
          </Button>
        </form>
        {loading ? (
          <Spinner />
        ) : tables.length === 0 ? (
          <EmptyState>Nenhuma mesa cadastrada.</EmptyState>
        ) : (
          <ul className="divide-y divide-stone-100">
            {tables.map((t) => (
              <li key={t.id} className="flex items-center gap-2 py-2">
                <span className={`flex-1 font-medium ${t.active ? '' : 'text-stone-400 line-through'}`}>{t.label}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void run(supabase.from('dining_tables').update({ active: !t.active }).eq('id', t.id))}
                >
                  {t.active ? 'Desativar' : 'Ativar'}
                </Button>
                <Button variant="danger" size="sm" onClick={() => void remove(t)}>
                  Excluir
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  )
}

function TeamSection() {
  const { session } = useAuth()
  const [people, setPeople] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at')
    if (error) setError(errorMessage(error))
    setPeople(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function update(id: string, patch: Partial<Pick<Profile, 'role' | 'active'>>) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    if (error) setError(errorMessage(error))
    else {
      setError(null)
      await load()
    }
  }

  const pending = people.filter((p) => !p.active)

  return (
    <section>
      <SectionTitle>Equipe</SectionTitle>
      <Card className="space-y-3">
        <p className="text-sm text-stone-600">
          Quem cria conta pela tela de login fica aguardando aqui. Escolha a função e libere o acesso.
        </p>
        {error && <ErrorBox>{error}</ErrorBox>}
        {pending.length > 0 && <Notice>{pending.length} pessoa(s) aguardando aprovação.</Notice>}
        {loading ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-stone-100">
            {people.map((p) => {
              const me = p.id === session?.user.id
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {p.full_name || 'Sem nome'} {me && <span className="text-stone-500">(você)</span>}
                    </div>
                    {!p.active && <Badge className="bg-amber-100 text-amber-900">Aguardando aprovação</Badge>}
                  </div>
                  <select
                    className={`${inputClass} !w-auto`}
                    value={p.role}
                    disabled={me}
                    aria-label={`Função de ${p.full_name}`}
                    onChange={(e) => void update(p.id, { role: e.target.value as AppRole })}
                  >
                    {(Object.keys(roleLabel) as AppRole[]).map((r) => (
                      <option key={r} value={r}>
                        {roleLabel[r]}
                      </option>
                    ))}
                  </select>
                  {!me &&
                    (p.active ? (
                      <Button variant="danger" size="sm" onClick={() => void update(p.id, { active: false })}>
                        Bloquear
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => void update(p.id, { active: true })}>
                        Aprovar
                      </Button>
                    ))}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </section>
  )
}

export default function Settings() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Configurações</h1>
      <RestaurantSection />
      <TablesSection />
      <TeamSection />
    </div>
  )
}
