import { useEffect, useState } from 'react'

/** Relógio que se atualiza sozinho (para "há 5 min" e alertas de atraso). */
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
