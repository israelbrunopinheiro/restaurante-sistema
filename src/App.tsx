import { Suspense, lazy, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import type { AppRole } from './lib/orders'
import Login from './pages/Login'
import PublicOrder from './pages/public/PublicOrder'
import PublicTrack from './pages/public/PublicTrack'
import PendingApproval from './pages/PendingApproval'

// Telas da equipe carregam só quando abertas: a página do cliente fica leve em internet móvel.
const NewOrder = lazy(() => import('./pages/NewOrder'))
const Orders = lazy(() => import('./pages/Orders'))
const Cash = lazy(() => import('./pages/Cash'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Finance = lazy(() => import('./pages/Finance'))
const Kitchen = lazy(() => import('./pages/Kitchen'))
const Menu = lazy(() => import('./pages/Menu'))
const Settings = lazy(() => import('./pages/Settings'))
const QrCodes = lazy(() => import('./pages/QrCodes'))

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
        <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/pedir" element={<PublicOrder />} />
          <Route path="/pedir/pedido/:id" element={<PublicTrack />} />
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
                path="qr"
                element={
                  <Guard roles={['owner']}>
                    <QrCodes />
                  </Guard>
                }
              />
              <Route
                path="painel"
                element={
                  <Guard roles={['owner']}>
                    <Dashboard />
                  </Guard>
                }
              />
              <Route
                path="financeiro"
                element={
                  <Guard roles={['owner']}>
                    <Finance />
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
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
