'use client'

import { useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Globe,
  Info,
  Lock,
  Radar,
  ShieldAlert,
  Upload,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { logAudit } from '@/lib/audit'
import { useAuth } from '@/lib/auth-context'
import type { FileScanResult, PublicScanResult } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const GRADE_TONE: Record<PublicScanResult['grade'], string> = {
  A: 'bg-severity-low/15 text-severity-low',
  B: 'bg-severity-low/15 text-severity-low',
  C: 'bg-severity-medium/15 text-severity-medium',
  D: 'bg-severity-high/15 text-severity-high',
  F: 'bg-severity-critical/15 text-severity-critical',
}

const RISK_TONE: Record<FileScanResult['riskLevel'], string> = {
  منخفض: 'bg-severity-low/15 text-severity-low',
  متوسط: 'bg-severity-medium/15 text-severity-medium',
  مرتفع: 'bg-severity-critical/15 text-severity-critical',
  'غير محدد': 'bg-muted text-muted-foreground',
}

export function PublicScan() {
  return (
    <div className="space-y-6">
      <div className="flex gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
        <Info className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="font-semibold text-primary">الفحص العام</p>
          <p className="text-muted-foreground">
            يفحص هذا القسم أهدافاً <strong>خارج شبكتك المحلية</strong>: مواقع
            وخدمات عبر الإنترنت (رابط)، أو ملفات مرفقة (فحص ثابت بدون تشغيلها).
            الفحص محدود بمنافذ شائعة ولا يشمل أي محاولة اختراق أو استغلال
            ثغرات — استخدمه فقط على أهداف تملك تصريحاً بفحصها.
          </p>
        </div>
      </div>

      <Tabs defaultValue="site">
        <TabsList>
          <TabsTrigger value="site" className="gap-2">
            <Globe className="size-4" />
            فحص موقع/رابط
          </TabsTrigger>
          <TabsTrigger value="file" className="gap-2">
            <FileSearch className="size-4" />
            فحص ملف
          </TabsTrigger>
        </TabsList>
        <TabsContent value="site" className="mt-4">
          <SiteScanPanel />
        </TabsContent>
        <TabsContent value="file" className="mt-4">
          <FileScanPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SiteScanPanel() {
  const { currentUser } = useAuth()
  const [consent, setConsent] = useState(false)
  const [authorizedBy, setAuthorizedBy] = useState('')
  const [target, setTarget] = useState('')
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<PublicScanResult | null>(null)

  const startScan = async () => {
    if (!consent) {
      toast.error('يجب الإقرار بامتلاك تصريح رسمي قبل بدء الفحص')
      return
    }
    if (!authorizedBy.trim()) {
      toast.error('أدخل اسم الجهة/الشخص المصرِّح بالفحص')
      return
    }
    if (!target.trim()) {
      toast.error('أدخل رابط أو نطاق الهدف')
      return
    }
    setScanning(true)
    logAudit(currentUser?.username ?? '-', 'scan_start', `بدء فحص عام: ${target.trim()}`)
    try {
      const res = await fetch('/api/public-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: target.trim(), authorizedBy: authorizedBy.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'فشل الفحص')
      setResult(data.scan)
      logAudit(
        currentUser?.username ?? '-',
        'scan_complete',
        `اكتمل الفحص العام لـ ${target.trim()} — التقييم ${data.scan.grade}`,
      )
      toast.success(`اكتمل الفحص — التقييم الأمني: ${data.scan.grade}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ أثناء الفحص')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-4 text-severity-medium" />
            إقرار التصريح — شرط أساسي قبل الفحص
          </CardTitle>
          <CardDescription>
            فحص مواقع أو أنظمة لا تملك تصريحاً بها قد يُعد مخالفة قانونية في
            كثير من الدول، حتى لو كان الفحص محدوداً وغير اختراقي.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="target">رابط/نطاق الهدف</Label>
              <Input
                id="target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="example.com أو https://example.com"
                dir="ltr"
                className="text-left font-mono"
                disabled={scanning}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-by-public">الجهة/الشخص المصرِّح بالفحص</Label>
              <Input
                id="auth-by-public"
                value={authorizedBy}
                onChange={(e) => setAuthorizedBy(e.target.value)}
                placeholder="مثال: مالك النطاق / فريق الأمن"
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
              أُقِرّ بأنني أملك التصريح الرسمي والقانوني اللازم لفحص هذا
              الهدف (أنا مالكه أو مفوَّض رسمياً من مالكه)، وأتحمّل كامل
              المسؤولية عن هذا الإجراء.
            </span>
          </label>

          <Button onClick={startScan} disabled={scanning || !consent || !authorizedBy.trim()} className="gap-2">
            <Radar className={scanning ? 'size-4 animate-spin' : 'size-4'} />
            {scanning ? 'جارٍ الفحص...' : 'بدء الفحص العام'}
          </Button>
        </CardContent>
      </Card>

      {result && <SiteScanResults scan={result} />}
    </div>
  )
}

function SiteScanResults({ scan }: { scan: PublicScanResult }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="text-xs text-muted-foreground">التقييم الأمني الإجمالي</div>
            <div className="mt-1 text-sm">
              الهدف: <span dir="ltr" className="font-mono">{scan.target}</span>
              {scan.resolvedIp && (
                <span className="text-muted-foreground"> ({scan.resolvedIp})</span>
              )}
            </div>
          </div>
          <div className={`flex size-16 items-center justify-center rounded-2xl text-3xl font-extrabold ${GRADE_TONE[scan.grade]}`}>
            {scan.grade}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">ملاحظات التقييم</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {scan.gradeReasons.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-severity-medium" />
              {r}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Globe className="size-4 text-primary" />
              HTTP وترويسات الأمان
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {scan.http?.reachable ? (
              <>
                <div>الحالة: <span className="font-mono">{scan.http.status}</span></div>
                {scan.http.server && <div>Server: <span className="font-mono">{scan.http.server}</span></div>}
                <div className="pt-2 text-xs text-muted-foreground">ترويسات أمان مفقودة:</div>
                {scan.http.missingSecurityHeaders.length === 0 ? (
                  <div className="flex items-center gap-1 text-severity-low">
                    <CheckCircle2 className="size-3.5" /> لا يوجد — جميع الترويسات موجودة
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {scan.http.missingSecurityHeaders.map((h) => (
                      <Badge key={h} variant="destructive">{h}</Badge>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-1 text-severity-critical">
                <XCircle className="size-3.5" /> غير قابل للوصول: {scan.http?.error}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Lock className="size-4 text-primary" />
              شهادة TLS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {scan.tls?.present ? (
              <>
                <div>البروتوكول: <span className="font-mono">{scan.tls.protocol}</span></div>
                <div>الجهة المُصدِرة: {scan.tls.issuer}</div>
                <div>تنتهي في: <span className="font-mono">{scan.tls.validTo}</span></div>
                <div>
                  الأيام المتبقية:{' '}
                  <span className={scan.tls.daysRemaining !== null && scan.tls.daysRemaining < 14 ? 'text-severity-critical' : ''}>
                    {scan.tls.daysRemaining}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-1 text-severity-high">
                <XCircle className="size-3.5" /> لا توجد شهادة صالحة: {scan.tls?.error}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">المنافذ المفحوصة</CardTitle>
          <CardDescription>قائمة منافذ شائعة محدودة (وليس فحصاً شاملاً)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">المنفذ</TableHead>
                <TableHead className="text-right">الخدمة</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scan.ports.map((p) => (
                <TableRow key={p.port}>
                  <TableCell dir="ltr" className="font-mono">{p.port}</TableCell>
                  <TableCell>{p.service}</TableCell>
                  <TableCell>
                    {p.open ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-severity-high">
                        <AlertTriangle className="size-3.5" /> مفتوح
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-severity-low">
                        <CheckCircle2 className="size-3.5" /> مغلق
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function FileScanPanel() {
  const { currentUser } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<FileScanResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const startScan = async () => {
    if (!file) {
      toast.error('اختر ملفاً للفحص')
      return
    }
    setScanning(true)
    logAudit(currentUser?.username ?? '-', 'scan_start', `بدء فحص ملف: ${file.name}`)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/file-scan', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'فشل فحص الملف')
      setResult(data.result)
      logAudit(
        currentUser?.username ?? '-',
        'scan_complete',
        `اكتمل فحص الملف ${file.name} — مستوى الخطورة ${data.result.riskLevel}`,
      )
      toast.success('اكتمل فحص الملف')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ أثناء فحص الملف')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">فحص ملف ثابت (Static Analysis)</CardTitle>
          <CardDescription>
            يُحسَب بصمة الملف (Hash) ونوعه الحقيقي ومستوى العشوائية
            (Entropy) وتُستخرج نصوص مثيرة للريبة، مع تدقيق سمعة اختياري عبر
            VirusTotal — دون تشغيل الملف على السيرفر إطلاقاً.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-8 text-center hover:border-primary/50"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-6 text-muted-foreground" />
            <div className="text-sm">
              {file ? (
                <span className="font-medium">{file.name} ({(file.size / 1024).toFixed(1)} كيلوبايت)</span>
              ) : (
                'اضغط لاختيار ملف أو برنامج (حتى 25 ميجابايت)'
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <Button onClick={startScan} disabled={scanning || !file} className="gap-2">
            <FileSearch className={scanning ? 'size-4 animate-pulse' : 'size-4'} />
            {scanning ? 'جارٍ الفحص...' : 'فحص الملف'}
          </Button>
        </CardContent>
      </Card>

      {result && <FileScanResults result={result} />}
    </div>
  )
}

function FileScanResults({ result }: { result: FileScanResult }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="text-xs text-muted-foreground">مستوى الخطورة</div>
            <div className="mt-1 font-mono text-sm">{result.fileName}</div>
          </div>
          <Badge className={`px-3 py-1 text-sm ${RISK_TONE[result.riskLevel]}`} variant="outline">
            {result.riskLevel}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">تفاصيل الملف</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>النوع المكتشف: {result.detectedType}</div>
          <div>الحجم: {(result.fileSize / 1024).toFixed(1)} كيلوبايت</div>
          <div>الإنتروبيا (Entropy): {result.entropy} / 8</div>
          <div dir="ltr" className="font-mono text-xs">MD5: {result.md5}</div>
          <div dir="ltr" className="font-mono text-xs">SHA1: {result.sha1}</div>
          <div dir="ltr" className="font-mono text-xs">SHA256: {result.sha256}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">أسباب التقييم</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {result.riskReasons.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-severity-medium" />
              {r}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">سمعة الملف (VirusTotal)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">{result.reputation.note}</p>
          {result.reputation.checked && (
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="text-severity-critical">خبيث: {result.reputation.malicious}</span>
              <span className="text-severity-medium">مشبوه: {result.reputation.suspicious}</span>
              <span className="text-severity-low">آمن: {result.reputation.harmless}</span>
              <span className="text-muted-foreground">غير مصنّف: {result.reputation.undetected}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {result.interestingStrings.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">نصوص مستخرجة مثيرة للاهتمام</CardTitle>
            <CardDescription>روابط/عناوين IP/أوامر شائعة الاستخدام في البرمجيات الخبيثة</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 space-y-1 overflow-y-auto font-mono text-xs">
              {result.interestingStrings.map((s, i) => (
                <div key={i} dir="ltr" className="break-all rounded bg-muted/40 px-2 py-1">
                  {s}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
