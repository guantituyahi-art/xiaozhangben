/* 小账本 Service Worker：联网优先，离线回退缓存 */
const CACHE_NAME = 'xiaozhangben-v1.0.2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

const OFFLINE_RESPONSE = () => new Response('当前离线，且本地缓存不可用', {
  status: 503,
  headers: { 'content-type': 'text/plain; charset=utf-8' },
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, fallbackKey) {
  try {
    const response = await fetch(request);
    if (!response.ok) {
      const cached = await caches.match(fallbackKey);
      return cached || response;
    }
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(fallbackKey, copy)).catch(() => {});
    return response;
  } catch (err) {
    const cached = await caches.match(fallbackKey);
    return cached || OFFLINE_RESPONSE();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return;

  // 页面导航：联网优先，离线或服务器出错时回退到缓存的首页
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  // 静态资源：联网优先，保证更新及时；离线或出错时回退缓存
  event.respondWith(networkFirst(request, request));
});