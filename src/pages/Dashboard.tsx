import { useEffect, useMemo, useState } from 'react'
import { ChartCard, BarList, ColumnChart, SERIES_1, StatTile } from '../components/charts'
import { ErrorBox, Spinner, errorMessage } from '../components/ui'
import { getSalesReport } from '../lib/api'
import { formatDate, formatDayMonth, periodRange, PERIOD_LABELS, type PeriodPreset, type SalesReport } from '../lib/finance'
import { hourRange } from '../lib/charts'
import { formatBRL, formatBRLShort } from '../lib/money'
import { channelIcon, channelLabel, todayInManaus } from '../lib/orders'

const PRESETS: PeriodPreset[] = ['today', 'yesterday', '7d', '30d', 'month', 'last_month']

export function PeriodPicker({ value, onChange }: { value: PeriodPreset; onChange: (p: PeriodPreset) => void }) {
  return (
    <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1" role="radiogroup" aria-label="Período">
      {PRESETS.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          onClick={() => onChange(p)}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
            value === p ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
          }`}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const today = todayInManaus()
  const [preset, setPreset] = useState<PeriodPreset>('today')
  const [report, setReport] = useState<SalesReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const range = useMemo(() => periodRange(preset, today), [preset, today])
  const multiDay = range.from !== range.to

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getSalesReport(range.from, range.to)
      .then((r) => {
        if (!cancelled) {
          setReport(r)
          setError(null)
        }
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [range.from, range.to])

  const hours = useMemo(() => {
    if (!report) return []
    const { from, to } = hourRange(report.by_hour.map((h) => h.hour))
    const byHour = new Map(report.by_hour.map((h) => [h.hour, h.count]))
    return Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => ({
      key: String(h),
      label: `${h}h`,
      values: [byHour.get(h) ?? 0],
    }))
  }, [report])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Painel de vendas</h1>
        <p className="text-sm text-stone-600">
          {multiDay ? `${formatDate(range.from)} a ${formatDate(range.to)}` : formatDate(range.from)} · pedidos não
          cancelados, pagos ou não.
        </p>
      </div>

      <PeriodPicker value={preset} onChange={setPreset} />
      {error && <ErrorBox>{error}</ErrorBox>}

      {!report ? (
        loading ? (
          <Spinner />
        ) : null
      ) : (
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-2">
              <StatTile
                hero
                label="Faturamento"
                value={formatBRL(report.revenue_cents)}
                hint={`${report.orders} ${report.orders === 1 ? 'pedido' : 'pedidos'}`}
              />
            </div>
            <StatTile label="Ticket médio" value={formatBRL(report.average_ticket_cents)} hint="por pedido" />
            <StatTile
              label="Ainda a receber"
              value={formatBRL(report.unpaid_cents)}
              hint="pedidos deste período não pagos"
            />
          </div>
          {report.cancelled > 0 && (
            <p className="text-sm text-stone-600">
              {report.cancelled} {report.cancelled === 1 ? 'pedido cancelado' : 'pedidos cancelados'} (
              {formatBRL(report.cancelled_cents)}), fora dos números acima.
            </p>
          )}

          {report.orders === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-stone-500">
              Nenhum pedido neste período.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {multiDay && (
                <div className="lg:col-span-2">
                  <ChartCard
                    title="Faturamento por dia"
                    subtitle="Pedidos não cancelados"
                    table={{
                      head: ['Dia', 'Pedidos', 'Faturamento'],
                      rows: report.days.map((d) => [formatDate(d.date), String(d.count), formatBRL(d.cents)]),
                    }}
                    busy={loading}
                  >
                    <ColumnChart
                      data={report.days.map((d) => ({ key: d.date, label: formatDayMonth(d.date), values: [d.cents] }))}
                      series={[{ name: 'Faturamento', color: SERIES_1 }]}
                      format={formatBRL}
                      formatAxis={formatBRLShort}
                      unitLabel="Faturamento por dia"
                    />
                  </ChartCard>
                </div>
              )}

              <ChartCard
                title="Mais vendidos"
                subtitle="Por quantidade de unidades (10 primeiros)"
                table={{
                  head: ['Produto', 'Unidades', 'Valor'],
                  rows: report.top_products.map((p) => [p.name, String(p.quantity), formatBRL(p.cents)]),
                }}
                busy={loading}
              >
                <BarList
                  data={report.top_products.map((p) => ({
                    key: p.name,
                    label: p.name,
                    value: p.quantity,
                    valueLabel: `${p.quantity} un.`,
                    hint: formatBRL(p.cents),
                  }))}
                />
              </ChartCard>

              <div className="space-y-4">
                <ChartCard
                  title="Pedidos por horário"
                  subtitle="Quando a casa enche"
                  table={{
                    head: ['Horário', 'Pedidos'],
                    rows: hours.map((h) => [h.label, String(h.values[0])]),
                  }}
                  busy={loading}
                >
                  <ColumnChart
                    data={hours}
                    series={[{ name: 'Pedidos', color: SERIES_1 }]}
                    format={(v) => String(v)}
                    formatAxis={(v) => (Number.isInteger(v) ? String(v) : '')}
                    unitLabel="Pedidos por horário"
                  />
                </ChartCard>

                <ChartCard
                  title="Canais"
                  subtitle="Faturamento por tipo de pedido"
                  table={{
                    head: ['Canal', 'Pedidos', 'Faturamento'],
                    rows: report.by_channel.map((c) => [channelLabel[c.channel], String(c.count), formatBRL(c.cents)]),
                  }}
                  busy={loading}
                >
                  <BarList
                    data={report.by_channel.map((c) => ({
                      key: c.channel,
                      label: `${channelIcon[c.channel]} ${channelLabel[c.channel]}`,
                      value: c.cents,
                      valueLabel: formatBRL(c.cents),
                      hint: `${c.count} ${c.count === 1 ? 'pedido' : 'pedidos'}`,
                    }))}
                  />
                </ChartCard>
              </div>
            </div>
          )}
          <p className="text-xs text-stone-500">
            Faturamento = valor dos pedidos feitos no período. O dinheiro que de fato entrou (caixa, Pix, cartões) e as
            despesas ficam em <strong>Financeiro</strong>.
          </p>
        </div>
      )}
    </div>
  )
}
