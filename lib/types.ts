export type Permission =
  | 'dashboard'
  | 'encryption'
  | 'network'
  | 'monitor'
  | 'vulnerabilities'
  | 'users'
  | 'audit'
  | 'reports'

export type Role = 'admin' | 'analyst' | 'viewer'

export interface User {
  id: string
  username: string
  displayName: string
  password: string // PBKDF2-SHA256 hash ("salt|hash", base64) — never plaintext, see lib/crypto.ts
  role: Role
  permissions: Permission[]
  createdAt: number
  active: boolean
}

export type AuditAction =
  | 'login'
  | 'logout'
  | 'setup'
  | 'user_add'
  | 'user_edit'
  | 'user_delete'
  | 'encrypt'
  | 'decrypt'
  | 'keygen'
  | 'scan_start'
  | 'scan_complete'
  | 'vuln_fix'
  | 'whatif'

export interface AuditEntry {
  id: string
  timestamp: number
  actor: string
  action: AuditAction
  detail: string
}

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface Device {
  id: string
  ip: string
  mac: string
  hostname: string
  vendor: string
  os: string
  online: boolean
  openPorts: OpenPort[]
}

export interface OpenPort {
  port: number
  service: string
  version: string
  banner: string
}

export interface ScanResult {
  id: string
  timestamp: number
  range: string
  authorizedBy: string
  devices: Device[]
  durationMs: number
}

export type FixStatus = 'open' | 'fixed'

export interface Vulnerability {
  id: string
  name: string
  deviceIp: string
  location: string
  severity: Severity
  cause: string
  impact: string
  remediation: string[]
  status: FixStatus
  cve?: string
  port?: number
  service?: string
  version?: string
  archived?: boolean
}

// ---- تثبيت النظام ----
export interface InstallStatus {
  installed: boolean
  installedAt?: number
  installedBy?: string
  host?: string
  checks?: InstallCheck[]
}

export interface InstallCheck {
  key: string
  label: string
  ok: boolean
  detail: string
}

// ---- الفحص العام (مواقع/شبكات بعيدة + ملفات) ----
export interface PublicPort {
  port: number
  open: boolean
  service: string
}

export interface PublicScanResult {
  id: string
  timestamp: number
  target: string
  authorizedBy: string
  resolvedIp: string | null
  http: {
    reachable: boolean
    status: number | null
    server: string | null
    headers: Record<string, string>
    missingSecurityHeaders: string[]
    error?: string
  } | null
  tls: {
    present: boolean
    protocol: string | null
    issuer: string | null
    subject: string | null
    validFrom: string | null
    validTo: string | null
    daysRemaining: number | null
    error?: string
  } | null
  ports: PublicPort[]
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  gradeReasons: string[]
  durationMs: number
}

export interface FileScanResult {
  id: string
  timestamp: number
  fileName: string
  fileSize: number
  detectedType: string
  md5: string
  sha1: string
  sha256: string
  entropy: number
  interestingStrings: string[]
  reputation: {
    checked: boolean
    malicious: number
    suspicious: number
    harmless: number
    undetected: number
    note: string
  }
  riskLevel: 'منخفض' | 'متوسط' | 'مرتفع' | 'غير محدد'
  riskReasons: string[]
}
