const VERSION = "escape-pwa-v18";
const APP_CACHE = `${VERSION}-pages`;
const ASSET_CACHE = `${VERSION}-assets`;
const CORE_PAGES = [
  "/", "/streak", "/crew", "/settings", "/account",
  "/account/sign-in", "/account/register", "/rooms/create",
  "/rooms/join", "/report", "/how-to", "/boss",
];
const PUBLIC_ASSETS = [
  "/offline.html",
  "/images/escape-island.png",
  "/images/island-board-v2.png",
  "/images/mascot.png",
  "/images/Kirk%20Sprite%20Sheet.png",
  "/images/Diddy%20Sprite%20Sheet.png",
  "/images/Epstein%20Sprite%20Sheet.png",
  "/images/Pixel-Art%20Base%20Avatar%20Selection%20Sheet.png",
  "/icons/escape-app-192.png",
  "/icons/escape-app-512.png",
  "/icons/escape-app.svg",
  "/favicon.svg",
];

function pagePath(url) {
  return url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
}

// These routes render a generic document. Account data is fetched separately
// through uncached /api requests after the client opens the document.
function documentRequest(path) {
  return new Request(new URL(path, self.location.origin), {
    credentials: "omit",
    cache: "reload",
    headers: { Accept: "text/html" },
  });
}

function referencedAssets(html, baseUrl) {
  const assets = new Set();
  for (const match of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1].replace(/&amp;/g, "&"), baseUrl);
      if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) assets.add(url.href);
    } catch { /* An invalid or non-URL HTML attribute is not an app asset. */ }
  }
  return assets;
}

async function cacheAsset(value) {
  const request = new Request(new URL(value, self.location.origin), { credentials: "omit", cache: "reload" });
  const response = await fetch(request);
  if (!response.ok) throw new Error("An offline asset is not available yet.");
  const cache = await caches.open(ASSET_CACHE);
  await cache.put(request, response);
}

async function cacheDocument(path) {
  const request = documentRequest(path);
  const response = await fetch(request);
  const responseUrl = new URL(response.url || request.url);
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html") || responseUrl.origin !== self.location.origin || pagePath(responseUrl) !== path) {
    throw new Error("This page is not available for offline use yet.");
  }
  const html = await response.clone().text();
  const cache = await caches.open(APP_CACHE);
  await cache.put(request, response);
  return referencedAssets(html, request.url);
}

async function refreshDocument(path) {
  const assets = await cacheDocument(path);
  await Promise.allSettled([...assets].map(cacheAsset));
}

async function offlineDocument(url) {
  const cache = await caches.open(APP_CACHE);
  const exactPage = await cache.match(documentRequest(pagePath(url)));
  if (exactPage) return exactPage;
  return await caches.match(new URL("/offline.html", self.location.origin).href) || new Response(
    "You are offline. Reconnect to open this page and log your day.",
    { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    // Keep the old worker if even the recovery screen cannot be fetched.
    await cacheAsset("/offline.html");
    const pageResults = await Promise.allSettled(CORE_PAGES.map(cacheDocument));
    const assets = new Set(PUBLIC_ASSETS.filter(path => path !== "/offline.html"));
    for (const result of pageResults) {
      if (result.status === "fulfilled") for (const asset of result.value) assets.add(asset);
    }
    // A temporary miss on one route or illustration still leaves a usable
    // recovery screen and every page that successfully finished caching.
    await Promise.allSettled([...assets].map(cacheAsset));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("escape-pwa-") && key !== APP_CACHE && key !== ASSET_CACHE).map(key => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname === "/api" || url.pathname.startsWith("/api/")) return;
  // Next's client router requests Flight payloads at page URLs. Those must
  // never be stored or returned as document HTML, including prefetches.
  if (request.headers.get("RSC") === "1" || request.headers.has("Next-Router-State-Tree") || request.headers.has("Next-Router-Prefetch") || request.headers.get("Accept")?.includes("text/x-component") || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    const network = fetch(request);
    event.respondWith(network.then(response => response.status >= 500 ? offlineDocument(url) : response).catch(() => offlineDocument(url)));
    const path = pagePath(url);
    if (CORE_PAGES.includes(path)) {
      // Refresh only a separate anonymous, query-free document. Neither
      // session-bearing responses nor invitation tokens enter CacheStorage.
      event.waitUntil(network.then(response => response.ok ? refreshDocument(path) : undefined).catch(() => {}));
    }
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || PUBLIC_ASSETS.includes(url.pathname) || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/images/")) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      // Development can reuse framework URLs; prefer fresh styles and scripts.
      if (url.pathname.startsWith("/_next/static/")) {
        try {
          const response = await fetch(new Request(request, { credentials: "omit" }));
          if (response.ok) { await cache.put(request, response.clone()).catch(() => {}); return response; }
          return await cache.match(request) || response;
        } catch { return await cache.match(request) || Response.error(); }
      }
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(new Request(request, { credentials: "omit" }));
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});

self.addEventListener("push", event => {
  let data;
  try { data = event.data?.json(); } catch { /* A plain reminder still works if its payload cannot be decoded. */ }
  data = data || { title: "Your crew is waiting", body: "A little daily hello keeps your escape moving.", url: "/" };
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/icons/escape-app-192.png",
    badge: "/icons/escape-app-192.png",
    tag: "get-out-daily-reminder",
    renotify: true,
    data: { url: data.url ?? "/" },
    actions: [{ action: "open", title: "Log my day" }],
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  let target = new URL("/", self.location.origin);
  try {
    const requested = new URL(event.notification.data?.url ?? "/", self.location.origin);
    if (requested.origin === self.location.origin) target = requested;
  } catch { /* Open the game when a notification has no valid route. */ }
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(async windows => {
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(target.href).catch(() => {});
      return existing.focus();
    }
    return clients.openWindow(target.href);
  }));
});
