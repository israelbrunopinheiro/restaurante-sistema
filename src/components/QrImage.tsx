import { useEffect, useState } from 'react'

/** QR code como imagem. A biblioteca só é carregada quando algum QR aparece (não pesa na página inicial). */
export default function QrImage({ text, label, size = 224 }: { text: string; label: string; size?: number }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let cancelled = false
    import('qrcode')
      .then((m) => m.default.toDataURL(text, { margin: 1, width: size * 2, errorCorrectionLevel: 'M' }))
      .then((u) => !cancelled && setSrc(u))
      .catch(() => !cancelled && setSrc(''))
    return () => {
      cancelled = true
    }
  }, [text, size])
  return src ? (
    <img src={src} alt={`QR code: ${label}`} width={size} height={size} className="mx-auto" style={{ width: size, height: size }} />
  ) : (
    <div className="mx-auto animate-pulse rounded bg-stone-100" style={{ width: size, height: size }} aria-hidden />
  )
}
