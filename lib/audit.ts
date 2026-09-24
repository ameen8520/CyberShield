'use client'

import { store, uid } from './storage'
import type { AuditAction, AuditEntry } from './types'

export async function logAudit(
  actor: string,
  action: AuditAction,
  detail: string,
): Promise<AuditEntry> {
  const entry: AuditEntry = {
    id: uid('log'),
    timestamp: Date.now(),
    actor,
    action,
    detail,
  }
  await store.addAuditEntry(entry)
  return entry
}

export const ACTION_LABELS: Record<AuditAction, string> = {
  login: 'تسجيل دخول',
  logout: 'تسجيل خروج',
  setup: 'تهيئة النظام',
  user_add: 'إضافة مستخدم',
  user_edit: 'تعديل مستخدم',
  user_delete: 'حذف مستخدم',
  encrypt: 'تشفير',
  decrypt: 'فك تشفير',
  keygen: 'توليد مفاتيح',
  scan_start: 'بدء فحص',
  scan_complete: 'اكتمال فحص',
  vuln_fix: 'معالجة ثغرة',
  whatif: 'محاكاة إصلاح',
}
