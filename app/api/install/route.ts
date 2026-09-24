import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createClient } from '@supabase/supabase-js'
import type { InstallCheck, InstallStatus } from '@/lib/types'

// نخزن حالة التثبيت بملف عشان ما يطلب التثبيت كل مرة
const DATA_DIR = path.join(process.cwd(), 'data')
const STATE_FILE = path.join(DATA_DIR, 'install-state.json')

async function readState(): Promise<InstallStatus | null> {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8')
    return JSON.parse(raw) as InstallStatus
  } catch {
    return null
  }
}

async function writeState(state: InstallStatus): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8')
}

async function runChecks(): Promise<InstallCheck[]> {
  const checks: InstallCheck[] = []

  // 1) متغيرات بيئة Supabase
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const envOk = !!url && !!key && !url.includes('xxxxxxxxxxxx')
  checks.push({
    key: 'env',
    label: 'متغيرات بيئة Supabase (.env.local)',
    ok: envOk,
    detail: envOk
      ? 'تم العثور على NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY.'
      : 'انسخ .env.local.example إلى .env.local وضع بيانات مشروعك على Supabase ثم أعد تشغيل السيرفر.',
  })

  // 2) الوصول لقاعدة البيانات وجداول supabase-schema.sql
  let dbOk = false
  let dbDetail = 'لم تُفحص (متغيرات البيئة غير مكتملة).'
  if (envOk) {
    try {
      const client = createClient(url!, key!)
      const { error } = await client.from('users').select('id', { head: true, count: 'exact' })
      if (error) {
        dbDetail = `تعذّر الوصول لجدول "users": ${error.message}. تأكد من تنفيذ محتوى supabase-schema.sql داخل مشروع Supabase.`
      } else {
        dbOk = true
        dbDetail = 'الاتصال بقاعدة البيانات ناجح والجداول المطلوبة موجودة.'
      }
    } catch (err) {
      dbDetail = `فشل الاتصال بـ Supabase: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
    }
  }
  checks.push({ key: 'db', label: 'الاتصال بقاعدة البيانات والجداول', ok: dbOk, detail: dbDetail })

  let fsOk = false
  let fsDetail = ''
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    const testFile = path.join(DATA_DIR, '.write-test')
    await fs.writeFile(testFile, 'ok')
    await fs.unlink(testFile)
    fsOk = true
    fsDetail = 'يمكن للتطبيق الكتابة على قرص السيرفر بنجاح.'
  } catch (err) {
    fsDetail = `تعذّرت الكتابة على القرص: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
  }
  checks.push({ key: 'fs', label: 'صلاحية الكتابة على السيرفر', ok: fsOk, detail: fsDetail })

  return checks
}

export async function GET() {
  const saved = await readState()
  if (saved?.installed) {
    return NextResponse.json(saved)
  }
  const checks = await runChecks()
  return NextResponse.json({ installed: false, checks } satisfies InstallStatus)
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const installedBy: string = body?.installedBy ?? 'system'

    const checks = await runChecks()
    const allOk = checks.every((c) => c.ok)

    if (!allOk) {
      return NextResponse.json(
        { installed: false, checks } satisfies InstallStatus,
        { status: 422 },
      )
    }

    const state: InstallStatus = {
      installed: true,
      installedAt: Date.now(),
      installedBy,
      host: os.hostname(),
      checks,
    }
    await writeState(state)
    return NextResponse.json(state)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'فشل التثبيت لسبب غير معروف' },
      { status: 500 },
    )
  }
}

// إعادة تعيين حالة التثبيت (للتجربة فقط)
export async function DELETE() {
  try {
    await fs.unlink(STATE_FILE)
  } catch {
    // لا شيء لحذفه أصلاً
  }
  return NextResponse.json({ installed: false })
}
