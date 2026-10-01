import { supabase } from './supabase'
import type { CartLine } from './cart'
import { toRpcItems } from './cart'
import type { OrderChannel, OrderStatus } from './orders'

export type NewOrderInput = {
  channel: OrderChannel
  lines: CartLine[]
  diningTableId?: string
  customerName?: string
  customerPhone?: string
  deliveryAddress?: string
  notes?: string
}

/** Cria o pedido no banco. Preços e totais são calculados no servidor. */
export async function createOrder(input: NewOrderInput) {
  const { data, error } = await supabase.rpc('create_order', {
    p_channel: input.channel,
    p_items: toRpcItems(input.lines),
    p_dining_table_id: input.diningTableId || undefined,
    p_customer_name: input.customerName?.trim() || undefined,
    p_customer_phone: input.customerPhone?.trim() || undefined,
    p_delivery_address: input.deliveryAddress?.trim() || undefined,
    p_notes: input.notes?.trim() || undefined,
  })
  if (error) throw error
  return data
}

export async function setOrderStatus(orderId: string, status: OrderStatus, reason?: string) {
  const { data, error } = await supabase.rpc('set_order_status', {
    p_order_id: orderId,
    p_status: status,
    p_reason: reason || undefined,
  })
  if (error) throw error
  return data
}
