/** Matemática dos gráficos (sem DOM): escalas "redondas" e faixas de horário. */

/**
 * Arredonda o máximo para cima até um número limpo (1, 2, 4, 6, 8, 10 × 10^n). Esses degraus foram escolhidos
 * porque a metade deles (a marca do meio do eixo) também é um número limpo, e porque sobra pouco espaço vazio.
 */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1
  const exp = Math.floor(Math.log10(max))
  const base = 10 ** exp
  const m = max / base
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 4 ? 4 : m <= 6 ? 6 : m <= 8 ? 8 : 10
  return step * base
}

/** Marcas do eixo Y: 0, metade e topo (3 marcas bastam; o resto vai na dica e na tabela). */
export function axisTicks(niceTop: number): number[] {
  return [0, niceTop / 2, niceTop]
}

/** Faixa de horas a mostrar: da primeira à última hora com pedido, com um respiro e no mínimo 6 horas. */
export function hourRange(hours: number[]): { from: number; to: number } {
  if (hours.length === 0) return { from: 10, to: 15 }
  let from = Math.max(0, Math.min(...hours) - 1)
  let to = Math.min(23, Math.max(...hours) + 1)
  while (to - from < 5) {
    if (from > 0) from--
    if (to - from < 5 && to < 23) to++
    if (from === 0 && to === 23) break
  }
  return { from, to }
}

/** Mostra só alguns rótulos no eixo X quando há muitas colunas. */
export function labelEvery(count: number, maxLabels = 8): number {
  return Math.max(1, Math.ceil(count / maxLabels))
}
