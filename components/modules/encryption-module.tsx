'use client'

import { useRef, useState } from 'react'
import {
  ArrowLeftRight,
  Copy,
  Download,
  File as FileIcon,
  Key,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldAlert,
  Unlock,
  UploadCloud,
} from 'lucide-react'
import { toast } from 'sonner'
import { logAudit } from '@/lib/audit'
import { useAuth } from '@/lib/auth-context'
import {
  aesDecrypt,
  aesDecryptFile,
  aesEncrypt,
  aesEncryptFile,
  randomPassphrase,
  rsaDecrypt,
  rsaEncrypt,
  rsaGenerateKeyPair,
  rsaMaxBytes,
} from '@/lib/crypto'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

function copy(text: string) {
  navigator.clipboard.writeText(text)
  toast.success('تم النسخ')
}

export function EncryptionModule() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">التشفير وفك التشفير</h1>
        <p className="text-sm text-muted-foreground">
          عمليات تشفير حقيقية تعمل بالكامل داخل متصفحك عبر Web Crypto API — لا
          تُرسَل بياناتك إلى أي خادم.
        </p>
      </div>

      <Tabs defaultValue="aes">
        <TabsList>
          <TabsTrigger value="aes" className="gap-2">
            <Lock className="size-4" />
            متماثل — AES
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-2">
            <FileIcon className="size-4" />
            تشفير ملفات
          </TabsTrigger>
          <TabsTrigger value="rsa" className="gap-2">
            <KeyRound className="size-4" />
            غير متماثل — RSA
          </TabsTrigger>
        </TabsList>
        <TabsContent value="aes" className="mt-4">
          <AesPanel />
        </TabsContent>
        <TabsContent value="files" className="mt-4">
          <FilePanel />
        </TabsContent>
        <TabsContent value="rsa" className="mt-4">
          <RsaPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AesPanel() {
  const { currentUser } = useAuth()
  const [mode, setMode] = useState<'encrypt' | 'decrypt'>('encrypt')
  const [passphrase, setPassphrase] = useState('')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (!passphrase) {
      toast.error('أدخل مفتاح/عبارة المرور')
      return
    }
    if (!input.trim()) {
      toast.error('أدخل النص')
      return
    }
    setBusy(true)
    try {
      if (mode === 'encrypt') {
        const res = await aesEncrypt(input, passphrase)
        setOutput(res)
        logAudit(currentUser?.username ?? '-', 'encrypt', 'تشفير نص بخوارزمية AES-256-GCM')
      } else {
        const res = await aesDecrypt(input, passphrase)
        setOutput(res)
        logAudit(currentUser?.username ?? '-', 'decrypt', 'فك تشفير نص AES-256-GCM')
      }
    } catch {
      toast.error(
        mode === 'decrypt'
          ? 'فشل فك التشفير — تحقق من المفتاح أو صحة النص المشفّر'
          : 'حدث خطأ أثناء التشفير',
      )
      setOutput('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="size-4 text-primary" />
          التشفير المتماثل (AES-256-GCM)
        </CardTitle>
        <CardDescription>
          مفتاح واحد للتشفير وفك التشفير. يُشتق مفتاح 256-بت من عبارة المرور
          باستخدام PBKDF2 (‏150,000 دورة) مع مِلح عشوائي لكل عملية.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 space-y-2">
            <Label>مفتاح التشفير (عبارة مرور)</Label>
            <div className="flex gap-2">
              <Input
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                dir="ltr"
                className="text-left font-mono"
                placeholder="أدخل المفتاح السري"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setPassphrase(randomPassphrase())}
                aria-label="توليد مفتاح عشوائي"
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </div>
          <Select value={mode} onValueChange={(v) => setMode(v as 'encrypt' | 'decrypt')}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="encrypt">تشفير</SelectItem>
              <SelectItem value="decrypt">فك تشفير</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{mode === 'encrypt' ? 'النص الأصلي' : 'النص المشفّر (Base64)'}</Label>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            dir={mode === 'encrypt' ? 'auto' : 'ltr'}
            className={mode === 'decrypt' ? 'font-mono text-left text-xs' : ''}
          />
        </div>

        <Button onClick={run} disabled={busy} className="gap-2">
          {mode === 'encrypt' ? <Lock className="size-4" /> : <Unlock className="size-4" />}
          {busy ? 'جارٍ المعالجة...' : mode === 'encrypt' ? 'تشفير' : 'فك التشفير'}
        </Button>

        {output && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>النتيجة</Label>
              <Button variant="ghost" size="sm" onClick={() => copy(output)} className="gap-1.5">
                <Copy className="size-3.5" />
                نسخ
              </Button>
            </div>
            <Textarea
              readOnly
              value={output}
              rows={4}
              dir={mode === 'decrypt' ? 'auto' : 'ltr'}
              className={mode === 'encrypt' ? 'font-mono text-left text-xs' : ''}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function FilePanel() {
  const { currentUser } = useAuth()
  const [mode, setMode] = useState<'encrypt' | 'decrypt'>('encrypt')
  const [passphrase, setPassphrase] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [resultName, setResultName] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setFile(null)
    if (resultUrl) URL.revokeObjectURL(resultUrl)
    setResultUrl(null)
    setResultName('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const run = async () => {
    if (!file) {
      toast.error('اختر ملفاً أولاً')
      return
    }
    if (!passphrase) {
      toast.error('أدخل كلمة المرور')
      return
    }
    setBusy(true)
    if (resultUrl) URL.revokeObjectURL(resultUrl)
    setResultUrl(null)

    try {
      const buffer = await file.arrayBuffer()

      if (mode === 'encrypt') {
        const encrypted = await aesEncryptFile(buffer, passphrase, file.name)
        const blob = new Blob([encrypted], { type: 'application/octet-stream' })
        setResultUrl(URL.createObjectURL(blob))
        setResultName(`${file.name}.enc`)
        logAudit(
          currentUser?.username ?? '-',
          'encrypt',
          `تشفير ملف حقيقي (AES-256-GCM): ${file.name} (${(file.size / 1024).toFixed(1)} كيلوبايت)`,
        )
        toast.success('تم تشفير الملف — اضغط تنزيل للحصول عليه')
      } else {
        const { data, originalName } = await aesDecryptFile(buffer, passphrase)
        const blob = new Blob([data])
        setResultUrl(URL.createObjectURL(blob))
        setResultName(originalName || file.name.replace(/\.enc$/, ''))
        logAudit(
          currentUser?.username ?? '-',
          'decrypt',
          `فك تشفير ملف حقيقي: ${file.name} → ${originalName}`,
        )
        toast.success('تم فك تشفير الملف بنجاح')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشلت العملية')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileIcon className="size-4 text-primary" />
          تشفير وفك تشفير الملفات (AES-256-GCM حقيقي)
        </CardTitle>
        <CardDescription>
          يعمل بالكامل داخل متصفحك عبر Web Crypto API — الملف وكلمة المرور لا
          يغادران جهازك أبداً، ولا يمرّان بأي خادم. استخدم نفس كلمة المرور
          لفك التشفير لاحقاً.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 space-y-2">
            <Label>كلمة المرور</Label>
            <div className="flex gap-2">
              <Input
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                type="password"
                dir="ltr"
                className="text-left font-mono"
                placeholder="أدخل كلمة مرور قوية"
              />
              {mode === 'encrypt' && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setPassphrase(randomPassphrase())}
                  aria-label="توليد كلمة مرور عشوائية"
                >
                  <RefreshCw className="size-4" />
                </Button>
              )}
            </div>
          </div>
          <Select
            value={mode}
            onValueChange={(v) => {
              setMode(v as 'encrypt' | 'decrypt')
              reset()
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="encrypt">تشفير ملف</SelectItem>
              <SelectItem value="decrypt">فك تشفير ملف</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{mode === 'encrypt' ? 'الملف المراد تشفيره' : 'الملف المشفّر (.enc)'}</Label>
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-4">
            <UploadCloud className="size-5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm file:ml-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground"
            />
          </div>
          {file && (
            <p className="text-xs text-muted-foreground">
              {file.name} — {(file.size / 1024).toFixed(1)} كيلوبايت
            </p>
          )}
        </div>

        {mode === 'decrypt' && (
          <div className="flex items-start gap-2 rounded-lg border border-severity-medium/30 bg-severity-medium/5 p-3 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
            كلمة مرور خاطئة تعني فشل فك التشفير تماماً ولن تُسترجع البيانات —
            لا يوجد "استرجاع بدون كلمة المرور" حتى من مطوّري هذا البرنامج،
            لأن التشفير حقيقي ولا يُخزَّن أي نسخة من كلمة المرور بأي مكان.
          </div>
        )}

        <Button onClick={run} disabled={busy || !file} className="gap-2">
          {mode === 'encrypt' ? <Lock className="size-4" /> : <Unlock className="size-4" />}
          {busy ? 'جارٍ المعالجة...' : mode === 'encrypt' ? 'تشفير الملف' : 'فك تشفير الملف'}
        </Button>

        {resultUrl && (
          <div className="flex items-center justify-between rounded-lg border border-severity-low/40 bg-severity-low/5 p-3">
            <div className="text-sm">
              <div className="font-medium">جاهز: {resultName}</div>
              <div className="text-xs text-muted-foreground">
                {mode === 'encrypt' ? 'الملف المشفّر' : 'الملف الأصلي بعد فك التشفير'}
              </div>
            </div>
            <a
              href={resultUrl}
              download={resultName}
              className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}
            >
              <Download className="size-3.5" />
              تنزيل
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RsaPanel() {
  const { currentUser } = useAuth()
  const [modulus, setModulus] = useState<'2048' | '4096'>('2048')
  const [publicKey, setPublicKey] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [generating, setGenerating] = useState(false)

  const [mode, setMode] = useState<'encrypt' | 'decrypt'>('encrypt')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [busy, setBusy] = useState(false)

  const generate = async () => {
    setGenerating(true)
    try {
      const pair = await rsaGenerateKeyPair(Number(modulus) as 2048 | 4096)
      setPublicKey(pair.publicKey)
      setPrivateKey(pair.privateKey)
      logAudit(currentUser?.username ?? '-', 'keygen', `توليد زوج مفاتيح RSA-${modulus}`)
      toast.success('تم توليد زوج المفاتيح')
    } catch {
      toast.error('تعذّر توليد المفاتيح')
    } finally {
      setGenerating(false)
    }
  }

  const run = async () => {
    if (!input.trim()) {
      toast.error('أدخل النص')
      return
    }
    setBusy(true)
    try {
      if (mode === 'encrypt') {
        if (!publicKey.trim()) {
          toast.error('المفتاح العام مطلوب للتشفير')
          return
        }
        const max = rsaMaxBytes(Number(modulus) as 2048 | 4096)
        if (new TextEncoder().encode(input).length > max) {
          toast.error(`النص أطول من الحد الأقصى لـ RSA (${max} بايت). استخدم AES للنصوص الطويلة.`)
          return
        }
        const res = await rsaEncrypt(input, publicKey)
        setOutput(res)
        logAudit(currentUser?.username ?? '-', 'encrypt', `تشفير بالمفتاح العام RSA-${modulus}`)
      } else {
        if (!privateKey.trim()) {
          toast.error('المفتاح الخاص مطلوب لفك التشفير')
          return
        }
        const res = await rsaDecrypt(input, privateKey)
        setOutput(res)
        logAudit(currentUser?.username ?? '-', 'decrypt', `فك تشفير بالمفتاح الخاص RSA-${modulus}`)
      }
    } catch {
      toast.error('فشلت العملية — تحقق من المفاتيح وصحة النص')
      setOutput('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="size-4 text-primary" />
            زوج المفاتيح (عام + خاص)
          </CardTitle>
          <CardDescription>
            المفتاح العام للتشفير ويمكن مشاركته. المفتاح الخاص لفك التشفير ويجب
            حفظه بسرية تامة.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label>طول المفتاح</Label>
              <Select value={modulus} onValueChange={(v) => setModulus(v as '2048' | '4096')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2048">RSA 2048-bit</SelectItem>
                  <SelectItem value="4096">RSA 4096-bit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generate} disabled={generating} className="gap-2">
              <RefreshCw className={`size-4 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'جارٍ التوليد...' : 'توليد المفاتيح'}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>المفتاح العام</Label>
              {publicKey && (
                <Button variant="ghost" size="sm" onClick={() => copy(publicKey)} className="gap-1.5">
                  <Copy className="size-3.5" />
                  نسخ
                </Button>
              )}
            </div>
            <Textarea
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              rows={5}
              dir="ltr"
              className="font-mono text-left text-[11px]"
              placeholder="-----BEGIN PUBLIC KEY-----"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>المفتاح الخاص</Label>
              {privateKey && (
                <Button variant="ghost" size="sm" onClick={() => copy(privateKey)} className="gap-1.5">
                  <Copy className="size-3.5" />
                  نسخ
                </Button>
              )}
            </div>
            <Textarea
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              rows={5}
              dir="ltr"
              className="font-mono text-left text-[11px]"
              placeholder="-----BEGIN PRIVATE KEY-----"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowLeftRight className="size-4 text-primary" />
            التشفير / فك التشفير
          </CardTitle>
          <CardDescription>
            RSA-OAEP مع SHA-256. مناسب للنصوص القصيرة والمفاتيح؛ للبيانات الكبيرة
            استخدم AES.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={mode} onValueChange={(v) => setMode(v as 'encrypt' | 'decrypt')}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="encrypt">تشفير (بالمفتاح العام)</SelectItem>
              <SelectItem value="decrypt">فك تشفير (بالمفتاح الخاص)</SelectItem>
            </SelectContent>
          </Select>

          <div className="space-y-2">
            <Label>{mode === 'encrypt' ? 'النص الأصلي' : 'النص المشفّر (Base64)'}</Label>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={4}
              dir={mode === 'encrypt' ? 'auto' : 'ltr'}
              className={mode === 'decrypt' ? 'font-mono text-left text-xs' : ''}
            />
          </div>

          <Button onClick={run} disabled={busy} className="gap-2">
            {mode === 'encrypt' ? <Lock className="size-4" /> : <Unlock className="size-4" />}
            {busy ? 'جارٍ المعالجة...' : mode === 'encrypt' ? 'تشفير' : 'فك التشفير'}
          </Button>

          {output && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>النتيجة</Label>
                <Button variant="ghost" size="sm" onClick={() => copy(output)} className="gap-1.5">
                  <Copy className="size-3.5" />
                  نسخ
                </Button>
              </div>
              <Textarea
                readOnly
                value={output}
                rows={4}
                dir={mode === 'decrypt' ? 'auto' : 'ltr'}
                className={mode === 'encrypt' ? 'font-mono text-left text-xs' : ''}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
