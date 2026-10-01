const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** 3590 → "R$ 35,90" */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100)
}

/**
 * Converte o que o usuário digitou em centavos.
 * Aceita "35", "35,9", "35,90", "35.90", "1.234,50" e "R$ 35,90". Retorna null se inválido.
 */
export function parseBRLToCents(input: string): number | null {
  const s = input.replace(/R\$/gi, '').replace(/\s/g, '')
  if (!s) return null

  let intPart: string
  let decPart = ''
  if (s.includes(',')) {
    // vírgula é o separador decimal; pontos só valem como milhar ("1.234,50")
    const parts = s.split(',')
    if (parts.length !== 2) return null
    ;[intPart, decPart] = parts
  } else if ((s.match(/\./g) ?? []).length === 1 && !/^\d{1,3}\.\d{3}$/.test(s)) {
    // "35.90": ponto como decimal (formato de quem digita no teclado numérico)
    ;[intPart, decPart] = s.split('.')
  } else {
    intPart = s
  }

  if (intPart.includes('.')) {
    if (!/^\d{1,3}(\.\d{3})+$/.test(intPart)) return null
    intPart = intPart.replace(/\./g, '')
  }
  if (!/^\d+$/.test(intPart) || !/^\d{0,2}$/.test(decPart)) return null
  return Number(intPart) * 100 + Number(decPart.padEnd(2, '0'))
}

/** 3590 → "35,90" (para preencher campos de edição) */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}
