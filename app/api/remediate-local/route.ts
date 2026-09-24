import { NextResponse } from 'next/server'
import { exec } from 'node:child_process'
import os from 'node:os'
import { promisify } from 'node:util'
import { isOwnMachine } from '@/lib/server-net'

const execAsync = promisify(exec)

// اسم ثابت للقاعدة عشان نقدر نحذفها لاحقاً بسهولة
function ruleName(port: number) {
  return `AutoRemediation-Block-Port-${port}`
}

async function blockPortWindows(port: number) {
  const name = ruleName(port)
  await execAsync(
    `powershell -NoProfile -Command "New-NetFirewallRule -DisplayName '${name}' -Direction Inbound -LocalPort ${port} -Protocol TCP -Action Block -ErrorAction Stop"`,
    { timeout: 8000 },
  )
}

async function unblockPortWindows(port: number) {
  const name = ruleName(port)
  await execAsync(
    `powershell -NoProfile -Command "Remove-NetFirewallRule -DisplayName '${name}' -ErrorAction Stop"`,
    { timeout: 8000 },
  )
}

async function blockPortLinux(port: number) {
  // يتطلب صلاحيات root على السيرفر لتعمل فعلياً
  await execAsync(`iptables -A INPUT -p tcp --dport ${port} -j DROP`, { timeout: 8000 })
}

async function unblockPortLinux(port: number) {
  await execAsync(`iptables -D INPUT -p tcp --dport ${port} -j DROP`, { timeout: 8000 })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const ip: string = body?.ip ?? ''
    const port: number = Number(body?.port)
    const action: 'block' | 'unblock' = body?.action === 'unblock' ? 'unblock' : 'block'

    if (!port || Number.isNaN(port)) {
      return NextResponse.json({ error: 'رقم منفذ غير صالح' }, { status: 400 })
    }

    // *** حاجز أمان جوهري: المعالجة التلقائية الحقيقية تُطبَّق فقط على
    // هذا السيرفر نفسه، ولا يمكن أبداً أن تُغيّر إعدادات جهاز آخر على
    // الشبكة بدون صلاحيات إدارية مباشرة على ذلك الجهاز تحديداً. ***
    if (!isOwnMachine(ip)) {
      return NextResponse.json(
        {
          error:
            'المعالجة التلقائية الحقيقية متاحة فقط على السيرفر نفسه. لتغيير إعدادات جهاز آخر على الشبكة، استخدم زر "توليد سكربت المعالجة" ونفّذه يدوياً على ذلك الجهاز بصلاحيات إدارية.',
        },
        { status: 403 },
      )
    }

    const isWindows = os.platform() === 'win32'

    if (action === 'block') {
      isWindows ? await blockPortWindows(port) : await blockPortLinux(port)
    } else {
      isWindows ? await unblockPortWindows(port) : await unblockPortLinux(port)
    }

    return NextResponse.json({
      success: true,
      message:
        action === 'block'
          ? `تم حظر المنفذ ${port} فعلياً عبر جدار الحماية على هذا السيرفر.`
          : `تم إلغاء حظر المنفذ ${port} وإعادته لوضعه السابق.`,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `فشلت المعالجة: ${err.message}. تأكد إن التطبيق يعمل بصلاحيات Administrator.`
            : 'فشلت المعالجة لسبب غير معروف',
      },
      { status: 500 },
    )
  }
}
