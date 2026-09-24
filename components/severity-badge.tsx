import { cn } from '@/lib/utils'
import type { Severity } from '@/lib/types'

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: 'منخفض',
  medium: 'متوسط',
  high: 'عالٍ',
  critical: 'حرج',
}

const STYLES: Record<Severity, string> = {
  low: 'bg-severity-low/15 text-severity-low border-severity-low/30',
  medium: 'bg-severity-medium/15 text-severity-medium border-severity-medium/30',
  high: 'bg-severity-high/15 text-severity-high border-severity-high/30',
  critical:
    'bg-severity-critical/15 text-severity-critical border-severity-critical/40',
}

export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold',
        STYLES[severity],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {SEVERITY_LABEL[severity]}
    </span>
  )
}
