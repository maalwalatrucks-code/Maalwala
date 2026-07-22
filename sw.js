const CACHE = 'maalwala-v29';
const ASSETS = ['./', './index.html', './driver.html', './style.css', './app.js', './config.js', './manifest.json', './icon.svg', './slide-1.jpg', './slide-2.jpg'];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', e=>{
  // Delete every cache from previous versions so old content can never
  // be served again — this was the bug: old caches were never cleaned up.
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e=>{
  // Network-first: always try to get the latest version first. Only fall
  // back to the cached copy if the network request fails (i.e. offline).
  // The previous version did this backwards (cache-first), which is why
  // updates weren't showing up even after re-uploading the files.
  e.respondWith(
    fetch(e.request).then(res=>{
      const resClone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, resClone)).catch(()=>{});
      return res;
    }).catch(()=> caches.match(e.request))
  );
});
