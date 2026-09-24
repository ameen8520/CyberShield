'use client'

import { useEffect, useState } from 'react'
import {
  Activity,
  MonitorSmartphone,
  Network,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useData } from '@/lib/data-context'
import { ACTION_LABELS } from '@/lib/audit'
import { store } from '@/lib/storage'
import {
  computeSecurityScore,
  SEVERITY_ORDER,
} from '@/lib/simulation'
import type { AuditEntry, Severity } from '@/lib/types'
import { SeverityBadge } from '@/components/severity-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'الآن'
  if (m < 60) return `منذ ${m} دقيقة`
  const h = Math.floor(m / 60)
  if (h < 24) return `منذ ${h} ساعة`
  return `منذ ${Math.floor(h / 24)} يوم`
}

export function Dashboard({ onNavigate }: { onNavigate: (v: string) => void }) {
  const { currentUser } = useAuth()
  const { vulns, latestScan, scans } = useData()

  const open = vulns.filter((v) => v.status === 'open')
  const score = computeSecurityScore(vulns)
  const deviceCount = latestScan?.devices.length ?? 0
  const openPortCount =
    latestScan?.devices.reduce((s, d) => s + d.openPorts.length, 0) ?? 0

  const bySeverity = (['critical', 'high', 'medium', 'low'] as Severity[]).map(
    (sev) => ({ sev, count: open.filter((v) => v.severity === sev).length }),
  )

  const [recentAudit, setRecentAudit] = useState<AuditEntry[]>([])

  useEffect(() => {
    let cancelled = false
    store.getAudit().then((entries) => {
      if (!cancelled) setRecentAudit(entries.slice(0, 6))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const scoreColor =
    score >= 75
      ? 'text-severity-low'
      : score >= 45
        ? 'text-severity-medium'
        : 'text-severity-critical'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">
          مرحباً، {currentUser?.displayName}
        </h1>
        <p className="text-sm text-muted-foreground">
          نظرة عامة على الوضع الأمني للشبكة والأنظمة.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <MonitorSmartphone className="size-6" />
            </div>
            <div>
              <div className="text-2xl font-bold">{deviceCount}</div>
              <div className="text-xs text-muted-foreground">أجهزة مكتشفة</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-12 items-center justify-center rounded-xl bg-chart-1/15 text-chart-1">
              <Network className="size-6" />
            </div>
            <div>
              <div className="text-2xl font-bold">{openPortCount}</div>
              <div className="text-xs text-muted-foreground">منافذ مفتوحة</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-12 items-center justify-center rounded-xl bg-severity-critical/15 text-severity-critical">
              <ShieldAlert className="size-6" />
            </div>
            <div>
              <div className="text-2xl font-bold">{open.length}</div>
              <div className="text-xs text-muted-foreground">ثغرات مفتوحة</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-12 items-center justify-center rounded-xl bg-severity-low/15 text-severity-low">
              <ShieldCheck className="size-6" />
            </div>
            <div>
              <div className="text-2xl font-bold">{scans.length}</div>
              <div className="text-xs text-muted-foreground">عمليات فحص</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Security score */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">مؤشر الأمان العام</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-2">
              <span className={`text-5xl font-bold ${scoreColor}`}>{score}</span>
              <span className="pb-2 text-sm text-muted-foreground">/ 100</span>
            </div>
            <Progress value={score} className="h-2" />
            <p className="text-xs text-muted-foreground">
              يُحتسب المؤشر بناءً على عدد وخطورة الثغرات المفتوحة. عالج الثغرات
              الحرجة أولاً لرفع المؤشر.
            </p>
          </CardContent>
        </Card>

        {/* Severity breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">توزيع الثغرات حسب الخطورة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {open.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                لا توجد ثغرات مفتوحة. ابدأ فحص الشبكة لاكتشاف الثغرات.
              </p>
            ) : (
              bySeverity.map(({ sev, count }) => {
                const pct = open.length ? (count / open.length) * 100 : 0
                return (
                  <div key={sev} className="flex items-center gap-3">
                    <div className="w-16 shrink-0">
                      <SeverityBadge severity={sev} />
                    </div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-current"
                        style={{
                          width: `${pct}%`,
                          color: `var(--severity-${sev})`,
                        }}
                      />
                    </div>
                    <span className="w-6 text-left text-sm font-semibold">
                      {count}
                    </span>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4 text-primary" />
            آخر النشاطات
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentAudit.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              لا يوجد نشاط بعد.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recentAudit.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-4 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{ACTION_LABELS[e.action]}</span>
                    <span className="mr-2 text-muted-foreground">
                      — {e.detail}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {timeAgo(e.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
