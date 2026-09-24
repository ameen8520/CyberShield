'use client'

import { supabase } from './supabase-client'
import type {
  AuditEntry,
  ScanResult,
  User,
  Vulnerability,
} from './types'

const LOCAL_KEYS = {
  session: 'cs_session',
  dataMode: 'cs_data_mode',
} as const

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeLocal<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export const store = {
  // Users
  getUsers: async (): Promise<User[]> => {
    const { data, error } = await supabase
      .from('users')
      .select('data')
      .order('created_at', { ascending: true })
    if (error || !data) return []
    return data.map((row) => row.data as User)
  },
  setUsers: async (users: User[]): Promise<void> => {
    const { data: existing } = await supabase.from('users').select('id')
    const existingIds = new Set((existing ?? []).map((r) => r.id as string))
    const nextIds = new Set(users.map((u) => u.id))
    const toDelete = [...existingIds].filter((id) => !nextIds.has(id))
    if (toDelete.length) {
      await supabase.from('users').delete().in('id', toDelete)
    }
    if (users.length) {
      await supabase.from('users').upsert(
        users.map((u) => ({
          id: u.id,
          username: u.username,
          created_at: u.createdAt,
          data: u,
        })),
      )
    }
  },
  hasUsers: async (): Promise<boolean> => {
    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
    return (count ?? 0) > 0
  },

  // Session (محلي لهذا المتصفح فقط)
  getSessionId: (): string | null =>
    readLocal<string | null>(LOCAL_KEYS.session, null),
  setSessionId: (id: string | null): void =>
    writeLocal(LOCAL_KEYS.session, id),

  // Audit
  getAudit: async (): Promise<AuditEntry[]> => {
    const { data, error } = await supabase
      .from('audit_log')
      .select('data')
      .order('timestamp', { ascending: false })
      .limit(500)
    if (error || !data) return []
    return data.map((row) => row.data as AuditEntry)
  },
  addAuditEntry: async (entry: AuditEntry): Promise<void> => {
    await supabase
      .from('audit_log')
      .insert({ id: entry.id, timestamp: entry.timestamp, data: entry })
  },

  // Scans
  getScans: async (): Promise<ScanResult[]> => {
    const { data, error } = await supabase
      .from('scans')
      .select('data')
      .order('timestamp', { ascending: false })
      .limit(20)
    if (error || !data) return []
    return data.map((row) => row.data as ScanResult)
  },
  addScan: async (scan: ScanResult): Promise<void> => {
    await supabase
      .from('scans')
      .insert({ id: scan.id, timestamp: scan.timestamp, data: scan })
    // أبقِ آخر 20 فحص فقط
    const { data } = await supabase
      .from('scans')
      .select('id')
      .order('timestamp', { ascending: false })
    const ids = (data ?? []).map((r) => r.id as string)
    if (ids.length > 20) {
      await supabase.from('scans').delete().in('id', ids.slice(20))
    }
  },
  clearScans: async (): Promise<void> => {
    await supabase.from('scans').delete().neq('id', '')
  },

  // Vulnerabilities
  getVulns: async (): Promise<Vulnerability[]> => {
    const { data, error } = await supabase
      .from('vulnerabilities')
      .select('data')
      .limit(200)
    if (error || !data) return []
    return data.map((row) => row.data as Vulnerability)
  },
  addVulns: async (vulns: Vulnerability[]): Promise<void> => {
    if (!vulns.length) return
    await supabase
      .from('vulnerabilities')
      .upsert(vulns.map((v) => ({ id: v.id, data: v })))
    // أبقِ آخر 200 ثغرة فقط
    const { data } = await supabase.from('vulnerabilities').select('id')
    const ids = (data ?? []).map((r) => r.id as string)
    if (ids.length > 200) {
      await supabase
        .from('vulnerabilities')
        .delete()
        .in('id', ids.slice(0, ids.length - 200))
    }
  },
  updateVulnStatus: async (
    id: string,
    status: 'open' | 'fixed',
  ): Promise<void> => {
    const { data } = await supabase
      .from('vulnerabilities')
      .select('data')
      .eq('id', id)
      .single()
    if (!data) return
    const updated = { ...(data.data as Vulnerability), status }
    await supabase.from('vulnerabilities').update({ data: updated }).eq('id', id)
  },
  clearVulns: async (): Promise<void> => {
    await supabase.from('vulnerabilities').delete().neq('id', '')
  },

  archiveOpenVulns: async (): Promise<void> => {
    const { data, error } = await supabase
      .from('vulnerabilities')
      .select('id, data')
    if (error || !data) return
    const toArchive = data.filter((row) => !(row.data as Vulnerability).archived)
    if (!toArchive.length) return
    await supabase.from('vulnerabilities').upsert(
      toArchive.map((row) => ({
        id: row.id,
        data: { ...(row.data as Vulnerability), archived: true },
      })),
    )
  },

  // حذف ثغرة واحدة نهائياً (من الأرشيف أو من الثغرات الحالية)
  deleteVuln: async (id: string): Promise<void> => {
    await supabase.from('vulnerabilities').delete().eq('id', id)
  },

  // Data mode: 'real' | 'demo' (تفضيل واجهة محلي)
  getDataMode: (): 'real' | 'demo' =>
    readLocal<'real' | 'demo'>(LOCAL_KEYS.dataMode, 'demo'),
  setDataMode: (mode: 'real' | 'demo'): void =>
    writeLocal(LOCAL_KEYS.dataMode, mode),
}

export function uid(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return prefix ? `${prefix}_${rand}` : rand
}
