import { NextResponse } from 'next/server'
import os from 'node:os'
import { getOwnIpAddresses } from '@/lib/server-net'

export async function GET() {
  return NextResponse.json({
    addresses: getOwnIpAddresses(),
    hostname: os.hostname(),
    platform: os.platform(),
  })
}
