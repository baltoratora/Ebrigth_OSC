/**
 * Web Push fan-out.
 *
 * Lazy-loads the `web-push` module + VAPID config so the rest of the CRM
 * boots cleanly even when push is unconfigured (matches the same pattern
 * we use for Resend email in lib/crm/email.ts).
 *
 * The transport is best-effort: failures are caught per-subscription so a
 * single dead endpoint can't break the whole fan-out, and `410 Gone`
 * responses prune the subscription row so we stop retrying it.
 */

import type { PrismaClient } from '@prisma/client'

interface PushPayload {
  title: string
  body:  string
  url?:  string
  type?: string
}

type WebPushLib = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void
  sendNotification: (
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ) => Promise<unknown>
} | 'unavailable'

let cachedLib: WebPushLib | null = null

async function getWebPush(): Promise<WebPushLib> {
  if (cachedLib) return cachedLib
  const publicKey  = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject    = process.env.VAPID_EMAIL ? `mailto:${process.env.VAPID_EMAIL}` : 'mailto:noreply@ebright.my'
  if (!publicKey || !privateKey) {
    console.warn('[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — push disabled')
    cachedLib = 'unavailable'
    return cachedLib
  }
  try {
    const mod = await import('web-push')
    const lib = (mod as unknown as { default?: WebPushLib }).default ?? (mod as unknown as WebPushLib)
    if (lib === 'unavailable') {
      cachedLib = 'unavailable'
      return cachedLib
    }
    lib.setVapidDetails(subject, publicKey, privateKey)
    cachedLib = lib
    return cachedLib
  } catch (e) {
    console.warn('[push] failed to load web-push module:', (e as Error).message)
    cachedLib = 'unavailable'
    return cachedLib
  }
}

/**
 * Send a push payload to every active subscription for each of `userIds`.
 * Idempotent and safe to call from any path (LEAD ingest, transfer route).
 * Returns the number of pushes delivered (success or 4xx — not counting
 * 410 prunes).
 */
export async function sendPushToUsers(
  prisma:  PrismaClient,
  userIds: string[],
  payload: PushPayload,
): Promise<number> {
  if (userIds.length === 0) return 0
  const lib = await getWebPush()
  if (lib === 'unavailable') return 0

  const subs = await prisma.crm_push_subscription.findMany({
    where:  { userId: { in: userIds } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  })
  if (subs.length === 0) return 0

  const body = JSON.stringify(payload)
  let delivered = 0

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await lib.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        )
        delivered++
      } catch (err) {
        // 404 / 410 → endpoint is dead; prune the row so future fan-outs skip it.
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          try {
            await prisma.crm_push_subscription.delete({ where: { id: sub.id } })
          } catch { /* ignore prune failures */ }
        } else {
          console.warn(
            `[push] sendNotification failed (${statusCode ?? 'unknown'}):`,
            (err as Error).message ?? err,
          )
        }
      }
    }),
  )

  return delivered
}
