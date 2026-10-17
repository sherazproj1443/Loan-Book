
const CACHE_NAME = 'fintrack-pro-v8-3icons';
const ASSETS = [
  'index.html',
  'transactions.html',
  'incomes.html',
  'expenses.html',
  'profiles.html',
  'analytics.html',
  'assets.html',
  'todos.html',
  'auth.js',
  'pwa.js',
  'jsonbin-config.js',
  'manifest.json',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(err => console.log('Cache fail', url, err)))
      );
    }).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if(e.request.url.includes('api.jsonbin.io')){
    e.respondWith(fetch(e.request).catch(()=> caches.match(e.request)));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(()=> {
      if(e.request.destination==='document'){
        return caches.match('index.html');
      }
    }))
  );
});