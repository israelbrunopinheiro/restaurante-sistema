import { describe, expect, it } from 'vitest'
import { centsToInput, formatBRL, parseBRLToCents } from './money'

describe('parseBRLToCents', () => {
  it.each([
    ['35', 3500],
    ['35,9', 3590],
    ['35,90', 3590],
    ['35.90', 3590],
    ['1.234,50', 123450],
    ['R$ 35,90', 3590],
    ['0,5', 50],
    ['0', 0],
    ['1.234.567', 123456700],
  ])('%s → %s', (input, expected) => {
    expect(parseBRLToCents(input)).toBe(expected)
  })

  it.each(['', '   ', 'abc', '-5', '1,234', '12,3,4', '1..2', 'R$'])('rejeita %j', (input) => {
    expect(parseBRLToCents(input)).toBeNull()
  })

  it('não tem erro de ponto flutuante', () => {
    expect(parseBRLToCents('19,99')).toBe(1999)
    expect(parseBRLToCents('0,29')).toBe(29)
    expect(parseBRLToCents('1,15')).toBe(115)
  })
})

describe('formatBRL / centsToInput', () => {
  it('formata em reais', () => {
    expect(formatBRL(3590).replace(/\s/g, ' ')).toBe('R$ 35,90')
    expect(formatBRL(0).replace(/\s/g, ' ')).toBe('R$ 0,00')
  })
  it('ida e volta', () => {
    expect(centsToInput(3590)).toBe('35,90')
    expect(parseBRLToCents(centsToInput(123450))).toBe(123450)
  })
})
