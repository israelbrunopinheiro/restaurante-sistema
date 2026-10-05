import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Janela sobre a tela. Fecha com Esc ou clicando fora.
 *
 * O foco é posto no primeiro campo UMA vez, ao abrir (e volta para onde estava ao fechar). Antes isso rodava de novo a
 * cada atualização da tela, e quem digitava via o foco pular para o "X" de fechar a cada letra.
 */
export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  // A função de fechar costuma ser criada de novo a cada atualização do pai; guardamos a mais recente
  // sem reconfigurar a janela.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const root = ref.current
    const first =
      root?.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea') ??
      root?.querySelector<HTMLElement>('button:not([aria-label="Fechar"])') ??
      root?.querySelector<HTMLElement>('button')
    first?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus?.()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCloseRef.current()
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => onCloseRef.current()}
            className="-mr-2 -mt-1 h-10 w-10 shrink-0 rounded-lg text-xl text-stone-500 hover:bg-stone-100"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
