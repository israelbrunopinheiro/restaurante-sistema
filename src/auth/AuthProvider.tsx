import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Tables } from '../lib/database.types'

type Profile = Tables<'profiles'>
type Settings = Tables<'settings'>

type AuthState = {
  session: Session | null
  profile: Profile | null
  settings: Settings | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (name: string, email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>
  signOut: () => Promise<void>
  reloadProfile: () => Promise<void>
  reloadSettings: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function translateAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'Este e-mail já está cadastrado.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).'
  if (m.includes('password') && m.includes('6')) return 'A senha precisa ter ao menos 6 caracteres.'
  if (m.includes('valid email') || m.includes('invalid email')) return 'Digite um e-mail válido.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde um pouco e tente de novo.'
  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [dataReady, setDataReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      // Só guarda a sessão aqui; chamadas ao banco ficam no efeito abaixo (evita travar o cliente de auth).
      setSession(next)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  const reloadProfile = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile(data)
  }, [userId])

  const reloadSettings = useCallback(async () => {
    const { data } = await supabase.from('settings').select('*').maybeSingle()
    setSettings(data)
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!userId) {
      setProfile(null)
      setSettings(null)
      setDataReady(true)
      return
    }
    setDataReady(false)
    ;(async () => {
      await reloadProfile()
      await reloadSettings()
      if (!cancelled) setDataReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [userId, reloadProfile, reloadSettings])

  // Se o dono ainda não aprovou, confere a cada 10 s (e libera o acesso sozinho).
  const waitingApproval = !!userId && dataReady && !!profile && !profile.active
  useEffect(() => {
    if (!waitingApproval) return
    const t = setInterval(() => {
      reloadProfile().then(reloadSettings)
    }, 10000)
    return () => clearInterval(t)
  }, [waitingApproval, reloadProfile, reloadSettings])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    return error ? translateAuthError(error.message) : null
  }, [])

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() } },
    })
    if (error) return { error: translateAuthError(error.message), needsConfirmation: false }
    // Sem sessão = o projeto exige confirmar o e-mail antes do primeiro acesso.
    return { error: null, needsConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      settings,
      loading: !sessionReady || !dataReady,
      signIn,
      signUp,
      signOut,
      reloadProfile,
      reloadSettings,
    }),
    [session, profile, settings, sessionReady, dataReady, signIn, signUp, signOut, reloadProfile, reloadSettings],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
