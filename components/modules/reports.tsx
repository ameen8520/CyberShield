'use client'

import { useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useData } from '@/lib/data-context'
import { logAudit } from '@/lib/audit'
import {
  computeSecurityScore,
  SEVERITY_ORDER,
} from '@/lib/simulation'
import type { Severity } from '@/lib/types'
import { SeverityBadge } from '@/components/severity-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileBarChart, Printer, ShieldCheck } from 'lucide-react'

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'حرجة',
  high: 'عالية',
  medium: 'متوسطة',
  low: 'منخفضة',
}

export function Reports() {
  const { currentUser } = useAuth()
  const { vulns, latestScan, scans } = useData()

  const open = useMemo(() => vulns.filter((v) => v.status === 'open'), [vulns])
  const fixed = useMemo(() => vulns.filter((v) => v.status === 'fixed'), [vulns])
  const score = computeSecurityScore(vulns)

  const grouped = useMemo(() => {
    const order: Severity[] = ['critical', 'high', 'medium', 'low']
    return order
      .map((sev) => ({
        sev,
        items: open
          .filter((v) => v.severity === sev)
          .sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]),
      }))
      .filter((g) => g.items.length > 0)
  }, [open])

  const counts = useMemo(
    () => ({
      critical: open.filter((v) => v.severity === 'critical').length,
      high: open.filter((v) => v.severity === 'high').length,
      medium: open.filter((v) => v.severity === 'medium').length,
      low: open.filter((v) => v.severity === 'low').length,
    }),
    [open],
  )

  function handlePrint() {
    logAudit(
      currentUser?.username ?? 'system',
      'scan_complete',
      'تم توليد تقرير أمني وتصديره للطباعة',
    )
    window.print()
  }

  const generatedAt = new Date().toLocaleString('ar')
  const hasData = vulns.length > 0 || (latestScan?.devices.length ?? 0) > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-xl font-bold">التقارير الأمنية</h1>
          <p className="text-sm text-muted-foreground">
            تقرير احترافي شامل جاهز للطباعة أو التصدير إلى PDF.
          </p>
        </div>
        <Button onClick={handlePrint} disabled={!hasData}>
          <Printer className="size-4" />
          طباعة / تصدير PDF
        </Button>
      </div>

      {!hasData ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            لا توجد بيانات كافية لتوليد تقرير. ابدأ بفحص الشبكة أولاً.
          </CardContent>
        </Card>
      ) : (
        <div
          id="report-sheet"
          className="mx-auto max-w-3xl space-y-6 rounded-xl border border-border bg-card p-6 print:border-0 print:p-0 print:shadow-none"
        >
          {/* Report header */}
          <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <ShieldCheck className="size-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold">تقرير الوضع الأمني</h2>
                <p className="text-xs text-muted-foreground">
                  الحصن السيبراني · Cyber Shield
                </p>
              </div>
            </div>
            <div className="text-left text-xs text-muted-foreground">
              <div>تاريخ التوليد: {generatedAt}</div>
              <div>أُعدّ بواسطة: {currentUser?.displayName}</div>
            </div>
          </div>

          {/* Executive summary */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <FileBarChart className="size-4 text-primary" />
              الملخص التنفيذي
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryStat label="مؤشر الأمان" value={`${score}/100`} />
              <SummaryStat
                label="أجهزة مفحوصة"
                value={String(latestScan?.devices.length ?? 0)}
              />
              <SummaryStat label="ثغرات مفتوحة" value={String(open.length)} />
              <SummaryStat label="ثغرات مُعالَجة" value={String(fixed.length)} />
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              أظهر الفحص وجود {open.length} ثغرة مفتوحة، منها {counts.critical}{' '}
              حرجة و{counts.high} عالية الخطورة. يُوصى بمعالجة الثغرات الحرجة
              والعالية على الفور وفق خطة المعالجة المرفقة أدناه.
            </p>
          </section>

          {/* Severity distribution */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold">توزيع الثغرات حسب الخطورة</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['critical', 'high', 'medium', 'low'] as Severity[]).map((sev) => (
                <div
                  key={sev}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                >
                  <SeverityBadge severity={sev} />
                  <span className="text-lg font-bold">{counts[sev]}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Detailed findings */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold">النتائج التفصيلية وخطة المعالجة</h3>
            {grouped.length === 0 ? (
              <p className="rounded-lg bg-severity-low/10 px-4 py-3 text-sm text-severity-low">
                لا توجد ثغرات مفتوحة. الوضع الأمني ممتاز.
              </p>
            ) : (
              grouped.map((group) => (
                <div key={group.sev} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={group.sev} />
                    <span className="text-xs text-muted-foreground">
                      ({group.items.length} ثغرة {SEVERITY_LABEL[group.sev]})
                    </span>
                  </div>
                  {group.items.map((v) => (
                    <div
                      key={v.id}
                      className="break-inside-avoid rounded-lg border border-border p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{v.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {v.deviceIp}
                          {v.port ? `:${v.port}` : ''}
                          {v.cve ? ` · ${v.cve}` : ''}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">السبب: </span>
                        {v.cause}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">الأثر: </span>
                        {v.impact}
                      </p>
                      <div className="mt-2">
                        <span className="text-xs font-medium">خطوات المعالجة:</span>
                        <ol className="mr-4 mt-1 list-decimal space-y-0.5 text-xs text-muted-foreground">
                          {v.remediation.map((step, i) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </section>

          <div className="border-t border-border pt-3 text-center text-[10px] text-muted-foreground">
            هذا التقرير أُنشئ آلياً بواسطة نظام الحصن السيبراني · عدد عمليات الفحص
            المسجلة: {scans.length}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-center">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}
