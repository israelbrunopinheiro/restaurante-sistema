/**
 * Pix "copia e cola" / QR code estático (BR Code, padrão EMV do Banco Central).
 *
 * É um QR com a chave do restaurante e o valor: o cliente paga no app do banco. NÃO há confirmação automática do
 * pagamento (isso exigiria uma conta com API de Pix); o restaurante confere no extrato antes de dar baixa.
 */

/** CRC-16/CCITT-FALSE (polinômio 0x1021, valor inicial 0xFFFF), exigido no fim do código Pix. */
export function crc16(text: string): number {
  let crc = 0xffff
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc
}

/** Sem acento, maiúsculo, só letras/números/espaço, limitado (nome do recebedor ≤ 25, cidade ≤ 15). */
export function asciiUpper(text: string, max: number): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/**
 * Arruma a chave como o banco espera: e-mail em minúsculas; CPF/CNPJ só números; celular com +55.
 * (Um número de 11 dígitos sem formatação pode ser CPF ou celular: para celular, digite com +55.)
 */
export function normalizePixKey(input: string): string {
  const k = input.trim()
  if (k.includes('@')) return k.toLowerCase()
  if (/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(k) && /[.-]/.test(k)) return k.replace(/\D/g, '') // CPF formatado
  if (/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/.test(k) && /[./-]/.test(k)) return k.replace(/\D/g, '') // CNPJ formatado
  if (/^\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}$/.test(k) && /[()\s-]/.test(k)) return `+55${k.replace(/\D/g, '')}` // celular formatado
  return k
}

const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`

export type PixData = { key: string; name: string; city: string }

/** Código Pix "copia e cola". `amountCents` omitido = o cliente digita o valor no app. */
export function pixPayload(p: PixData & { amountCents?: number; txid?: string }): string {
  const txid = (p.txid ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'
  const body =
    field('00', '01') +
    field('01', '12') +
    field('26', field('00', 'br.gov.bcb.pix') + field('01', normalizePixKey(p.key))) +
    field('52', '0000') +
    field('53', '986') +
    (p.amountCents && p.amountCents > 0 ? field('54', (p.amountCents / 100).toFixed(2)) : '') +
    field('58', 'BR') +
    field('59', asciiUpper(p.name, 25) || 'RECEBEDOR') +
    field('60', asciiUpper(p.city, 15) || 'BRASIL') +
    field('62', field('05', txid)) +
    '6304'
  return body + crc16(body).toString(16).toUpperCase().padStart(4, '0')
}

/** Confere se um código Pix está íntegro (o CRC bate). */
export function pixPayloadIsValid(payload: string): boolean {
  if (payload.length < 8 || payload.slice(-8, -4) !== '6304') return false
  return crc16(payload.slice(0, -4)).toString(16).toUpperCase().padStart(4, '0') === payload.slice(-4)
}
