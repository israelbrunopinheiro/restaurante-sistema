import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Badge, Button, Card, EmptyState, ErrorBox, Field, SectionTitle, Spinner, errorMessage, inputClass } from '../components/ui'
import type { Tables } from '../lib/database.types'
import { centsToInput, formatBRL, parseBRLToCents } from '../lib/money'
import { supabase } from '../lib/supabase'

type Category = Tables<'categories'>
type Product = Tables<'products'>

type Editing = { kind: 'new'; categoryId: string } | { kind: 'edit'; id: string } | null

function ProductForm({
  initial,
  categories,
  categoryId,
  onSaved,
  onCancel,
}: {
  initial?: Product
  categories: Category[]
  categoryId: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [price, setPrice] = useState(initial ? centsToInput(initial.price_cents) : '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [category, setCategory] = useState(initial?.category_id ?? categoryId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const cents = parseBRLToCents(price)
    if (!name.trim()) return setError('Digite o nome do produto.')
    if (cents === null) return setError('Preço inválido. Use o formato 35,90.')
    setBusy(true)
    setError(null)
    const payload = {
      name: name.trim(),
      price_cents: cents,
      description: description.trim() || null,
      category_id: category,
    }
    const { error } = initial
      ? await supabase.from('products').update(payload).eq('id', initial.id)
      : await supabase.from('products').insert(payload)
    setBusy(false)
    if (error) setError(errorMessage(error))
    else onSaved()
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl bg-brand-50 p-3">
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <Field label="Nome">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Preço (R$)">
          <input
            className={inputClass}
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="35,90"
          />
        </Field>
      </div>
      <Field label="Descrição (opcional)">
        <input
          className={inputClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex.: acompanha arroz, farofa e couve"
        />
      </Field>
      {initial && (
        <Field label="Categoria">
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

export default function Menu() {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [newCategory, setNewCategory] = useState('')

  const load = useCallback(async () => {
    const [c, p] = await Promise.all([
      supabase.from('categories').select('*').order('position').order('name'),
      supabase.from('products').select('*').order('position').order('name'),
    ])
    const err = c.error ?? p.error
    setError(err ? errorMessage(err) : null)
    setCategories(c.data ?? [])
    setProducts(p.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await action
    if (error) setError(errorMessage(error))
    else {
      setError(null)
      await load()
    }
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault()
    const name = newCategory.trim()
    if (!name) return
    await run(supabase.from('categories').insert({ name, position: categories.length }))
    setNewCategory('')
  }

  async function renameCategory(c: Category) {
    const name = window.prompt('Novo nome da categoria:', c.name)?.trim()
    if (name && name !== c.name) await run(supabase.from('categories').update({ name }).eq('id', c.id))
  }

  async function deleteCategory(c: Category) {
    if (products.some((p) => p.category_id === c.id)) {
      setError(`A categoria "${c.name}" ainda tem produtos. Mova ou exclua os produtos antes.`)
      return
    }
    if (window.confirm(`Excluir a categoria "${c.name}"?`)) await run(supabase.from('categories').delete().eq('id', c.id))
  }

  async function deleteProduct(p: Product) {
    if (window.confirm(`Excluir "${p.name}"? Pedidos antigos continuam com o nome e o preço da época.`)) {
      await run(supabase.from('products').delete().eq('id', p.id))
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Cardápio</h1>
        <p className="text-sm text-stone-600">
          Produtos marcados como indisponíveis não aparecem para os atendentes na hora de lançar o pedido.
        </p>
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}

      <form onSubmit={addCategory} className="flex gap-2">
        <input
          className={inputClass}
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          placeholder="Nova categoria (ex.: Pratos, Bebidas, Sobremesas)"
          aria-label="Nome da nova categoria"
        />
        <Button type="submit" disabled={!newCategory.trim()}>
          Adicionar
        </Button>
      </form>

      {categories.length === 0 ? (
        <EmptyState>Comece criando uma categoria acima.</EmptyState>
      ) : (
        categories.map((c) => {
          const items = products.filter((p) => p.category_id === c.id)
          return (
            <section key={c.id} aria-label={`Categoria ${c.name}`}>
              <SectionTitle
                aside={
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => void renameCategory(c)}>
                      Renomear
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void deleteCategory(c)}>
                      Excluir
                    </Button>
                  </div>
                }
              >
                {c.name}
              </SectionTitle>
              <div className="space-y-2">
                {items.map((p) =>
                  editing?.kind === 'edit' && editing.id === p.id ? (
                    <ProductForm
                      key={p.id}
                      initial={p}
                      categories={categories}
                      categoryId={c.id}
                      onSaved={() => {
                        setEditing(null)
                        void load()
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <Card key={p.id} className="flex flex-wrap items-center gap-3 !p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{p.name}</span>
                          {!p.active && <Badge className="bg-stone-200 text-stone-700">Indisponível</Badge>}
                        </div>
                        {p.description && <div className="text-sm text-stone-500">{p.description}</div>}
                      </div>
                      <div className="font-bold text-brand-700">{formatBRL(p.price_cents)}</div>
                      <div className="flex gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void run(supabase.from('products').update({ active: !p.active }).eq('id', p.id))}
                        >
                          {p.active ? 'Pausar' : 'Reativar'}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setEditing({ kind: 'edit', id: p.id })}>
                          Editar
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => void deleteProduct(p)}>
                          Excluir
                        </Button>
                      </div>
                    </Card>
                  ),
                )}
                {editing?.kind === 'new' && editing.categoryId === c.id ? (
                  <ProductForm
                    categories={categories}
                    categoryId={c.id}
                    onSaved={() => {
                      setEditing(null)
                      void load()
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <Button variant="secondary" onClick={() => setEditing({ kind: 'new', categoryId: c.id })}>
                    + Produto em {c.name}
                  </Button>
                )}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
