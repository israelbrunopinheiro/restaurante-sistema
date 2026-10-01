import { useAuth } from '../auth/AuthProvider'
import { Button, Card } from '../components/ui'

export default function PendingApproval() {
  const { profile, signOut, reloadProfile } = useAuth()
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-50 px-4">
      <Card className="w-full max-w-sm text-center">
        <div className="mb-2 text-4xl">⏳</div>
        <h1 className="text-xl font-bold">Aguardando aprovação</h1>
        <p className="mt-2 text-stone-600">
          {profile ? `Olá, ${profile.full_name}! ` : ''}
          Peça ao dono do restaurante para liberar o seu acesso em <strong>Configurações → Equipe</strong>. Esta tela
          atualiza sozinha quando ele aprovar.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={() => void reloadProfile()}>Já fui aprovado — verificar</Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sair
          </Button>
        </div>
      </Card>
    </div>
  )
}
