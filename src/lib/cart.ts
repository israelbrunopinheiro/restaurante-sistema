export type CartLine = {
  /** id local da linha (uma mesma comida pode aparecer em linhas com observações diferentes) */
  key: string
  productId: string
  name: string
  unitPriceCents: number
  quantity: number
  notes: string
}

export const MAX_QTY = 99

type ProductRef = { id: string; name: string; price_cents: number }

/** Toque no produto: soma 1 na linha sem observação, ou cria uma linha nova. */
export function addToCart(lines: CartLine[], product: ProductRef, newKey: () => string): CartLine[] {
  const existing = lines.find((l) => l.productId === product.id && l.notes.trim() === '')
  if (existing) return changeQty(lines, existing.key, 1)
  return [
    ...lines,
    {
      key: newKey(),
      productId: product.id,
      name: product.name,
      unitPriceCents: product.price_cents,
      quantity: 1,
      notes: '',
    },
  ]
}

/** Soma `delta` à quantidade; a linha some ao chegar a 0. */
export function changeQty(lines: CartLine[], key: string, delta: number): CartLine[] {
  return lines
    .map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + delta) } : l))
    .filter((l) => l.quantity > 0)
}

export function setNotes(lines: CartLine[], key: string, notes: string): CartLine[] {
  return lines.map((l) => (l.key === key ? { ...l, notes } : l))
}

export function removeLine(lines: CartLine[], key: string): CartLine[] {
  return lines.filter((l) => l.key !== key)
}

export function subtotalCents(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0)
}

export function itemCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0)
}

/** Formato esperado pela função create_order do banco. O preço NÃO vai: o servidor usa o do cardápio. */
export function toRpcItems(lines: CartLine[]) {
  return lines.map((l) => ({
    product_id: l.productId,
    quantity: l.quantity,
    notes: l.notes.trim() || null,
  }))
}
