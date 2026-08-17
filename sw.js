const CACHE = "smena-plus-v3";
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
// Примечание: шрифт Google Sans грузится с внешнего CDN и кешируется
// автоматически при первом использовании (см. обработчик fetch ниже) —
// не включаем его в обязательный список ниже, чтобы сбой сети при
// установке service worker не ломал офлайн-режим всего приложения.

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
// ВАЖНО: перехватываем и кешируем только запросы к своему же сайту.
// Запросы к Firebase/Firestore и другим внешним сервисам пропускаем
// без вмешательства — у них особый тип долгоживущих соединений,
// которые нельзя оборачивать в обычное кеширование (иначе связь с
// облаком обрывается с ошибкой "Response body is already used").
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
