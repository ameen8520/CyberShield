import type { Vulnerability } from './types'

// نولّد سكربت جاهز للنسخ، المستخدم هو من ينفّذه يدوياً
export function generateRemediationScript(vuln: Vulnerability): {
  windows: string
  linux: string
} {
  const port = vuln.port

  const windowsLines = [
    `# سكربت معالجة: ${vuln.name}`,
    `# نفّذه على الجهاز ${vuln.deviceIp} داخل PowerShell كـ Administrator`,
    '',
  ]
  const linuxLines = [
    `# سكربت معالجة: ${vuln.name}`,
    `# نفّذه على الجهاز ${vuln.deviceIp} عبر SSH بصلاحيات root/sudo`,
    '',
  ]

  if (port) {
    windowsLines.push(
      `New-NetFirewallRule -DisplayName "Block-Port-${port}" -Direction Inbound -LocalPort ${port} -Protocol TCP -Action Block`,
    )
    linuxLines.push(`sudo iptables -A INPUT -p tcp --dport ${port} -j DROP`)
  }

  // خطوات إضافية خاصة بنوع الخدمة، مبنية على وصف الثغرة والسبب التقني
  const text = `${vuln.name} ${vuln.cause}`.toLowerCase()
  if (text.includes('telnet')) {
    windowsLines.push('Disable-WindowsOptionalFeature -Online -FeatureName TelnetClient -NoRestart')
    linuxLines.push('sudo systemctl disable --now telnet.socket')
  }
  if (text.includes('ftp')) {
    windowsLines.push('Stop-Service -Name "FTPSVC" -Force -ErrorAction SilentlyContinue')
    linuxLines.push('sudo systemctl disable --now vsftpd')
  }
  if (text.includes('rdp') || text.includes('3389')) {
    windowsLines.push(
      'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server" -Name "fDenyTSConnections" -Value 1',
    )
  }
  if (text.includes('smb')) {
    windowsLines.push('Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force')
  }

  // خطوات المعالجة النصية العامة المرفقة أصلاً بالثغرة (من التحليل)
  windowsLines.push('', '# خطوات إضافية موصى بها:')
  linuxLines.push('', '# خطوات إضافية موصى بها:')
  vuln.remediation.forEach((step) => {
    windowsLines.push(`# - ${step}`)
    linuxLines.push(`# - ${step}`)
  })

  return { windows: windowsLines.join('\n'), linux: linuxLines.join('\n') }
}
