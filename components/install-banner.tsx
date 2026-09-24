'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Rocket, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { logAudit } from '@/lib/audit'
import type { InstallCheck } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function InstallBanner() {
  const { currentUser } = useAuth()
  const [installed, setInstalled] = useState<boolean | null>(null)
  const [checks, setChecks] = useState<InstallCheck[]>([])
  const [installing, setInstalling] = useState(false)
  const [open, setOpen] = useState(false)

  const refresh = async () => {
    try {
      const res = await fetch('/api/install')
      const data = await res.json()
      setInstalled(!!data.installed)
      setChecks(data.checks ?? [])
    } catch {
      setInstalled(null)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  // فقط مدير النظام يرى زر التثبيت، ويختفي تماماً بعد اكتمال التثبيت
  if (installed !== false || currentUser?.role !== 'admin') return null

  const runInstall = async () => {
    setInstalling(true)
    try {
      const res = await fetch('/api/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installedBy: currentUser?.username ?? 'admin' }),
      })
      const data = await res.json()
      setChecks(data.checks ?? [])
      if (res.ok && data.installed) {
        setInstalled(true)
        toast.success('تم تثبيت النظام على السيرفر بنجاح')
        void logAudit(currentUser?.username ?? '-', 'setup', 'تم تثبيت النظام على السيرفر')
        setOpen(false)
      } else {
        toast.error('لم يكتمل التثبيت — راجع الفحوصات أدناه')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل التثبيت')
    } finally {
      setInstalling(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) refresh()
        setOpen(v)
      }}
    >
      <DialogTrigger render={<Button size="sm" className="gap-2 bg-primary text-primary-foreground" />}>
        <Rocket className="size-4" />
        تثبيت النظام على السيرفر
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="size-5 text-primary" />
            تثبيت النظام على السيرفر
          </DialogTitle>
          <DialogDescription>
            يتحقق هذا المعالج من جاهزية السيرفر (قاعدة البيانات ومتغيرات البيئة
            وصلاحيات الكتابة) ثم يسجّل النظام كـ &quot;مُثبَّت&quot; على هذا
            الجهاز. لن يظهر هذا الزر مرة أخرى بعد نجاح التثبيت.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {checks.map((c) => (
            <div
              key={c.key}
              className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3"
            >
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-severity-low" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-severity-critical" />
              )}
              <div className="text-sm">
                <div className="font-medium">{c.label}</div>
                <div className="text-xs text-muted-foreground">{c.detail}</div>
              </div>
            </div>
          ))}
          {checks.length === 0 && (
            <div className="text-sm text-muted-foreground">جارٍ فحص جاهزية السيرفر...</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={refresh} disabled={installing}>
            إعادة الفحص
          </Button>
          <Button onClick={runInstall} disabled={installing} className="gap-2">
            {installing && <Loader2 className="size-4 animate-spin" />}
            تأكيد التثبيت
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
