/* ═══════════════════════════════════════════════════════
   CARGARIA — Service Worker (PWA)
   Cache-first for app shell, network-first for API calls
   ═══════════════════════════════════════════════════════ */

const CACHE_NAME  = 'cargaria-v1';
const SUPABASE_HOST = 'qosurbvbptavnhqpbawp.supabase.co';

// App shell files to pre-cache
const SHELL_FILES = [
  '/app/',
  '/app/index.html',
  '/app/style.css',
  '/app/app.js',
  '/app/auth.js',
  '/app/dashboard.js',
  '/app/contracts.js',
  '/app/payments.js',
  '/app/reports.js',
  '/app/suppliers.js',
  '/app/customers.js',
  '/app/ledger.js',
  '/app/settings.js',
  '/manifest.json',
];

/* ── Install: pre-cache shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

/* ── Activate: clean old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch strategy ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-first for Supabase API (always fresh data)
  if (url.hostname === SUPABASE_HOST) {
    event.respondWith(
      fetch(event.request).catch(() => new Response('{"error":"offline"}', {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }))
    );
    return;
  }

  // Network-first for PayPal SDK
  if (url.hostname === 'www.paypal.com') {
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Cache-first for app shell files
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache new shell files
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/app/index.html');
        }
        return new Response('', { status: 503 });
      });
    })
  );
});
