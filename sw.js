// Lets the check-in page open and scan with no signal.
// - At install it saves the main page files straight away, so the very first visit is covered too.
// - When online it always fetches the latest copy (and refreshes the saved one).
// - When offline it falls back to the saved copy. Requests to Apps Script (POST) are never touched.
const CACHE = "site-portal-v1.25.0";   // bump this number to force phones to clear their saved copy
const LIB = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
const SHELL = ["./", "index.html", "style.css", "config.js", "branding.js", "app.js", "invoice.js", "manifest.json", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
    e.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        for (const url of SHELL) {
            try { await cache.add(new Request(url, { cache: "reload" })); } catch (err) {}
        }
        try { await cache.put(LIB, await fetch(LIB, { mode: "no-cors" })); } catch (err) {}
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", (e) => {
    e.waitUntil((async () => {
        for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", (e) => {
    const req = e.request, url = new URL(req.url);
    if (req.method !== "GET") return;
    if (url.origin !== location.origin && req.url !== LIB) return;

    e.respondWith((async () => {
        const cache = await caches.open(CACHE);
        if (req.url === LIB) {
            const saved = await cache.match(req.url);
            if (saved) return saved;
        }
        try {
            const res = await fetch(new Request(req, { cache: "no-store" }));
            if (res.ok || res.type === "opaque") {
                await cache.put(req, res.clone());
            }
            return res;
        } catch (err) {
            const saved = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
            if (saved) return saved;
            if (req.mode === "navigate") {   // opening the app with no signal
                const shell = (await cache.match("./")) || (await cache.match("index.html"));
                if (shell) return shell;
            }
            throw err;
        }
    })());
});
