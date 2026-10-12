// Minimal service worker: makes the app installable and shows an offline page.
// Pages and data are never cached (they're private and change constantly); only static assets are.
const STATIC_CACHE = "sale-away-static-v1";
const OFFLINE_HTML = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title><body style="font-family:system-ui;padding:2rem;text-align:center;background:#f6f4ef;color:#1d2433">
<h1 style="font-size:1.25rem">No signal right now</h1><p>Sale Away needs a connection. It will work again once you're back online.</p>
<button onclick="location.reload()" style="padding:.75rem 1.25rem;border-radius:.75rem;border:0;background:#1f4e79;color:#fff;font-size:1rem">Try again</button></body>`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html" } })));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
  }
});
