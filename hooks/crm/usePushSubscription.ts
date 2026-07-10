'use client'

import { useCallback, useEffect, useState } from 'react'

const SW_PATH = '/sw.js'

interface UsePushReturn {
  /** True once we know the browser's current state (post-mount). */
  ready: boolean
  /** True when this browser has an active push subscription registered. */
  subscribed: boolean
  /** True when the browser doesn't support web push at all. */
  unsupported: boolean
  /** True if the user previously denied permission. */
  denied: boolean
  /** True while a subscribe/unsubscribe round-trip is in flight. */
  pending: boolean
  /** Trigger permission prompt + server subscription. */
  subscribe: () => Promise<void>
  /** Drop the subscription on every device for this user. */
  unsubscribe: () => Promise<void>
  /** Last error from subscribe/unsubscribe (UI hint). */
  error: string | null
}

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64     = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(b64)
  const arr     = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr.buffer
}

/**
 * Client-side hook managing the web push subscription lifecycle for the
 * current user/browser. Pairs with the toggle in the notification dropdown.
 *
 * @param tenantId - the tenant the user is signed into; recorded with the
 *                   subscription so cross-tenant fan-out works correctly.
 */
export function usePushSubscription(tenantId: string | null): UsePushReturn {
  const [ready, setReady]             = useState(false)
  const [subscribed, setSubscribed]   = useState(false)
  const [unsupported, setUnsupported] = useState(false)
  const [denied, setDenied]           = useState(false)
  const [pending, setPending]         = useState(false)
  const [error, setError]             = useState<string | null>(null)

  // Detect environment + read current subscription state on mount.
  useEffect(() => {
    let cancelled = false

    async function init() {
      if (typeof window === 'undefined') return
      const supports =
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window
      if (!supports) {
        if (!cancelled) {
          setUnsupported(true)
          setReady(true)
        }
        return
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) {
          setDenied(true)
          setReady(true)
        }
        return
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration(SW_PATH)
        const sub = await reg?.pushManager.getSubscription()
        if (!cancelled) {
          setSubscribed(!!sub)
          setReady(true)
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message)
          setReady(true)
        }
      }
    }

    void init()
    return () => { cancelled = true }
  }, [])

  const subscribe = useCallback(async () => {
    // Note: we no longer bail when tenantId is null — the server resolves the
    // tenant from the session, so a missing client tenantId must not silently
    // block the toggle (the previous cause of "can't turn it on" for some users).
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'denied') {
        setDenied(true)
        return
      }
      if (permission !== 'granted') return

      const reg = await navigator.serviceWorker.register(SW_PATH)
      await navigator.serviceWorker.ready

      const keyRes = await fetch('/api/crm/push/vapid-key')
      const { publicKey } = (await keyRes.json()) as { publicKey: string }
      if (!publicKey) {
        setError('Push is not configured on the server')
        return
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToBuffer(publicKey),
      })
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      const endpoint = json.endpoint ?? ''
      const p256dh   = json.keys?.p256dh ?? ''
      const authKey  = json.keys?.auth   ?? ''
      if (!endpoint || !p256dh || !authKey) {
        setError('Subscription is missing required keys')
        return
      }

      const res = await fetch('/api/crm/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ endpoint, p256dh, auth: authKey, tenantId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err?.error ?? 'Server rejected the subscription')
        return
      }
      setSubscribed(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(false)
    }
  }, [pending, tenantId])

  const unsubscribe = useCallback(async () => {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_PATH)
      const sub = await reg?.pushManager.getSubscription()
      if (sub) await sub.unsubscribe()
      await fetch('/api/crm/push/unsubscribe', { method: 'POST' })
      setSubscribed(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(false)
    }
  }, [pending])

  return { ready, subscribed, unsupported, denied, pending, subscribe, unsubscribe, error }
}
