'use client'

import { useState } from 'react'
import { Eye, EyeOff, Loader2, LogIn, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AuthScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <ShieldCheck className="size-8" />
          </div>
          <h1 className="text-2xl font-bold text-balance">الحصن السيبراني</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            Cyber Shield — منصة أمن سيبراني متكاملة
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}

function LoginForm() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    try {
      const res = await login(username, password)
      if (!res.ok) {
        toast.error(res.error ?? 'تعذر تسجيل الدخول')
        return
      }
      toast.success('مرحباً بعودتك')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>تسجيل الدخول</CardTitle>
        <CardDescription>أدخل بيانات حسابك للمتابعة إلى المنصة.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-user">اسم المستخدم</Label>
            <Input
              id="login-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              dir="ltr"
              className="text-left"
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-pass">كلمة المرور</Label>
            <div className="relative">
              <Input
                id="login-pass"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                dir="ltr"
                className="text-left"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute inset-y-0 left-2 flex items-center text-muted-foreground"
                aria-label="إظهار كلمة المرور"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LogIn className="size-4" />
            )}
            دخول
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
