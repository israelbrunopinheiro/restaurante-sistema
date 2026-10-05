import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import QrImage from '../components/QrImage'
import { Button, Card, EmptyState, ErrorBox, Notice, Spinner, errorMessage } from '../components/ui'
import type { Tables } from '../lib/database.types'
import { newTableToken, onlineMenuUrl } from '../lib/publicOrder'
import { supabase } from '../lib/supabase'

/** QR codes para imprimir: um geral (retirada e delivery) e um por mesa (o código da mesa vai dentro do link). */
export default function QrCodes() {
  const { settings } = useAuth()
  const [tables, setTables] = useState<Tables<'dining_tables'>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('dining_tables').select('*').eq('active', true)
    if (error) setError(errorMessage(error))
    setTables((data ?? []).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { numeric: true })))
    setLoading(false)
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const origin = window.location.origin
  const base = import.meta.env.BASE_URL
  const name = settings?.restaurant_name ?? 'Cardápio'

  async function rotate(t: Tables<'dining_tables'>) {
    if (!window.confirm(`Trocar o código da ${t.label}?\nO QR code impresso hoje deixa de funcionar e você precisa imprimir o novo.`)) return
    const { error } = await supabase.from('dining_tables').update({ qr_token: newTableToken() }).eq('id', t.id)
    if (error) setError(errorMessage(error))
    else {
      setError(null)
      setNotice(`Código da ${t.label} trocado. Imprima o novo QR code.`)
      await load()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-bold">QR codes do cardápio online</h1>
          <p className="text-sm text-stone-600">
            Imprima e cole nas mesas. O cliente aponta a câmera do celular e faz o pedido, sem baixar nada.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/configuracoes" className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-stone-700 hover:bg-stone-200/70">
            ← Configurações
          </Link>
          <Button onClick={() => window.print()}>🖨️ Imprimir</Button>
        </div>
      </div>

      {settings && !settings.online_open && (
        <div className="print:hidden">
          <ErrorBox>
            Os pedidos online estão <strong>desligados</strong>. Os QR codes abrem uma página de "pedidos fechados" até
            você ligar em <Link to="/configuracoes" className="underline">Configurações → Pedidos online</Link>.
          </ErrorBox>
        </div>
      )}
      {notice && (
        <div className="print:hidden">
          <Notice>{notice}</Notice>
        </div>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2 print:gap-6">
          <Card className="break-inside-avoid text-center" data-testid="qr-geral">
            <div className="text-lg font-extrabold">{name}</div>
            <div className="mb-2 font-semibold text-brand-700">Retirada e delivery</div>
            <QrImage text={onlineMenuUrl(origin, base)} label="retirada e delivery" size={224} />
            <p className="mt-2 text-sm text-stone-600">Aponte a câmera do celular para ver o cardápio e pedir.</p>
            <p className="mt-1 break-all text-[10px] text-stone-400 print:hidden">{onlineMenuUrl(origin, base)}</p>
          </Card>

          {tables.map((t) => (
            <Card key={t.id} className="break-inside-avoid text-center" data-testid={`qr-${t.label}`}>
              <div className="text-lg font-extrabold">{name}</div>
              <div className="mb-2 text-2xl font-extrabold text-brand-700">{t.label}</div>
              <QrImage text={onlineMenuUrl(origin, base, t.qr_token)} label={t.label} />
              <p className="mt-2 text-sm text-stone-600">Aponte a câmera para ver o cardápio e pedir da sua mesa.</p>
              <div className="mt-2 print:hidden">
                <Button variant="ghost" size="sm" onClick={() => void rotate(t)}>
                  Trocar código
                </Button>
              </div>
            </Card>
          ))}
          {tables.length === 0 && (
            <div className="sm:col-span-1 print:hidden">
              <EmptyState>
                Nenhuma mesa cadastrada. Crie as mesas em <Link to="/configuracoes" className="underline">Configurações</Link>.
              </EmptyState>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
