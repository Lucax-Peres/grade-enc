/*
 * Service worker: deixa o app abrir sem internet.
 * Estratégia "stale-while-revalidate": responde com o que está no cache
 * (rápido) e, em paralelo, busca a versão nova para a próxima abertura.
 *
 * IMPORTANTE: ao publicar mudanças, aumente o número da versão abaixo
 * (v1 → v2 …) para o celular descartar o cache antigo.
 */
const CACHE = "grade-enc-v1";
const SHELL = [
  "./",
  "./index.html",
  "./assets/style.css",
  "./assets/data.js",
  "./assets/app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const cacheable = url.origin === self.location.origin || url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com");
  if (!cacheable) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: url.origin === self.location.origin });
      const network = fetch(req)
        .then((res) => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; })
        .catch(() => cached || (req.mode === "navigate" ? cache.match("./index.html") : undefined));
      return cached || network;
    })
  );
});
