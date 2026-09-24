'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { logAudit } from './audit'
import { hashPassword, verifyPassword } from './crypto'
import { store, uid } from './storage'
import type { Permission, Role, User } from './types'

export const ALL_PERMISSIONS: Permission[] = [
  'dashboard',
  'encryption',
  'network',
  'monitor',
  'vulnerabilities',
  'users',
  'audit',
  'reports',
]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL_PERMISSIONS,
  analyst: ['dashboard', 'encryption', 'network', 'monitor', 'vulnerabilities', 'reports'],
  viewer: ['dashboard', 'reports'],
}

// حساب المدير الافتراضي عند أول تشغيل
const SEED_ADMIN = {
  username: 'ameen',
  displayName: 'ameen',
  password: 'ameen 123',
} as const

interface AuthState {
  ready: boolean
  currentUser: User | null
  users: User[]
  login: (
    username: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  addUser: (
    data: Omit<User, 'id' | 'createdAt'>,
  ) => Promise<{ ok: boolean; error?: string }>
  updateUser: (id: string, patch: Partial<User>) => Promise<void>
  deleteUser: (id: string) => Promise<void>
  can: (perm: Permission) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let u = await store.getUsers()
      // بذرة تلقائية: عند عدم وجود أي مستخدم في قاعدة البيانات، أنشئ حساب
      if (u.length === 0) {
        const admin: User = {
          id: uid('usr'),
          username: SEED_ADMIN.username,
          displayName: SEED_ADMIN.displayName,
          password: await hashPassword(SEED_ADMIN.password),
          role: 'admin',
          permissions: ROLE_PERMISSIONS.admin,
          createdAt: Date.now(),
          active: true,
        }
        await store.setUsers([admin])
        void logAudit(admin.username, 'setup', 'تم إنشاء حساب مدير النظام الأول')
        u = [admin]
      }
      if (cancelled) return
      setUsers(u)
      const sid = store.getSessionId()
      if (sid) {
        const found = u.find((x) => x.id === sid) ?? null
        setCurrentUser(found)
      }
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const persistUsers = useCallback(async (next: User[]) => {
    setUsers(next)
    await store.setUsers(next)
  }, [])

  const login = useCallback(
    async (username: string, password: string) => {
      const found = users.find(
        (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
      )
      if (!found) return { ok: false, error: 'اسم المستخدم غير موجود' }
      if (!found.active) return { ok: false, error: 'الحساب معطّل' }
      if (!(await verifyPassword(password, found.password)))
        return { ok: false, error: 'كلمة المرور غير صحيحة' }
      store.setSessionId(found.id)
      setCurrentUser(found)
      void logAudit(found.username, 'login', 'تسجيل دخول ناجح')
      return { ok: true }
    },
    [users],
  )

  const logout = useCallback(async () => {
    if (currentUser) void logAudit(currentUser.username, 'logout', 'تسجيل خروج')
    store.setSessionId(null)
    setCurrentUser(null)
  }, [currentUser])

  const addUser = useCallback(
    async (data: Omit<User, 'id' | 'createdAt'>) => {
      if (
        users.some(
          (u) => u.username.toLowerCase() === data.username.toLowerCase(),
        )
      ) {
        return { ok: false, error: 'اسم المستخدم مستخدم بالفعل' }
      }
      const newUser: User = {
        ...data,
        password: await hashPassword(data.password),
        id: uid('usr'),
        createdAt: Date.now(),
      }
      await persistUsers([...users, newUser])
      void logAudit(
        currentUser?.username ?? 'system',
        'user_add',
        `إضافة المستخدم "${newUser.username}" بصلاحية ${newUser.role}`,
      )
      return { ok: true }
    },
    [users, persistUsers, currentUser],
  )

  const updateUser = useCallback(
    async (id: string, patch: Partial<User>) => {
      const resolvedPatch = patch.password
        ? { ...patch, password: await hashPassword(patch.password) }
        : patch
      const next = users.map((u) =>
        u.id === id ? { ...u, ...resolvedPatch } : u,
      )
      await persistUsers(next)
      const target = next.find((u) => u.id === id)
      if (currentUser?.id === id && target) setCurrentUser(target)
      void logAudit(
        currentUser?.username ?? 'system',
        'user_edit',
        `تعديل المستخدم "${target?.username ?? id}"`,
      )
    },
    [users, persistUsers, currentUser],
  )

  const deleteUser = useCallback(
    async (id: string) => {
      const target = users.find((u) => u.id === id)
      await persistUsers(users.filter((u) => u.id !== id))
      void logAudit(
        currentUser?.username ?? 'system',
        'user_delete',
        `حذف المستخدم "${target?.username ?? id}"`,
      )
    },
    [users, persistUsers, currentUser],
  )

  const can = useCallback(
    (perm: Permission) => {
      if (!currentUser) return false
      // إن أي صلاحية جديدة تُضاف للنظام تظهر تلقائياً للمستخدمين الحاليين
      const rolePerms = ROLE_PERMISSIONS[currentUser.role] ?? []
      const combined = new Set([...currentUser.permissions, ...rolePerms])
      return combined.has(perm)
    },
    [currentUser],
  )

  const value = useMemo<AuthState>(
    () => ({
      ready,
      currentUser,
      users,
      login,
      logout,
      addUser,
      updateUser,
      deleteUser,
      can,
    }),
    [
      ready,
      users,
      currentUser,
      login,
      logout,
      addUser,
      updateUser,
      deleteUser,
      can,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
