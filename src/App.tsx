import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import type { AppRole } from './lib/orders'
import Login from './pages/Login'
import PendingApproval from './pages/PendingApproval'
import NewOrder from './pages/NewOrder'
import Orders from './pages/Orders'
import Cash from './pages/Cash'
import Kitchen from './pages/Kitchen'
import Menu from './pages/Menu'
import Settings from './pages/Settings'

function RequireStaff() {
  const { session, profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  if (!profile?.active) return <PendingApproval />
  return <Outlet />
}

function Guard({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const { profile } = useAuth()
  if (!profile || !roles.includes(profile.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

function Home() {
  const { profile } = useAuth()
  return <Navigate to={profile?.role === 'kitchen' ? '/cozinha' : '/novo-pedido'} replace />
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireStaff />}>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route
                path="novo-pedido"
                element={
                  <Guard roles={['owner', 'attendant']}>
                    <NewOrder />
                  </Guard>
                }
              />
              <Route
                path="pedidos"
                element={
                  <Guard roles={['owner', 'attendant']}>
                    <Orders />
                  </Guard>
                }
              />
              <Route
                path="caixa"
                element={
                  <Guard roles={['owner', 'attendant']}>
                    <Cash />
                  </Guard>
                }
              />
              <Route
                path="cozinha"
                element={
                  <Guard roles={['owner', 'kitchen']}>
                    <Kitchen />
                  </Guard>
                }
              />
              <Route
                path="cardapio"
                element={
                  <Guard roles={['owner']}>
                    <Menu />
                  </Guard>
                }
              />
              <Route
                path="configuracoes"
                element={
                  <Guard roles={['owner']}>
                    <Settings />
                  </Guard>
                }
              />
              <Route path="*" element={<Home />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
