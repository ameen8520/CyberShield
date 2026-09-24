'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  MonitorSmartphone,
  Radar,
  Server,
  ShieldAlert,
  Wifi,
} from 'lucide-react'
import { toast } from 'sonner'
import { logAudit } from '@/lib/audit'
import { useAuth } from '@/lib/auth-context'
import { useData } from '@/lib/data-context'
import { deriveVulnerabilities, runSimulatedScan } from '@/lib/simulation'
import type { Device, ScanResult } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const RISKY_PORTS = new Set([21, 23, 139, 445, 3389, 3306])
type TargetMode = 'count' | 'single' | 'range'

function subnetBase(ip: string): string | null {
  const m = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/)
  return m ? m[1] : null
}

export function LocalScan() {
  const { currentUser } = useAuth()
  const { latestScan, addScan, dataMode } = useData()

  const [consent, setConsent] = useState(false)
  const [authorizedBy, setAuthorizedBy] = useState('')
  const [mode, setMode] = useState<TargetMode>('count')
  const [deviceCount, setDeviceCount] = useState('25')
  const [singleIp, setSingleIp] = useState('')
  const [range, setRange] = useState('192.168.1.1 - 192.168.1.254')
  const [serverIp, setServerIp] = useState<string | null>(null)
  const [serverHostname, setServerHostname] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const timers = useRef<number[]>([])

  useEffect(() => {
    return () => timers.current.forEach((t) => window.clearTimeout(t))
  }, [])

  useEffect(() => {
    if (dataMode !== 'real') return
    let cancelled = false
    fetch('/api/self-info')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const lan = (data.addresses as string[])?.find(
          (a: string) => a !== '127.0.0.1' && a !== 'localhost',
        )
        if (lan) {
          setServerIp(lan)
          const base = subnetBase(lan)
          if (base) setRange(`${base}.1 - ${base}.254`)
        }
        setServerHostname(data.hostname ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [dataMode])

  function resolveEffectiveRange(): { value: string; label: string } | null {
    if (mode === 'single') {
      if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(singleIp.trim())) return null
      return { value: singleIp.trim(), label: `جهاز واحد: ${singleIp.trim()}` }
    }
    if (mode === 'count') {
      const base = serverIp ? subnetBase(serverIp) : null
      if (!base) return null
      const n = Math.min(254, Math.max(1, parseInt(deviceCount, 10) || 0))
      return { value: `${base}.1 - ${base}.${n}`, label: `أول ${n} جهاز في شبكة السيرفر (${base}.0/24)` }
    }
    if (!range.trim()) return null
    return { value: range.trim(), label: `نطاق مخصص: ${range.trim()}` }
  }

  const startScan = async () => {
    if (!consent) {
      toast.error('يجب الإقرار بامتلاك تصريح رسمي قبل بدء الفحص')
      return
    }
    if (!authorizedBy.trim()) {
      toast.error('أدخل اسم الجهة/الشخص المصرِّح بالفحص')
      return
    }
    const effective = resolveEffectiveRange()
    if (!effective) {
      toast.error('حدد هدف الفحص بشكل صحيح (عدد الأجهزة، أو IP، أو نطاق)')
      return
    }

    setScanning(true)
    setProgress(0)
    logAudit(currentUser?.username ?? '-', 'scan_start', `بدء فحص محلي: ${effective.label}`)

    const stages = [
      { at: 15, label: 'اكتشاف الأجهزة عبر Ping...' },
      { at: 40, label: 'قراءة جدول ARP لعناوين MAC...' },
      { at: 65, label: 'فحص المنافذ المفتوحة (Port Scan)...' },
      { at: 90, label: 'تحديد أسماء الأجهزة (Reverse DNS)...' },
    ]
    stages.forEach((s, i) => {
      const t = window.setTimeout(() => {
        setProgress(s.at)
        setStage(s.label)
      }, (i + 1) * 600)
      timers.current.push(t)
    })

    try {
      let scan: ScanResult

      if (dataMode === 'real') {
        const res = await fetch('/api/network-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ range: effective.value, authorizedBy: authorizedBy.trim() }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'فشل الفحص')
        scan = data.scan
      } else {
        await new Promise((r) => window.setTimeout(r, 1500))
        scan = runSimulatedScan(effective.value, authorizedBy.trim())
      }

      const vulns = deriveVulnerabilities(scan)
      addScan(scan, vulns)
      logAudit(
        currentUser?.username ?? '-',
        'scan_complete',
        `اكتمل الفحص: ${scan.devices.length} جهاز، ${vulns.length} ثغرة`,
      )
      setProgress(100)
      setStage('تحليل النتائج وإعداد التقرير...')
      toast.success(`اكتمل الفحص: ${scan.devices.length} جهاز مكتشف`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ أثناء الفحص')
    } finally {
      timers.current.forEach((t) => window.clearTimeout(t))
      setScanning(false)
      setProgress(0)
      setStage('')
    }
  }

  return (
    <div className="space-y-6">
      {/* Technical disclosure */}
      <div className="flex gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
        <Info className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="font-semibold text-primary">ملاحظة تقنية مهمة</p>
          <p className="text-muted-foreground">
            {dataMode === 'real' ? (
              <>
                الوضع الحالي <strong>بيانات حقيقية</strong>: الفحص فعلي (Ping
                Sweep + Port Scan + قراءة جدول ARP) وينفَّذ من السيرفر المحلي
                (Node.js) وليس من المتصفح. يشترط أن يشتغل هذا التطبيق على جهاز
                داخل نفس الشبكة المطلوب فحصها.
              </>
            ) : (
              <>
                الوضع الحالي <strong>بيانات توضيحية</strong>: النتائج المعروضة
                محاكاة وهمية لأغراض العرض والتدريب فقط ولا تلمس شبكتك فعلياً.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Server IP auto-detect */}
      {dataMode === 'real' && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm">
          <Server className="size-4 text-primary" />
          <span className="text-muted-foreground">عنوان السيرفر الحالي:</span>
          <span dir="ltr" className="font-mono font-semibold">
            {serverIp ?? 'جارٍ الاكتشاف...'}
          </span>
          {serverHostname && (
            <span className="text-xs text-muted-foreground">({serverHostname})</span>
          )}
        </div>
      )}

      {/* Consent gate */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-4 text-severity-medium" />
            إقرار التصريح — شرط أساسي قبل الفحص
          </CardTitle>
          <CardDescription>
            لا يبدأ أي فحص دون موافقة صريحة وإقرار بامتلاك تصريح رسمي. فحص شبكات لا
            تملك تصريحاً بها قد يُعد مخالفة قانونية.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>طريقة تحديد الهدف</Label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${mode === 'count' ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <input
                  type="radio"
                  name="target-mode"
                  className="accent-primary"
                  checked={mode === 'count'}
                  onChange={() => setMode('count')}
                  disabled={scanning}
                />
                عدد الأجهزة في شبكة السيرفر
              </label>
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${mode === 'single' ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <input
                  type="radio"
                  name="target-mode"
                  className="accent-primary"
                  checked={mode === 'single'}
                  onChange={() => setMode('single')}
                  disabled={scanning}
                />
                جهاز واحد (IP محدد)
              </label>
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${mode === 'range' ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <input
                  type="radio"
                  name="target-mode"
                  className="accent-primary"
                  checked={mode === 'range'}
                  onChange={() => setMode('range')}
                  disabled={scanning}
                />
                نطاق مخصص (Range/CIDR)
              </label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {mode === 'count' && (
              <div className="space-y-2">
                <Label htmlFor="device-count">عدد الأجهزة المطلوب فحصها (بدءاً من .1)</Label>
                <Select value={deviceCount} onValueChange={(v) => v && setDeviceCount(v)}>
                  <SelectTrigger id="device-count" className="w-full" disabled={scanning}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['10', '25', '50', '100', '150', '254'].map((n) => (
                      <SelectItem key={n} value={n}>
                        {n} جهاز
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {mode === 'single' && (
              <div className="space-y-2">
                <Label htmlFor="single-ip">عنوان IP المستهدف</Label>
                <Input
                  id="single-ip"
                  value={singleIp}
                  onChange={(e) => setSingleIp(e.target.value)}
                  placeholder="192.168.1.25"
                  dir="ltr"
                  className="text-left font-mono"
                  disabled={scanning}
                />
              </div>
            )}
            {mode === 'range' && (
              <div className="space-y-2">
                <Label htmlFor="range">نطاق الشبكة</Label>
                <Input
                  id="range"
                  value={range}
                  onChange={(e) => setRange(e.target.value)}
                  dir="ltr"
                  className="text-left font-mono"
                  disabled={scanning}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="auth-by">الجهة/الشخص المصرِّح بالفحص</Label>
              <Input
                id="auth-by"
                value={authorizedBy}
                onChange={(e) => setAuthorizedBy(e.target.value)}
                placeholder="مثال: إدارة تقنية المعلومات"
                disabled={scanning}
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(!!v)}
              disabled={scanning}
              className="mt-0.5"
            />
            <span className="text-sm leading-relaxed">
              أُقِرّ بأنني أملك التصريح الرسمي والقانوني اللازم لإجراء فحص أمني على
              الشبكة المحددة أعلاه، وأتحمّل كامل المسؤولية عن هذا الإجراء.
            </span>
          </label>

          {scanning ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-primary">
                <Radar className="size-4 animate-spin" />
                {stage}
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          ) : (
            <Button onClick={startScan} disabled={!consent || !authorizedBy.trim()} className="gap-2">
              <Radar className="size-4" />
              بدء الفحص
            </Button>
          )}
        </CardContent>
      </Card>

      {latestScan && !scanning && <ScanResults scan={latestScan} />}
    </div>
  )
}

function ScanResults({ scan }: { scan: ScanResult }) {
  const totalPorts = scan.devices.reduce((s, d) => s + d.openPorts.length, 0)
  const riskyPorts = scan.devices.reduce(
    (s, d) => s + d.openPorts.filter((p) => RISKY_PORTS.has(p.port)).length,
    0,
  )
  const services = new Set<string>()
  scan.devices.forEach((d) => d.openPorts.forEach((p) => services.add(p.service)))

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat icon={MonitorSmartphone} label="أجهزة مكتشفة" value={scan.devices.length} tone="primary" />
        <SummaryStat icon={Wifi} label="منافذ مفتوحة" value={totalPorts} tone="chart" />
        <SummaryStat icon={AlertTriangle} label="منافذ عالية الخطورة" value={riskyPorts} tone="danger" />
        <SummaryStat icon={CheckCircle2} label="خدمات مكتشفة" value={services.size} tone="ok" />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          نطاق: <span dir="ltr" className="font-mono">{scan.range}</span> · صرّح به: {scan.authorizedBy}
        </span>
        <span>مدة الفحص: {(scan.durationMs / 1000).toFixed(1)} ثانية</span>
      </div>

      {scan.devices.map((d) => (
        <DeviceCard key={d.id} device={d} />
      ))}
    </div>
  )
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wifi
  label: string
  value: number
  tone: 'primary' | 'chart' | 'danger' | 'ok'
}) {
  const tones = {
    primary: 'bg-primary/15 text-primary',
    chart: 'bg-chart-1/15 text-chart-1',
    danger: 'bg-severity-critical/15 text-severity-critical',
    ok: 'bg-severity-low/15 text-severity-low',
  }
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`flex size-11 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="size-5" />
        </div>
        <div>
          <div className="text-xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function DeviceCard({ device }: { device: Device }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MonitorSmartphone className="size-4 text-primary" />
            {device.hostname}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span dir="ltr" className="font-mono">IP: {device.ip}</span>
            <span dir="ltr" className="font-mono">MAC: {device.mac}</span>
            <span>{device.vendor}</span>
            <span>{device.os}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">المنفذ</TableHead>
              <TableHead className="text-right">الخدمة</TableHead>
              <TableHead className="text-right">الإصدار</TableHead>
              <TableHead className="text-right">التقييم</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {device.openPorts.map((p) => {
              const risky = RISKY_PORTS.has(p.port)
              return (
                <TableRow key={p.port}>
                  <TableCell dir="ltr" className="text-right font-mono">{p.port}</TableCell>
                  <TableCell>{p.service}</TableCell>
                  <TableCell dir="ltr" className="text-right font-mono text-xs">{p.version}</TableCell>
                  <TableCell>
                    {risky ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-severity-high">
                        <AlertTriangle className="size-3.5" />
                        يحتاج مراجعة
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-severity-low">
                        <CheckCircle2 className="size-3.5" />
                        عادي
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
