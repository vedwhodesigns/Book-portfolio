// Postroom service worker: shows push notifications and opens the right page when one is tapped.
// Pushes carry no payload; the newest notification is fetched from the app.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let n = null;
    try {
      const r = await fetch('/api/notifications?limit=1', { credentials: 'same-origin', cache: 'no-store' });
      if (r.ok) n = (await r.json()).items?.[0] || null;
    } catch { /* offline or signed out */ }
    const title = n?.title || 'Postroom';
    await self.registration.showNotification(title, {
      body: n?.body || 'Open Postroom to see what changed.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: n?.id || 'postroom',
      ...(n?.image ? { image: n.image } : {}),
      data: { url: n?.url || '/#/alerts' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/#/alerts';
  event.waitUntil((async () => {
    const external = /^https?:\/\//.test(url) && !url.startsWith(self.location.origin);
    if (external) return self.clients.openWindow(url);
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.location.origin)) {
        await c.focus();
        return c.navigate(new URL(url, self.location.origin).href);
      }
    }
    return self.clients.openWindow(url);
  })());
});

// A fetch handler (network only) keeps the app installable on every Android browser.
self.addEventListener('fetch', () => {});
