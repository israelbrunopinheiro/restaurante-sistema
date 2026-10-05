import { describe, expect, it } from 'vitest'
import {
  formatPhone,
  isValidPhone,
  newTableToken,
  onlineMenuUrl,
  paymentNote,
  statusMessage,
  trackStepIndex,
} from './publicOrder'

describe('telefone', () => {
  it('formata celular e fixo, com ou sem +55', () => {
    expect(formatPhone('92999990000')).toBe('(92) 99999-0000')
    expect(formatPhone('9232221111')).toBe('(92) 3222-1111')
    expect(formatPhone('5592999990000')).toBe('(92) 99999-0000')
    expect(formatPhone('(92) 99999-0000')).toBe('(92) 99999-0000')
  })
  it('formatos desconhecidos voltam como vieram; vazio vira vazio', () => {
    expect(formatPhone('12345')).toBe('12345')
    expect(formatPhone(null)).toBe('')
    expect(formatPhone('')).toBe('')
  })
  it('mesma regra do banco: 10 a 13 dígitos', () => {
    expect(isValidPhone('(92) 99999-0000')).toBe(true)
    expect(isValidPhone('+55 92 99999-0000')).toBe(true)
    expect(isValidPhone('999990000')).toBe(false)
    expect(isValidPhone('55929999900001')).toBe(false)
    expect(isValidPhone('abc')).toBe(false)
  })
})

describe('link do cardápio', () => {
  it('monta o endereço com e sem mesa, respeitando a subpasta', () => {
    expect(onlineMenuUrl('https://x.github.io', '/restaurante-sistema/')).toBe('https://x.github.io/restaurante-sistema/pedir')
    expect(onlineMenuUrl('https://x.github.io', '/restaurante-sistema')).toBe('https://x.github.io/restaurante-sistema/pedir')
    expect(onlineMenuUrl('https://meusite.com.br', '/', 'abc123')).toBe('https://meusite.com.br/pedir?mesa=abc123')
  })
  it('gera códigos de mesa de 24 caracteres, diferentes a cada vez', () => {
    const a = newTableToken()
    const b = newTableToken()
    expect(a).toMatch(/^[0-9a-f]{24}$/)
    expect(a).not.toBe(b)
  })
})

describe('acompanhamento', () => {
  it('passos do pedido', () => {
    expect(trackStepIndex('new')).toBe(0)
    expect(trackStepIndex('preparing')).toBe(1)
    expect(trackStepIndex('ready')).toBe(2)
    expect(trackStepIndex('delivered')).toBe(3)
    expect(trackStepIndex('cancelled')).toBe(-1)
  })
  it('mensagens mudam conforme o tipo de pedido', () => {
    expect(statusMessage('table', 'ready')).toContain('mesa')
    expect(statusMessage('pickup', 'ready')).toContain('retirar')
    expect(statusMessage('delivery', 'ready')).toContain('entregar')
    expect(statusMessage('delivery', 'cancelled')).toContain('cancelado')
    expect(paymentNote('table')).toContain('mesa')
    expect(paymentNote('delivery')).toContain('entrega')
  })
})
