import { NextResponse } from 'next/server'
import net from 'node:net'
import tls from 'node:tls'
import dns from 'node:dns'
import { promisify } from 'node:util'
import type { PublicPort, PublicScanResult } from '@/lib/types'

const dnsLookup = promisify(dns.lookup)

const PUBLIC_PORTS: { port: number; service: string }[] = [
  { port: 21, service: 'FTP' },
  { port: 22, service: 'SSH' },
  { port: 23, service: 'Telnet' },
  { port: 25, service: 'SMTP' },
  { port: 53, service: 'DNS' },
  { port: 80, service: 'HTTP' },
  { port: 110, service: 'POP3' },
  { port: 143, service: 'IMAP' },
  { port: 443, service: 'HTTPS' },
  { port: 445, service: 'SMB' },
  { port: 3306, service: 'MySQL' },
  { port: 3389, service: 'RDP' },
  { port: 5900, service: 'VNC' },
  { port: 8080, service: 'HTTP-Alt' },
  { port: 8443, service: 'HTTPS-Alt' },
]
const RISKY_PUBLIC_PORTS = new Set([21, 23, 139, 445, 3389, 5900, 3306])

const SECURITY_HEADERS = [
  'strict-transport-security',
  'content-security-policy',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
]

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// نمنع فحص عناوين خاصة/محلية، الفحص العام لأهداف خارجية بس
function isPrivateOrReserved(ip: string): boolean {
  if (net.isIP(ip) === 6) {
    const lower = ip.toLowerCase()
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')
  }
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true
  const [a, b] = parts
  if (a === 127) return true // loopback
  if (a === 10) return true // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 169 && b === 254) return true // link-local + cloud metadata
  if (a === 0) return true
  if (a >= 224) return true // multicast/reserved
  return false
}

function normalizeTarget(raw: string): { url: URL; hostname: string } | null {
  let value = raw.trim()
  if (!value) return null
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`
  try {
    const url = new URL(value)
    return { url, hostname: url.hostname }
  } catch {
    return null
  }
}

async function scanPort(ip: string, port: number, timeoutMs = 900): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let done = false
    const finish = (result: boolean) => {
      if (done) return
      done = true
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, ip)
  })
}

async function runInBatches<T, R>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    results.push(...(await Promise.all(batch.map(worker))))
  }
  return results
}

function checkTls(hostname: string): Promise<PublicScanResult['tls']> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: hostname, port: 443, servername: hostname, timeout: 6000, rejectUnauthorized: false },
      () => {
        try {
          const cert = socket.getPeerCertificate()
          const protocol = socket.getProtocol()
          const validTo = cert?.valid_to ? new Date(cert.valid_to) : null
          const daysRemaining = validTo
            ? Math.round((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null
          resolve({
            present: true,
            protocol: protocol ?? null,
            issuer: cert?.issuer ? Object.values(cert.issuer).join(', ') : null,
            subject: cert?.subject ? Object.values(cert.subject).join(', ') : null,
            validFrom: cert?.valid_from ?? null,
            validTo: cert?.valid_to ?? null,
            daysRemaining,
          })
        } finally {
          socket.end()
        }
      },
    )
    socket.once('error', (err) => {
      resolve({
        present: false,
        protocol: null,
        issuer: null,
        subject: null,
        validFrom: null,
        validTo: null,
        daysRemaining: null,
        error: err.message,
      })
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve({
        present: false,
        protocol: null,
        issuer: null,
        subject: null,
        validFrom: null,
        validTo: null,
        daysRemaining: null,
        error: 'انتهت المهلة أثناء الاتصال بمنفذ 443',
      })
    })
  })
}

export async function POST(request: Request) {
  const startedAt = Date.now()
  try {
    const body = await request.json()
    const targetRaw: string = body?.target ?? ''
    const authorizedBy: string = body?.authorizedBy ?? ''

    const normalized = normalizeTarget(targetRaw)
    if (!normalized) {
      return NextResponse.json({ error: 'أدخل رابط أو نطاق صحيح، مثال: example.com' }, { status: 400 })
    }
    if (!authorizedBy.trim()) {
      return NextResponse.json({ error: 'أدخل اسم الجهة/الشخص المصرِّح بالفحص' }, { status: 400 })
    }

    const { url, hostname } = normalized

    let resolvedIp: string | null = null
    try {
      const lookup = await dnsLookup(hostname, { family: 4 })
      resolvedIp = lookup.address
    } catch {
      return NextResponse.json({ error: `تعذّر تحليل النطاق (DNS): ${hostname}` }, { status: 400 })
    }

    if (isPrivateOrReserved(resolvedIp)) {
      return NextResponse.json(
        {
          error:
            'هذا الهدف يشير لعنوان داخلي/خاص أو محجوز. الفحص العام مخصَّص لأهداف خارجية فقط — استخدم "الفحص المحلي" لشبكتك الداخلية.',
        },
        { status: 400 },
      )
    }

    // 1) فحص HTTP/HTTPS + ترويسات الأمان
    let http: PublicScanResult['http'] = null
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 7000)
      const res = await fetch(url.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'CyberShield-PublicScan/1.0' },
      })
      clearTimeout(timeout)
      const headers: Record<string, string> = {}
      res.headers.forEach((v, k) => (headers[k] = v))
      const missing = SECURITY_HEADERS.filter((h) => !(h in headers))
      http = {
        reachable: true,
        status: res.status,
        server: headers['server'] ?? null,
        headers,
        missingSecurityHeaders: missing,
      }
    } catch (err) {
      http = {
        reachable: false,
        status: null,
        server: null,
        headers: {},
        missingSecurityHeaders: SECURITY_HEADERS,
        error: err instanceof Error ? err.message : 'تعذّر الوصول',
      }
    }

    // 2) شهادة TLS (فقط لو الهدف https أو منفذ 443 متاح)
    const tlsResult = await checkTls(hostname)

    // 3) فحص منفذ محدود لأشهر الخدمات
    const portChecks = await runInBatches(PUBLIC_PORTS, 5, async (p) => ({
      ...p,
      open: await scanPort(resolvedIp!, p.port),
    }))
    const ports: PublicPort[] = portChecks.map((p) => ({ port: p.port, open: p.open, service: p.service }))

    let score = 100
    const reasons: string[] = []
    if (!http.reachable) {
      score -= 40
      reasons.push('الموقع غير قابل للوصول عبر HTTP/HTTPS')
    } else {
      const deduction = Math.min(http.missingSecurityHeaders.length * 6, 30)
      if (deduction > 0) {
        score -= deduction
        reasons.push(`${http.missingSecurityHeaders.length} ترويسة أمان مفقودة`)
      }
    }
    if (!tlsResult?.present) {
      score -= 20
      reasons.push('لا توجد شهادة TLS صالحة على المنفذ 443')
    } else if (tlsResult.daysRemaining !== null && tlsResult.daysRemaining < 14) {
      score -= 15
      reasons.push(`شهادة TLS قاربت على الانتهاء (${tlsResult.daysRemaining} يوم متبقٍ)`)
    }
    const riskyOpen = ports.filter((p) => p.open && RISKY_PUBLIC_PORTS.has(p.port))
    if (riskyOpen.length > 0) {
      score -= riskyOpen.length * 10
      reasons.push(`${riskyOpen.length} منفذ عالي الخطورة مفتوح للعموم (${riskyOpen.map((p) => p.port).join(', ')})`)
    }
    score = Math.max(0, Math.min(100, score))
    const grade: PublicScanResult['grade'] =
      score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F'
    if (reasons.length === 0) reasons.push('لا توجد ملاحظات أمنية أساسية — الوضع جيد')

    const scan: PublicScanResult = {
      id: uid('pscan'),
      timestamp: Date.now(),
      target: targetRaw.trim(),
      authorizedBy: authorizedBy.trim(),
      resolvedIp,
      http,
      tls: tlsResult,
      ports,
      grade,
      gradeReasons: reasons,
      durationMs: Date.now() - startedAt,
    }

    return NextResponse.json({ scan })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'فشل الفحص العام لسبب غير معروف' },
      { status: 500 },
    )
  }
}
