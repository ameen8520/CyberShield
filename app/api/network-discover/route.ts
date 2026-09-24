import { exec } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import { promisify } from 'node:util'
import { getOwnIpAddresses } from '@/lib/server-net'

export const dynamic = 'force-dynamic'

const execAsync = promisify(exec)

// هذا الفحص "لحظي" مصاحب لصفحة المراقبة ويجب أن يكون سريعاً.
const QUICK_PORTS: { port: number; service: string }[] = [
  { port: 21, service: 'FTP' },
  { port: 22, service: 'SSH' },
  { port: 80, service: 'HTTP' },
  { port: 135, service: 'RPC' },
  { port: 139, service: 'NetBIOS' },
  { port: 443, service: 'HTTPS' },
  { port: 445, service: 'SMB' },
  { port: 3306, service: 'MySQL' },
  { port: 3389, service: 'RDP' },
  { port: 5900, service: 'VNC' },
  { port: 8080, service: 'HTTP-Alt' },
]

function subnetBase(ip: string): string | null {
  const m = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/)
  return m ? m[1] : null
}

async function pingHost(ip: string): Promise<{ alive: boolean; latency: number | null; ttl: number | null }> {
  const isWindows = os.platform() === 'win32'
  const cmd = isWindows ? `ping -n 1 -w 800 ${ip}` : `ping -c 1 -W 1 ${ip}`
  const startedAt = Date.now()
  try {
    const { stdout } = await execAsync(cmd, { timeout: 2500 })
    const ttlMatch = stdout.match(/ttl[=:]\s*(\d+)/i)
    const timeMatch = stdout.match(/time[=<]\s*([\d.]+)\s*ms/i)
    return {
      alive: true,
      latency: timeMatch ? Math.round(parseFloat(timeMatch[1])) : Date.now() - startedAt,
      ttl: ttlMatch ? parseInt(ttlMatch[1], 10) : null,
    }
  } catch {
    return { alive: false, latency: null, ttl: null }
  }
}

function guessOsFromTtl(ttl: number | null): string {
  if (ttl === null) return 'غير محدد'
  if (ttl <= 64) return 'Linux/Mac'
  if (ttl <= 128) return 'Windows'
  return 'Router'
}

async function scanPort(ip: string, port: number, timeoutMs = 500): Promise<boolean> {
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

async function getArpTable(): Promise<Map<string, string>> {
  const table = new Map<string, string>()
  try {
    const { stdout } = await execAsync('arp -a', { timeout: 3000 })
    for (const line of stdout.split('\n')) {
      const ipMatch = line.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)
      const macMatch = line.match(/([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}/)
      if (ipMatch && macMatch) table.set(ipMatch[0], macMatch[0].toUpperCase().replace(/-/g, ':'))
    }
  } catch {
    // arp غير متاح
  }
  return table
}

export async function POST(request: Request) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`))
      }

      try {
        const body = await request.json().catch(() => ({}))
        const mode: 'all' | 'single' = body?.mode === 'single' ? 'single' : 'all'

        if (mode === 'single') {
          const ip: string = body?.ip ?? ''
          if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
            send({ type: 'line', text: `خطأ: عنوان IP غير صالح "${ip}"` })
            send({ type: 'done' })
            controller.close()
            return
          }

          send({ type: 'line', text: `$ ping -c 1 ${ip}` })
          const ping = await pingHost(ip)
          if (ping.alive) {
            send({
              type: 'line',
              text: `الرد من ${ip}: وقت=${ping.latency}ms TTL=${ping.ttl} (${guessOsFromTtl(ping.ttl)})`,
            })
          } else {
            send({ type: 'line', text: `انتهت مهلة الطلب لـ ${ip} — الجهاز غير متصل حالياً` })
          }
          send({ type: 'ping', ip, alive: ping.alive, latency: ping.latency, ttl: ping.ttl })

          if (ping.alive) {
            send({ type: 'line', text: `$ فحص المنافذ الشائعة على ${ip}...` })
            const openPorts: { port: number; service: string }[] = []
            for (const p of QUICK_PORTS) {
              const open = await scanPort(ip, p.port)
              send({ type: 'line', text: `  منفذ ${p.port} (${p.service}): ${open ? 'مفتوح ✔' : 'مغلق'}` })
              if (open) openPorts.push(p)
            }
            send({ type: 'ports', ip, openPorts })
            send({
              type: 'line',
              text: `اكتمل الفحص: ${openPorts.length} منفذ مفتوح من أصل ${QUICK_PORTS.length}`,
            })
          }
          send({ type: 'done' })
          controller.close()
          return
        }

        // mode === 'all': اكتشاف كل الأجهزة الحية في شبكة السيرفر
        const own = getOwnIpAddresses().find((a) => a !== '127.0.0.1' && a !== 'localhost')
        const base = own ? subnetBase(own) : null
        if (!base) {
          send({ type: 'line', text: 'تعذّر تحديد شبكة السيرفر تلقائياً.' })
          send({ type: 'done' })
          controller.close()
          return
        }

        const ips = Array.from({ length: 254 }, (_, i) => `${base}.${i + 1}`)
        send({ type: 'line', text: `$ فحص شبكة ${base}.0/24 (254 عنوان)...` })
        send({ type: 'line', text: '—'.repeat(40) })

        const BATCH = 24
        let aliveCount = 0
        for (let i = 0; i < ips.length; i += BATCH) {
          const batch = ips.slice(i, i + BATCH)
          const results = await Promise.all(
            batch.map(async (ip) => ({ ip, ...(await pingHost(ip)) })),
          )
          for (const r of results) {
            if (r.alive) {
              aliveCount++
              send({
                type: 'line',
                text: `[+] ${r.ip} متصل — ${r.latency}ms TTL=${r.ttl} (${guessOsFromTtl(r.ttl)})`,
              })
              send({ type: 'result', ip: r.ip, alive: true, latency: r.latency, ttl: r.ttl })
            }
          }
          send({ type: 'progress', scanned: Math.min(i + BATCH, ips.length), total: ips.length })
        }

        send({ type: 'line', text: '—'.repeat(40) })
        send({ type: 'line', text: `اكتمل الفحص: ${aliveCount} جهاز متصل من أصل 254 عنوان مُختبَر.` })

        // إثراء الأجهزة المكتشفة بعناوين MAC من جدول ARP (بدون فحص منافذ)
        const arp = await getArpTable()
        send({ type: 'arp', table: Object.fromEntries(arp) })

        send({ type: 'done' })
        controller.close()
      } catch (err) {
        send({ type: 'line', text: `خطأ: ${err instanceof Error ? err.message : 'غير معروف'}` })
        send({ type: 'done' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
