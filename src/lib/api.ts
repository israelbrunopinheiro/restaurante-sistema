import { supabase } from './supabase'
import type { CartLine } from './cart'
import { toRpcItems } from './cart'
import type { CashSummary, PaymentRow } from './cash'
import { toRpcPayments } from './cash'
import type { EntryKind, FinanceSummary, SalesReport } from './finance'
import type { OrderChannel, OrderStatus } from './orders'
import type { PublicMenu, PublicOrderStatus } from './publicOrder'

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

// ───────── Financeiro (só o dono) ─────────

export async function getFinanceSummary(from: string, to: string): Promise<FinanceSummary> {
  const { data, error } = await supabase.rpc('finance_summary', { p_from: from, p_to: to })
  if (error) throw error
  return data as unknown as FinanceSummary
}

export async function getSalesReport(from: string, to: string): Promise<SalesReport> {
  const { data, error } = await supabase.rpc('sales_report', { p_from: from, p_to: to })
  if (error) throw error
  return data as unknown as SalesReport
}

export type NewEntryInput = {
  kind: EntryKind
  categoryId: string
  description: string
  party?: string
  amountCents: number
  dueDate: string
  notes?: string
  repeatMonths?: number
}

/** Cria o lançamento (ou vários, se repetir todo mês). Devolve quantos foram criados. */
export async function createFinanceEntry(i: NewEntryInput) {
  const { data, error } = await supabase.rpc('create_finance_entry', {
    p_kind: i.kind,
    p_category_id: i.categoryId,
    p_description: i.description,
    p_party: i.party?.trim() || undefined,
    p_amount_cents: i.amountCents,
    p_due_date: i.dueDate,
    p_notes: i.notes?.trim() || undefined,
    p_repeat_months: i.repeatMonths ?? 1,
  })
  if (error) throw error
  return data
}

export async function payFinanceEntry(
  entryId: string,
  method: string,
  opts: { amountCents?: number; paidDate?: string; fromDrawer?: boolean } = {},
) {
  const { data, error } = await supabase.rpc('pay_finance_entry', {
    p_entry_id: entryId,
    p_method: method,
    p_amount_cents: opts.amountCents,
    p_paid_date: opts.paidDate,
    p_from_drawer: opts.fromDrawer ?? false,
  })
  if (error) throw error
  return data
}

export async function reopenFinanceEntry(entryId: string) {
  const { data, error } = await supabase.rpc('reopen_finance_entry', { p_entry_id: entryId })
  if (error) throw error
  return data
}

// ───────── Cardápio online (público, sem login) ─────────

export async function getPublicMenu(tableToken?: string | null): Promise<PublicMenu> {
  const { data, error } = await supabase.rpc('public_menu', { p_table_token: tableToken || undefined })
  if (error) throw error
  return data as unknown as PublicMenu
}

export type PublicOrderInput = {
  channel: 'table' | 'pickup' | 'delivery'
  lines: CartLine[]
  name: string
  phone: string
  address?: string
  notes?: string
  tableToken?: string | null
}

export async function placePublicOrder(i: PublicOrderInput) {
  const { data, error } = await supabase.rpc('place_public_order', {
    p_channel: i.channel,
    p_items: toRpcItems(i.lines),
    p_customer_name: i.name,
    p_customer_phone: i.phone,
    p_delivery_address: i.address?.trim() || undefined,
    p_notes: i.notes?.trim() || undefined,
    p_table_token: i.tableToken || undefined,
  })
  if (error) throw error
  return data as unknown as { id: string; order_number: number; total_cents: number }
}

export async function getPublicOrderStatus(id: string): Promise<PublicOrderStatus | null> {
  const { data, error } = await supabase.rpc('public_order_status', { p_order_id: id })
  if (error) throw error
  return (data as unknown as PublicOrderStatus | null) ?? null
}
