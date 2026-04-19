// Vercro Service Worker — Push Notifications
// Placed in public/sw.js

importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

const CACHE_NAME = 'vercro-v1';

// ── Push event — show notification ───────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Vercro', body: event.data.text() };
  }

  const options = {
    body:    data.body || '',
    icon:    '/icons/icon-192.png',
    badge:   '/icons/icon-192.png',
    tag:     data.tag || data.notification_type || 'vercro',
    renotify: false,
    data: {
      url:               data.url || '/',
      notification_type: data.notification_type,
      task_id:           data.task_id || null,
      crop_id:           data.crop_id || null,
      section:           data.section || null,
      event_id:          data.event_id || null,
    },
    actions: data.actions || [],
    vibrate: [200, 100, 200],
    requireInteraction: data.priority === 'critical',
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── Notification click — deep link into app ───────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data    = event.notification.data || {};
  const action  = event.action;

  // Build deep link URL
  let url = data.url || '/';

  // Action buttons (e.g. "Mark done", "Snooze")
  if (action === 'complete' && data.task_id) {
    fetch(`https://api.vercro.com/tasks/${data.task_id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
    return;
  }

  if (action === 'snooze' && data.task_id) {
    fetch(`https://api.vercro.com/tasks/${data.task_id}/snooze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: 1 }),
    }).catch(() => {});
    return;
  }

  // Mark notification as opened
  if (data.event_id) {
    fetch(`https://api.vercro.com/notifications/${data.event_id}/opened`, {
      method: 'POST',
    }).catch(() => {});
  }

  // Open app to correct section
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('app.vercro.com') && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url, data });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// ── Push subscription change ──────────────────────────────────────────────────
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: self.__VAPID_PUBLIC_KEY__,
    }).then((subscription) => {
      return fetch('https://api.vercro.com/notifications/register-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription }),
      });
    })
  );
});

// ── Basic install/activate ────────────────────────────────────────────────────
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));