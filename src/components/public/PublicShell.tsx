import type { ReactNode } from 'react'
import VersionTag from '../VersionTag'

/** Moldura da área pública: só o nome do restaurante, sem menu da equipe. */
export default function PublicShell({ name, children }: { name?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-stone-50">
      <header className="border-b border-brand-800 bg-brand-700 text-white shadow">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-lg font-bold" aria-hidden>
            {(name ?? 'C').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-lg font-bold leading-tight">{name ?? 'Cardápio'}</div>
            <div className="text-xs text-brand-100">Peça pelo celular</div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-4">{children}</main>
      <VersionTag />
    </div>
  )
}
