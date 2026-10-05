import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button, Card, ErrorBox, SectionTitle, Spinner, errorMessage, inputClass } from '../ui'
import type { Tables } from '../../lib/database.types'
import type { EntryKind } from '../../lib/finance'
import { supabase } from '../../lib/supabase'

type Category = Tables<'finance_categories'>

function KindList({ kind, title, hint }: { kind: EntryKind; title: string; hint: string }) {
  const [items, setItems] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('finance_categories').select('*').eq('kind', kind).order('name')
    if (error) setError(errorMessage(error))
    setItems(data ?? [])
    setLoading(false)
  }, [kind])

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: PromiseLike<{ error: { message: string } | null }>, friendly?: string) {
    const { error } = await action
    if (error) setError(friendly ?? errorMessage(error))
    else {
      setError(null)
      await load()
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await run(supabase.from('finance_categories').insert({ name: name.trim(), kind }), 'Já existe uma categoria com esse nome.')
    setName('')
  }

  async function rename(c: Category) {
    const next = window.prompt('Novo nome da categoria:', c.name)?.trim()
    if (next && next !== c.name) {
      await run(supabase.from('finance_categories').update({ name: next }).eq('id', c.id), 'Já existe uma categoria com esse nome.')
    }
  }

  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <Card className="space-y-3">
        <p className="text-sm text-stone-600">{hint}</p>
        {error && <ErrorBox>{error}</ErrorBox>}
        <form onSubmit={add} className="flex gap-2">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nova categoria"
            aria-label={`Nova categoria de ${title.toLowerCase()}`}
          />
          <Button type="submit" variant="secondary" disabled={!name.trim()}>
            Adicionar
          </Button>
        </form>
        {loading ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-stone-100">
            {items.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-2">
                <span className={`flex-1 ${c.active ? '' : 'text-stone-400 line-through'}`}>{c.name}</span>
                <Button variant="ghost" size="sm" onClick={() => void rename(c)}>
                  Renomear
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void run(supabase.from('finance_categories').update({ active: !c.active }).eq('id', c.id))}
                >
                  {c.active ? 'Desativar' : 'Ativar'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  )
}

export default function CategoriesTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <KindList kind="payable" title="Categorias de despesas" hint="Para onde vai o dinheiro (contas a pagar)." />
      <KindList kind="receivable" title="Categorias de receitas" hint="De onde vem o dinheiro além das vendas (contas a receber)." />
    </div>
  )
}
