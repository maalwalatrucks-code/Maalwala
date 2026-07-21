const CACHE = 'maalwala-v12';
const ASSETS = ['./', './index.html', './driver.html', './style.css', './app.js', './config.js', './manifest.json', './icon.svg', './slide-1.jpg', './slide-2.jpg'];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate', e=>{ self.clients.claim(); });
self.addEventListener('fetch', e=>{
  e.respondWith(
    caches.match(e.request).then(cached=> cached || fetch(e.request).catch(()=>cached))
  );
});
