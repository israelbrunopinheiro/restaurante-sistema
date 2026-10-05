import { describe, expect, it } from 'vitest'
import { axisTicks, hourRange, labelEvery, niceMax } from './charts'

describe('niceMax', () => {
  it.each([
    [0, 1],
    [-5, 1],
    [1, 1],
    [1.2, 2],
    [2.3, 4],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],
    [87, 100],
    [11300, 20000],
    [50468, 60000],
    [26000, 40000],
    [0.4, 0.4],
  ])('%s → %s', (v, expected) => {
    expect(niceMax(v)).toBeCloseTo(expected)
  })
  it('nunca fica abaixo do valor', () => {
    for (const v of [1, 3.7, 99, 101, 4999, 5001, 123456]) expect(niceMax(v)).toBeGreaterThanOrEqual(v)
  })
})

describe('eixo e horas', () => {
  it('marcas: 0, metade, topo', () => {
    expect(axisTicks(20000)).toEqual([0, 10000, 20000])
  })
  it('a metade do topo é sempre um número limpo (no máximo uma casa decimal)', () => {
    for (const v of [1, 3, 7, 12, 45, 99, 130, 480, 5047, 61234, 1234567]) {
      const half = niceMax(v) / 2
      expect(Math.abs(half * 10 - Math.round(half * 10))).toBeLessThan(1e-9)
    }
  })
  it('faixa de horas com respiro e mínimo de 6 horas', () => {
    expect(hourRange([])).toEqual({ from: 10, to: 15 })
    expect(hourRange([12, 13])).toEqual({ from: 10, to: 15 })
    const r = hourRange([12, 13])
    expect(r.to - r.from).toBeGreaterThanOrEqual(5)
    expect(r.from).toBeLessThanOrEqual(11)
    expect(r.to).toBeGreaterThanOrEqual(14)
    expect(hourRange([11, 22])).toEqual({ from: 10, to: 23 })
    const edge = hourRange([0, 1])
    expect(edge.from).toBe(0)
    expect(edge.to - edge.from).toBeGreaterThanOrEqual(5)
  })
  it('rótulos do eixo X espaçados', () => {
    expect(labelEvery(7)).toBe(1)
    expect(labelEvery(31)).toBe(4)
    expect(labelEvery(24, 8)).toBe(3)
  })
})
