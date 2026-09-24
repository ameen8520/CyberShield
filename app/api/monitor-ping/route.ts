import { NextResponse } from 'next/server'
import { exec } from 'node:child_process'
import os from 'node:os'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

// يفحص IP واحد ويرجع latency بالميلي ثانية، أو null لو ما رد.
// الأمر يختلف بين ويندوز ولينكس، لكن النتيجة نفسها.
async function pingOne(ip: string): Promise<{ ip: string; alive: boolean; latency: number | null; ttl: number | null }> {
  const isWin = os.platform() === 'win32'
  const cmd = isWin
    ? `ping -n 1 -w 500 ${ip}`
    : `ping -c 1 -W 1 ${ip}`

  const start = Date.now()
  try {
    const { stdout } = await execAsync(cmd, { timeout: 2000 })
    const elapsed = Date.now() - start

    // نحاول نجيب latency من مخرجات ping المحددة (أدق من قياسنا)
    // ويندوز: "Average = 2ms"   لينكس: "time=2.34 ms"
    const winMatch = stdout.match(/Average\s*=\s*(\d+)ms/i)
    const linMatch = stdout.match(/time[=<]\s*([\d.]+)\s*ms/i)
    const latency = winMatch
      ? parseInt(winMatch[1], 10)
      : linMatch
      ? Math.round(parseFloat(linMatch[1]))
      : elapsed

    const ttlMatch = stdout.match(/ttl[=:]\s*(\d+)/i)
    const ttl = ttlMatch ? parseInt(ttlMatch[1], 10) : null

    return { ip, alive: true, latency, ttl }
  } catch {
    return { ip, alive: false, latency: null, ttl: null }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const ips: string[] = body?.ips ?? []

    if (!Array.isArray(ips) || ips.length === 0) {
      return NextResponse.json({ error: 'أرسل قائمة IPs' }, { status: 400 })
    }
    if (ips.length > 50) {
      return NextResponse.json({ error: 'الحد الأقصى 50 IP في المراقبة اللحظية' }, { status: 400 })
    }

    // فحص كل الـ IPs بالتوازي في نفس اللحظة
    const results = await Promise.all(ips.map(pingOne))

    return NextResponse.json({ results, timestamp: Date.now() })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'فشل الفحص' },
      { status: 500 },
    )
  }
}
