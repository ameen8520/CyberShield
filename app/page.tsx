'use client'

import { useState } from 'react'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { DataProvider } from '@/lib/data-context'
import { AppShell, type ViewKey } from '@/components/app-shell'
import { AuditLog } from '@/components/modules/audit-log'
import { AuthScreen } from '@/components/auth/auth-screen'
import { Dashboard } from '@/components/modules/dashboard'
import { EncryptionModule } from '@/components/modules/encryption-module'
import { NetworkScan } from '@/components/modules/network-scan'
import { Vulnerabilities } from '@/components/modules/vulnerabilities'
import { Reports } from '@/components/modules/reports'
import { UserManagement } from '@/components/modules/user-management'
import { NetworkMonitor } from '@/components/modules/network-monitor'
import { ShieldCheck } from 'lucide-react'

function AppInner() {
  const { ready, currentUser, can } = useAuth()
  const [view, setView] = useState<ViewKey>('dashboard')

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <ShieldCheck className="size-10 animate-pulse text-primary" />
          <span className="text-sm">جارٍ تحميل الحصن السيبراني...</span>
        </div>
      </div>
    )
  }

  if (!currentUser) {
    return <AuthScreen />
  }

  function navigate(next: ViewKey) {
    setView(can(next) ? next : 'dashboard')
  }

  const active = can(view) ? view : 'dashboard'

  return (
    <AppShell active={active} onNavigate={navigate}>
      {active === 'dashboard' && (
        <Dashboard onNavigate={(v) => navigate(v as ViewKey)} />
      )}
      {active === 'encryption' && <EncryptionModule />}
      {active === 'network' && <NetworkScan />}
      {active === 'monitor' && <NetworkMonitor />}
      {active === 'vulnerabilities' && <Vulnerabilities />}
      {active === 'reports' && <Reports />}
      {active === 'users' && <UserManagement />}
      {active === 'audit' && <AuditLog />}
    </AppShell>
  )
}

export default function Page() {
  return (
    <AuthProvider>
      <DataProvider>
        <AppInner />
      </DataProvider>
    </AuthProvider>
  )
}
