import { describe, expect, it } from 'vitest'
import { asciiUpper, crc16, normalizePixKey, pixPayload, pixPayloadIsValid } from './pix'

describe('CRC-16 do Pix', () => {
  it('valor de verificação padrão do CRC-16/CCITT-FALSE', () => {
    expect(crc16('123456789')).toBe(0x29b1)
  })
  it('exemplo do manual do Banco Central (chave aleatória, sem valor)', () => {
    // payload sem o CRC final; o manual publica o CRC 1D3D para este exemplo
    const semCrc = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304'
    expect(crc16(semCrc).toString(16).toUpperCase()).toBe('1D3D')
  })
})

describe('texto do Pix', () => {
  it('tira acento, passa para maiúsculo e limita', () => {
    expect(asciiUpper('Cordeiro\'s Refeições', 25)).toBe('CORDEIROS REFEICOES')
    expect(asciiUpper('São José dos Pinhais do Sul', 15)).toBe('SAO JOSE DOS PI')
    expect(asciiUpper('  Mesa   1  ', 25)).toBe('MESA 1')
  })
  it('arruma a chave como o banco espera', () => {
    expect(normalizePixKey(' Contato@Exemplo.COM ')).toBe('contato@exemplo.com')
    expect(normalizePixKey('123.456.789-09')).toBe('12345678909')
    expect(normalizePixKey('12.345.678/0001-95')).toBe('12345678000195')
    expect(normalizePixKey('(92) 99999-0000')).toBe('+5592999990000')
    expect(normalizePixKey('+5592999990000')).toBe('+5592999990000')
    expect(normalizePixKey('123e4567-e12b-12d1-a456-426655440000')).toBe('123e4567-e12b-12d1-a456-426655440000')
  })
})

describe('código "copia e cola"', () => {
  const base = { key: 'contato@exemplo.com', name: 'Cordeiro\'s Refeições', city: 'Manaus' }

  it('monta os campos certos e o CRC fecha', () => {
    const p = pixPayload({ ...base, amountCents: 8390, txid: 'PED12' })
    expect(p.startsWith('000201010212')).toBe(true)
    expect(p).toContain('0014br.gov.bcb.pix0119contato@exemplo.com')
    expect(p).toContain('5303986')
    expect(p).toContain('540583.90') // valor com ponto e 2 casas
    expect(p).toContain('5802BR')
    expect(p).toContain('5919CORDEIROS REFEICOES')
    expect(p).toContain('6006MANAUS')
    expect(p).toContain('62090505PED12') // campo 62 com o código do pedido
    expect(pixPayloadIsValid(p)).toBe(true)
  })

  it('sem valor, o campo 54 não existe (cliente digita no app)', () => {
    const p = pixPayload(base)
    expect(p).not.toMatch(/54\d\d\d/)
    expect(p).toContain('0503***')
    expect(pixPayloadIsValid(p)).toBe(true)
  })

  it('valor muda o código e quebra o CRC se alguém mexer no texto', () => {
    const a = pixPayload({ ...base, amountCents: 1000 })
    const b = pixPayload({ ...base, amountCents: 1001 })
    expect(a).not.toBe(b)
    expect(pixPayloadIsValid(a)).toBe(true)
    expect(pixPayloadIsValid(a.replace('10.00', '99.99'))).toBe(false)
    expect(pixPayloadIsValid('lixo')).toBe(false)
  })

  it('txid inválido vira ***, e valores quebrados não geram erro de arredondamento', () => {
    expect(pixPayload({ ...base, txid: '!!!' })).toContain('0503***')
    expect(pixPayload({ ...base, amountCents: 1999 })).toContain('540519.99')
    expect(pixPayload({ ...base, amountCents: 5 })).toContain('54040.05')
  })
})
