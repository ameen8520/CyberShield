'use client'

import { uid } from './storage'
import type {
  Device,
  OpenPort,
  ScanResult,
  Severity,
  Vulnerability,
} from './types'

// بيانات وهمية تحاكي نتائج فحص شبكة حقيقي

const VENDORS = [
  { vendor: 'Cisco Systems', prefix: '00:1A:2B' },
  { vendor: 'TP-Link', prefix: '50:C7:BF' },
  { vendor: 'Dell Inc.', prefix: 'F8:BC:12' },
  { vendor: 'Apple, Inc.', prefix: 'AC:BC:32' },
  { vendor: 'Samsung Electronics', prefix: '5C:0A:5B' },
  { vendor: 'Hewlett Packard', prefix: '3C:D9:2B' },
  { vendor: 'Ubiquiti Inc.', prefix: '24:A4:3C' },
  { vendor: 'Raspberry Pi', prefix: 'B8:27:EB' },
]

const OS_LIST = [
  'Linux 5.15 (Ubuntu Server)',
  'Windows Server 2019',
  'Windows 11 Pro',
  'macOS 14 Sonoma',
  'RouterOS 7.x',
  'FreeBSD 13',
  'Debian 12',
  'Android 13',
]

const HOSTNAMES = [
  'gateway',
  'srv-web01',
  'srv-db01',
  'nas-storage',
  'ws-admin',
  'printer-hp',
  'cam-ipc',
  'ap-office',
  'dev-laptop',
  'iot-thermostat',
]

interface PortDef {
  port: number
  service: string
  versions: string[]
  risky?: boolean
}

const PORT_CATALOG: PortDef[] = [
  { port: 21, service: 'FTP', versions: ['vsftpd 2.3.4', 'ProFTPD 1.3.5'], risky: true },
  { port: 22, service: 'SSH', versions: ['OpenSSH 7.4', 'OpenSSH 9.6'] },
  { port: 23, service: 'Telnet', versions: ['Linux telnetd'], risky: true },
  { port: 25, service: 'SMTP', versions: ['Postfix 3.4', 'Exim 4.94'] },
  { port: 80, service: 'HTTP', versions: ['Apache 2.4.29', 'nginx 1.24.0', 'Apache 2.2.15'], risky: true },
  { port: 110, service: 'POP3', versions: ['Dovecot'] },
  { port: 139, service: 'NetBIOS', versions: ['Samba 3.6.3'], risky: true },
  { port: 443, service: 'HTTPS', versions: ['nginx 1.24.0', 'Apache 2.4.57'] },
  { port: 445, service: 'SMB', versions: ['Samba 4.15', 'Windows SMBv1'], risky: true },
  { port: 3306, service: 'MySQL', versions: ['MySQL 5.7.30', 'MariaDB 10.11'], risky: true },
  { port: 3389, service: 'RDP', versions: ['Microsoft Terminal Services'], risky: true },
  { port: 8080, service: 'HTTP-Proxy', versions: ['Jetty 9.4', 'Tomcat 8.5.0'], risky: true },
]

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomMac(prefix: string): string {
  const seg = () => randInt(0, 255).toString(16).padStart(2, '0').toUpperCase()
  return `${prefix}:${seg()}:${seg()}:${seg()}`
}

function baseFromRange(range: string): string {
  // Accept "192.168.1.1 - 192.168.1.254" or "192.168.1.0/24"
  const m = range.match(/(\d+)\.(\d+)\.(\d+)\./)
  return m ? `${m[1]}.${m[2]}.${m[3]}` : '192.168.1'
}

export function runSimulatedScan(
  range: string,
  authorizedBy: string,
): ScanResult {
  const base = baseFromRange(range)
  const count = randInt(5, 9)
  const usedHost = new Set<number>()
  const devices: Device[] = []

  for (let i = 0; i < count; i++) {
    let host = randInt(2, 250)
    while (usedHost.has(host)) host = randInt(2, 250)
    usedHost.add(host)

    const v = rand(VENDORS)
    const portCount = randInt(1, 5)
    const chosen = new Set<number>()
    const openPorts: OpenPort[] = []
    for (let p = 0; p < portCount; p++) {
      const def = rand(PORT_CATALOG)
      if (chosen.has(def.port)) continue
      chosen.add(def.port)
      openPorts.push({
        port: def.port,
        service: def.service,
        version: rand(def.versions),
        banner: `${def.service} — ${rand(def.versions)}`,
      })
    }
    devices.push({
      id: uid('dev'),
      ip: `${base}.${host}`,
      mac: randomMac(v.prefix),
      hostname: `${rand(HOSTNAMES)}-${host}`,
      vendor: v.vendor,
      os: rand(OS_LIST),
      online: true,
      openPorts: openPorts.sort((a, b) => a.port - b.port),
    })
  }

  // gateway
  devices.unshift({
    id: uid('dev'),
    ip: `${base}.1`,
    mac: randomMac('00:1A:2B'),
    hostname: 'gateway',
    vendor: 'Cisco Systems',
    os: 'RouterOS 7.x',
    online: true,
    openPorts: [
      { port: 80, service: 'HTTP', version: 'Router Admin', banner: 'HTTP — Router Admin' },
      { port: 443, service: 'HTTPS', version: 'Router Admin', banner: 'HTTPS — Router Admin' },
    ],
  })

  return {
    id: uid('scan'),
    timestamp: Date.now(),
    range,
    authorizedBy,
    devices: devices.sort(
      (a, b) =>
        Number(a.ip.split('.').pop()) - Number(b.ip.split('.').pop()),
    ),
    durationMs: randInt(4000, 9000),
  }
}

// Vulnerability derivation

interface VulnTemplate {
  match: (port: OpenPort, device: Device) => boolean
  build: (port: OpenPort, device: Device) => Omit<Vulnerability, 'id' | 'deviceIp' | 'location' | 'status'>
}

const TEMPLATES: VulnTemplate[] = [
  {
    match: (p) => p.service === 'FTP',
    build: (p) => ({
      name: 'خدمة FTP بنقل غير مشفّر',
      severity: 'high',
      cause: `المنفذ ${p.port} (FTP) مفتوح وينقل البيانات وبيانات الدخول كنص صريح دون تشفير.`,
      impact: 'يمكن لمهاجم على نفس الشبكة اعتراض أسماء المستخدمين وكلمات المرور والملفات.',
      remediation: [
        'استبدال FTP بـ SFTP أو FTPS المشفّر',
        'إغلاق المنفذ 21 إن لم يكن ضرورياً',
        'تقييد الوصول عبر جدار الحماية إلى عناوين موثوقة',
      ],
      cve: 'CVE-1999-0497',
      port: p.port,
    }),
  },
  {
    match: (p) => p.service === 'Telnet',
    build: (p) => ({
      name: 'بروتوكول Telnet غير آمن',
      severity: 'critical',
      cause: `المنفذ ${p.port} (Telnet) يوفّر تحكماً عن بُعد دون أي تشفير للجلسة.`,
      impact: 'سيطرة كاملة محتملة على الجهاز عند اعتراض بيانات الدخول.',
      remediation: [
        'تعطيل Telnet نهائياً واستخدام SSH (المنفذ 22)',
        'إغلاق المنفذ 23 على جدار الحماية',
      ],
      cve: 'CVE-1999-0619',
      port: p.port,
    }),
  },
  {
    match: (p) => p.version.includes('SMBv1') || p.service === 'SMB',
    build: (p) => ({
      name: 'مشاركة ملفات SMB قديمة',
      severity: p.version.includes('SMBv1') ? 'critical' : 'medium',
      cause: `المنفذ ${p.port} يشغّل ${p.version}. إصدار SMBv1 معرّض لثغرة EternalBlue.`,
      impact: 'تنفيذ تعليمات برمجية عن بُعد وانتشار برمجيات الفدية (مثل WannaCry).',
      remediation: [
        'تعطيل SMBv1 والاعتماد على SMBv3',
        'تركيب تحديثات الأمان MS17-010',
        'تقييد المنفذ 445 داخلياً فقط',
      ],
      cve: 'CVE-2017-0144',
      port: p.port,
    }),
  },
  {
    match: (p) => p.version.includes('Apache 2.2') || p.version.includes('Apache 2.4.29'),
    build: (p) => ({
      name: 'خادم ويب بإصدار قديم',
      severity: 'high',
      cause: `المنفذ ${p.port} يشغّل ${p.version} وهو إصدار قديم به ثغرات معروفة غير مُصلَحة.`,
      impact: 'استغلال ثغرات معروفة قد يؤدي لكشف بيانات أو تنفيذ تعليمات برمجية.',
      remediation: [
        'تحديث خادم الويب لأحدث إصدار مستقر',
        'تفعيل التحديثات الأمنية التلقائية',
        'إخفاء ترويسة الإصدار (Server header)',
      ],
      cve: 'CVE-2021-41773',
      port: p.port,
    }),
  },
  {
    match: (p) => p.service === 'MySQL',
    build: (p) => ({
      name: 'قاعدة بيانات مكشوفة على الشبكة',
      severity: 'high',
      cause: `المنفذ ${p.port} (${p.service}) مفتوح ويسمح بالاتصال المباشر بقاعدة البيانات.`,
      impact: 'محاولات تخمين كلمات المرور والوصول غير المصرّح للبيانات الحساسة.',
      remediation: [
        'ربط قاعدة البيانات على 127.0.0.1 فقط',
        'استخدام جدار حماية لحصر الوصول',
        'فرض كلمات مرور قوية وتعطيل حساب root عن بُعد',
      ],
      port: p.port,
    }),
  },
  {
    match: (p) => p.service === 'RDP',
    build: (p) => ({
      name: 'سطح مكتب بعيد مكشوف (RDP)',
      severity: 'high',
      cause: `المنفذ ${p.port} (RDP) مكشوف ويُعد هدفاً شائعاً لهجمات القوة العمياء.`,
      impact: 'اختراق الحساب والوصول الكامل لسطح المكتب عن بُعد.',
      remediation: [
        'إتاحة RDP عبر VPN فقط',
        'تفعيل مصادقة مستوى الشبكة (NLA)',
        'تفعيل التحقق بخطوتين وحظر المحاولات الفاشلة',
      ],
      cve: 'CVE-2019-0708',
      port: p.port,
    }),
  },
  {
    match: (p, d) => p.service === 'HTTP' && d.hostname === 'gateway',
    build: (p) => ({
      name: 'لوحة إدارة الراوتر ببيانات دخول افتراضية',
      severity: 'critical',
      cause: 'لوحة إدارة جهاز الشبكة متاحة وقد تستخدم بيانات الدخول الافتراضية (admin/admin).',
      impact: 'سيطرة كاملة على إعدادات الشبكة وإعادة توجيه حركة المرور.',
      remediation: [
        'تغيير بيانات الدخول الافتراضية فوراً',
        'تعطيل الإدارة عبر HTTP واستخدام HTTPS',
        'تقييد الوصول للوحة الإدارة من الشبكة الداخلية',
      ],
      port: p.port,
    }),
  },
]

export function deriveVulnerabilities(scan: ScanResult): Vulnerability[] {
  const vulns: Vulnerability[] = []
  for (const device of scan.devices) {
    for (const port of device.openPorts) {
      for (const tpl of TEMPLATES) {
        if (tpl.match(port, device)) {
          const base = tpl.build(port, device)
          vulns.push({
            ...base,
            id: uid('vuln'),
            deviceIp: device.ip,
            location: `${device.hostname} (${device.ip})`,
            status: 'open',
            service: port.service,
            version: port.version,
          })
        }
      }
    }
  }
  return vulns
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 40,
  high: 25,
  medium: 12,
  low: 5,
}

// Security score 0-100 based on open vulnerabilities.
export function computeSecurityScore(vulns: Vulnerability[]): number {
  const open = vulns.filter((v) => v.status === 'open')
  const penalty = open.reduce((sum, v) => sum + SEVERITY_WEIGHT[v.severity], 0)
  return Math.max(0, Math.min(100, 100 - penalty))
}
