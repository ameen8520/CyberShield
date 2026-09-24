'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { store } from './storage'
import type { ScanResult, Vulnerability } from './types'

interface DataState {
  scans: ScanResult[]
  vulns: Vulnerability[]
  dataMode: 'real' | 'demo'
  latestScan: ScanResult | null
  addScan: (scan: ScanResult, vulns: Vulnerability[]) => Promise<void>
  setVulnStatus: (id: string, status: 'open' | 'fixed') => Promise<void>
  deleteVuln: (id: string) => Promise<void>
  setDataMode: (mode: 'real' | 'demo') => void
  clearAll: () => Promise<void>
}

const DataContext = createContext<DataState | null>(null)

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [scans, setScans] = useState<ScanResult[]>([])
  const [vulns, setVulns] = useState<Vulnerability[]>([])
  const [dataMode, setDataModeState] = useState<'real' | 'demo'>('demo')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [s, v] = await Promise.all([store.getScans(), store.getVulns()])
      if (cancelled) return
      setScans(s)
      setVulns(v)
      setDataModeState(store.getDataMode())
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const addScan = useCallback(
    async (scan: ScanResult, newVulns: Vulnerability[]) => {
      setScans((prev) => [scan, ...prev].slice(0, 20))
      setVulns((prev) => [
        ...newVulns,
        ...prev.map((v) => (v.archived ? v : { ...v, archived: true })),
      ].slice(0, 200))
      await store.addScan(scan)
      await store.archiveOpenVulns()
      await store.addVulns(newVulns)
    },
    [],
  )

  const setVulnStatus = useCallback(
    async (id: string, status: 'open' | 'fixed') => {
      setVulns((prev) => prev.map((v) => (v.id === id ? { ...v, status } : v)))
      await store.updateVulnStatus(id, status)
    },
    [],
  )

  const deleteVuln = useCallback(async (id: string) => {
    setVulns((prev) => prev.filter((v) => v.id !== id))
    await store.deleteVuln(id)
  }, [])

  const setDataMode = useCallback((mode: 'real' | 'demo') => {
    setDataModeState(mode)
    store.setDataMode(mode)
  }, [])

  const clearAll = useCallback(async () => {
    setScans([])
    setVulns([])
    await Promise.all([store.clearScans(), store.clearVulns()])
  }, [])

  const value = useMemo<DataState>(
    () => ({
      scans,
      vulns,
      dataMode,
      latestScan: scans[0] ?? null,
      addScan,
      setVulnStatus,
      deleteVuln,
      setDataMode,
      clearAll,
    }),
    [scans, vulns, dataMode, addScan, setVulnStatus, deleteVuln, setDataMode, clearAll],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataState {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
