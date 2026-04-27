const APP_SHELL_CACHE = 'flashcards-app-shell-v1';
const STATIC_CACHE = 'flashcards-static-v1';
const DATA_CACHE = 'flashcards-data-v1';
const OFFLINE_URL = '/offline.html';

const APP_SHELL_URLS = ['/', OFFLINE_URL, '/manifest.json', '/icons/icon-source.svg'];
const ACTIVE_CACHES = [APP_SHELL_CACHE, STATIC_CACHE, DATA_CACHE];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => !ACTIVE_CACHES.includes(cacheName))
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
    return;
  }

  const url = new URL(request.url);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  if (isStaticAssetRequest(request)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isDataRequest(request, url)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
  }
});

function isStaticAssetRequest(request) {
  return ['style', 'script', 'worker', 'image', 'font', 'manifest'].includes(request.destination);
}

function isDataRequest(request, url) {
  if (url.origin !== self.location.origin) {
    return false;
  }

  const acceptHeader = request.headers.get('accept') || '';
  const looksLikeApiRequest = url.pathname.startsWith('/api/');
  const looksLikeJsonRequest = acceptHeader.includes('application/json');
  const looksLikeProgrammaticDataRequest = request.destination === '' && !/\.[a-z0-9]+$/i.test(url.pathname);

  return looksLikeApiRequest || looksLikeJsonRequest || looksLikeProgrammaticDataRequest;
}

async function handleNavigationRequest(request) {
  try {
    const response = await fetch(request);

    if (response.ok && isHtmlResponse(response)) {
      const cache = await caches.open(APP_SHELL_CACHE);
      await cache.put('/', response.clone());
    }

    return response;
  } catch (error) {
    const cache = await caches.open(APP_SHELL_CACHE);
    const cachedAppShell = await cache.match('/');

    if (cachedAppShell) {
      return cachedAppShell;
    }

    const offlineResponse = await cache.match(OFFLINE_URL);

    if (offlineResponse) {
      return offlineResponse;
    }

    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);

  if (isCacheableResponse(response)) {
    await cache.put(request, response.clone());
  }

  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);

    if (response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    throw error;
  }
}

function isHtmlResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('text/html');
}

function isCacheableResponse(response) {
  return response.ok || response.type === 'opaque';
}
