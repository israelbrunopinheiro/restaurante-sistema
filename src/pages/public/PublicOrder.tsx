import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Modal from '../../components/Modal'
import PublicShell from '../../components/public/PublicShell'
import { Button, Card, EmptyState, ErrorBox, Field, Spinner, errorMessage, inputClass } from '../../components/ui'
import { getPublicMenu, placePublicOrder } from '../../lib/api'
import { addToCart, changeQty, itemCount, setNotes, subtotalCents, type CartLine } from '../../lib/cart'
import { formatBRL } from '../../lib/money'
import {
  isValidPhone,
  paymentNote,
  rememberCustomer,
  rememberOrder,
  rememberedCustomer,
  type PublicMenu,
} from '../../lib/publicOrder'

type Mode = 'table' | 'pickup' | 'delivery'
const newKey = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)

export default function PublicOrder() {
  const [params] = useSearchParams()
  const token = params.get('mesa')
  const navigate = useNavigate()

  const [menu, setMenu] = useState<PublicMenu | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)
  const [lines, setLines] = useState<CartLine[]>([])
  const [activeCat, setActiveCat] = useState('all')
  const [checkout, setCheckout] = useState(false)
  const saved = useMemo(() => rememberedCustomer(), [])
  const [name, setName] = useState(saved.name)
  const [phone, setPhone] = useState(saved.phone)
  const [address, setAddress] = useState('')
  const [notes, setNotesText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      if (token) sessionStorage.setItem('mesa-token', token)
    } catch {
      /* sem armazenamento: segue normal */
    }
    let cancelled = false
    getPublicMenu(token)
      .then((m) => {
        if (cancelled) return
        setMenu(m)
        if (m.open) {
          setMode(m.table ? 'table' : m.pickup && !m.delivery ? 'pickup' : m.delivery && !m.pickup ? 'delivery' : 'pickup')
        }
      })
      .catch((e) => !cancelled && setLoadError(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [token])

  const open = menu?.open ? menu : null
  const categories = open?.categories ?? []
  const products = useMemo(
    () => categories.filter((c) => activeCat === 'all' || c.id === activeCat),
    [categories, activeCat],
  )
  const qtyByProduct = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of lines) m.set(l.productId, (m.get(l.productId) ?? 0) + l.quantity)
    return m
  }, [lines])

  const subtotal = subtotalCents(lines)
  const count = itemCount(lines)
  const fee = mode === 'delivery' ? (open?.delivery_fee_cents ?? 0) : 0
  const total = subtotal + fee
  const minCents = mode === 'table' ? 0 : (open?.min_cents ?? 0)
  const belowMin = minCents > 0 && subtotal < minCents

  function validate(): string | null {
    if (!mode) return 'Escolha como quer receber o pedido.'
    if (lines.length === 0) return 'Escolha ao menos um item.'
    if (name.trim().length < 2) return 'Informe o seu nome.'
    if (!isValidPhone(phone)) return 'Informe um telefone válido, com DDD. Ex.: (92) 99999-0000'
    if (mode === 'delivery' && address.trim().length < 8) return 'Informe o endereço de entrega completo.'
    if (belowMin) return `O pedido mínimo é ${formatBRL(minCents)}.`
    return null
  }

  async function submit() {
    const problem = validate()
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      const res = await placePublicOrder({
        channel: mode!,
        lines,
        name,
        phone,
        address: mode === 'delivery' ? address : undefined,
        notes,
        tableToken: mode === 'table' ? token : undefined,
      })
      rememberOrder(res.id)
      rememberCustomer(name.trim(), phone.trim())
      navigate(`/pedir/pedido/${res.id}`)
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <PublicShell>
        <ErrorBox>Não foi possível carregar o cardápio. Verifique a internet e tente de novo. ({loadError})</ErrorBox>
      </PublicShell>
    )
  }
  if (!menu) {
    return (
      <PublicShell>
        <Spinner />
      </PublicShell>
    )
  }
  if (!menu.open) {
    return (
      <PublicShell name={menu.restaurant_name}>
        <Card className="mt-6 text-center">
          <div className="mb-2 text-4xl" aria-hidden>
            🔒
          </div>
          <h1 className="text-xl font-bold">Pedidos online fechados</h1>
          <p className="mt-2 text-stone-600">
            No momento não estamos recebendo pedidos por aqui. Volte mais tarde ou fale diretamente com o restaurante.
          </p>
        </Card>
      </PublicShell>
    )
  }
  if (!menu.table && !menu.pickup && !menu.delivery) {
    return (
      <PublicShell name={menu.restaurant_name}>
        <EmptyState>Pedidos online indisponíveis no momento.</EmptyState>
      </PublicShell>
    )
  }

  return (
    <PublicShell name={menu.restaurant_name}>
      <div className="space-y-4 pb-28">
        {menu.table_requested && !menu.table && (
          <ErrorBox>
            Este QR code da mesa não é válido ou foi desativado. Você ainda pode pedir para retirada ou delivery, ou
            chamar o atendente.
          </ErrorBox>
        )}

        {menu.table ? (
          <Card className="flex items-center gap-3 !p-3">
            <span className="text-2xl" aria-hidden>
              🍽️
            </span>
            <div>
              <div className="font-bold">{menu.table.label}</div>
              <div className="text-sm text-stone-600">Seu pedido vai direto para a cozinha e para a sua mesa.</div>
            </div>
          </Card>
        ) : (
          menu.pickup &&
          menu.delivery && (
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Como receber">
              {(['pickup', 'delivery'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`min-h-14 rounded-xl border-2 px-3 text-sm font-semibold ${
                    mode === m ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-stone-200 bg-white text-stone-700'
                  }`}
                >
                  {m === 'pickup' ? '🛍️ Retirar no local' : `🛵 Receber em casa${menu.delivery_fee_cents > 0 ? ` (+ ${formatBRL(menu.delivery_fee_cents)})` : ''}`}
                </button>
              ))}
            </div>
          )
        )}
        {!menu.table && menu.pickup !== menu.delivery && (
          <p className="text-sm text-stone-600">
            {menu.pickup ? '🛍️ Pedidos para retirar no local.' : `🛵 Pedidos para entrega${menu.delivery_fee_cents > 0 ? ` (taxa ${formatBRL(menu.delivery_fee_cents)})` : ''}.`}
          </p>
        )}
        {minCents > 0 && <p className="text-sm text-stone-600">Pedido mínimo: {formatBRL(minCents)}.</p>}

        {categories.length === 0 ? (
          <EmptyState>O cardápio ainda não tem produtos.</EmptyState>
        ) : (
          <>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {[{ id: 'all', name: 'Tudo' }, ...categories].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveCat(c.id)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
                    activeCat === c.id ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-700'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
            {products.map((c) => (
              <section key={c.id} aria-label={c.name}>
                <h2 className="mb-2 text-lg font-bold">{c.name}</h2>
                <div className="space-y-2">
                  {c.products.map((p) => {
                    const q = qtyByProduct.get(p.id) ?? 0
                    return (
                      <Card key={p.id} className="flex items-center gap-3 !p-3" data-testid={`prod-${p.id}`}>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold">{p.name}</div>
                          {p.description && <div className="line-clamp-2 text-sm text-stone-500">{p.description}</div>}
                          <div className="mt-1 font-bold text-brand-700">{formatBRL(p.price_cents)}</div>
                        </div>
                        {q === 0 ? (
                          <Button size="sm" onClick={() => setLines((ls) => addToCart(ls, p, newKey))}>
                            Adicionar
                          </Button>
                        ) : (
                          <div className="flex items-center overflow-hidden rounded-xl border border-stone-300">
                            <button
                              type="button"
                              aria-label={`Diminuir ${p.name}`}
                              className="h-10 w-10 text-xl font-bold hover:bg-stone-100"
                              onClick={() => {
                                const line = lines.find((l) => l.productId === p.id)
                                if (line) setLines((ls) => changeQty(ls, line.key, -1))
                              }}
                            >
                              −
                            </button>
                            <span className="w-8 text-center font-bold" aria-label={`Quantidade de ${p.name}`}>
                              {q}
                            </span>
                            <button
                              type="button"
                              aria-label={`Aumentar ${p.name}`}
                              className="h-10 w-10 text-xl font-bold hover:bg-stone-100"
                              onClick={() => setLines((ls) => addToCart(ls, p, newKey))}
                            >
                              +
                            </button>
                          </div>
                        )}
                      </Card>
                    )
                  })}
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto max-w-xl">
            <Button size="lg" className="w-full" onClick={() => setCheckout(true)}>
              Ver pedido · {count} {count === 1 ? 'item' : 'itens'} · {formatBRL(subtotal)}
            </Button>
          </div>
        </div>
      )}

      {checkout && mode && (
        <Modal title="Seu pedido" onClose={() => !busy && setCheckout(false)}>
          <div className="space-y-4">
            <ul className="space-y-3">
              {lines.map((l) => (
                <li key={l.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 font-semibold">{l.name}</span>
                    <span className="shrink-0 text-sm text-stone-600">{formatBRL(l.unitPriceCents * l.quantity)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center overflow-hidden rounded-xl border border-stone-300">
                      <button
                        type="button"
                        aria-label={`Diminuir ${l.name} no pedido`}
                        className="h-10 w-10 text-xl font-bold hover:bg-stone-100"
                        onClick={() => setLines((ls) => changeQty(ls, l.key, -1))}
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-bold">{l.quantity}</span>
                      <button
                        type="button"
                        aria-label={`Aumentar ${l.name} no pedido`}
                        className="h-10 w-10 text-xl font-bold hover:bg-stone-100"
                        onClick={() => setLines((ls) => changeQty(ls, l.key, 1))}
                      >
                        +
                      </button>
                    </div>
                    <input
                      className={inputClass}
                      value={l.notes}
                      maxLength={100}
                      onChange={(e) => setLines((ls) => setNotes(ls, l.key, e.target.value))}
                      placeholder="Observação (ex.: sem cebola)"
                      aria-label={`Observação de ${l.name}`}
                    />
                  </div>
                </li>
              ))}
            </ul>
            {lines.length === 0 && <p className="text-sm text-stone-500">Seu pedido está vazio.</p>}

            <div className="space-y-1 rounded-xl bg-stone-100 p-3 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatBRL(subtotal)}</span>
              </div>
              {fee > 0 && (
                <div className="flex justify-between">
                  <span>Taxa de entrega</span>
                  <span>{formatBRL(fee)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-stone-300 pt-1 text-lg font-extrabold">
                <span>Total</span>
                <span data-testid="checkout-total">{formatBRL(total)}</span>
              </div>
            </div>
            {belowMin && (
              <p className="text-sm font-semibold text-amber-700">
                Faltam {formatBRL(minCents - subtotal)} para o pedido mínimo de {formatBRL(minCents)}.
              </p>
            )}

            <Field label="Seu nome">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} />
            </Field>
            <Field label="Telefone com DDD" hint="Usamos só para falar sobre o seu pedido.">
              <input
                className={inputClass}
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                placeholder="(92) 99999-0000"
              />
            </Field>
            {mode === 'delivery' && (
              <Field label="Endereço de entrega" hint="Rua, número, bairro e ponto de referência.">
                <textarea className={inputClass} rows={2} maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} />
              </Field>
            )}
            <Field label="Alguma observação para o pedido? (opcional)">
              <input className={inputClass} maxLength={200} value={notes} onChange={(e) => setNotesText(e.target.value)} />
            </Field>

            <p className="text-sm text-stone-600">💵 {paymentNote(mode)}</p>
            {error && <ErrorBox>{error}</ErrorBox>}
            <div className="flex gap-2">
              <Button variant="ghost" size="lg" onClick={() => setCheckout(false)} disabled={busy}>
                Voltar
              </Button>
              <Button size="lg" className="flex-1" disabled={busy || lines.length === 0} onClick={() => void submit()}>
                {busy ? 'Enviando…' : `Enviar pedido · ${formatBRL(total)}`}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </PublicShell>
  )
}
