'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Facebook,
  Youtube,
  Globe,
  FileSpreadsheet,
  Calendar,
  Mail,
  Code2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plug,
  Loader2,
  Copy,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/crm/utils'
import { useReadOnlyViewer } from '@/lib/crm/use-read-only-viewer'

// ─── Types ─────────────────────────────────────────────────────────────────────

type IntegrationStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR'

interface Integration {
  id: string
  type: string
  label: string
  description: string
  icon: React.ReactNode
  status: IntegrationStatus
  lastSyncAt?: string | null
  connectHref?: string
  webhookUrl?: string
  isWebhookBased?: boolean
}

// ─── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: IntegrationStatus }) {
  if (status === 'CONNECTED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        Connected
      </span>
    )
  }
  if (status === 'ERROR') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <AlertCircle className="h-3 w-3" />
        Error
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
      <XCircle className="h-3 w-3" />
      Disconnected
    </span>
  )
}

// ─── Integration card ──────────────────────────────────────────────────────────

interface IntegrationCardProps {
  integration: Integration
  onConnect: (type: string) => void
  onDisconnect: (type: string) => void
  branchId?: string
  domain: string
  readOnly?: boolean
}

function IntegrationCard({ integration, onConnect, onDisconnect, branchId, domain, readOnly = false }: IntegrationCardProps) {
  const [copied, setCopied] = useState(false)
  const isConnected = integration.status === 'CONNECTED'

  const webhookUrl = integration.webhookUrl
    ? integration.webhookUrl.replace('[domain]', domain).replace('[branchId]', branchId ?? 'your-branch-id')
    : undefined

  async function copyWebhook() {
    if (!webhookUrl) return
    await navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {integration.icon}
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
              {integration.label}
            </h3>
            <StatusBadge status={integration.status} />
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 flex-1">
        {integration.description}
      </p>

      {/* Last sync */}
      {integration.lastSyncAt && (
        <p className="text-xs text-slate-400 mb-3">
          Last sync: {new Date(integration.lastSyncAt).toLocaleString('en-MY')}
        </p>
      )}

      {/* Webhook URL */}
      {integration.isWebhookBased && webhookUrl && (
        <div className="mb-3">
          <p className="text-xs font-medium text-slate-500 mb-1">Webhook URL</p>
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800">
            <code className="flex-1 truncate text-xs text-slate-700 dark:text-slate-300">
              {webhookUrl}
            </code>
            <button onClick={copyWebhook} className="shrink-0 text-slate-400 hover:text-slate-600">
              {copied ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Action — hidden for read-only viewers (status badge above still shows). */}
      <div className="flex gap-2">
        {readOnly ? null : integration.type === 'WEBSITE_FORM' ? (
          <a
            href="/crm/settings/forms"
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <Code2 className="h-3.5 w-3.5" />
            Create Form
          </a>
        ) : isConnected ? (
          <button
            onClick={() => onDisconnect(integration.type)}
            className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors"
          >
            <Plug className="h-3.5 w-3.5" />
            Disconnect
          </button>
        ) : (
          <button
            onClick={() => onConnect(integration.type)}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Connect
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function IntegrationsPageClient() {
  const readOnly = useReadOnlyViewer()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [branchId, setBranchId] = useState<string | undefined>(undefined)
  const domain =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-domain.com'

  // Show success toast on OAuth redirect
  useEffect(() => {
    const connected = searchParams.get('connected')
    if (connected) {
      toast.success(`${connected.toUpperCase()} connected successfully!`)
      router.replace('/crm/integrations')
    }
  }, [searchParams, router])

  // Fetch integrations
  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true)
        const res = await fetch('/api/crm/integrations')
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json() as { integrations: Array<{ type: string; status: IntegrationStatus; lastSyncAt: string | null }>; branchId: string }
        setBranchId(data.branchId)

        const statusMap = new Map(data.integrations.map((i) => [i.type, i]))

        const getStatus = (type: string): IntegrationStatus =>
          statusMap.get(type)?.status ?? 'DISCONNECTED'
        const getLastSync = (type: string): string | null =>
          statusMap.get(type)?.lastSyncAt ?? null

        setIntegrations([
          {
            id: 'meta',
            type: 'META',
            label: 'Meta Business (Facebook & Instagram)',
            description: 'Sync leads from Meta Lead Ads directly into the CRM. Requires Facebook Business Manager access.',
            icon: <Facebook className="h-5 w-5 text-blue-600" />,
            status: getStatus('META'),
            lastSyncAt: getLastSync('META'),
            connectHref: '/api/crm/integrations/meta/connect',
          },
          {
            id: 'tiktok',
            type: 'TIKTOK',
            label: 'TikTok Business',
            description: 'Import leads from TikTok Lead Generation campaigns automatically.',
            icon: <Youtube className="h-5 w-5 text-pink-600" />,
            status: getStatus('TIKTOK'),
            lastSyncAt: getLastSync('TIKTOK'),
            connectHref: '/api/crm/integrations/tiktok/connect',
          },
          {
            id: 'wix',
            type: 'WIX',
            label: 'Wix',
            description: 'Receive form submissions from your Wix website via webhook.',
            icon: <Globe className="h-5 w-5 text-violet-600" />,
            status: getStatus('WIX'),
            lastSyncAt: getLastSync('WIX'),
            isWebhookBased: true,
            webhookUrl: `[domain]/api/webhooks/wix/[branchId]`,
          },
          {
            id: 'google',
            type: 'GOOGLE_FORMS',
            label: 'Google Forms / Sheets',
            description: 'Sync responses from Google Forms (via connected Sheets) into the CRM.',
            icon: <FileSpreadsheet className="h-5 w-5 text-green-600" />,
            status: getStatus('GOOGLE_FORMS'),
            lastSyncAt: getLastSync('GOOGLE_FORMS'),
            connectHref: '/api/crm/integrations/google/connect',
          },
          {
            id: 'google_cal',
            type: 'GOOGLE_CALENDAR',
            label: 'Google Calendar',
            description: 'Sync CRM appointments with Google Calendar. Two-way sync for events.',
            icon: <Calendar className="h-5 w-5 text-red-500" />,
            status: getStatus('GOOGLE_CALENDAR'),
            lastSyncAt: getLastSync('GOOGLE_CALENDAR'),
            connectHref: '/api/crm/integrations/google/connect',
          },
          {
            id: 'outlook',
            type: 'OUTLOOK',
            label: 'Outlook / Microsoft 365',
            description: 'Sync appointments with Outlook Calendar via Microsoft Graph API.',
            icon: <Mail className="h-5 w-5 text-blue-500" />,
            status: getStatus('OUTLOOK'),
            lastSyncAt: getLastSync('OUTLOOK'),
            connectHref: '/api/crm/integrations/outlook/connect',
          },
          {
            id: 'website_form',
            type: 'WEBSITE_FORM',
            label: 'Website Form',
            description: 'Embed a lead capture form on any website using an iframe snippet.',
            icon: <Code2 className="h-5 w-5 text-slate-600" />,
            status: 'CONNECTED',
          },
        ])
      } catch (err) {
        console.error(err)
        toast.error('Failed to load integrations')
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [])

  function handleConnect(type: string) {
    const integration = integrations.find((i) => i.type === type)
    if (integration?.connectHref) {
      window.location.href = integration.connectHref
    }
  }

  async function handleDisconnect(type: string) {
    try {
      const res = await fetch(`/api/crm/integrations/${type.toLowerCase()}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed')
      setIntegrations((prev) =>
        prev.map((i) =>
          i.type === type ? { ...i, status: 'DISCONNECTED', lastSyncAt: null } : i,
        ),
      )
      toast.success('Integration disconnected')
    } catch {
      toast.error('Failed to disconnect')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Integrations</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Integrations</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Connect external platforms to automatically import leads and sync data.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => (
          <IntegrationCard
            key={integration.id}
            integration={integration}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            branchId={branchId}
            domain={domain}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  )
}
