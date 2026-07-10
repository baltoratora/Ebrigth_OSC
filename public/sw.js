/* Service worker for Ebright CRM web push notifications.
 *
 * Receives push payloads from /lib/crm/push.ts and displays them as native
 * browser notifications. Clicking a notification focuses the existing CRM
 * tab (or opens a new one) at the payload's `url`.
 *
 * Registered by hooks/crm/usePushSubscription.ts on toggle-on.
 */

self.addEventListener('install', (event) => {
  // Activate as soon as installed instead of waiting for the next page load.
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload = {}
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Ebright CRM', body: event.data.text() }
  }
  const title = payload.title || 'Ebright CRM'
  const options = {
    body:      payload.body || '',
    icon:      '/icons/icon-192.png',
    badge:     '/icons/badge-72.png',
    data:      { url: payload.url || '/crm' },
    tag:       payload.type || 'crm-notification',
    renotify:  true,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/crm'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a CRM tab is already open, focus it and navigate.
      for (const client of clientList) {
        if (client.url.includes('/crm') && 'focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      // Otherwise open a new window.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    }),
  )
})
