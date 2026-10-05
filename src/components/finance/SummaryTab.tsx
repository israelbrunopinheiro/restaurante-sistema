import { useEffect, useMemo, useState } from 'react'
import { BarList, ChartCard, ColumnChart, SERIES_1, SERIES_2, StatTile } from '../charts'
import { ErrorBox, Spinner, errorMessage } from '../ui'
import { PeriodPicker } from '../../pages/Dashboard'
import { getFinanceSummary } from '../../lib/api'
import { formatDate, formatDayMonth, periodRange, type FinanceSummary, type PeriodPreset } from '../../lib/finance'
import { formatBRL, formatBRLShort } from '../../lib/money'
import { todayInManaus } from '../../lib/orders'

export default function SummaryTab({ onGoTo }: { onGoTo: (tab: 'payable' | 'receivable') => void }) {
  const today = todayInManaus()
  const [preset, setPreset] = useState<PeriodPreset>('month')
  const [data, setData] = useState<FinanceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const range = useMemo(() => periodRange(preset, today), [preset, today])
  const multiDay = range.from !== range.to

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getFinanceSummary(range.from, range.to)
      .then((d) => {
        if (!cancelled) {
          setData(d)
          setError(null)
        }
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [range.from, range.to])

  const income = data ? data.sales.total_cents + data.other_income_cents : 0
  const result = data?.result_cents ?? 0

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        {multiDay ? `${formatDate(range.from)} a ${formatDate(range.to)}` : formatDate(range.from)} · conta o dinheiro na
        data em que entrou ou saiu.
      </p>
      <PeriodPicker value={preset} onChange={setPreset} />
      {error && <ErrorBox>{error}</ErrorBox>}

      {!data ? (
        loading ? <Spinner /> : null
      ) : (
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <StatTile
                hero
                label="Resultado do período"
                value={
                  <span data-testid="result">
                    {result < 0 ? '−' : ''}
                    {formatBRL(Math.abs(result))}
                  </span>
                }
                hint={
                  <span className="font-semibold">
                    {result > 0 ? '▲ Sobrou dinheiro' : result < 0 ? '▼ Saiu mais do que entrou' : '= Entrou e saiu o mesmo valor'}
                  </span>
                }
              />
            </div>
            <StatTile label="Entradas" value={<span data-testid="income">{formatBRL(income)}</span>} hint="vendas + outras receitas" />
            <StatTile label="Saídas" value={<span data-testid="expenses">{formatBRL(data.expenses_cents)}</span>} hint="contas pagas" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {multiDay && (
              <div className="lg:col-span-2">
                <ChartCard
                  title="Entradas e saídas por dia"
                  legend={[
                    { name: 'Entradas', color: SERIES_1 },
                    { name: 'Saídas', color: SERIES_2 },
                  ]}
                  table={{
                    head: ['Dia', 'Entradas', 'Saídas'],
                    rows: data.days.map((d) => [formatDate(d.date), formatBRL(d.income_cents), formatBRL(d.expense_cents)]),
                  }}
                  busy={loading}
                >
                  <ColumnChart
                    data={data.days.map((d) => ({
                      key: d.date,
                      label: formatDayMonth(d.date),
                      values: [d.income_cents, d.expense_cents],
                    }))}
                    series={[
                      { name: 'Entradas', color: SERIES_1 },
                      { name: 'Saídas', color: SERIES_2 },
                    ]}
                    format={formatBRL}
                    formatAxis={formatBRLShort}
                    unitLabel="Entradas e saídas por dia"
                  />
                </ChartCard>
              </div>
            )}

            <ChartCard
              title="Entradas"
              subtitle="Vendas por forma de pagamento e outras receitas"
              table={{
                head: ['Origem', 'Valor'],
                rows: [
                  ['Vendas em dinheiro', formatBRL(data.sales.cash_cents)],
                  ['Vendas no Pix', formatBRL(data.sales.pix_cents)],
                  ['Vendas no débito', formatBRL(data.sales.debit_cents)],
                  ['Vendas no crédito', formatBRL(data.sales.credit_cents)],
                  ['Outras receitas', formatBRL(data.other_income_cents)],
                ],
              }}
              busy={loading}
            >
              {income === 0 ? (
                <p className="py-6 text-center text-sm text-stone-500">Nenhuma entrada neste período.</p>
              ) : (
                <BarList
                  data={[
                    { key: 'cash', label: '💵 Vendas em dinheiro', value: data.sales.cash_cents },
                    { key: 'pix', label: '⚡ Vendas no Pix', value: data.sales.pix_cents },
                    { key: 'debit', label: '💳 Vendas no débito', value: data.sales.debit_cents },
                    { key: 'credit', label: '💳 Vendas no crédito', value: data.sales.credit_cents },
                    { key: 'other', label: 'Outras receitas', value: data.other_income_cents },
                  ]
                    .filter((d) => d.value > 0)
                    .map((d) => ({ ...d, valueLabel: formatBRL(d.value) }))}
                />
              )}
            </ChartCard>

            <ChartCard
              title="Saídas por categoria"
              subtitle="Contas pagas no período"
              table={{
                head: ['Categoria', 'Valor'],
                rows: data.expenses_by_category.map((c) => [c.category, formatBRL(c.cents)]),
              }}
              busy={loading}
            >
              {data.expenses_by_category.length === 0 ? (
                <p className="py-6 text-center text-sm text-stone-500">Nenhuma conta paga neste período.</p>
              ) : (
                <BarList
                  color={SERIES_2}
                  data={data.expenses_by_category.map((c) => ({
                    key: c.category,
                    label: c.category,
                    value: c.cents,
                    valueLabel: formatBRL(c.cents),
                  }))}
                />
              )}
            </ChartCard>
          </div>

          <section aria-label="Contas em aberto">
            <h2 className="mb-2 text-lg font-bold">Contas em aberto (hoje)</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <button type="button" className="text-left" onClick={() => onGoTo('payable')}>
                <StatTile
                  label="A pagar"
                  value={<span data-testid="payables-open">{formatBRL(data.pending.payables_open_cents)}</span>}
                  hint="ver contas a pagar →"
                />
              </button>
              <button type="button" className="text-left" onClick={() => onGoTo('payable')}>
                <StatTile
                  label="⚠ Vencidas"
                  value={<span data-testid="payables-overdue">{formatBRL(data.pending.payables_overdue_cents)}</span>}
                  hint="a pagar, já passou do prazo"
                />
              </button>
              <button type="button" className="text-left" onClick={() => onGoTo('payable')}>
                <StatTile
                  label="Vencem em 7 dias"
                  value={formatBRL(data.pending.payables_next7_cents)}
                  hint="a pagar, hoje e próximos dias"
                />
              </button>
              <button type="button" className="text-left" onClick={() => onGoTo('receivable')}>
                <StatTile
                  label="A receber"
                  value={formatBRL(data.pending.receivables_open_cents)}
                  hint={
                    data.pending.receivables_overdue_cents > 0
                      ? `⚠ ${formatBRL(data.pending.receivables_overdue_cents)} vencido`
                      : 'ver contas a receber →'
                  }
                />
              </button>
            </div>
          </section>

          {data.loose_withdrawals_cents > 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {formatBRL(data.loose_withdrawals_cents)} foram retirados do caixa (sangrias) <strong>sem lançamento de
              despesa</strong>. Esse valor não está em "Saídas". Para entrar no resultado, lance a conta em Contas a pagar e
              marque "saiu do dinheiro da gaveta".
            </p>
          )}
          <p className="text-xs text-stone-500">
            Resultado = vendas recebidas (descontados estornos) + outras receitas − contas pagas. Pedidos ainda não
            pagos e contas ainda não pagas não entram. O custo dos ingredientes só aparece como despesa quando você
            lança a compra.
          </p>
        </div>
      )}
    </div>
  )
}
