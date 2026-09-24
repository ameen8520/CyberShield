'use client'

import {
  Activity,
  FileBarChart,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Radar,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useData } from '@/lib/data-context'
import type { Permission } from '@/lib/types'
import { cn } from '@/lib/utils'
import { InstallBanner } from '@/components/install-banner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type ViewKey = Permission

interface NavItem {
  key: ViewKey
  label: string
  icon: typeof LayoutDashboard
}

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'لوحة المعلومات', icon: LayoutDashboard },
  { key: 'encryption', label: 'التشفير وفك التشفير', icon: KeyRound },
  { key: 'network', label: 'فحص الشبكة', icon: Radar },
  { key: 'monitor', label: 'المراقبة اللحظية', icon: Activity },
  { key: 'vulnerabilities', label: 'اكتشاف الثغرات', icon: ShieldAlert },
  { key: 'reports', label: 'التقارير', icon: FileBarChart },
  { key: 'users', label: 'إدارة المستخدمين', icon: Users },
  { key: 'audit', label: 'سجل التدقيق', icon: ScrollText },
]

const ROLE_LABEL: Record<string, string> = {
  admin: 'مدير النظام',
  analyst: 'محلل أمني',
  viewer: 'مُطّلع',
}

export function AppShell({
  active,
  onNavigate,
  children,
}: {
  active: ViewKey
  onNavigate: (v: ViewKey) => void
  children: React.ReactNode
}) {
  const { currentUser, logout, can } = useAuth()
  const { dataMode, setDataMode, vulns } = useData()

  const openCount = vulns.filter((v) => v.status === 'open').length
  const items = NAV.filter((n) => can(n.key))

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-l border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-sidebar-foreground">
              الحصن السيبراني
            </div>
            <div className="text-xs text-muted-foreground">Cyber Shield</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const Icon = item.icon
            const isActive = active === item.key
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <Icon className="size-4.5 shrink-0" />
                <span className="flex-1 text-right">{item.label}</span>
                {item.key === 'vulnerabilities' && openCount > 0 && (
                  <span className="rounded-full bg-severity-critical px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {openCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4 text-xs text-muted-foreground">
          نسخة تجريبية · التخزين محلي على متصفحك
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <ShieldCheck className="size-5 text-primary" />
            <span className="text-sm font-bold">الحصن السيبراني</span>
          </div>

          <div className="flex flex-1 items-center justify-end gap-3">
            <InstallBanner />

            {/* Data mode toggle */}
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
              <Activity className="size-4 text-primary" />
              <span className="text-xs font-medium">
                {dataMode === 'real' ? 'بيانات حقيقية' : 'بيانات توضيحية'}
              </span>
              <Switch
                checked={dataMode === 'real'}
                onCheckedChange={(v) => setDataMode(v ? 'real' : 'demo')}
                aria-label="تبديل وضع البيانات"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="sm" className="gap-2" />}
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  {currentUser?.displayName?.charAt(0) ?? 'U'}
                </span>
                <span className="hidden sm:inline">
                  {currentUser?.displayName}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-semibold">{currentUser?.displayName}</div>
                  <div className="text-xs font-normal text-muted-foreground">
                    {ROLE_LABEL[currentUser?.role ?? 'viewer']} · @
                    {currentUser?.username}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="size-4" />
                  تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Mobile nav */}
        <div className="flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-2 md:hidden">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
                  active === item.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground',
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            )
          })}
        </div>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
