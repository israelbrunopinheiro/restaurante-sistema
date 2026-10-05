import { useId, useState, type ReactNode } from 'react'
import { axisTicks, labelEvery, niceMax } from '../lib/charts'

/*
 * Gráficos simples em HTML (sem biblioteca). Regras: marcas finas (colunas até 24 px, ponta de 4 px arredondada,
 * base reta), 2 px de respiro entre barras, grade discreta, rótulo só no ponto de maior valor, dica ao passar o
 * mouse ou focar com o teclado, legenda quando há 2+ séries e visão em tabela (nada depende só de cor ou de dica).
 * Cores: --viz-series-1 / --viz-series-2 (index.css). Texto nunca usa a cor da série.
 */

export type Series = { name: string; color: string }
export type ColumnDatum = { key: string; label: string; values: number[] }

export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  busy = false,
}: {
  title: string
  subtitle?: string
  legend?: Series[]
  table?: { head: string[]; rows: string[][] }
  children: ReactNode
  busy?: boolean
}) {
  const [showTable, setShowTable] = useState(false)
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className={`rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition-opacity ${busy ? 'opacity-60' : ''}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={id} className="font-bold text-stone-900">
            {title}
          </h3>
          {subtitle && <p className="text-xs text-stone-500">{subtitle}</p>}
        </div>
        {table && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100"
            aria-pressed={showTable}
          >
            {showTable ? 'Ver gráfico' : 'Ver tabela'}
          </button>
        )}
      </div>
      {legend && legend.length >= 2 && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
          {legend.map((s) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: s.color }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      {showTable && table ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white text-xs text-stone-500">
              <tr>
                {table.head.map((h, i) => (
                  <th key={h} className={`py-1 pr-3 font-medium ${i > 0 ? 'text-right' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {table.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, i) => (
                    <td key={i} className={`py-1 pr-3 tabular-nums ${i > 0 ? 'text-right' : ''}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  )
}

/** Colunas (1 ou 2 séries lado a lado). */
export function ColumnChart({
  data,
  series,
  format,
  formatAxis = format,
  unitLabel,
  height = 176,
}: {
  data: ColumnDatum[]
  series: Series[]
  /** valor exato (dica, rótulo do ponto máximo e leitor de tela) */
  format: (v: number) => string
  /** versão curta para os números do eixo Y */
  formatAxis?: (v: number) => string
  unitLabel?: string
  height?: number
}) {
  const [active, setActive] = useState<number | null>(null)
  const all = data.flatMap((d) => d.values)
  const top = niceMax(Math.max(0, ...all))
  const ticks = axisTicks(top)
  const every = labelEvery(data.length)
  const maxVal = Math.max(0, ...all)
  const maxIdx = maxVal > 0 ? data.findIndex((d) => d.values.includes(maxVal)) : -1
  const maxSeries = maxIdx >= 0 ? data[maxIdx].values.indexOf(maxVal) : -1

  const tipShift = active === null ? '-50%' : active < 2 ? '0%' : active > data.length - 3 ? '-100%' : '-50%'

  return (
    <div className="flex gap-2">
      <div
        className="relative w-16 shrink-0 whitespace-nowrap text-right text-[11px] text-stone-500 tabular-nums"
        style={{ height, marginTop: 20 }}
        aria-hidden
      >
        {ticks.map((t) => (
          <span key={t} className="absolute right-0" style={{ bottom: `${(t / top) * 100}%`, transform: 'translateY(50%)' }}>
            {formatAxis(t)}
          </span>
        ))}
      </div>
      <div className="relative min-w-0 flex-1" style={{ paddingTop: 20 }}>
        <div className="relative" style={{ height }} role="group" aria-label={unitLabel}>
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden
              className="absolute inset-x-0 border-t"
              style={{ bottom: `${(t / top) * 100}%`, borderColor: 'var(--viz-grid)' }}
            />
          ))}
          <div className="absolute inset-0 flex">
            {data.map((d, i) => (
              <button
                key={d.key}
                type="button"
                className="group relative flex min-w-0 flex-1 items-end justify-center gap-[2px] rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
                aria-label={`${d.label}: ${d.values.map((v, si) => `${series[si].name} ${format(v)}`).join(', ')}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive((a) => (a === i ? null : a))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((a) => (a === i ? null : a))}
              >
                {active === i && <span aria-hidden className="absolute inset-0 bg-stone-900/[0.04]" />}
                {d.values.map((v, si) => (
                  <span key={si} className="relative flex h-full max-w-6 flex-1 items-end">
                    {v > 0 && (
                      <span
                        className="block w-full rounded-t-[4px]"
                        style={{
                          height: `max(2px, ${(v / top) * 100}%)`,
                          background: series[si].color,
                          opacity: active === i ? 1 : 0.92,
                        }}
                      />
                    )}
                    {i === maxIdx && si === maxSeries && series.length === 1 && (
                      <span
                        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-stone-800"
                        style={{ bottom: `calc(${(v / top) * 100}% + 3px)` }}
                      >
                        {format(v)}
                      </span>
                    )}
                  </span>
                ))}
              </button>
            ))}
          </div>
          {active !== null && (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 min-w-32 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg"
              style={{ left: `${((active + 0.5) / data.length) * 100}%`, top: 0, transform: `translateX(${tipShift})` }}
            >
              <div className="mb-1 font-medium text-stone-500">{data[active].label}</div>
              {data[active].values.map((v, si) => (
                <div key={si} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-stone-600">
                    <span aria-hidden className="inline-block h-0.5 w-3" style={{ background: series[si].color }} />
                    {series[si].name}
                  </span>
                  <span className="font-bold text-stone-900 tabular-nums">{format(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-1 flex" aria-hidden>
          {data.map((d, i) => (
            <div key={d.key} className="min-w-0 flex-1 text-center text-[11px] text-stone-500 tabular-nums">
              {i % every === 0 ? d.label : ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export type BarDatum = { key: string; label: string; value: number; valueLabel: string; hint?: string }

/** Barras horizontais ordenadas (ranking): valor na ponta da barra. Uma série só, uma cor. */
export function BarList({ data, color = 'var(--viz-series-1)' }: { data: BarDatum[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-stone-800">{d.label}</span>
            {d.hint && <span className="shrink-0 text-xs text-stone-500">{d.hint}</span>}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div
                className="h-3 rounded-r-[4px]"
                style={{ width: `${Math.max(1.5, (d.value / max) * 100)}%`, background: color }}
                role="img"
                aria-label={`${d.label}: ${d.valueLabel}`}
              />
            </div>
            <span className="w-24 shrink-0 text-right text-sm font-bold text-stone-900 tabular-nums">{d.valueLabel}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Número de destaque (um por tela, ≥48 px) ou ficha de indicador. */
export function StatTile({
  label,
  value,
  hint,
  hero = false,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  hero?: boolean
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-stone-600">{label}</div>
      <div className={`whitespace-nowrap font-extrabold leading-tight text-stone-900 ${hero ? 'text-4xl sm:text-5xl' : 'text-2xl'}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-stone-500">{hint}</div>}
    </div>
  )
}

export const SERIES_1 = 'var(--viz-series-1)'
export const SERIES_2 = 'var(--viz-series-2)'
