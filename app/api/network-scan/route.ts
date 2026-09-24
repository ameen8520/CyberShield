import { NextResponse } from 'next/server'
import { exec } from 'node:child_process'
import net from 'node:net'
import dns from 'node:dns'
import os from 'node:os'
import { promisify } from 'node:util'

// هذا الفحص لازم يشتغل على سيرفر عندك وصول للشبكة المحلية (مو استضافة سحابية عامة)

const execAsync = promisify(exec)
const reverseDns = promisify(dns.reverse)

// أشهر المنافذ التي يهتم بها مسؤول الشبكة (يمكن توسيعها لاحقاً)
const COMMON_PORTS: { port: number; service: string }[] = [
  { port: 21, service: 'FTP' },
  { port: 22, service: 'SSH' },
  { port: 23, service: 'Telnet' },
  { port: 25, service: 'SMTP' },
  { port: 53, service: 'DNS' },
  { port: 80, service: 'HTTP' },
  { port: 110, service: 'POP3' },
  { port: 139, service: 'NetBIOS' },
  { port: 143, service: 'IMAP' },
  { port: 443, service: 'HTTPS' },
  { port: 445, service: 'SMB' },
  { port: 993, service: 'IMAPS' },
  { port: 995, service: 'POP3S' },
  { port: 1723, service: 'PPTP' },
  { port: 3306, service: 'MySQL' },
  { port: 3389, service: 'RDP' },
  { port: 5900, service: 'VNC' },
  { port: 8080, service: 'HTTP-Alt' },
]

interface ScannedPort {
  port: number
  service: string
  version: string
  banner: string
}

interface ScannedDevice {
  id: string
  ip: string
  mac: string
  hostname: string
  vendor: string
  os: string
  online: boolean
  openPorts: ScannedPort[]
}

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function expandRange(range: string): string[] {
  const trimmed = range.trim()

  // صيغة CIDR /24 فقط (الأكثر شيوعاً على الشبكات المنزلية والمكتبية)
  const cidrMatch = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}\/24$/)
  if (cidrMatch) {
    const [, a, b, c] = cidrMatch
    const ips: string[] = []
    for (let i = 1; i <= 254; i++) ips.push(`${a}.${b}.${c}.${i}`)
    return ips
  }

  // صيغة "start - end"
  const rangeMatch = trimmed.match(
    /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})\s*-\s*(?:\d{1,3}\.\d{1,3}\.\d{1,3}\.)?(\d{1,3})$/,
  )
  if (rangeMatch) {
    const [, base, startStr, endStr] = rangeMatch
    const start = parseInt(startStr, 10)
    const end = parseInt(endStr, 10)
    const ips: string[] = []
    for (let i = start; i <= end && i <= 254; i++) ips.push(`${base}.${i}`)
    return ips
  }

  // IP مفرد
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) return [trimmed]

  return []
}

async function pingHost(ip: string): Promise<{ alive: boolean; ttl: number | null }> {
  const isWindows = os.platform() === 'win32'
  const cmd = isWindows ? `ping -n 1 -w 800 ${ip}` : `ping -c 1 -W 1 ${ip}`
  try {
    const { stdout } = await execAsync(cmd, { timeout: 2500 })
    const ttlMatch = stdout.match(/ttl[=:]\s*(\d+)/i)
    return { alive: true, ttl: ttlMatch ? parseInt(ttlMatch[1], 10) : null }
  } catch {
    return { alive: false, ttl: null }
  }
}

// تخمين نوع نظام التشغيل من قيمة TTL (مش دقيق 100% لكنه مؤشر جيد)
function guessOsFromTtl(ttl: number | null): string {
  if (ttl === null) return 'غير محدد (لم يصل رد Ping يحتوي TTL)'
  if (ttl <= 64) return 'Linux / Unix / macOS / Android (TTL≈64)'
  if (ttl <= 128) return 'Windows (TTL≈128)'
  return 'جهاز شبكة / راوتر (TTL≈255)'
}

async function scanPort(ip: string, port: number, timeoutMs = 400): Promise<boolean> {
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

const HTTP_PORTS = new Set([80, 8080, 443])

async function grabBanner(ip: string, port: number, timeoutMs = 1200): Promise<string> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let data = ''
    let done = false
    const finish = (result: string) => {
      if (done) return
      done = true
      socket.destroy()
      resolve(result.trim())
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => {
      if (HTTP_PORTS.has(port)) {
        socket.write(`HEAD / HTTP/1.0\r\nHost: ${ip}\r\n\r\n`)
      }
      // خدمات أخرى (SSH/FTP/SMTP...) ترسل Banner من نفسها بدون أي طلب
    })
    socket.on('data', (chunk) => {
      data += chunk.toString('utf8')
      if (data.length > 512) finish(data)
    })
    socket.once('timeout', () => finish(data))
    socket.once('error', () => finish(data))
    socket.once('close', () => finish(data))
  })
}

// نستخرج اسم/إصدار الخدمة من الـ banner اللي يرجعه المنفذ
function parseVersionFromBanner(banner: string, port: number): string {
  if (!banner) return 'غير محدد (لم يُرسل الجهاز أي Banner قابل للقراءة)'

  if (HTTP_PORTS.has(port)) {
    const serverMatch = banner.match(/Server:\s*([^\r\n]+)/i)
    if (serverMatch) return serverMatch[1].trim()
    return 'غير محدد (لا توجد ترويسة Server في رد الجهاز)'
  }

  // صيغة Banner القياسية لـ SSH: "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3"
  const sshMatch = banner.match(/SSH-[\d.]+-\S+/)
  if (sshMatch) return sshMatch[0]

  // أول سطر غالباً يكفي لبقية الخدمات (FTP, SMTP, POP3, IMAP...)
  const firstLine = banner.split(/\r?\n/)[0]
  return firstLine ? firstLine.slice(0, 200) : 'غير محدد'
}

// يقرأ جدول ARP المحلي (بعد الـ Ping) لجلب عناوين MAC الحقيقية
async function getArpTable(): Promise<Map<string, string>> {
  const isWindows = os.platform() === 'win32'
  const table = new Map<string, string>()
  try {
    const { stdout } = await execAsync(isWindows ? 'arp -a' : 'arp -a', { timeout: 3000 })
    const lines = stdout.split('\n')
    for (const line of lines) {
      const ipMatch = line.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)
      const macMatch = line.match(/([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}/)
      if (ipMatch && macMatch) {
        table.set(ipMatch[0], macMatch[0].toUpperCase().replace(/-/g, ':'))
      }
    }
  } catch {
    // arp غير متاح، نكمل بدون MAC
  }
  return table
}

function getOwnAddresses(): Map<string, string> {
  const table = new Map<string, string>()
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        table.set(iface.address, iface.mac.toUpperCase())
      }
    }
  }
  return table
}

// محاولة إضافية موجّهة لجهاز واحد إذا لم يظهر في جدول ARP العام
// (أحياناً يحتاج الكاش وقتاً أطول ليتحدث لبعض الأجهزة)
async function arpLookupSingle(ip: string): Promise<string | null> {
  const isWindows = os.platform() === 'win32'
  try {
    const { stdout } = await execAsync(isWindows ? `arp -a ${ip}` : `arp -n ${ip}`, {
      timeout: 2000,
    })
    const macMatch = stdout.match(/([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}/)
    return macMatch ? macMatch[0].toUpperCase().replace(/-/g, ':') : null
  } catch {
    return null
  }
}

// كاش بسيط عشان ما نستعلم نفس الشركة المصنعة أكثر من مرة
const vendorCache = new Map<string, string>()
async function lookupVendor(mac: string): Promise<string> {
  const prefix = mac.slice(0, 8)
  if (vendorCache.has(prefix)) return vendorCache.get(prefix)!
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2500)
    const res = await fetch(`https://api.macvendors.com/${mac}`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) throw new Error('not found')
    const vendor = (await res.text()).trim()
    vendorCache.set(prefix, vendor)
    return vendor
  } catch {
    vendorCache.set(prefix, 'غير معروف (تعذّر الوصول لقاعدة بيانات OUI)')
    return 'غير معروف (تعذّر الوصول لقاعدة بيانات OUI)'
  }
}
async function runInBatches<T, R>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(worker))
    results.push(...batchResults)
  }
  return results
}

export async function POST(request: Request) {
  const startedAt = Date.now()
  try {
    const body = await request.json()
    const range: string = body?.range ?? ''
    const authorizedBy: string = body?.authorizedBy ?? ''

    const ips = expandRange(range)
    if (ips.length === 0) {
      return NextResponse.json(
        { error: 'صيغة النطاق غير مدعومة. استخدم مثلاً: 192.168.1.1 - 192.168.1.254 أو 192.168.1.0/24' },
        { status: 400 },
      )
    }
    if (ips.length > 254) {
      return NextResponse.json(
        { error: 'النطاق كبير جداً. الحد الأقصى 254 عنوان في الفحص الواحد.' },
        { status: 400 },
      )
    }

    const pingResults = await runInBatches(ips, 30, async (ip) => ({
      ip,
      ...(await pingHost(ip)),
    }))
    const aliveHosts = pingResults.filter((r) => r.alive)
    const aliveIps = aliveHosts.map((r) => r.ip)
    const ttlByIp = new Map(aliveHosts.map((r) => [r.ip, r.ttl]))

    await new Promise((r) => setTimeout(r, 800))

    // 3) جدول ARP لجلب MAC الحقيقي + عناوين جهازك نفسه (لا تظهر في ARP)
    const arpTable = await getArpTable()
    const ownAddresses = getOwnAddresses()

    // 4) فحص المنافذ الشائعة لكل جهاز حي + استكمال MAC/Vendor/OS
    const devices: ScannedDevice[] = await runInBatches(aliveIps, 5, async (ip) => {
      const portChecks = await Promise.all(
        COMMON_PORTS.map(async (p) => ({
          ...p,
          open: await scanPort(ip, p.port),
        })),
      )
      const openPorts: ScannedPort[] = await Promise.all(
        portChecks
          .filter((p) => p.open)
          .map(async (p) => {
            const banner = await grabBanner(ip, p.port)
            return {
              port: p.port,
              service: p.service,
              version: parseVersionFromBanner(banner, p.port),
              banner,
            }
          }),
      )

      let hostname = ip
      try {
        const names = await reverseDns(ip)
        if (names && names.length > 0) hostname = names[0]
      } catch {
        // لا يوجد PTR record، نبقي الـ IP كاسم
      }

      // (ج) استعلام ARP موجّه لهذا الـ IP تحديداً كمحاولة أخيرة
      let mac = ownAddresses.get(ip) ?? arpTable.get(ip) ?? null
      if (!mac) mac = await arpLookupSingle(ip)

      const vendor = mac ? await lookupVendor(mac) : 'غير معروف (لا يوجد عنوان MAC لاستخراج الشركة منه)'
      const guessedOs = guessOsFromTtl(ttlByIp.get(ip) ?? null)

      return {
        id: uid('dev'),
        ip,
        mac: mac ?? 'غير متاح (الجهاز خارج نفس الشبكة الفرعية Subnet)',
        hostname,
        vendor,
        os: guessedOs,
        online: true,
        openPorts,
      }
    })

    const scan = {
      id: uid('scan'),
      timestamp: Date.now(),
      range,
      authorizedBy,
      devices,
      durationMs: Date.now() - startedAt,
    }

    return NextResponse.json({ scan })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'فشل الفحص لسبب غير معروف' },
      { status: 500 },
    )
  }
}
