/* Linkee — service worker (PWA).
 * Rôle volontairement prudent :
 *  - met en cache les fichiers statiques de l'appli (code, polices, icônes) pour qu'elle s'ouvre vite ;
 *  - quand il n'y a pas de réseau, affiche une page « hors connexion » au lieu d'une erreur du navigateur ;
 *  - ne met JAMAIS en cache les pages connectées, l'API ni Supabase : aucune donnée personnelle n'est gardée sur le téléphone.
 * Pour publier une nouvelle version de ce fichier, change VERSION. */
const VERSION = "linkee-v1";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/linkee-logo-clair.png", "/linkee-logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStaticAsset = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, cartes, Google… : le navigateur s'en charge seul
  if (url.pathname.startsWith("/api/")) return;

  // Ouverture d'une page : toujours depuis le réseau (données à jour) ; sans réseau → page « hors connexion »
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Fichiers statiques : d'abord le cache (les fichiers /_next/static/ ont un nom qui change à chaque version)
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
