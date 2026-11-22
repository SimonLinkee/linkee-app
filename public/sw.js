/* Linkee — service worker (PWA).
 * Rôle volontairement prudent :
 *  - met en cache les fichiers statiques de l'appli (code, polices, icônes) pour qu'elle s'ouvre vite ;
 *  - quand il n'y a pas de réseau, affiche une page « hors connexion » au lieu d'une erreur du navigateur ;
 *  - mode hors ligne du logisticien : la coquille de la page « Ma journée » (/journee) est gardée pour pouvoir la rouvrir sans réseau ;
 *    les DONNÉES, elles, sont gardées par l'appli dans IndexedDB (jamais ici), et effacées à la déconnexion ;
 *  - ne met JAMAIS en cache les autres pages connectées, l'API ni Supabase.
 * Pour publier une nouvelle version de ce fichier, change VERSION. */
const VERSION = "linkee-v2";
const STATIC_CACHE = `${VERSION}-static`;
const PAGES_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/badge-96.png", "/icons/icon-192.png", "/icons/icon-512.png", "/linkee-logo-clair.png", "/linkee-logo.png"];

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

  // Ouverture d'une page : toujours depuis le réseau (à jour) ; sans réseau → page « hors connexion »
  if (req.mode === "navigate") {
    if (url.pathname === "/journee" || url.pathname.startsWith("/journee/")) {
      // « Ma journée » : on garde la dernière coquille vue pour pouvoir la rouvrir sans réseau
      event.respondWith(
        fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(PAGES_CACHE).then((c) => c.put("/journee", copy));
            }
            return res;
          })
          .catch(() => caches.match("/journee").then((hit) => hit || caches.match(OFFLINE_URL))),
      );
      return;
    }
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

// ---------------------------------------------------------------------------------------------------------------------
// Notifications sur le téléphone (migration 080) : bannière + pastille, même appli fermée.
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { title: "Linkee", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(d.title || "Linkee", {
        body: d.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: d.tag || d.id || "linkee",
        renotify: true,
        data: { url: d.url || "/" },
      });
      // pastille sur l'icône de l'appli : nombre de notifications non lues
      try {
        if (typeof d.unread === "number" && self.navigator && self.navigator.setAppBadge) await self.navigator.setAppBadge(d.unread);
      } catch (e) {
        /* non supporté */
      }
    })(),
  );
});

// toucher la bannière : ouvre (ou ramène au premier plan) l'appli sur la bonne page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          if ("navigate" in c) c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
