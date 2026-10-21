/**
 * Service worker du Thaayam :
 * 1. Jeu sans internet : les fichiers du jeu sont gardés sur l'appareil. On essaie toujours le réseau
 *    d'abord (pour avoir la dernière version), et on se sert de la copie quand il n'y a pas d'internet.
 * 2. Notifications « C'est ton tour » et invitations, même quand le jeu est fermé.
 */
const CACHE = 'thaayam-v6';
const FICHIERS = [
  './', 'index.html', 'regles.html', 'app.js', 'appel.js', 'regles.js', 'sons.js', 'config.js', 'style.css',
  'manifest.webmanifest', 'icone-180.png', 'icone-192.png', 'icone-512.png',
  'moteur/classement.js', 'moteur/en-ligne.js', 'moteur/guide.js', 'moteur/i18n-plus.js', 'moteur/i18n.js',
  'moteur/ia.js', 'moteur/partie.js', 'moteur/plateau.js', 'moteur/regles.js', 'moteur/stats.js',
  'moteur/textes-regles.js', 'moteur/themes.js',
];
// Polices et module Supabase : servis depuis la copie s'ils sont déjà là
const EXTERNES = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (EXTERNES.includes(url.hostname)) {
    e.respondWith(caches.match(req).then((copie) => copie || fetch(req).then((rep) => {
      if (rep.ok || rep.type === 'opaque') { const c = rep.clone(); caches.open(CACHE).then((cache) => cache.put(req, c)); }
      return rep;
    })));
    return;
  }
  if (url.origin !== self.location.origin) return; // Supabase : toujours en direct
  e.respondWith(fetch(req).then((rep) => {
    if (rep.ok) { const c = rep.clone(); caches.open(CACHE).then((cache) => cache.put(req, c)); }
    return rep;
  }).catch(async () => {
    const copie = await caches.match(req, { ignoreSearch: true });
    if (copie) return copie;
    if (req.mode === 'navigate') return caches.match('index.html');
    return Response.error();
  }));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { corps: e.data && e.data.text() }; }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
    // « C'est ton tour » : inutile si le jeu est déjà ouvert sous les yeux du joueur
    if (d.type === 'tour' && fenetres.some((f) => f.visibilityState === 'visible')) return undefined;
    return self.registration.showNotification(d.titre || 'Thaayam', {
      body: d.corps || '', icon: 'icone-192.png', badge: 'icone-192.png', vibrate: [80, 40, 80],
      tag: d.code ? `thaayam-${d.code}` : 'thaayam', renotify: true, data: { url: d.url || './' },
    });
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
    const f = fenetres.find((x) => new URL(x.url).origin === self.location.origin);
    if (f) return f.navigate(url).then((x) => (x || f).focus()).catch(() => f.focus());
    return self.clients.openWindow(url);
  }));
});
