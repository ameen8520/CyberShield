import os from 'node:os'

// نجيب كل عناوين IP الخاصة بجهاز السيرفر نفسه
export function getOwnIpAddresses(): string[] {
  const addresses: string[] = ['127.0.0.1', 'localhost']
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4') addresses.push(iface.address)
    }
  }
  return addresses
}

export function isOwnMachine(ip: string): boolean {
  return getOwnIpAddresses().includes(ip)
}
