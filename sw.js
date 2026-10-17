const CACHE_NAME = 'fintrack-pro-v4-pin-avatar';
const ASSETS = [
  './',
  './index.html',
  './transactions.html',
  './incomes.html',
  './expenses.html',
  './profiles.html',
  './analytics.html',
  './assets.html',
  './todos.html',
  './auth.js',
  './manifest.json',
  './jsonbin-config.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network first for jsonbin API, cache first for local assets
  if(e.request.url.includes('api.jsonbin.io')){
    e.respondWith(
      fetch(e.request).then(res=>{
        return res;
      }).catch(()=> caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res=>{
      // cache new assets
      if(res.ok && e.request.method==='GET'){
        const clone=res.clone();
        caches.open(CACHE_NAME).then(cache=>cache.put(e.request, clone));
      }
      return res;
    }).catch(()=> {
      if(e.request.destination==='document'){
        return caches.match('./index.html');
      }
    }))
  );
});

// Background sync for pending data
self.addEventListener('sync', e => {
  if(e.tag==='fintrack-sync'){
    e.waitUntil(
      self.clients.matchAll().then(clients=>{
        clients.forEach(c=>c.postMessage({type:'SYNC_NOW'}));
      })
    );
  }
});