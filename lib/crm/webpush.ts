import webpush, { type PushSubscription } from 'web-push'
import { prisma } from './db'

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL ?? 'admin@ebright.my'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
}

export async function sendPushNotification(
  userId: string,
  tenantId: string,
  payload: { title: string; body: string; link?: string },
): Promise<void> {
  const subs = await prisma.crm_push_subscription.findMany({
    where: { userId, tenantId },
  })

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      const pushSub: PushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }
      await webpush.sendNotification(pushSub, JSON.stringify(payload))
    }),
  )

  // Remove expired/invalid subscriptions
  const toDelete: string[] = []
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const err = result.reason as { statusCode?: number }
      if (err.statusCode === 410 || err.statusCode === 404) {
        toDelete.push(subs[i].id)
      }
    }
  })

  if (toDelete.length) {
    await prisma.crm_push_subscription.deleteMany({ where: { id: { in: toDelete } } })
  }
}
