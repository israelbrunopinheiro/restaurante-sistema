import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Button, Card, EmptyState, ErrorBox, Field, Notice, SectionTitle, Spinner, errorMessage, inputClass } from '../components/ui'
import { createOrder } from '../lib/api'
import { addToCart, changeQty, itemCount, removeLine, setNotes, subtotalCents, type CartLine } from '../lib/cart'
import type { Tables } from '../lib/database.types'
import { formatBRL } from '../lib/money'
import { channelIcon, channelLabel, type OrderChannel } from '../lib/orders'
import { supabase } from '../lib/supabase'

type Category = Tables<'categories'>
type Product = Tables<'products'>
type DiningTable = Tables<'dining_tables'>

const CHANNELS: OrderChannel[] = ['table', 'pickup', 'delivery', 'whatsapp']
const newKey = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)

export default function NewOrder() {
  const { settings, profile } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [tables, setTables] = useState<DiningTable[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [channel, setChannel] = useState<OrderChannel>('table')
  const [tableId, setTableId] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [lines, setLines] = useState<CartLine[]>([])
  const [activeCat, setActiveCat] = useState<string>('all')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ number: number; title: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [c, p, t] = await Promise.all([
        supabase.from('categories').select('*').eq('active', true).order('position').order('name'),
        supabase.from('products').select('*').eq('active', true).order('position').order('name'),
        supabase.from('dining_tables').select('*').eq('active', true),
      ])
      if (cancelled) return
      const err = c.error ?? p.error ?? t.error
      if (err) setLoadError(errorMessage(err))
      setCategories(c.data ?? [])
      setProducts(p.data ?? [])
      setTables((t.data ?? []).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { numeric: true })))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const visibleCategories = useMemo(
    () => categories.filter((c) => products.some((p) => p.category_id === c.id)),
    [categories, products],
  )
  const visibleProducts = useMemo(
    () => products.filter((p) => visibleCategories.some((c) => c.id === p.category_id) && (activeCat === 'all' || p.category_id === activeCat)),
    [products, visibleCategories, activeCat],
  )
  const qtyByProduct = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of lines) m.set(l.productId, (m.get(l.productId) ?? 0) + l.quantity)
    return m
  }, [lines])

  const deliveryFee = channel === 'delivery' ? (settings?.delivery_fee_cents ?? 0) : 0
  const subtotal = subtotalCents(lines)
  const total = subtotal + deliveryFee
  const count = itemCount(lines)

  function validate(): string | null {
    if (lines.length === 0) return 'Adicione ao menos um item ao pedido.'
    if (channel === 'table' && !tableId) return 'Escolha a mesa.'
    if (channel === 'pickup' && !name.trim()) return 'Informe o nome do cliente para a retirada.'
    if ((channel === 'delivery' || channel === 'whatsapp') && !phone.trim()) return 'Informe o telefone do cliente.'
    if (channel === 'delivery' && !address.trim()) return 'Informe o endereço de entrega.'
    return null
  }

  async function submit() {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    setSent(null)
    try {
      const order = await createOrder({
        channel,
        lines,
        diningTableId: channel === 'table' ? tableId : undefined,
        customerName: name,
        customerPhone: phone,
        deliveryAddress: channel === 'delivery' ? address : undefined,
        notes: orderNotes,
      })
      const tableLabel = tables.find((t) => t.id === tableId)?.label
      setSent({
        number: order.order_number,
        title: channel === 'table' ? (tableLabel ?? 'Mesa') : channelLabel[channel],
      })
      setLines([])
      setOrderNotes('')
      setName('')
      setPhone('')
      setAddress('')
      setTableId('')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-5 pb-32">
      {sent && (
        <Notice>
          ✅ Pedido <strong>#{sent.number}</strong> ({sent.title}) enviado para a cozinha.{' '}
          <Link to="/pedidos" className="font-semibold underline">
            Ver pedidos
          </Link>
        </Notice>
      )}
      {loadError && <ErrorBox>{loadError}</ErrorBox>}

      <section>
        <SectionTitle>Tipo de pedido</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Tipo de pedido">
          {CHANNELS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={channel === c}
              onClick={() => setChannel(c)}
              className={`flex min-h-16 flex-col items-center justify-center rounded-xl border-2 px-2 py-2 text-sm font-semibold transition-colors ${
                channel === c
                  ? 'border-brand-600 bg-brand-50 text-brand-800'
                  : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
              }`}
            >
              <span className="text-2xl" aria-hidden>
                {channelIcon[c]}
              </span>
              {channelLabel[c]}
            </button>
          ))}
        </div>
      </section>

      <Card className="space-y-3">
        {channel === 'table' && (
          <div>
            <div className="mb-2 text-sm font-medium text-stone-700">Mesa</div>
            {tables.length === 0 ? (
              <p className="text-sm text-stone-500">
                Nenhuma mesa cadastrada.{' '}
                {profile?.role === 'owner' ? (
                  <Link to="/configuracoes" className="font-semibold text-brand-700 underline">
                    Cadastrar mesas
                  </Link>
                ) : (
                  'Peça ao dono para cadastrar em Configurações → Mesas.'
                )}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6" role="radiogroup" aria-label="Mesa">
                {tables.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={tableId === t.id}
                    onClick={() => setTableId(t.id)}
                    className={`min-h-12 rounded-xl border-2 px-2 text-sm font-semibold ${
                      tableId === t.id
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-stone-200 bg-white text-stone-800 hover:border-stone-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {channel !== 'table' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={channel === 'pickup' ? 'Nome do cliente *' : 'Nome do cliente'}>
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            </Field>
            <Field label={channel === 'delivery' || channel === 'whatsapp' ? 'Telefone *' : 'Telefone'}>
              <input
                className={inputClass}
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(92) 99999-0000"
                autoComplete="off"
              />
            </Field>
            {channel === 'delivery' && (
              <div className="sm:col-span-2">
                <Field label="Endereço de entrega *" hint="Rua, número, bairro e ponto de referência.">
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </Field>
              </div>
            )}
          </div>
        )}

        <Field label="Observação do pedido (opcional)">
          <input
            className={inputClass}
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            placeholder="Ex.: cliente alérgico a amendoim"
          />
        </Field>
      </Card>

      <section>
        <SectionTitle>Cardápio</SectionTitle>
        {visibleProducts.length === 0 && visibleCategories.length === 0 ? (
          <EmptyState>
            O cardápio está vazio.{' '}
            {profile?.role === 'owner' ? (
              <Link to="/cardapio" className="font-semibold text-brand-700 underline">
                Cadastrar produtos
              </Link>
            ) : (
              'Peça ao dono para cadastrar os produtos.'
            )}
          </EmptyState>
        ) : (
          <>
            <div className="-mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1">
              {[{ id: 'all', name: 'Tudo' }, ...visibleCategories].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveCat(c.id)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
                    activeCat === c.id ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
              {visibleProducts.map((p) => {
                const q = qtyByProduct.get(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`product-${p.id}`}
                    onClick={() => setLines((ls) => addToCart(ls, p, newKey))}
                    className="relative flex min-h-24 flex-col justify-between rounded-xl border border-stone-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-brand-600 active:bg-brand-50"
                  >
                    {q ? (
                      <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-bold text-white">
                        {q}
                      </span>
                    ) : null}
                    <span className="font-semibold leading-snug">{p.name}</span>
                    {p.description && <span className="mt-0.5 line-clamp-2 text-xs text-stone-500">{p.description}</span>}
                    <span className="mt-2 font-bold text-brand-700">{formatBRL(p.price_cents)}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </section>

      <section>
        <SectionTitle>Itens do pedido</SectionTitle>
        {lines.length === 0 ? (
          <EmptyState>Toque nos produtos acima para adicionar.</EmptyState>
        ) : (
          <div className="space-y-2">
            {lines.map((l) => (
              <Card key={l.key} className="space-y-2 !p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 font-semibold">{l.name}</div>
                  <div className="shrink-0 text-sm font-semibold text-stone-600">
                    {formatBRL(l.unitPriceCents * l.quantity)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center overflow-hidden rounded-xl border border-stone-300">
                    <button
                      type="button"
                      aria-label={`Diminuir ${l.name}`}
                      className="h-11 w-11 text-xl font-bold hover:bg-stone-100"
                      onClick={() => setLines((ls) => changeQty(ls, l.key, -1))}
                    >
                      −
                    </button>
                    <span className="w-10 text-center text-lg font-bold" aria-label={`Quantidade de ${l.name}`}>
                      {l.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Aumentar ${l.name}`}
                      className="h-11 w-11 text-xl font-bold hover:bg-stone-100"
                      onClick={() => setLines((ls) => changeQty(ls, l.key, 1))}
                    >
                      +
                    </button>
                  </div>
                  <input
                    className={inputClass}
                    value={l.notes}
                    onChange={(e) => setLines((ls) => setNotes(ls, l.key, e.target.value))}
                    placeholder="Observação (ex.: sem cebola)"
                    aria-label={`Observação de ${l.name}`}
                  />
                  <button
                    type="button"
                    aria-label={`Remover ${l.name}`}
                    className="h-11 w-11 shrink-0 rounded-xl text-xl text-red-700 hover:bg-red-50"
                    onClick={() => setLines((ls) => removeLine(ls, l.key))}
                  >
                    ✕
                  </button>
                </div>
              </Card>
            ))}
            <div className="space-y-1 px-1 pt-2 text-sm text-stone-600">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatBRL(subtotal)}</span>
              </div>
              {channel === 'delivery' && (
                <div className="flex justify-between">
                  <span>Taxa de entrega</span>
                  <span>{formatBRL(deliveryFee)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-2">
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-stone-500">
                {count} {count === 1 ? 'item' : 'itens'}
              </div>
              <div className="text-xl font-bold">{formatBRL(total)}</div>
            </div>
            <Button size="lg" className="flex-[2]" disabled={busy || lines.length === 0} onClick={() => void submit()}>
              {busy ? 'Enviando…' : 'Enviar para a cozinha'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
