'use client'

import { useState } from 'react'
import { Shield, Trash2, UserCog, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  useAuth,
} from '@/lib/auth-context'
import type { Permission, Role } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'

const PERM_LABEL: Record<Permission, string> = {
  dashboard: 'لوحة المعلومات',
  encryption: 'التشفير',
  network: 'فحص الشبكة',
  monitor: 'المراقبة اللحظية',
  vulnerabilities: 'الثغرات',
  users: 'المستخدمون',
  audit: 'سجل التدقيق',
  reports: 'التقارير',
}

const ROLE_LABEL: Record<Role, string> = {
  admin: 'مدير النظام',
  analyst: 'محلل أمني',
  viewer: 'مُطّلع',
}

export function UserManagement() {
  const { users, currentUser, addUser, updateUser, deleteUser } = useAuth()
  const isAdmin = currentUser?.role === 'admin'

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Shield className="mx-auto mb-3 size-8 opacity-50" />
          إدارة المستخدمين متاحة لمدير النظام فقط.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">إدارة المستخدمين والصلاحيات</h1>
          <p className="text-sm text-muted-foreground">
            إضافة وحذف المستخدمين وتحديد صلاحيات الوصول لكل وحدة.
          </p>
        </div>
        <AddUserDialog />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">المستخدم</TableHead>
                <TableHead className="text-right">الدور</TableHead>
                <TableHead className="text-right">الصلاحيات</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.displayName}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">
                      @{u.username}
                    </div>
                  </TableCell>
                  <TableCell>{ROLE_LABEL[u.role]}</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {u.permissions.length} من {ALL_PERMISSIONS.length} وحدات
                    </span>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={u.active}
                      disabled={u.id === currentUser?.id}
                      onCheckedChange={(v) => updateUser(u.id, { active: v })}
                      aria-label="تفعيل/تعطيل"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <EditUserDialog userId={u.id} />
                      {u.id !== currentUser?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            deleteUser(u.id)
                            toast.success('تم حذف المستخدم')
                          }}
                          aria-label="حذف"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function PermissionPicker({
  value,
  onChange,
}: {
  value: Permission[]
  onChange: (perms: Permission[]) => void
}) {
  const toggle = (p: Permission) => {
    onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p])
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {ALL_PERMISSIONS.map((p) => (
        <label
          key={p}
          className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-2 text-sm"
        >
          <Checkbox
            checked={value.includes(p)}
            onCheckedChange={() => toggle(p)}
          />
          {PERM_LABEL[p]}
        </label>
      ))}
    </div>
  )
}

function AddUserDialog() {
  const { addUser } = useAuth()
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('analyst')
  const [perms, setPerms] = useState<Permission[]>(ROLE_PERMISSIONS.analyst)

  const onRoleChange = (r: Role) => {
    setRole(r)
    setPerms(ROLE_PERMISSIONS[r])
  }

  const reset = () => {
    setUsername('')
    setDisplayName('')
    setPassword('')
    setRole('analyst')
    setPerms(ROLE_PERMISSIONS.analyst)
  }

  const submit = async () => {
    if (username.trim().length < 3) {
      toast.error('اسم المستخدم قصير جداً')
      return
    }
    if (password.length < 6) {
      toast.error('كلمة المرور يجب ألا تقل عن 6 أحرف')
      return
    }
    const res = await addUser({
      username: username.trim(),
      displayName: displayName.trim() || username.trim(),
      password,
      role,
      permissions: perms,
      active: true,
    })
    if (!res.ok) {
      toast.error(res.error ?? 'تعذر إضافة المستخدم')
      return
    }
    toast.success('تمت إضافة المستخدم')
    reset()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2" />}>
        <UserPlus className="size-4" />
        إضافة مستخدم
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>إضافة مستخدم جديد</DialogTitle>
          <DialogDescription>
            حدّد بيانات الحساب والدور والصلاحيات.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>اسم المستخدم</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                dir="ltr"
                className="text-left"
              />
            </div>
            <div className="space-y-2">
              <Label>الاسم المعروض</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>كلمة المرور</Label>
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
                className="text-left"
              />
            </div>
            <div className="space-y-2">
              <Label>الدور</Label>
              <Select value={role} onValueChange={(v) => onRoleChange(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">مدير النظام</SelectItem>
                  <SelectItem value="analyst">محلل أمني</SelectItem>
                  <SelectItem value="viewer">مُطّلع</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>الصلاحيات</Label>
            <PermissionPicker value={perms} onChange={setPerms} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit}>إضافة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditUserDialog({ userId }: { userId: string }) {
  const { users, updateUser } = useAuth()
  const user = users.find((u) => u.id === userId)!
  const [open, setOpen] = useState(false)
  const [displayName, setDisplayName] = useState(user.displayName)
  const [role, setRole] = useState<Role>(user.role)
  const [perms, setPerms] = useState<Permission[]>(user.permissions)
  const [password, setPassword] = useState('')

  const submit = () => {
    const patch: Partial<typeof user> = {
      displayName: displayName.trim() || user.username,
      role,
      permissions: perms,
    }
    if (password) patch.password = password
    updateUser(userId, patch)
    toast.success('تم تحديث المستخدم')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="icon" aria-label="تعديل" />}
      >
        <UserCog className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>تعديل: {user.displayName}</DialogTitle>
          <DialogDescription dir="ltr" className="text-right">
            @{user.username}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>الاسم المعروض</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>الدور</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">مدير النظام</SelectItem>
                  <SelectItem value="analyst">محلل أمني</SelectItem>
                  <SelectItem value="viewer">مُطّلع</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>كلمة مرور جديدة (اختياري)</Label>
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="اتركه فارغاً للإبقاء على الحالية"
              dir="ltr"
              className="text-left"
            />
          </div>
          <div className="space-y-2">
            <Label>الصلاحيات</Label>
            <PermissionPicker value={perms} onChange={setPerms} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit}>حفظ التغييرات</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
