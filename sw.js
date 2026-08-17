const CACHE = "smena-plus-v4";
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
// кеш — только запасной вариант при отсутствии интернета.
// ВАЖНО: перехватываем только запросы к своему же сайту — запросы
// к Firebase/Firestore, шрифтам и другим внешним сервисам пропускаем
// без вмешательства.
// Раньше здесь дополнительно "досохранялась" свежая копия каждого
// ответа в кеш (через .clone()) — именно это в некоторых ситуациях
// вызывало ошибку "Response body is already used" и рвало связь
// с облаком. Теперь просто отдаём сеть, а при её отсутствии — то,
// что уже лежит в кеше с момента установки (список ASSETS выше).
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
