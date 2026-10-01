import { describe, expect, it } from 'vitest'
import {
  addToCart,
  changeQty,
  itemCount,
  removeLine,
  setNotes,
  subtotalCents,
  toRpcItems,
  type CartLine,
} from './cart'

const feijoada = { id: 'p1', name: 'Feijoada', price_cents: 3500 }
const suco = { id: 'p2', name: 'Suco', price_cents: 800 }
let n = 0
const key = () => `k${++n}`

describe('carrinho', () => {
  it('soma na linha existente sem observação', () => {
    let cart: CartLine[] = []
    cart = addToCart(cart, feijoada, key)
    cart = addToCart(cart, feijoada, key)
    expect(cart).toHaveLength(1)
    expect(cart[0].quantity).toBe(2)
  })

  it('cria linha nova quando a existente tem observação', () => {
    let cart = addToCart([], feijoada, key)
    cart = setNotes(cart, cart[0].key, 'sem cebola')
    cart = addToCart(cart, feijoada, key)
    expect(cart).toHaveLength(2)
    expect(cart[0].notes).toBe('sem cebola')
    expect(cart[1].notes).toBe('')
  })

  it('remove a linha ao chegar a zero e respeita o máximo de 99', () => {
    let cart = addToCart([], suco, key)
    cart = changeQty(cart, cart[0].key, -1)
    expect(cart).toHaveLength(0)

    cart = addToCart([], suco, key)
    cart = changeQty(cart, cart[0].key, 500)
    expect(cart[0].quantity).toBe(99)
  })

  it('calcula subtotal e contagem', () => {
    let cart = addToCart([], feijoada, key)
    cart = addToCart(cart, feijoada, key)
    cart = addToCart(cart, suco, key)
    expect(subtotalCents(cart)).toBe(7800)
    expect(itemCount(cart)).toBe(3)
  })

  it('remove linha', () => {
    const cart = addToCart(addToCart([], feijoada, key), suco, key)
    expect(removeLine(cart, cart[0].key).map((l) => l.productId)).toEqual(['p2'])
  })

  it('monta os itens do RPC sem enviar preço e com observação vazia como null', () => {
    let cart = addToCart([], feijoada, key)
    cart = setNotes(cart, cart[0].key, '  ponto da carne: mal passado ')
    cart = addToCart(cart, suco, key)
    const items = toRpcItems(cart)
    expect(items).toEqual([
      { product_id: 'p1', quantity: 1, notes: 'ponto da carne: mal passado' },
      { product_id: 'p2', quantity: 1, notes: null },
    ])
    expect(JSON.stringify(items)).not.toContain('price')
  })
})
