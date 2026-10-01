import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!url || !key) {
  throw new Error(
    'Faltam VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY. Copie .env.example para .env.local e preencha.',
  )
}

export const supabase = createClient<Database>(url, key)
