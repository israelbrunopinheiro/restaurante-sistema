import type { Enums, Tables } from './database.types'

export type OrderChannel = Enums<'order_channel'>
export type OrderStatus = Enums<'order_status'>
export type AppRole = Enums<'app_role'>

export type OrderItem = Tables<'order_items'>
export type OrderWithItems = Tables<'orders'> & {
  order_items: OrderItem[]
  dining_tables: { label: string } | null
}

export const OPEN_STATUSES: OrderStatus[] = ['new', 'preparing', 'ready']

export const channelLabel: Record<OrderChannel, string> = {
  table: 'Mesa',
  pickup: 'Retirada',
  delivery: 'Delivery',
  whatsapp: 'WhatsApp',
}

export const channelIcon: Record<OrderChannel, string> = {
  table: '🍽️',
  pickup: '🛍️',
  delivery: '🛵',
  whatsapp: '💬',
}

export const statusLabel: Record<OrderStatus, string> = {
  new: 'Novo',
  preparing: 'Preparando',
  ready: 'Pronto',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
}

export const statusStyle: Record<OrderStatus, string> = {
  new: 'bg-sky-100 text-sky-800',
  preparing: 'bg-amber-100 text-amber-900',
  ready: 'bg-emerald-100 text-emerald-800',
  delivered: 'bg-stone-200 text-stone-700',
  cancelled: 'bg-red-100 text-red-800',
}

export const roleLabel: Record<AppRole, string> = {
  owner: 'Dono',
  attendant: 'Atendente',
  kitchen: 'Cozinha',
}

/** "Mesa 3", "Retirada · Maria", "Delivery · João", "WhatsApp · (92) 99999-0000" */
export function orderTitle(o: OrderWithItems): string {
  switch (o.channel) {
    case 'table':
      return o.dining_tables?.label ?? 'Mesa'
    case 'pickup':
      return `Retirada${o.customer_name ? ` · ${o.customer_name}` : ''}`
    case 'delivery':
      return `Delivery${o.customer_name ? ` · ${o.customer_name}` : ''}`
    case 'whatsapp':
      return `WhatsApp${o.customer_name ? ` · ${o.customer_name}` : o.customer_phone ? ` · ${o.customer_phone}` : ''}`
  }
}

/** Data de hoje no fuso do restaurante (AAAA-MM-DD), igual ao business_date do banco. */
export function todayInManaus(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Manaus' }).format(now)
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Manaus',
  }).format(new Date(iso))
}

/** "agora", "5 min", "1h 20min" */
export function elapsedLabel(iso: string, now: number = Date.now()): string {
  const min = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}min`
}

export function elapsedMinutes(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))
}
