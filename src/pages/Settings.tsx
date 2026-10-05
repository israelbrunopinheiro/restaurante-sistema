import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Notice, SectionTitle, Spinner, errorMessage, inputClass } from '../components/ui'
import type { Tables } from '../lib/database.types'
import { centsToInput, parseBRLToCents } from '../lib/money'
import { roleLabel, type AppRole } from '../lib/orders'
import { onlineMenuUrl } from '../lib/publicOrder'
import { asciiUpper, normalizePixKey, pixPayload } from '../lib/pix'
import QrImage from '../components/QrImage'
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

function OnlineSection() {
  const { settings, reloadSettings } = useAuth()
  const [minText, setMinText] = useState(centsToInput(settings?.online_min_cents ?? 0))
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pixKey, setPixKey] = useState(settings?.pix_key ?? '')
  const [pixName, setPixName] = useState(settings?.pix_name ?? settings?.restaurant_name ?? '')
  const [pixCity, setPixCity] = useState(settings?.pix_city ?? '')
  if (!settings) return null

  const pixSaved =
    settings.pix_key && settings.pix_name && settings.pix_city
      ? { key: settings.pix_key, name: settings.pix_name, city: settings.pix_city }
      : null

  async function savePix(clear = false) {
    if (clear) {
      await save({ pix_key: null, pix_name: null, pix_city: null })
      setPixKey('')
      return
    }
    const key = normalizePixKey(pixKey)
    const name = asciiUpper(pixName, 25)
    const city = asciiUpper(pixCity, 15)
    if (!key || !name || !city) return setError('Preencha a chave Pix, o nome do recebedor e a cidade.')
    await save({ pix_key: key, pix_name: name, pix_city: city })
    setPixKey(key)
    setPixName(name)
    setPixCity(city)
  }

  const link = onlineMenuUrl(window.location.origin, import.meta.env.BASE_URL)

  async function save(patch: Partial<Pick<Tables<'settings'>, 'online_open' | 'online_pickup' | 'online_delivery' | 'online_table' | 'online_min_cents' | 'pix_key' | 'pix_name' | 'pix_city'>>) {
    setError(null)
    setNotice(null)
    const { error } = await supabase.from('settings').update(patch).eq('id', true)
    if (error) return setError(errorMessage(error))
    await reloadSettings()
    setNotice('Salvo!')
  }

  async function toggleOpen(next: boolean) {
    if (next && !window.confirm('Ligar os pedidos online?\n\nQualquer pessoa com o link ou o QR code poderá fazer pedidos. Confira o cardápio e a taxa de entrega antes.')) return
    await save({ online_open: next })
  }

  async function saveMin() {
    const cents = parseBRLToCents(minText === '' ? '0' : minText)
    if (cents === null) return setError('Valor inválido. Use o formato 30,00 (ou 0 para sem mínimo).')
    await save({ online_min_cents: cents })
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copie o link:', link)
    }
  }

  const Check = ({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-start gap-3 rounded-xl border border-stone-200 p-3">
      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-stone-500">{hint}</span>
      </span>
    </label>
  )

  return (
    <section>
      <SectionTitle>Pedidos online</SectionTitle>
      <Card className="space-y-4">
        {error && <ErrorBox>{error}</ErrorBox>}
        {notice && <Notice>{notice}</Notice>}

        <label
          className={`flex items-start gap-3 rounded-xl border-2 p-3 ${settings.online_open ? 'border-emerald-500 bg-emerald-50' : 'border-stone-300'}`}
        >
          <input
            type="checkbox"
            className="mt-1 h-6 w-6 shrink-0"
            checked={settings.online_open}
            onChange={(e) => void toggleOpen(e.target.checked)}
            aria-label="Aceitando pedidos online"
          />
          <span>
            <span className="block text-lg font-bold">
              {settings.online_open ? '🟢 Aceitando pedidos online' : '🔴 Pedidos online desligados'}
            </span>
            <span className="block text-sm text-stone-600">
              {settings.online_open
                ? 'Desligue quando a cozinha estiver cheia ou fora do horário. Quem abrir o link verá "pedidos fechados".'
                : 'Ligue para começar a receber pedidos pelo link e pelos QR codes das mesas. Enquanto estiver desligado, quem abrir o link vê "pedidos fechados".'}
            </span>
          </span>
        </label>

        <div className="grid gap-2 sm:grid-cols-3">
          <Check label="Retirada" hint="Cliente busca no local" checked={settings.online_pickup} onChange={(v) => void save({ online_pickup: v })} />
          <Check label="Delivery" hint="Usa a taxa de entrega acima" checked={settings.online_delivery} onChange={(v) => void save({ online_delivery: v })} />
          <Check label="Pedido pela mesa" hint="Pelo QR code de cada mesa" checked={settings.online_table} onChange={(v) => void save({ online_table: v })} />
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Pedido mínimo para retirada e delivery (R$)" hint="0 = sem mínimo. Não vale para pedidos feitos pela mesa.">
              <input className={inputClass} inputMode="decimal" value={minText} onChange={(e) => setMinText(e.target.value)} />
            </Field>
          </div>
          <Button variant="secondary" onClick={() => void saveMin()}>
            Salvar
          </Button>
        </div>

        <div className="space-y-3 rounded-xl border border-stone-200 p-3" data-testid="pix-config">
          <div>
            <div className="font-semibold">⚡ Pix no cardápio online</div>
            <p className="text-sm text-stone-600">
              {pixSaved
                ? '🟢 Pix ativo: o cliente que escolher Pix vê o QR Code e o copia e cola com o valor exato do pedido.'
                : 'Informe a sua chave Pix para o cliente poder pagar pelo QR Code. Sem chave, a opção Pix não aparece.'}
            </p>
          </div>
          <Field label="Chave Pix" hint="CPF, CNPJ, celular, e-mail ou chave aleatória. O dinheiro cai direto na sua conta.">
            <input className={inputClass} value={pixKey} onChange={(e) => setPixKey(e.target.value)} autoComplete="off" maxLength={77} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome do recebedor" hint="Como aparece no app do cliente (até 25 letras).">
              <input className={inputClass} value={pixName} onChange={(e) => setPixName(e.target.value)} maxLength={40} />
            </Field>
            <Field label="Cidade" hint="Até 15 letras. Ex.: Manaus">
              <input className={inputClass} value={pixCity} onChange={(e) => setPixCity(e.target.value)} maxLength={30} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void savePix()}>
              Salvar Pix
            </Button>
            {pixSaved && (
              <Button variant="ghost" onClick={() => void savePix(true)}>
                Desligar Pix
              </Button>
            )}
          </div>
          {pixSaved && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-stone-100 p-2 text-sm">
              <QrImage text={pixPayload(pixSaved)} label="teste do Pix (sem valor)" size={96} />
              <p className="min-w-0 flex-1 text-stone-700">
                <strong>Teste:</strong> leia este QR com o app do seu banco (não precisa pagar). Deve aparecer o nome{' '}
                <strong>{pixSaved.name}</strong>. O Pix é conferido por você no extrato; o sistema não recebe aviso do banco.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-xl bg-stone-100 p-3">
          <div className="text-sm font-medium text-stone-700">Link do cardápio online</div>
          <div className="break-all rounded-lg bg-white p-2 text-sm" data-testid="online-link">
            {link}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => void copy()}>
              {copied ? '✓ Copiado' : 'Copiar link'}
            </Button>
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 items-center rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-800 hover:bg-stone-100"
            >
              Abrir
            </a>
            <Link
              to="/qr"
              className="inline-flex min-h-9 items-center rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700"
            >
              QR codes das mesas →
            </Link>
          </div>
        </div>
        <p className="text-xs text-stone-500">
          Os pedidos online chegam na cozinha com a etiqueta <strong>🌐 Online</strong>, o tipo (<strong>Delivery</strong> ou <strong>Retirada</strong>), a taxa e a forma de pagamento que o cliente escolheu. O cliente acompanha o andamento por uma página própria. Há limites automáticos por telefone, aparelho e mesa
          contra pedidos falsos; se alguém abusar, cancele o pedido em Pedidos.
        </p>
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
      <OnlineSection />
      <TablesSection />
      <TeamSection />
    </div>
  )
}
