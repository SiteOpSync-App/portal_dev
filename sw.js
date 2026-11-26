const CACHE = "site-portal-v1.26.0";
const ASSETS = ["./", "./index.html", "./style.css", "./app.js", "./config.js", "./branding.js", "./invoice.js", "./manifest.json"];

self.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
    e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Pages and scripts: network first, falling back to cache when offline.
// Other requests (like the QR scanner library and Google Sheets) go straight to the network.
self.addEventListener("fetch", (e) => {
    const url = new URL(e.request.url);
    if (url.origin !== location.origin || e.request.method !== "GET") return;
    const path = url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname;
    if (!ASSETS.some((a) => path.endsWith(a.slice(1)))) return;

    e.respondWith(
        fetch(e.request).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
            return res;
        }).catch(() => caches.match(e.request))
    );
});
