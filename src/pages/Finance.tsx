import { useState } from 'react'
import CategoriesTab from '../components/finance/CategoriesTab'
import EntriesTab from '../components/finance/EntriesTab'
import SummaryTab from '../components/finance/SummaryTab'

type Tab = 'summary' | 'payable' | 'receivable' | 'categories'

const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Resumo' },
  { id: 'payable', label: 'Contas a pagar' },
  { id: 'receivable', label: 'Contas a receber' },
  { id: 'categories', label: 'Categorias' },
]

export default function Finance() {
  const [tab, setTab] = useState<Tab>('summary')
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Financeiro</h1>
      <div className="-mx-3 flex gap-1 overflow-x-auto border-b border-stone-200 px-3" role="tablist" aria-label="Financeiro">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-semibold ${
              tab === t.id ? 'border-brand-600 text-brand-800' : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'summary' && <SummaryTab onGoTo={setTab} />}
      {tab === 'payable' && <EntriesTab kind="payable" />}
      {tab === 'receivable' && <EntriesTab kind="receivable" />}
      {tab === 'categories' && <CategoriesTab />}
    </div>
  )
}
