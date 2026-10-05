import type { OrderChannel, OrderStatus } from './orders'

// ───────── Respostas das funções públicas do banco ─────────

export type PayWith = 'pix' | 'cash' | 'card'
export const payWithLabel: Record<PayWith, string> = { pix: 'Pix', cash: 'Dinheiro', card: 'Cartão' }

export type PublicProduct = { id: string; name: string; description: string | null; price_cents: number }
export type PublicCategory = { id: string; name: string; products: PublicProduct[] }

export type PublicMenu =
  | { open: false; restaurant_name: string }
  | {
      open: true
      restaurant_name: string
      pickup: boolean
      delivery: boolean
      delivery_fee_cents: number
      min_cents: number
      pix: boolean
      table_requested: boolean
      table: { label: string } | null
      categories: PublicCategory[]
    }

export type PublicOrderStatus = {
  order_number: number
  status: OrderStatus
  channel: OrderChannel
  total_cents: number
  delivery_fee_cents: number
  created_at: string
  paid: boolean
  pay_with: PayWith | null
  change_for_cents: number | null
  pix: { key: string; name: string; city: string } | null
  table_label: string | null
  items: { name: string; quantity: number; notes: string | null }[]
}

// ───────── Telefone ─────────

/** "92999990000" → "(92) 99999-0000"; "9232221111" → "(92) 3222-1111"; outro formato volta como veio. */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  let d = raw.replace(/\D/g, '')
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return raw
}

/** Mesma regra do banco: de 10 a 13 dígitos (com DDD, e opcionalmente 55). */
export function isValidPhone(raw: string): boolean {
  const n = raw.replace(/\D/g, '').length
  return n >= 10 && n <= 13
}

// ───────── Link e QR ─────────

/** Endereço do cardápio online, com o código da mesa quando for o QR de uma mesa. */
export function onlineMenuUrl(origin: string, basePath: string, tableToken?: string): string {
  const base = `${origin}${basePath.endsWith('/') ? basePath : `${basePath}/`}pedir`
  return tableToken ? `${base}?mesa=${encodeURIComponent(tableToken)}` : base
}

/** Gera um código novo para o QR da mesa (96 bits aleatórios, 24 caracteres hexadecimais). */
export function newTableToken(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// ───────── Acompanhamento ─────────

export const TRACK_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'new', label: 'Recebido' },
  { status: 'preparing', label: 'Preparando' },
  { status: 'ready', label: 'Pronto' },
  { status: 'delivered', label: 'Entregue' },
]

/** Quantos passos já foram atingidos (0 a 4); cancelado não avança. */
export function trackStepIndex(status: OrderStatus): number {
  return status === 'cancelled' ? -1 : TRACK_STEPS.findIndex((s) => s.status === status)
}

export function statusMessage(channel: OrderChannel, status: OrderStatus): string {
  switch (status) {
    case 'new':
      return 'Recebemos o seu pedido! Aguardando a cozinha começar.'
    case 'preparing':
      return 'Seu pedido está sendo preparado.'
    case 'ready':
      return channel === 'table'
        ? 'Pronto! Já está indo para a sua mesa.'
        : channel === 'pickup'
          ? 'Pronto! Pode vir retirar.'
          : 'Pronto! Vamos entregar em instantes.'
    case 'delivered':
      return channel === 'pickup' ? 'Retirado. Obrigado!' : 'Entregue. Bom apetite!'
    case 'cancelled':
      return 'Este pedido foi cancelado. Em caso de dúvida, fale com o restaurante.'
  }
}

/** Frase de pagamento para o cliente, conforme o que ele escolheu. */
export function paymentNote(channel: OrderChannel, payWith?: PayWith | null, changeForCents?: number | null): string {
  const when = channel === 'table' ? 'no final, na mesa' : channel === 'pickup' ? 'ao retirar' : 'na entrega'
  if (payWith === 'pix') return 'Pagamento por Pix.'
  if (payWith === 'cash')
    return changeForCents ? `Pagamento em dinheiro ${when} (troco para ${(changeForCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).` : `Pagamento em dinheiro ${when} (sem troco).`
  if (payWith === 'card') return `Pagamento no cartão ${when}.`
  return `Você paga ${when} (dinheiro, Pix ou cartão).`
}

export function isFinal(status: OrderStatus): boolean {
  return status === 'delivered' || status === 'cancelled'
}

// ───────── Memória do aparelho (conveniência; funciona sem ela) ─────────

const ORDERS_KEY = 'pedidos-online'
const CUSTOMER_KEY = 'cliente-online'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* modo privado ou armazenamento bloqueado: segue sem lembrar */
  }
}

export function rememberOrder(id: string) {
  const list = read<string[]>(ORDERS_KEY, []).filter((x) => x !== id)
  write(ORDERS_KEY, [id, ...list].slice(0, 10))
}
export function rememberedOrders(): string[] {
  return read<string[]>(ORDERS_KEY, [])
}
export function rememberCustomer(name: string, phone: string) {
  write(CUSTOMER_KEY, { name, phone })
}
export function rememberedCustomer(): { name: string; phone: string } {
  const c = read<{ name?: string; phone?: string }>(CUSTOMER_KEY, {})
  return { name: c.name ?? '', phone: c.phone ?? '' }
}
