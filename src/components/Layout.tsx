import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import type { AppRole } from '../lib/orders'
import { roleLabel } from '../lib/orders'

const tabs: { to: string; label: string; roles: AppRole[] }[] = [
  { to: '/novo-pedido', label: 'Novo pedido', roles: ['owner', 'attendant'] },
  { to: '/pedidos', label: 'Pedidos', roles: ['owner', 'attendant'] },
  { to: '/caixa', label: 'Caixa', roles: ['owner', 'attendant'] },
  { to: '/cozinha', label: 'Cozinha', roles: ['owner', 'kitchen'] },
  { to: '/painel', label: 'Painel', roles: ['owner'] },
  { to: '/financeiro', label: 'Financeiro', roles: ['owner'] },
  { to: '/cardapio', label: 'Cardápio', roles: ['owner'] },
  { to: '/configuracoes', label: 'Configurações', roles: ['owner'] },
]

export default function Layout() {
  const { profile, settings, signOut } = useAuth()
  const role = profile?.role ?? 'attendant'

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-brand-800 bg-brand-700 text-white shadow print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-lg font-bold leading-tight">{settings?.restaurant_name ?? 'Restaurante'}</div>
            <div className="truncate text-xs text-brand-100">
              {profile?.full_name} · {roleLabel[role]}
            </div>
          </div>
          <button
            onClick={() => void signOut()}
            className="min-h-9 shrink-0 rounded-lg px-3 text-sm font-medium text-brand-100 hover:bg-white/10"
          >
            Sair
          </button>
        </div>
        <nav aria-label="Principal" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-2">
          {tabs
            .filter((t) => t.roles.includes(role))
            .map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  `shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                    isActive ? 'bg-white text-brand-800' : 'text-brand-100 hover:bg-white/10'
                  }`
                }
              >
                {t.label}
              </NavLink>
            ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-4">
        <Outlet />
      </main>
    </div>
  )
}
