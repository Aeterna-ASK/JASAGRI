/**
 * Orgaly Service Worker - Emergency Reset
 * v.1.1.2
 * 
 * 以前の全キャッシュとService Workerの登録を強制的に破棄します。
 * POSTリクエストのキャッシュエラーを防止するため、fetchイベントを完全にバイパスします。
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('Orgaly: Clearing cache', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      console.log('Orgaly: All caches cleared. Unregistering SW...');
      return self.registration.unregister();
    }).then(() => {
      return self.clients.matchAll();
    }).then((clients) => {
      clients.forEach(client => {
        if (client.url && 'navigate' in client) {
          client.navigate(client.url);
        }
      });
    })
  );
});

// fetchイベントを一切処理せず、ブラウザの標準動作（ネットワーク）に任せる
// これにより、POSTリクエストのキャッシュ試行によるエラーを回避
self.addEventListener('fetch', (event) => {
  return;
});
