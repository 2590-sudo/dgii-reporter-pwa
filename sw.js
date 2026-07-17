const CACHE_NAME = 'dgii-reporter-v2';
const ASSETS = [
  '/', '/index.html', '/css/style.css',
  '/js/app.js', '/js/db.js', '/js/calc.js',
  '/js/sync.js', '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (!resp || resp.status !== 200) return resp;
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return resp;
      }).catch(() => caches.match('/index.html'));
    })
  );
});

// Sync check cada 12 horas
self.addEventListener('periodicsync', e => {
  if (e.tag === 'check-license') {
    e.waitUntil(checkLicense());
  }
});

async function checkLicense() {
  try {
    const db = await openDB();
    const config = await getConfig(db);
    if (!config?.token) return;
    const resp = await fetch(`https://dgii-admin.vercel.app/api/check?token=${config.token}`);
    const data = await resp.json();
    const tx = db.transaction('config', 'readwrite');
    tx.objectStore('config').put({ key: 'license_status', value: data.active ? 'active' : 'suspended' });
  } catch(e) {}
}
