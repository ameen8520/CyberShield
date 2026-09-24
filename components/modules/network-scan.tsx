'use client'

import { Globe, Radar } from 'lucide-react'
import { LocalScan } from '@/components/modules/local-scan'
import { PublicScan } from '@/components/modules/public-scan'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function NetworkScan() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">فحص الشبكة</h1>
        <p className="text-sm text-muted-foreground">
          اكتشاف الأجهزة والخدمات على شبكتك المحلية، أو تقييم التعرّض الأمني
          لأهداف خارجية (مواقع/ملفات).
        </p>
      </div>

      <Tabs defaultValue="local">
        <TabsList>
          <TabsTrigger value="local" className="gap-2">
            <Radar className="size-4" />
            فحص محلي
          </TabsTrigger>
          <TabsTrigger value="public" className="gap-2">
            <Globe className="size-4" />
            فحص عام
          </TabsTrigger>
        </TabsList>
        <TabsContent value="local" className="mt-4">
          <LocalScan />
        </TabsContent>
        <TabsContent value="public" className="mt-4">
          <PublicScan />
        </TabsContent>
      </Tabs>
    </div>
  )
}
