import { useCallback, useRef, useState } from 'react'

/**
 * Aviso sonoro para pedido novo. Navegadores só liberam áudio depois de um toque do usuário,
 * por isso o som precisa ser ativado por um botão.
 */
export function useBeep() {
  const ctxRef = useRef<AudioContext | null>(null)
  const [enabled, setEnabled] = useState(false)

  const play = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    const tone = (freq: number, start: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.25)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + 0.3)
    }
    tone(880, 0)
    tone(1175, 0.18)
  }, [])

  const toggle = useCallback(() => {
    if (enabled) {
      setEnabled(false)
      return
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctxRef.current ??= new Ctor()
    void ctxRef.current.resume()
    setEnabled(true)
    play() // toca uma vez para confirmar
  }, [enabled, play])

  const playIfEnabled = useCallback(() => {
    if (enabled) play()
  }, [enabled, play])

  return { enabled, toggle, playIfEnabled }
}
