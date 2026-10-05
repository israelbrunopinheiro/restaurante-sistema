// Tipos do banco, gerados do projeto Supabase (equivalente a `supabase gen types typescript`).
// Ao mudar o esquema (supabase/migrations), gere de novo e substitua este arquivo.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type OrderRow = {
  business_date: string
  cancel_reason: string | null
  channel: Database['public']['Enums']['order_channel']
  created_at: string
  created_by: string | null
  customer_name: string | null
  customer_phone: string | null
  delivery_address: string | null
  delivery_fee_cents: number
  dining_table_id: string | null
  id: string
  notes: string | null
  order_number: number
  paid_at: string | null
  status: Database['public']['Enums']['order_status']
  status_changed_at: string
  subtotal_cents: number
  total_cents: number
  updated_at: string
}

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.18' }
  public: {
    Tables: {
      cash_movements: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          entry_id: string | null
          id: string
          kind: Database['public']['Enums']['cash_movement_kind']
          reason: string
          session_id: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'cash_movements_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'cash_sessions'
            referencedColumns: ['id']
          },
        ]
      }
      cash_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closed_by_name: string | null
          counted_cents: number | null
          difference_cents: number | null
          expected_cash_cents: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          opened_by_name: string
          opening_cents: number
          totals: Json | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          id: string
          method: Database['public']['Enums']['payment_method']
          note: string | null
          order_id: string
          session_id: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'payments_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payments_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'cash_sessions'
            referencedColumns: ['id']
          },
        ]
      }
      categories: {
        Row: { active: boolean; created_at: string; id: string; name: string; position: number }
        Insert: { active?: boolean; created_at?: string; id?: string; name: string; position?: number }
        Update: { active?: boolean; created_at?: string; id?: string; name?: string; position?: number }
        Relationships: []
      }
      dining_tables: {
        Row: { active: boolean; created_at: string; id: string; label: string; seats: number | null }
        Insert: { active?: boolean; created_at?: string; id?: string; label: string; seats?: number | null }
        Update: { active?: boolean; created_at?: string; id?: string; label?: string; seats?: number | null }
        Relationships: []
      }
      finance_categories: {
        Row: { active: boolean; created_at: string; id: string; kind: Database['public']['Enums']['entry_kind']; name: string }
        Insert: { active?: boolean; created_at?: string; id?: string; kind: Database['public']['Enums']['entry_kind']; name: string }
        Update: { active?: boolean; created_at?: string; id?: string; kind?: Database['public']['Enums']['entry_kind']; name?: string }
        Relationships: []
      }
      finance_entries: {
        Row: {
          amount_cents: number
          category_id: string
          created_at: string
          created_by: string | null
          description: string
          due_date: string
          id: string
          installment: number | null
          installments: number | null
          kind: Database['public']['Enums']['entry_kind']
          notes: string | null
          paid_amount_cents: number | null
          paid_at: string | null
          paid_date: string | null
          paid_from_drawer: boolean
          paid_method: string | null
          party: string | null
          series_id: string | null
          updated_at: string
        }
        Insert: never
        Update: {
          amount_cents?: number
          category_id?: string
          description?: string
          due_date?: string
          notes?: string | null
          party?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'finance_entries_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'finance_categories'
            referencedColumns: ['id']
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          unit_price_cents: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'order_items_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
      orders: {
        Row: OrderRow
        Insert: Partial<OrderRow> & {
          channel: Database['public']['Enums']['order_channel']
          order_number: number
        }
        Update: Partial<OrderRow>
        Relationships: [
          {
            foreignKeyName: 'orders_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'orders_dining_table_id_fkey'
            columns: ['dining_table_id']
            isOneToOne: false
            referencedRelation: 'dining_tables'
            referencedColumns: ['id']
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          position: number
          price_cents: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          position?: number
          price_cents: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          position?: number
          price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'products_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          full_name: string
          id: string
          role: Database['public']['Enums']['app_role']
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name?: string
          id: string
          role?: Database['public']['Enums']['app_role']
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string
          id?: string
          role?: Database['public']['Enums']['app_role']
        }
        Relationships: []
      }
      settings: {
        Row: { delivery_fee_cents: number; id: boolean; restaurant_name: string; updated_at: string }
        Insert: { delivery_fee_cents?: number; id?: boolean; restaurant_name?: string; updated_at?: string }
        Update: { delivery_fee_cents?: number; id?: boolean; restaurant_name?: string; updated_at?: string }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      create_finance_entry: {
        Args: {
          p_amount_cents: number
          p_category_id: string
          p_description: string
          p_due_date: string
          p_kind: Database['public']['Enums']['entry_kind']
          p_notes?: string
          p_party?: string
          p_repeat_months?: number
        }
        Returns: number
      }
      finance_summary: { Args: { p_from: string; p_to: string }; Returns: Json }
      pay_finance_entry: {
        Args: {
          p_amount_cents?: number
          p_entry_id: string
          p_from_drawer?: boolean
          p_method: string
          p_paid_date?: string
        }
        Returns: Database['public']['Tables']['finance_entries']['Row']
      }
      reopen_finance_entry: {
        Args: { p_entry_id: string }
        Returns: Database['public']['Tables']['finance_entries']['Row']
      }
      sales_report: { Args: { p_from: string; p_to: string }; Returns: Json }
      add_cash_movement: {
        Args: {
          p_amount_cents: number
          p_kind: Database['public']['Enums']['cash_movement_kind']
          p_reason: string
        }
        Returns: Database['public']['Tables']['cash_movements']['Row']
      }
      cash_session_summary: { Args: { p_session_id?: string }; Returns: Json }
      close_cash_session: {
        Args: { p_counted_cents: number; p_notes?: string }
        Returns: Database['public']['Tables']['cash_sessions']['Row']
      }
      open_cash_session: {
        Args: { p_opening_cents: number }
        Returns: Database['public']['Tables']['cash_sessions']['Row']
      }
      pay_orders: { Args: { p_order_ids: string[]; p_payments: Json }; Returns: Json }
      refund_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: OrderRow
        SetofOptions: { from: '*'; to: 'orders'; isOneToOne: true; isSetofReturn: false }
      }
      create_order: {
        Args: {
          p_channel: Database['public']['Enums']['order_channel']
          p_customer_name?: string
          p_customer_phone?: string
          p_delivery_address?: string
          p_dining_table_id?: string
          p_items: Json
          p_notes?: string
        }
        Returns: OrderRow
        SetofOptions: { from: '*'; to: 'orders'; isOneToOne: true; isSetofReturn: false }
      }
      current_app_role: { Args: never; Returns: Database['public']['Enums']['app_role'] }
      is_owner: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      set_order_status: {
        Args: {
          p_order_id: string
          p_reason?: string
          p_status: Database['public']['Enums']['order_status']
        }
        Returns: OrderRow
        SetofOptions: { from: '*'; to: 'orders'; isOneToOne: true; isSetofReturn: false }
      }
    }
    Enums: {
      app_role: 'owner' | 'attendant' | 'kitchen'
      cash_movement_kind: 'supply' | 'withdrawal'
      entry_kind: 'payable' | 'receivable'
      payment_method: 'cash' | 'pix' | 'debit' | 'credit'
      order_channel: 'table' | 'pickup' | 'delivery' | 'whatsapp'
      order_status: 'new' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
    }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]
