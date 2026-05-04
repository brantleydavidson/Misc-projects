// JackedAI Service Worker
// Handles: push notifications, offline caching, background sync

const CACHE_NAME = 'jackedai-v1';
const STATIC_ASSETS = [
  '/',
  '/favicon.svg',
  '/manifest.json',
];

// ── Install: cache shell ───────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ─────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first with cache fallback ───────────────────────
self.addEventListener('fetch', (event) => {
  // Skip non-GET and API calls
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/.netlify/functions/')) return;
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
  );
});

// ── Push notifications ─────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'JackedAI', body: 'Time to check in!' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: data.tag || 'jackedai-notification',
    renotify: true,
    actions: data.actions || [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// ── Notification click ─────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  if (event.action === 'dismiss') return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if available
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new tab
      return self.clients.openWindow(url);
    })
  );
});

// ── Periodic sync (if supported) ──────────────────────────────────
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'jackedai-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // This runs in the service worker context — limited to fetch calls
  // Could sync data to Supabase here in the future
  console.log('[SW] Background sync triggered');
}

// ── Scheduled notification timer ───────────────────────────────────
// Listen for messages from the app to schedule notifications
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SCHEDULE_NOTIFICATION') {
    const { delay, title, body, tag, url } = event.data;
    setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: tag || 'jackedai-scheduled',
        renotify: true,
        actions: [
          { action: 'open', title: 'Open' },
          { action: 'dismiss', title: 'Later' },
        ],
        data: { url: url || '/' },
      });
    }, delay);
  }

  if (event.data?.type === 'SCHEDULE_ALL_REMINDERS') {
    scheduleServiceWorkerReminders(event.data.reminders);
  }
});

// Schedule reminders via the service worker (survives tab close)
const scheduledTimeouts = [];

function scheduleServiceWorkerReminders(reminders) {
  // Clear existing
  scheduledTimeouts.forEach((t) => clearTimeout(t));
  scheduledTimeouts.length = 0;

  const now = new Date();

  reminders.forEach((reminder) => {
    if (!reminder.enabled) return;

    // Check if it should fire today
    if (reminder.days.length > 0 && !reminder.days.includes(now.getDay())) return;

    const [hours, minutes] = reminder.time.split(':').map(Number);
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);

    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }

    const delay = target.getTime() - now.getTime();

    const timeout = setTimeout(() => {
      const urlMap = {
        morning_checkin: '/checkin',
        midday_checkin: '/checkin',
        evening_checkin: '/checkin',
        log_lunch: '/snap',
        log_dinner: '/snap',
        weigh_in: '/checkin',
      };

      self.registration.showNotification(reminder.title, {
        body: reminder.body,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: reminder.id,
        renotify: true,
        data: { url: urlMap[reminder.type] || '/' },
        actions: [
          { action: 'open', title: 'Open' },
          { action: 'dismiss', title: 'Later' },
        ],
      });
    }, delay);

    scheduledTimeouts.push(timeout);
  });
}
