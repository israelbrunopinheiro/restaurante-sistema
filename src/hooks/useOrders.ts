import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { OPEN_STATUSES, todayInManaus, type OrderWithItems } from '../lib/orders'
import { errorMessage } from '../components/ui'

/**
 * Pedidos em tempo real.
 *  - 'open':  só os em andamento (novo / preparando / pronto) — usado pela cozinha.
 *  - 'today': os de hoje + qualquer um ainda em andamento — usado na lista de pedidos.
 *
 * Qualquer mudança em orders/order_items dispara uma recarga (com debounce); além disso há
 * recarga ao voltar para a aba, ao reconectar a internet e a cada 30 s, como rede de segurança.
 */
export function useOrders(scope: 'open' | 'today') {
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const id = ++requestId.current
    let query = supabase
      .from('orders')
      .select('*, order_items(*), dining_tables(label)')
      .order('created_at', { ascending: true })
    query =
      scope === 'open'
        ? query.in('status', OPEN_STATUSES)
        : query.or(`business_date.eq.${todayInManaus()},status.in.(${OPEN_STATUSES.join(',')})`)
    const { data, error } = await query
    if (id !== requestId.current) return // chegou uma resposta mais nova
    if (error) {
      setError(errorMessage(error))
    } else {
      setError(null)
      setOrders(data as OrderWithItems[])
    }
    setLoading(false)
  }, [scope])

  useEffect(() => {
    void load()

    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void load(), 250)
    }

    const channel = supabase
      .channel(`orders-${scope}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, schedule)
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED')
        if (status === 'SUBSCRIBED') void load() // pega o que mudou enquanto reconectava
      })

    const refresh = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('online', refresh)
    const poll = setInterval(refresh, 30000)

    return () => {
      clearTimeout(timer)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('online', refresh)
      void supabase.removeChannel(channel)
    }
  }, [scope, load])

  return { orders, loading, error, live, reload: load }
}
