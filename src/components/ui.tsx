import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-stone-300',
  secondary: 'bg-white text-stone-800 border border-stone-300 hover:bg-stone-100 disabled:text-stone-400',
  danger: 'bg-white text-red-700 border border-red-300 hover:bg-red-50 disabled:text-red-300',
  ghost: 'text-stone-700 hover:bg-stone-200/70 disabled:text-stone-400',
}

const sizes: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-base',
  lg: 'min-h-14 px-6 text-lg',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  )
}

export const inputClass =
  'block w-full min-h-11 rounded-xl border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 placeholder:text-stone-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/25 disabled:bg-stone-100'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  )
}

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-2xl border border-stone-200 bg-white p-4 shadow-sm ${className}`} {...props} />
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-stone-900">{children}</h2>
      {aside}
    </div>
  )
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 p-8 text-stone-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-brand-600" />
      {label}
    </div>
  )
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {children}
    </div>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      {children}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-stone-500">{children}</div>
}

export function Badge({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </span>
  )
}

/** Mensagem legível a partir de um erro do Supabase/Postgres. */
export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') return e.message
  return 'Algo deu errado. Tente novamente.'
}
