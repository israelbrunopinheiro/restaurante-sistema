import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Button, Card, ErrorBox, Field, Notice, Spinner, inputClass } from '../components/ui'
import VersionTag from '../components/VersionTag'

export default function Login() {
  const { session, loading, settings, signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  if (loading) return <Spinner />
  if (session) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    if (mode === 'login') {
      const err = await signIn(email, password)
      if (err) setError(err)
    } else {
      if (name.trim().length < 2) {
        setError('Digite seu nome.')
      } else {
        const res = await signUp(name, email, password)
        if (res.error) setError(res.error)
        else if (res.needsConfirmation) {
          setInfo('Conta criada! Enviamos um e-mail de confirmação. Confirme e depois entre.')
          setMode('login')
        }
      }
    }
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-50 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-700 text-3xl font-bold text-white">
            C
          </div>
          <h1 className="text-2xl font-bold text-stone-900">{settings?.restaurant_name ?? "Cordeiro's Refeições"}</h1>
          <p className="text-sm text-stone-600">Gestão do restaurante</p>
        </div>
        <Card>
          <form onSubmit={onSubmit} className="space-y-4">
            <h2 className="text-lg font-bold">{mode === 'login' ? 'Entrar' : 'Criar conta'}</h2>
            {info && <Notice>{info}</Notice>}
            {error && <ErrorBox>{error}</ErrorBox>}
            {mode === 'signup' && (
              <Field label="Seu nome">
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </Field>
            )}
            <Field label="E-mail">
              <input
                className={inputClass}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </Field>
            <Field label="Senha" hint={mode === 'signup' ? 'Mínimo de 6 caracteres.' : undefined}>
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={6}
                required
              />
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
            </Button>
          </form>
          <button
            type="button"
            className="mt-4 w-full text-center text-sm font-medium text-brand-700 hover:underline"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setError(null)
              setInfo(null)
            }}
          >
            {mode === 'login' ? 'Primeiro acesso? Criar conta' : 'Já tenho conta'}
          </button>
          {mode === 'signup' && (
            <p className="mt-3 text-xs text-stone-500">
              A primeira conta criada vira a do dono. As demais ficam aguardando a aprovação do dono.
            </p>
          )}
        </Card>
        <VersionTag />
      </div>
    </div>
  )
}
