import { describe, expect, it } from 'vitest'
import { elapsedLabel, elapsedMinutes, todayInManaus } from './orders'

describe('todayInManaus', () => {
  it('usa o fuso de Manaus (UTC-4), não o UTC', () => {
    // 01:30 UTC de 2 de outubro ainda é 21:30 de 1º de outubro em Manaus
    expect(todayInManaus(new Date('2026-10-02T01:30:00Z'))).toBe('2026-10-01')
    expect(todayInManaus(new Date('2026-10-02T04:00:00Z'))).toBe('2026-10-02')
  })
})

describe('elapsed', () => {
  const now = new Date('2026-10-01T12:00:00Z').getTime()
  it('formata o tempo decorrido', () => {
    expect(elapsedLabel('2026-10-01T11:59:40Z', now)).toBe('agora')
    expect(elapsedLabel('2026-10-01T11:55:00Z', now)).toBe('5 min')
    expect(elapsedLabel('2026-10-01T10:40:00Z', now)).toBe('1h 20min')
    expect(elapsedMinutes('2026-10-01T12:30:00Z', now)).toBe(0)
  })
})
