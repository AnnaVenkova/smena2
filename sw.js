const CACHE = "smena-plus-v2";
const ASSETS = [
  "./index.html",
  "./styles.css",
  "./data.js",
  "./app.js",
  "./cloud.js",
  "./access-config.js",
  "./firebase-config.js",
  "./sheets-config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Сеть в приоритете (чтобы обновления кода приходили сразу),
// кеш — только запасной вариант, если нет интернета.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
