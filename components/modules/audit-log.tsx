'use client'

import { useEffect, useMemo, useState } from 'react'
import { store } from '@/lib/storage'
import { ACTION_LABELS } from '@/lib/audit'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type { AuditAction, AuditEntry } from '@/lib/types'
import { ScrollText, Search } from 'lucide-react'

function actionTone(action: AuditAction): string {
  if (action === 'login' || action === 'user_delete') {
    return 'bg-severity-critical/15 text-severity-critical border-severity-critical/30'
  }
  if (
    action === 'scan_start' ||
    action === 'scan_complete' ||
    action === 'encrypt' ||
    action === 'decrypt' ||
    action === 'keygen'
  ) {
    return 'bg-primary/15 text-primary border-primary/30'
  }
  return 'bg-secondary text-secondary-foreground border-border'
}

export function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [query, setQuery] = useState('')
  const [actionFilter, setActionFilter] = useState<string>('all')

  useEffect(() => {
    let cancelled = false
    store.getAudit().then((entries) => {
      if (!cancelled) setEntries(entries)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      const matchesQuery =
        query === '' ||
        entry.actor.toLowerCase().includes(query.toLowerCase()) ||
        entry.detail.toLowerCase().includes(query.toLowerCase())
      const matchesAction = actionFilter === 'all' || entry.action === actionFilter
      return matchesQuery && matchesAction
    })
  }, [entries, query, actionFilter])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">سجل التدقيق</h1>
        <p className="text-sm text-muted-foreground">
          سجل زمني كامل لكل العمليات الحساسة في النظام (يُحفظ آخر ٥٠٠ حدث).
        </p>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex items-center gap-2">
            <ScrollText className="size-5 text-primary" />
            <CardTitle className="text-base">
              الأحداث المسجّلة ({filtered.length})
            </CardTitle>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث بالمستخدم أو التفاصيل..."
                className="pr-9"
              />
            </div>
            <Select
              value={actionFilter}
              onValueChange={(v) => setActionFilter(v ?? 'all')}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder="كل الإجراءات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الإجراءات</SelectItem>
                {(Object.entries(ACTION_LABELS) as [AuditAction, string][]).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              لا توجد أحداث مطابقة
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ والوقت</TableHead>
                    <TableHead className="text-right">المستخدم</TableHead>
                    <TableHead className="text-right">الإجراء</TableHead>
                    <TableHead className="text-right">التفاصيل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {new Date(entry.timestamp).toLocaleString('ar')}
                      </TableCell>
                      <TableCell className="font-medium">{entry.actor}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={actionTone(entry.action)}>
                          {ACTION_LABELS[entry.action] ?? entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                        {entry.detail || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
