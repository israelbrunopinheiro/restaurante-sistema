/** Versão do app (para saber qual versão está no ar quando algo se comporta diferente do esperado). */
export default function VersionTag() {
  return (
    <div className="py-3 text-center text-[11px] text-stone-400 print:hidden" data-testid="versao">
      versão {__APP_VERSION__}
    </div>
  )
}
