import { supabase } from './supabase'
import type { CartLine } from './cart'
import { toRpcItems } from './cart'
import type { CashSummary, PaymentRow } from './cash'
import { toRpcPayments } from './cash'
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

// ───────── Caixa ─────────

export async function openCashSession(openingCents: number) {
  const { data, error } = await supabase.rpc('open_cash_session', { p_opening_cents: openingCents })
  if (error) throw error
  return data
}

/** Turno aberto + totais calculados pelo banco, ou null se o caixa estiver fechado. */
export async function getCashSummary(): Promise<CashSummary | null> {
  const { data, error } = await supabase.rpc('cash_session_summary', {})
  if (error) throw error
  return (data as CashSummary | null) ?? null
}

export async function addCashMovement(kind: 'supply' | 'withdrawal', amountCents: number, reason: string) {
  const { data, error } = await supabase.rpc('add_cash_movement', {
    p_kind: kind,
    p_amount_cents: amountCents,
    p_reason: reason,
  })
  if (error) throw error
  return data
}

export async function payOrders(orderIds: string[], rows: PaymentRow[]) {
  const { data, error } = await supabase.rpc('pay_orders', {
    p_order_ids: orderIds,
    p_payments: toRpcPayments(rows),
  })
  if (error) throw error
  return data as { orders: number; total_cents: number }
}

export async function refundOrder(orderId: string, reason: string) {
  const { data, error } = await supabase.rpc('refund_order', { p_order_id: orderId, p_reason: reason })
  if (error) throw error
  return data
}

export async function closeCashSession(countedCents: number, notes?: string) {
  const { data, error } = await supabase.rpc('close_cash_session', {
    p_counted_cents: countedCents,
    p_notes: notes?.trim() || undefined,
  })
  if (error) throw error
  return data
}
