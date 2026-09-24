import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import type { FileScanResult } from '@/lib/types'

// نقرأ بايتات الملف فقط، ما نشغّله أبداً
const MAX_SIZE = 25 * 1024 * 1024 // 25MB

const MAGIC_SIGNATURES: { hex: string; type: string }[] = [
  { hex: '4d5a', type: 'ملف تنفيذي Windows (PE/EXE/DLL)' },
  { hex: '7f454c46', type: 'ملف تنفيذي Linux (ELF)' },
  { hex: 'cafebabe', type: 'Java Class / Mach-O Fat Binary' },
  { hex: 'feedface', type: 'Mach-O (macOS)' },
  { hex: '504b0304', type: 'أرشيف ZIP (قد يكون APK/JAR/DOCX/XLSX/PPTX)' },
  { hex: '25504446', type: 'مستند PDF' },
  { hex: '526172211a0700', type: 'أرشيف RAR' },
  { hex: '377abcaf271c', type: 'أرشيف 7-Zip' },
  { hex: '1f8b08', type: 'أرشيف Gzip' },
  { hex: 'd0cf11e0a1b11ae1', type: 'مستند Office قديم (DOC/XLS/PPT)' },
  { hex: '89504e47', type: 'صورة PNG' },
  { hex: 'ffd8ff', type: 'صورة JPEG' },
]

function toHex(buf: Buffer, len: number): string {
  return buf.subarray(0, len).toString('hex')
}

function detectType(buf: Buffer, fileName: string): string {
  for (const sig of MAGIC_SIGNATURES) {
    if (toHex(buf, sig.hex.length / 2).toLowerCase() === sig.hex) return sig.type
  }
  const text = buf.subarray(0, 2).toString('utf8')
  if (text === '#!') return 'سكربت نصي (Shebang script)'
  // fallback: امتداد الملف فقط
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext) return `غير معروف من المحتوى — الامتداد: .${ext}`
  return 'غير معروف'
}

function shannonEntropy(buf: Buffer): number {
  if (buf.length === 0) return 0
  const freq = new Array(256).fill(0)
  for (const byte of buf) freq[byte]++
  let entropy = 0
  for (const count of freq) {
    if (count === 0) continue
    const p = count / buf.length
    entropy -= p * Math.log2(p)
  }
  return Math.round(entropy * 100) / 100
}

const SUSPICIOUS_MARKERS = [
  'powershell',
  'cmd.exe',
  'wscript',
  'certutil',
  'invoke-expression',
  'invoke-webrequest',
  '-enc ',
  'base64,',
  'eval(',
  'documentwrite',
  '.onion',
  'mimikatz',
  'reverse shell',
  'ncat',
]

// نطلع كل النصوص القابلة للقراءة داخل الملف عشان نبحث فيها عن مؤشرات مشبوهة
function extractInterestingStrings(buf: Buffer, max = 40): string[] {
  const printable = /[\x20-\x7e]{6,}/g
  const text = buf.toString('latin1')
  const found = new Set<string>()
  let match: RegExpExecArray | null
  const ipPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
  while ((match = printable.exec(text)) && found.size < 4000) {
    const s = match[0]
    const lower = s.toLowerCase()
    const looksInteresting =
      /^https?:\/\//i.test(s) ||
      ipPattern.test(s) ||
      SUSPICIOUS_MARKERS.some((m) => lower.includes(m))
    if (looksInteresting) found.add(s.slice(0, 200))
  }
  return [...found].slice(0, max)
}

async function lookupVirusTotal(sha256: string): Promise<FileScanResult['reputation']> {
  const apiKey = process.env.VT_API_KEY
  if (!apiKey) {
    return {
      checked: false,
      malicious: 0,
      suspicious: 0,
      harmless: 0,
      undetected: 0,
      note: 'لم يُفعَّل بحث السمعة (VirusTotal): أضف VT_API_KEY في .env.local لتفعيله.',
    }
  }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(`https://www.virustotal.com/api/v3/files/${sha256}`, {
      headers: { 'x-apikey': apiKey },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (res.status === 404) {
      return {
        checked: true,
        malicious: 0,
        suspicious: 0,
        harmless: 0,
        undetected: 0,
        note: 'الملف غير موجود مسبقاً في قاعدة بيانات VirusTotal (لا يعني بالضرورة أنه آمن).',
      }
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const stats = data?.data?.attributes?.last_analysis_stats ?? {}
    return {
      checked: true,
      malicious: stats.malicious ?? 0,
      suspicious: stats.suspicious ?? 0,
      harmless: stats.harmless ?? 0,
      undetected: stats.undetected ?? 0,
      note: `نتيجة ${(stats.malicious ?? 0) + (stats.suspicious ?? 0) + (stats.harmless ?? 0) + (stats.undetected ?? 0)} محرّك فحص على VirusTotal.`,
    }
  } catch (err) {
    return {
      checked: false,
      malicious: 0,
      suspicious: 0,
      harmless: 0,
      undetected: 0,
      note: `تعذّر الاستعلام من VirusTotal: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`,
    }
  }
}

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'أرفق ملفاً للفحص' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'الحد الأقصى لحجم الملف هو 25 ميجابايت' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())

    const md5 = crypto.createHash('md5').update(buf).digest('hex')
    const sha1 = crypto.createHash('sha1').update(buf).digest('hex')
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex')
    const detectedType = detectType(buf, file.name)
    const entropy = shannonEntropy(buf)
    const interestingStrings = extractInterestingStrings(buf)
    const reputation = await lookupVirusTotal(sha256)

    const riskReasons: string[] = []
    let riskLevel: FileScanResult['riskLevel'] = 'غير محدد'

    if (reputation.checked && reputation.malicious > 0) {
      riskLevel = 'مرتفع'
      riskReasons.push(`${reputation.malicious} محرّك فحص على VirusTotal صنّف الملف كخبيث`)
    } else {
      const isExecutable = /تنفيذي|Script|ELF|PE\/EXE/i.test(detectedType)
      const highEntropy = entropy >= 7.4
      const suspiciousStringsCount = interestingStrings.filter((s) =>
        SUSPICIOUS_MARKERS.some((m) => s.toLowerCase().includes(m)),
      ).length

      if (isExecutable && highEntropy) {
        riskLevel = 'متوسط'
        riskReasons.push('ملف تنفيذي بإنتروبيا عالية (قد يكون مضغوطاً/معبّأً Packed، شائع في البرمجيات الخبيثة)')
      }
      if (suspiciousStringsCount > 0) {
        riskLevel = 'متوسط'
        riskReasons.push(`تم رصد ${suspiciousStringsCount} نص مثير للريبة داخل الملف`)
      }
      if (riskReasons.length === 0) {
        riskLevel = 'منخفض'
        riskReasons.push('لم تُرصد مؤشرات خطر واضحة من التحليل الثابت')
      }
    }

    const result: FileScanResult = {
      id: uid('fscan'),
      timestamp: Date.now(),
      fileName: file.name,
      fileSize: file.size,
      detectedType,
      md5,
      sha1,
      sha256,
      entropy,
      interestingStrings,
      reputation,
      riskLevel,
      riskReasons,
    }

    return NextResponse.json({ result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'فشل فحص الملف لسبب غير معروف' },
      { status: 500 },
    )
  }
}
