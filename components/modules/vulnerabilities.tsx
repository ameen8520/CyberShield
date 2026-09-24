'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  CheckCircle2,
  ClipboardCopy,
  Code2,
  ExternalLink,
  FlaskConical,
  Loader2,
  MapPin,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  TrendingUp,
  Wrench,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { logAudit } from '@/lib/audit'
import { useAuth } from '@/lib/auth-context'
import { useData } from '@/lib/data-context'
import {
  computeSecurityScore,
  SEVERITY_ORDER,
  SEVERITY_WEIGHT,
} from '@/lib/simulation'
import { generateRemediationScript } from '@/lib/remediation-scripts'
import type { Severity, Vulnerability } from '@/lib/types'
import { SeverityBadge, SEVERITY_LABEL } from '@/components/severity-badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type SortKey = 'severity' | 'status'
type FilterStatus = 'all' | 'open' | 'fixed'

interface CveResult {
  id: string
  description: string
  severity: string
  cvssScore: number | null
  published: string
  url: string
}

export function Vulnerabilities() {
  const { vulns, deleteVuln } = useData()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('severity')
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [view, setView] = useState<'current' | 'archive'>('current')

  const currentVulns = useMemo(() => vulns.filter((v) => !v.archived), [vulns])
  const archivedVulns = useMemo(() => vulns.filter((v) => v.archived), [vulns])
  const activeList = view === 'current' ? currentVulns : archivedVulns

  const sorted = useMemo(() => {
    let list = [...activeList]
    if (filter !== 'all') list = list.filter((v) => v.status === filter)
    list.sort((a, b) => {
      if (sort === 'severity')
        return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      return a.status === b.status ? 0 : a.status === 'open' ? -1 : 1
    })
    return list
  }, [activeList, sort, filter])

  const selected = vulns.find((v) => v.id === selectedId) ?? null

  const handleDelete = (v: Vulnerability) => {
    const confirmed = window.confirm(
      `هل أنت متأكد من حذف الثغرة «${v.name}» على ${v.location} نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`,
    )
    if (!confirmed) return
    deleteVuln(v.id)
    if (selectedId === v.id) setSelectedId(null)
    toast.success('تم حذف الثغرة نهائياً')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">اكتشاف الثغرات ومعالجتها</h1>
          <p className="text-sm text-muted-foreground">
            تقرير كامل لكل ثغرة مكتشفة مع خطوات المعالجة ومحاكاة الإصلاح. عند
            كل فحص جديد تنتقل الثغرات السابقة تلقائياً إلى الأرشيف.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterStatus)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="open">غير معالَجة</SelectItem>
              <SelectItem value="fixed">معالَجة</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="severity">فرز حسب الخطورة</SelectItem>
              <SelectItem value="status">فرز حسب الحالة</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={view} onValueChange={(v) => { setView(v as 'current' | 'archive'); setSelectedId(null) }}>
        <TabsList>
          <TabsTrigger value="current" className="gap-2">
            <ShieldAlert className="size-4" />
            الثغرات المكتشفة ({currentVulns.length})
          </TabsTrigger>
          <TabsTrigger value="archive" className="gap-2">
            <Archive className="size-4" />
            الأرشيف ({archivedVulns.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={view} className="mt-4">
          {activeList.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                {view === 'current' ? (
                  <>
                    <ShieldCheck className="mx-auto mb-3 size-10 opacity-40" />
                    لا توجد ثغرات حالياً. ابدأ فحص الشبكة من وحدة «فحص الشبكة»
                    لاكتشاف الثغرات وتحليلها.
                  </>
                ) : (
                  <>
                    <Archive className="mx-auto mb-3 size-10 opacity-40" />
                    الأرشيف فارغ. الثغرات المكتشفة بالفحوصات السابقة (قبل آخر
                    فحص) تظهر هنا تلقائياً.
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
              {/* List */}
              <div className="space-y-3">
                {sorted.map((v) => (
                  <VulnRow
                    key={v.id}
                    vuln={v}
                    active={v.id === selectedId}
                    onClick={() => setSelectedId(v.id)}
                    onDelete={() => handleDelete(v)}
                  />
                ))}
                {sorted.length === 0 && (
                  <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                      لا توجد ثغرات مطابقة للفلتر المحدد.
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Sidebar report */}
              <div className="lg:sticky lg:top-24 lg:h-fit">
                {selected ? (
                  <VulnDetail
                    vuln={selected}
                    allVulns={vulns}
                    onClose={() => setSelectedId(null)}
                    onDelete={() => handleDelete(selected)}
                  />
                ) : (
                  <Card>
                    <CardContent className="py-16 text-center text-sm text-muted-foreground">
                      <ShieldAlert className="mx-auto mb-3 size-8 opacity-40" />
                      اختر ثغرة من القائمة لعرض التقرير التفصيلي وخيارات المعالجة.
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function VulnRow({
  vuln,
  active,
  onClick,
  onDelete,
}: {
  vuln: Vulnerability
  active: boolean
  onClick: () => void
  onDelete: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border p-4 text-right transition-colors ${
        active
          ? 'border-primary bg-primary/5'
          : 'border-border bg-card hover:border-primary/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{vuln.name}</span>
            {vuln.status === 'fixed' && (
              <span className="inline-flex items-center gap-1 text-xs text-severity-low">
                <CheckCircle2 className="size-3.5" />
                تم الإصلاح
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5" />
            {vuln.location}
            {vuln.cve && (
              <span dir="ltr" className="mr-2 rounded bg-muted px-1.5 py-0.5 font-mono">
                {vuln.cve}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <SeverityBadge severity={vuln.severity} />
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                onDelete()
              }
            }}
            className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="حذف الثغرة"
          >
            <Trash2 className="size-3.5" />
          </span>
        </div>
      </div>
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  )
}

function VulnDetail({
  vuln,
  allVulns,
  onClose,
  onDelete,
}: {
  vuln: Vulnerability
  allVulns: Vulnerability[]
  onClose: () => void
  onDelete: () => void
}) {
  const { currentUser } = useAuth()
  const { setVulnStatus } = useData()
  const [whatIf, setWhatIf] = useState(false)
  const [showScript, setShowScript] = useState(false)
  const [selfAddresses, setSelfAddresses] = useState<string[]>([])
  const [remediating, setRemediating] = useState(false)
  const [cveResults, setCveResults] = useState<CveResult[] | null>(null)
  const [cveNote, setCveNote] = useState<string | null>(null)
  const [cveFetchedAt, setCveFetchedAt] = useState<number | null>(null)
  const [cveLoading, setCveLoading] = useState(false)

  const fetchCve = async (force = false) => {
    if (!vuln.service && !vuln.version) return
    setCveLoading(true)
    try {
      const params = new URLSearchParams({
        service: vuln.service ?? '',
        version: vuln.version ?? '',
        ...(force ? { refresh: '1' } : {}),
      })
      const res = await fetch(`/api/cve-lookup?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'فشل الاتصال بقاعدة CVE')
      setCveResults(data.results ?? [])
      setCveNote(data.note ?? data.staleWarning ?? null)
      setCveFetchedAt(data.fetchedAt ?? Date.now())
    } catch (err) {
      setCveNote(err instanceof Error ? err.message : 'فشل الاتصال بقاعدة CVE')
      setCveResults(null)
    } finally {
      setCveLoading(false)
    }
  }

  // تحديث تلقائي كل 6 ساعات
  useEffect(() => {
    fetchCve(false)
    const interval = window.setInterval(() => fetchCve(false), 6 * 60 * 60 * 1000)
    return () => window.clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vuln.id])

  useEffect(() => {
    fetch('/api/self-info')
      .then((r) => r.json())
      .then((d) => setSelfAddresses(d.addresses ?? []))
      .catch(() => setSelfAddresses([]))
  }, [])

  const isLocalServer = selfAddresses.includes(vuln.deviceIp)

  const toggleFix = () => {
    const next = vuln.status === 'open' ? 'fixed' : 'open'
    setVulnStatus(vuln.id, next)
    logAudit(
      currentUser?.username ?? '-',
      'vuln_fix',
      `${next === 'fixed' ? 'وسم كمُعالَجة' : 'إعادة فتح'}: ${vuln.name} على ${vuln.location}`,
    )
    toast.success(next === 'fixed' ? 'تم وسم الثغرة كمُعالَجة' : 'تمت إعادة فتح الثغرة')
  }

  const runRealRemediation = async () => {
    if (!vuln.port) {
      toast.error('لا يوجد منفذ محدد لهذه الثغرة، لا يمكن حظره تلقائياً')
      return
    }
    setRemediating(true)
    try {
      const res = await fetch('/api/remediate-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: vuln.deviceIp, port: vuln.port, action: 'block' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'فشلت المعالجة')

      setVulnStatus(vuln.id, 'fixed')
      logAudit(
        currentUser?.username ?? '-',
        'vuln_fix',
        `معالجة تلقائية حقيقية: ${vuln.name} على ${vuln.location} (حظر منفذ ${vuln.port})`,
      )
      toast.success(data.message ?? 'تمت المعالجة الفعلية بنجاح')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشلت المعالجة')
    } finally {
      setRemediating(false)
    }
  }

  const script = useMemo(() => generateRemediationScript(vuln), [vuln])
  const copyScript = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('تم نسخ السكربت — نفّذه على الجهاز المستهدف بصلاحيات إدارية')
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{vuln.name}</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              aria-label="حذف الثغرة"
            >
              <Trash2 className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={vuln.severity} />
          {vuln.status === 'fixed' ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-severity-low/15 px-2 py-0.5 text-xs font-medium text-severity-low">
              <CheckCircle2 className="size-3.5" />
              تم الإصلاح
            </span>
          ) : (
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              لم تُعالَج
            </span>
          )}
          {vuln.cve && (
            <span dir="ltr" className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {vuln.cve}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="الموقع المتأثر">{vuln.location}</Field>
        <Field label="السبب التقني">{vuln.cause}</Field>
        <Field label="التأثير المحتمل">{vuln.impact}</Field>
        <div className="space-y-1">
          <div className="text-xs font-semibold text-muted-foreground">
            خطوات المعالجة
          </div>
          <ol className="list-inside list-decimal space-y-1 text-sm leading-relaxed">
            {vuln.remediation.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>

        <CveSection
          service={vuln.service}
          version={vuln.version}
          results={cveResults}
          note={cveNote}
          loading={cveLoading}
          fetchedAt={cveFetchedAt}
          onRefresh={() => fetchCve(true)}
        />

        <Separator />

        {isLocalServer ? (
          <div className="rounded-lg border border-severity-low/40 bg-severity-low/5 p-3 text-xs text-muted-foreground">
            هذا الجهاز هو <strong>السيرفر نفسه</strong> — المعالجة التلقائية
            هنا حقيقية فعلاً (تُنشئ قاعدة حظر حقيقية بجدار الحماية).
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            هذا جهاز آخر على الشبكة — لا يمكن تعديل إعداداته تلقائياً بدون
            صلاحيات إدارية عليه مباشرة. استخدم زر توليد السكربت أدناه ونفّذه
            يدوياً على ذلك الجهاز.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {isLocalServer && vuln.status !== 'fixed' && (
            <Button onClick={runRealRemediation} disabled={remediating} className="flex-1 gap-2">
              {remediating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              معالجة تلقائية حقيقية
            </Button>
          )}

          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => setShowScript((s) => !s)}
          >
            <TerminalSquare className="size-4" />
            توليد سكربت المعالجة
          </Button>

          <Button onClick={toggleFix} variant={vuln.status === 'fixed' ? 'outline' : 'secondary'} className="flex-1 gap-2">
            {vuln.status === 'fixed' ? (
              <>
                <RotateCcw className="size-4" />
                إعادة فتح
              </>
            ) : (
              <>
                <Wrench className="size-4" />
                وسم يدوي كمُعالَجة
              </>
            )}
          </Button>

          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => {
              setWhatIf((s) => !s)
              if (!whatIf)
                logAudit(currentUser?.username ?? '-', 'whatif', `محاكاة إصلاح: ${vuln.name}`)
            }}
          >
            <FlaskConical className="size-4" />
            محاكاة الإصلاح
          </Button>
        </div>

        {showScript && (
          <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Code2 className="size-4" />
              سكربت المعالجة — نفّذه يدوياً على {vuln.deviceIp}
            </div>
            <ScriptBlock
              label="Windows (PowerShell كـ Administrator)"
              code={script.windows}
              onCopy={() => copyScript(script.windows)}
            />
            <ScriptBlock
              label="Linux (sudo)"
              code={script.linux}
              onCopy={() => copyScript(script.linux)}
            />
          </div>
        )}

        {whatIf && <WhatIfPanel vuln={vuln} allVulns={allVulns} />}
      </CardContent>
    </Card>
  )
}

function CveSection({
  service,
  version,
  results,
  note,
  loading,
  fetchedAt,
  onRefresh,
}: {
  service?: string
  version?: string
  results: CveResult[] | null
  note: string | null
  loading: boolean
  fetchedAt: number | null
  onRefresh: () => void
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-muted-foreground">
          ثغرات CVE معروفة (قاعدة NVD الرسمية — تحديث حي)
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-xs"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          تحديث الآن
        </Button>
      </div>

      {version && (
        <div className="text-xs text-muted-foreground">
          البحث مبني على النسخة المكتشفة فعلياً:{' '}
          <span dir="ltr" className="font-mono">
            {version}
          </span>
        </div>
      )}

      {note && (
        <p className="rounded-md bg-muted/60 p-2 text-xs leading-relaxed text-muted-foreground">
          {note}
        </p>
      )}

      {results && results.length > 0 && (
        <div className="space-y-2">
          {results.map((cve) => (
            <a
              key={cve.id}
              href={cve.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-md border border-border p-2 text-xs hover:border-primary/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span dir="ltr" className="font-mono font-semibold">
                  {cve.id}
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  {cve.cvssScore != null ? `CVSS ${cve.cvssScore}` : cve.severity}
                  <ExternalLink className="size-3" />
                </span>
              </div>
              <p className="mt-1 text-muted-foreground leading-relaxed">
                {cve.description || 'لا يوجد وصف متاح'}
              </p>
            </a>
          ))}
        </div>
      )}

      {results && results.length === 0 && !note && (
        <p className="text-xs text-muted-foreground">
          لا توجد ثغرات CVE مطابقة معروفة حالياً لهذه النسخة بقاعدة NVD.
        </p>
      )}

      {fetchedAt && (
        <p className="text-[11px] text-muted-foreground/70">
          آخر تحديث: {new Date(fetchedAt).toLocaleString('ar')} — يُحدَّث تلقائياً كل 6 ساعات
          طالما الصفحة مفتوحة، أو اضغط "تحديث الآن".
        </p>
      )}
    </div>
  )
}

function ScriptBlock({
  label,
  code,
  onCopy,
}: {
  label: string
  code: string
  onCopy: () => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={onCopy}>
          <ClipboardCopy className="size-3.5" />
          نسخ
        </Button>
      </div>
      <pre
        dir="ltr"
        className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs leading-relaxed"
      >
        {code}
      </pre>
    </div>
  )
}

// تأثير إصلاح كل نوع خدمة على الأنظمة الأخرى
const SIDE_EFFECTS: Record<string, string> = {
  FTP: 'قد يتأثر أي نظام يعتمد على نقل الملفات عبر FTP — انقلها إلى SFTP.',
  Telnet: 'أي إدارة عن بُعد عبر Telnet ستتوقف — استخدم SSH بدلاً منها.',
  SMB: 'مشاركة الملفات والطابعات القديمة قد تحتاج إعادة ضبط على SMBv3.',
  MySQL: 'التطبيقات التي تتصل بقاعدة البيانات من أجهزة أخرى تحتاج إعادة توجيه عبر نفق آمن.',
  RDP: 'المستخدمون عن بُعد سيحتاجون الاتصال عبر VPN أولاً.',
  HTTP: 'الوصول عبر HTTP سيُعاد توجيهه إلى HTTPS — تأكد من وجود شهادة صالحة.',
}

function WhatIfPanel({
  vuln,
  allVulns,
}: {
  vuln: Vulnerability
  allVulns: Vulnerability[]
}) {
  const currentScore = computeSecurityScore(allVulns)
  const simulated = allVulns.map((v) =>
    v.id === vuln.id ? { ...v, status: 'fixed' as const } : v,
  )
  const newScore = computeSecurityScore(simulated)
  const improvement = newScore - currentScore
  const serviceKey =
    Object.keys(SIDE_EFFECTS).find((k) => vuln.name.includes(k)) ??
    (vuln.port ? undefined : undefined)
  const sideEffect =
    Object.entries(SIDE_EFFECTS).find(([k]) =>
      vuln.cause.includes(k) || vuln.name.includes(k),
    )?.[1] ??
    'لا يُتوقع تأثير جانبي كبير على الخدمات الأخرى عند تطبيق هذا الإصلاح.'

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <FlaskConical className="size-4" />
        محاكاة الإصلاح (What-If) — دون تنفيذ فعلي
      </div>

      <div className="space-y-1">
        <div className="text-xs font-semibold text-muted-foreground">
          ما الذي سيتغيّر؟
        </div>
        <p className="text-sm leading-relaxed">
          سيتم اعتبار الثغرة «{vuln.name}» على {vuln.location} مُعالَجة، وتطبيق
          خطوات المعالجة الموصى بها{vuln.port ? ` على المنفذ ${vuln.port}` : ''}.
        </p>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-semibold text-muted-foreground">
          هل تتأثر أنظمة/خدمات أخرى؟
        </div>
        <p className="text-sm leading-relaxed">{sideEffect}</p>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-semibold text-muted-foreground">
          التحسّن المتوقع في مستوى الأمان
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{currentScore}</span>
          <div className="flex flex-1 items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-severity-low transition-all"
                style={{ width: `${newScore}%` }}
              />
            </div>
          </div>
          <span className="text-sm font-bold text-severity-low">{newScore}</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-severity-low/15 px-2 py-0.5 text-xs font-bold text-severity-low">
            <TrendingUp className="size-3.5" />+{improvement}
          </span>
        </div>
      </div>
    </div>
  )
}
