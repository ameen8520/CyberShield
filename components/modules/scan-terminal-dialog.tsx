'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Plus, Radar, TerminalSquare } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

interface DiscoveredDevice {
  ip: string
  alive: boolean
  latency: number | null
  ttl: number | null
  mac?: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'all' | 'single'
  targetIp?: string
  targetLabel?: string
    existingIps: string[]
  onAddDevice: (ip: string, label?: string) => void
}

export function ScanTerminalDialog({
  open,
  onOpenChange,
  mode,
  targetIp,
  targetLabel,
  existingIps,
  onAddDevice,
}: Props) {
  const [lines, setLines] = useState<string[]>([])
  const [discovered, setDiscovered] = useState<DiscoveredDevice[]>([])
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<{ scanned: number; total: number } | null>(null)
  const [arpTable, setArpTable] = useState<Record<string, string>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    setLines([])
    setDiscovered([])
    setProgress(mode === 'all' ? { scanned: 0, total: 254 } : null)
    setArpTable({})
    runScan()
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  async function runScan() {
    setScanning(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch('/api/network-discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'single' ? { mode: 'single', ip: targetIp } : { mode: 'all' }),
        signal: controller.signal,
      })
      if (!res.body) throw new Error('لا يوجد رد من السيرفر')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const raw = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 1)
          if (!raw.trim()) continue
          handleEvent(JSON.parse(raw))
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setLines((prev) => [...prev, `خطأ في الاتصال: ${err instanceof Error ? err.message : 'غير معروف'}`])
      }
    } finally {
      setScanning(false)
    }
  }

  function handleEvent(evt: Record<string, unknown>) {
    switch (evt.type) {
      case 'line':
        setLines((prev) => [...prev, evt.text as string])
        break
      case 'progress':
        setProgress({ scanned: evt.scanned as number, total: evt.total as number })
        break
      case 'result':
        setDiscovered((prev) => [
          ...prev,
          { ip: evt.ip as string, alive: true, latency: evt.latency as number | null, ttl: evt.ttl as number | null },
        ])
        break
      case 'ping':
        if (mode === 'single') {
          setDiscovered([
            { ip: evt.ip as string, alive: evt.alive as boolean, latency: evt.latency as number | null, ttl: evt.ttl as number | null },
          ])
        }
        break
      case 'arp':
        setArpTable(evt.table as Record<string, string>)
        break
      default:
        break
    }
  }

  const addAll = () => {
    const toAdd = discovered.filter((d) => d.alive && !existingIps.includes(d.ip))
    toAdd.forEach((d) => onAddDevice(d.ip))
    if (toAdd.length > 0) toast.success(`تمت إضافة ${toAdd.length} جهاز للمراقبة`)
    else toast.info('كل الأجهزة المكتشفة مضافة بالفعل')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) abortRef.current?.abort(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TerminalSquare className="size-5 text-primary" />
            {mode === 'all' ? 'فحص جميع الأجهزة على الشبكة' : `فحص فوري: ${targetLabel ?? targetIp}`}
          </DialogTitle>
          <DialogDescription>
            {mode === 'all'
              ? 'فحص Ping لكل عناوين شبكة السيرفر المحلية (/24) لاكتشاف الأجهزة المتصلة حالياً.'
              : 'فحص Ping ومنافذ شائعة لهذا الجهاز تحديداً.'}
          </DialogDescription>
        </DialogHeader>

        {progress && (
          <div className="space-y-1">
            <Progress value={(progress.scanned / progress.total) * 100} className="h-1.5" />
            <div className="text-left text-xs text-muted-foreground" dir="ltr">
              {progress.scanned} / {progress.total}
            </div>
          </div>
        )}

        <div
          ref={scrollRef}
          dir="ltr"
          className="h-64 overflow-y-auto rounded-lg border border-border bg-black p-3 font-mono text-xs leading-relaxed text-green-400"
        >
          {lines.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {l}
            </div>
          ))}
          {scanning && (
            <div className="flex items-center gap-1 text-green-400/70">
              <span className="animate-pulse">▊</span>
            </div>
          )}
        </div>

        {mode === 'all' && discovered.length > 0 && (
          <div className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {discovered.map((d) => {
              const already = existingIps.includes(d.ip)
              return (
                <div
                  key={d.ip}
                  className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-1.5"
                >
                  <span dir="ltr" className="font-mono">
                    {d.ip} {arpTable[d.ip] ? `— ${arpTable[d.ip]}` : ''}
                  </span>
                  <Button
                    size="sm"
                    variant={already ? 'outline' : 'default'}
                    disabled={already}
                    className="h-7 gap-1 text-xs"
                    onClick={() => {
                      onAddDevice(d.ip)
                      toast.success(`تمت إضافة ${d.ip} للمراقبة`)
                    }}
                  >
                    <Plus className="size-3" />
                    {already ? 'مضاف' : 'إضافة للمراقبة'}
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          {scanning ? (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> جارٍ الفحص...
            </span>
          ) : (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Radar className="size-3.5" /> اكتمل الفحص
            </span>
          )}
          {mode === 'all' && discovered.some((d) => d.alive) && (
            <Button size="sm" onClick={addAll} className="gap-1.5">
              <Plus className="size-3.5" />
              إضافة كل المكتشَف للمراقبة
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
