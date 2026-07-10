'use client'

import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Bell, CheckCheck, BellOff } from 'lucide-react'
import { useNotifications, useMarkNotificationRead, useMarkAllRead } from '@/hooks/crm/useNotifications'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/crm/utils'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  link?: string | null
  readAt?: string | null
  createdAt: string
}

interface NotificationsPageClientProps {
  userId: string
}

export function NotificationsPageClient({ userId: _userId }: NotificationsPageClientProps) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [pushEnabled, setPushEnabled] = useState(false)

  const { data, isLoading } = useNotifications(filter)
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllRead()

  const notifications = ((data as { data?: Notification[] } | undefined)?.data) ?? []

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setPushEnabled(true)
    }
  }, [])

  async function enablePush() {
    if (!('serviceWorker' in navigator)) {
      toast.error('Service Workers not supported in this browser')
      return
    }
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.error('Push permission denied')
        return
      }

      const vapidRes = await fetch('/api/crm/push/vapid-key')
      const { publicKey } = await vapidRes.json() as { publicKey: string }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      })

      const subJson = sub.toJSON()
      await fetch('/api/crm/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          p256dh: (subJson.keys as { p256dh?: string } | undefined)?.p256dh ?? '',
          auth: (subJson.keys as { auth?: string } | undefined)?.auth ?? '',
          tenantId: 'current', // will be resolved server-side
        }),
      })

      setPushEnabled(true)
      toast.success('Push notifications enabled!')
    } catch (err) {
      toast.error('Failed to enable push notifications')
      console.error(err)
    }
  }

  async function handleMarkRead(id: string) {
    await markRead.mutateAsync(id)
  }

  async function handleMarkAllRead() {
    await markAllRead.mutateAsync()
    toast.success('All notifications marked as read')
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notifications</h1>
          <p className="text-sm text-gray-500 mt-0.5">Stay on top of your leads and tasks.</p>
        </div>
        <div className="flex items-center gap-2">
          {!pushEnabled && (
            <Button variant="outline" onClick={enablePush}>
              <Bell className="h-4 w-4 mr-2" /> Enable Push
            </Button>
          )}
          {pushEnabled && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              <Bell className="h-3.5 w-3.5" /> Push on
            </span>
          )}
          <Button variant="outline" onClick={handleMarkAllRead}>
            <CheckCheck className="h-4 w-4 mr-2" /> Mark all read
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit mb-6">
        {(['all', 'unread'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors',
              filter === f ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      )}

      {!isLoading && notifications.length === 0 && (
        <div className="text-center py-20 bg-gray-50 dark:bg-gray-900 rounded-xl border border-dashed">
          <BellOff className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No notifications</p>
          <p className="text-sm text-gray-400 mt-1">You&apos;re all caught up!</p>
        </div>
      )}

      <div className="space-y-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={cn(
              'flex items-start gap-4 p-4 rounded-lg border transition-colors cursor-pointer',
              n.readAt
                ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
            )}
            onClick={() => {
              if (!n.readAt) handleMarkRead(n.id)
              if (n.link) window.location.href = n.link
            }}
          >
            <div className={cn('p-2 rounded-full shrink-0', n.readAt ? 'bg-gray-100' : 'bg-blue-100')}>
              <Bell className={cn('h-4 w-4', n.readAt ? 'text-gray-400' : 'text-blue-600')} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className={cn('font-medium text-sm', n.readAt ? 'text-gray-700 dark:text-gray-300' : 'text-gray-900 dark:text-white')}>
                  {n.title}
                </p>
                {!n.readAt && <Badge className="shrink-0 text-xs">New</Badge>}
              </div>
              <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
              <p className="text-xs text-gray-400 mt-1">
                {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
