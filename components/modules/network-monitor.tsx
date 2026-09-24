'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  Router,
  Search,
  TerminalSquare,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScanTerminalDialog } from '@/components/modules/scan-terminal-dialog'

// عدد نقاط التاريخ المعروضة بالرسم البياني لكل جهاز
const HISTORY_MAX = 60

interface PingResult {
  ip: string
  alive: boolean
  latency: number | null
  ttl: number | null
}

interface DeviceState {
  ip: string
  label: string
  alive: boolean
  latency: number | null
  ttl: number | null
  history: (number | null)[]  // آخر HISTORY_MAX قيم latency (null = offline)
  lastSeen: number | null
  lossCount: number
  totalCount: number
}

// يحول TTL إلى تخمين OS
function guessOs(ttl: number | null): string {
  if (!ttl) return ''
  if (ttl <= 64) return 'Linux/Mac'
  if (ttl <= 128) return 'Windows'
  return 'Router'
}

// رسم بياني بسيط لمخطط الـ latency بالـ Canvas
function SparkLine({ history, alive }: { history: (number | null)[]; alive: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)

    // خط الخلفية
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, H / 2)
    ctx.lineTo(W, H / 2)
    ctx.stroke()

    const vals = history.filter((v): v is number => v !== null)
    if (vals.length < 2) return

    const max = Math.max(...vals, 10)
    const step = W / (HISTORY_MAX - 1)

    // منطقة التعبئة
    ctx.beginPath()
    let firstValid = true
    history.forEach((v, i) => {
      const x = i * step
      const y = v == null ? H : H - (v / max) * (H - 4) - 2
      if (firstValid) { ctx.moveTo(x, H); ctx.lineTo(x, y); firstValid = false }
      else ctx.lineTo(x, y)
    })
    ctx.lineTo((history.length - 1) * step, H)
    ctx.closePath()
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, alive ? 'rgba(20,184,166,0.25)' : 'rgba(239,68,68,0.2)')
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.fill()

    // الخط الرئيسي
    ctx.beginPath()
    firstValid = true
    history.forEach((v, i) => {
      if (v == null) { firstValid = true; return }
      const x = i * step
      const y = H - (v / max) * (H - 4) - 2
      if (firstValid) { ctx.moveTo(x, y); firstValid = false }
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = alive ? 'rgb(20,184,166)' : 'rgb(239,68,68)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }, [history, alive])

  return (
    <canvas
      ref={canvasRef}
      width={120}
      height={36}
      className="rounded opacity-80"
    />
  )
}

function latencyColor(ms: number | null): string {
  if (ms == null) return 'text-destructive'
  if (ms < 20) return 'text-teal-400'
  if (ms < 100) return 'text-yellow-400'
  return 'text-red-400'
}

function latencyLabel(ms: number | null): string {
  if (ms == null) return '—'
  return `${ms} ms`
}

function lossPercent(device: DeviceState): string {
  if (device.totalCount === 0) return '—'
  return `${Math.round((device.lossCount / device.totalCount) * 100)}%`
}

// ينشئ حالة جهاز جديد
function makeDevice(ip: string, label = ''): DeviceState {
  return {
    ip,
    label: label || ip,
    alive: false,
    latency: null,
    ttl: null,
    history: [],
    lastSeen: null,
    lossCount: 0,
    totalCount: 0,
  }
}

// IPs افتراضية لمراقبتها (الراوتر + السيرفر نفسه)
const DEFAULT_IPS = ['192.168.1.1']

// نحفظ الأجهزة في localStorage عشان تبقى بعد إغلاق المتصفح
const STORAGE_KEY = 'cybershield:monitor-devices'

function loadStoredDevices(): DeviceState[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    // نعيد تعيين حالة الاتصال اللحظية عند التحميل (سيُعاد فحصها فوراً)
    // لكن نحافظ على التاريخ والإحصائيات المتراكمة كما هي
    return parsed.map((d: DeviceState) => ({ ...d, alive: false }))
  } catch {
    return null
  }
}

export function NetworkMonitor() {
  const [devices, setDevices] = useState<DeviceState[]>(
    () =>
      loadStoredDevices() ??
      DEFAULT_IPS.map((ip) => makeDevice(ip, ip === '192.168.1.1' ? 'الراوتر (الافتراضي)' : ip)),
  )
  const [newIp, setNewIp] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [running, setRunning] = useState(true)
  const [tickCount, setTickCount] = useState(0)
  const [lastTick, setLastTick] = useState<number | null>(null)
  const [scanDialog, setScanDialog] = useState<
    { open: false } | { open: true; mode: 'all' } | { open: true; mode: 'single'; ip: string; label: string }
  >({ open: false })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fetchingRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(devices))
    } catch {
      // مساحة التخزين المحلي ممتلئة أو غير متاحة — نتجاهل بصمت
    }
  }, [devices])

  const runPing = useCallback(async (devList: DeviceState[]) => {
    if (fetchingRef.current || devList.length === 0) return
    fetchingRef.current = true
    try {
      const res = await fetch('/api/monitor-ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ips: devList.map((d) => d.ip) }),
      })
      if (!res.ok) throw new Error('فشل الفحص')
      const data: { results: PingResult[]; timestamp: number } = await res.json()

      setDevices((prev) =>
        prev.map((dev) => {
          const r = data.results.find((x) => x.ip === dev.ip)
          if (!r) return dev
          const newHistory = [...dev.history, r.alive ? r.latency : null].slice(-HISTORY_MAX)
          return {
            ...dev,
            alive: r.alive,
            latency: r.latency,
            ttl: r.ttl,
            history: newHistory,
            lastSeen: r.alive ? data.timestamp : dev.lastSeen,
            lossCount: dev.lossCount + (r.alive ? 0 : 1),
            totalCount: dev.totalCount + 1,
          }
        }),
      )
      setLastTick(data.timestamp)
      setTickCount((c) => c + 1)
    } catch {
      // نكمل بصمت في الخلفية بدون إزعاج المستخدم
    } finally {
      fetchingRef.current = false
    }
  }, [])

  // تشغيل/إيقاف المراقبة كل ثانية
  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    // فحص فوري أول ما يشتغل
    runPing(devices)
    intervalRef.current = setInterval(() => {
      setDevices((current) => { runPing(current); return current })
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  const addDevice = () => {
    const ip = newIp.trim()
    if (!ip) return
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
      toast.error('أدخل عنوان IP صحيح (مثل 192.168.1.10)')
      return
    }
    if (devices.find((d) => d.ip === ip)) {
      toast.error('هذا الـ IP مضاف بالفعل')
      return
    }
    if (devices.length >= 50) {
      toast.error('الحد الأقصى 50 جهاز في نفس الوقت')
      return
    }
    setDevices((prev) => [...prev, makeDevice(ip, newLabel.trim() || ip)])
    setNewIp('')
    setNewLabel('')
    toast.success(`تمت إضافة ${ip} للمراقبة`)
  }

  const removeDevice = (ip: string) => {
    setDevices((prev) => prev.filter((d) => d.ip !== ip))
  }

  // لإضافة جهاز مكتشف مباشرة لقائمة المراقبة المستمرة
  const addDiscoveredDevice = (ip: string, label?: string) => {
    setDevices((prev) => {
      if (prev.find((d) => d.ip === ip)) return prev
      if (prev.length >= 50) {
        toast.error('الحد الأقصى 50 جهاز في نفس الوقت')
        return prev
      }
      return [...prev, makeDevice(ip, label || ip)]
    })
  }

  const onlineCount = devices.filter((d) => d.alive).length
  const offlineCount = devices.length - onlineCount

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            المراقبة اللحظية للشبكة
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ping تلقائي كل ثانية — تأكيد حياة الأجهزة وقياس زمن الاستجابة
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastTick && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="size-3.5" />
              آخر فحص: {new Date(lastTick).toLocaleTimeString('ar')}
              <span className="text-muted-foreground/60 mr-1">· {tickCount} دورة</span>
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setScanDialog({ open: true, mode: 'all' })}
          >
            <Search className="size-3.5" />
            فحص جميع الأجهزة على الشبكة
          </Button>
          <Button
            size="sm"
            variant={running ? 'outline' : 'default'}
            className="gap-1.5"
            onClick={() => {
              setRunning((r) => !r)
              toast.info(running ? 'تم إيقاف المراقبة' : 'تم استئناف المراقبة')
            }}
          >
            {running ? (
              <><X className="size-3.5" /> إيقاف</>
            ) : (
              <><RefreshCw className="size-3.5" /> استئناف</>
            )}
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Wifi className="size-5 text-teal-400 mx-auto mb-1" />
            <div className="text-2xl font-bold text-teal-400">{onlineCount}</div>
            <div className="text-xs text-muted-foreground">متصل</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <WifiOff className="size-5 text-destructive mx-auto mb-1" />
            <div className="text-2xl font-bold text-destructive">{offlineCount}</div>
            <div className="text-xs text-muted-foreground">غير متصل</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Router className="size-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">{devices.length}</div>
            <div className="text-xs text-muted-foreground">إجمالي الأجهزة</div>
          </CardContent>
        </Card>
      </div>

      {/* Add device */}
      <Card>
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="text-sm">إضافة جهاز للمراقبة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Input
              value={newIp}
              onChange={(e) => setNewIp(e.target.value)}
              placeholder="192.168.1.10"
              dir="ltr"
              className="w-44 font-mono text-sm"
              onKeyDown={(e) => e.key === 'Enter' && addDevice()}
            />
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="اسم الجهاز (اختياري)"
              className="flex-1 min-w-40 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && addDevice()}
            />
            <Button onClick={addDevice} className="gap-1.5" size="sm">
              <Plus className="size-3.5" />
              إضافة
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            الحد الأقصى 50 جهاز — يمكن إضافة أي IP داخل الشبكة المحلية
          </p>
        </CardContent>
      </Card>

      {/* Devices list */}
      {devices.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground text-sm">
            <AlertCircle className="size-8 mx-auto mb-3 opacity-40" />
            لا توجد أجهزة مراقَبة. أضف IP جهاز من الحقل أعلاه.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {devices.map((dev) => (
            <Card
              key={dev.ip}
              className={`relative transition-all border ${
                dev.alive
                  ? 'border-teal-500/20 bg-teal-500/[0.03]'
                  : dev.totalCount > 0
                  ? 'border-destructive/20 bg-destructive/[0.03]'
                  : 'border-border'
              }`}
            >
              <CardContent className="pt-4 pb-3 space-y-3">
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-block size-2 rounded-full flex-shrink-0 ${
                          dev.totalCount === 0
                            ? 'bg-muted'
                            : dev.alive
                            ? 'bg-teal-400 shadow-[0_0_6px_rgba(20,184,166,0.6)] animate-pulse'
                            : 'bg-destructive'
                        }`}
                      />
                      <span className="font-semibold text-sm truncate">{dev.label}</span>
                    </div>
                    <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                      {dev.ip}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {dev.alive ? (
                      <Badge variant="outline" className="text-teal-400 border-teal-500/30 text-[11px]">
                        <CheckCircle2 className="size-3 ml-1" />
                        متصل
                      </Badge>
                    ) : dev.totalCount > 0 ? (
                      <Badge variant="outline" className="text-destructive border-destructive/30 text-[11px]">
                        <WifiOff className="size-3 ml-1" />
                        غير متصل
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px]">
                        <RefreshCw className="size-3 ml-1 animate-spin" />
                        جارٍ الفحص
                      </Badge>
                    )}
                    <button
                      onClick={() => setScanDialog({ open: true, mode: 'single', ip: dev.ip, label: dev.label })}
                      className="p-1 rounded text-muted-foreground hover:text-primary"
                      aria-label="فحص فوري لهذا الجهاز"
                      title="فحص فوري (Ping + منافذ)"
                    >
                      <TerminalSquare className="size-3.5" />
                    </button>
                    <button
                      onClick={() => removeDevice(dev.ip)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive"
                      aria-label="إزالة الجهاز"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                {/* Sparkline */}
                <div className="flex items-end justify-between gap-2">
                  <SparkLine history={dev.history} alive={dev.alive} />
                  <div className="text-right text-xs space-y-0.5">
                    <div className={`font-mono font-bold text-base ${latencyColor(dev.latency)}`}>
                      {latencyLabel(dev.latency)}
                    </div>
                    <div className="text-muted-foreground">استجابة</div>
                  </div>
                </div>

                {/* Bottom stats */}
                <div className="flex gap-4 text-xs text-muted-foreground border-t border-border/50 pt-2">
                  <div>
                    <span className="block font-medium text-foreground">{lossPercent(dev)}</span>
                    <span>فقدان</span>
                  </div>
                  {dev.ttl && (
                    <div>
                      <span className="block font-medium text-foreground">TTL {dev.ttl}</span>
                      <span>{guessOs(dev.ttl)}</span>
                    </div>
                  )}
                  {dev.lastSeen && (
                    <div className="mr-auto text-left">
                      <span className="block font-medium text-foreground">
                        {new Date(dev.lastSeen).toLocaleTimeString('ar')}
                      </span>
                      <span>آخر ظهور</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {scanDialog.open && (
        <ScanTerminalDialog
          open={scanDialog.open}
          onOpenChange={(v) => !v && setScanDialog({ open: false })}
          mode={scanDialog.mode}
          targetIp={scanDialog.mode === 'single' ? scanDialog.ip : undefined}
          targetLabel={scanDialog.mode === 'single' ? scanDialog.label : undefined}
          existingIps={devices.map((d) => d.ip)}
          onAddDevice={addDiscoveredDevice}
        />
      )}
    </div>
  )
}
