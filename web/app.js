import {
  REGLES_PAR_DEFAUT, PRESETS_DES, TAILLES, COULEURS,
  copieRegles, normaliserRegles, valeursPossibles, lireListe, resumeRegles, nomLancer, avecReglesFixes,
} from './moteur/regles.js';
import { nouvellePartie, lancer, jouer, coupsPossibles, geometrie, pionsParCase, pionsAuCentre, zoneCase, etapesCoup, arcsCroix, revoirPartie, angleVue } from './moteur/partie.js';
import { cle } from './moteur/plateau.js';
import { choisirCoup } from './moteur/ia.js';
import { sons, sonActif, basculerSon, vibrationsActives, basculerVibrations, vibrer } from './sons.js';
import { creerAppel, appelsPossibles } from './appel.js';
import { nouvellePartieGuidee, lancerGuide, conseilGuide } from './moteur/guide.js';
import { niveauJoueur, trierClassement } from './moteur/classement.js';
import { creerEnLigne, REACTIONS } from './moteur/en-ligne.js';
import { noterFin, resumeStats, normaliserStats, statsVides } from './moteur/stats.js';
import { themePlateau, themeValide, THEMES } from './moteur/themes.js';
import {
  LANGUES, traducteur, traduireJournal, traduireErreur, traduireNom, traduireReaction,
  resumeReglesTraduit, resumeStatsTraduit,
} from './moteur/i18n.js';
import { SUPABASE_URL, SUPABASE_CLE_PUBLIQUE } from './config.js';

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';

// ---------------------------------------------------------------- stockage
const memoire = {
  lire(k) { try { return localStorage.getItem(k); } catch { return null; } },
  ecrire(k, v) { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } },
};

// ---------------------------------------------------------------- langue
function langueChoisie() {
  const l = memoire.lire('thaayam:langue');
  if (LANGUES.some((x) => x.code === l)) return l;
  const nav = (navigator.language || 'fr').slice(0, 2);
  return LANGUES.some((x) => x.code === nav) ? nav : 'fr';
}
let t = traducteur(langueChoisie());
const nomAffiche = (nom) => traduireNom(nom, t);
/** Met à jour tous les textes de la page (attributs data-i18n) et l'écran en cours. */
function appliquerLangue() {
  const code = langueChoisie();
  t = traducteur(code);
  document.documentElement.lang = code;
  document.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((e) => { e.placeholder = t(e.dataset.i18nPlaceholder); });
  document.querySelectorAll('#choix-langue button').forEach((b) => b.classList.toggle('actif', b.dataset.langue === code));
  if (typeof majBoutonSon === 'function') majBoutonSon();
  if (typeof majBoutonVibr === 'function') majBoutonVibr();
  if (typeof majNotifs === 'function') majNotifs();
  if (typeof majBoutonTrajet === 'function') majBoutonTrajet();
  document.querySelectorAll('[data-reaction]').forEach((b) => { b.textContent = traduireReaction(b.dataset.reaction, t); });
}
LANGUES.forEach(({ code, nom }) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.langue = code;
  b.textContent = nom;
  b.lang = code;
  b.addEventListener('click', () => {
    memoire.ecrire('thaayam:langue', code);
    appliquerLangue();
    // Redessiner l'écran visible dans la nouvelle langue
    if (!$('ecran-accueil').hidden) afficherAccueil();
    if (!$('ecran-revoir').hidden) dessinerRevoir();
    reabonnerLangue();
    if (!$('ecran-reglages').hidden) ouvrirReglages(modeReglages);
    if (session && !$('ecran-salon').hidden) afficherPartieEnLigne();
    if (session && session.etat && !$('ecran-jeu').hidden) dessinerJeu();
    if (session && session.mode === 'ligne') { dessinerAppel(); redessinerMessages(); }
  });
  $('choix-langue').append(b);
});

// ---------------------------------------------------------------- thème (Cristal, Temple, Nuit ou Bois)
const COULEUR_BARRE = { cristal: '#05080c', temple: '#3b2f22', nuit: '#07030f', bois: '#7a3e12' };
function themeChoisi() {
  return themeValide(memoire.lire('thaayam:theme'));
}
function appliquerTheme() {
  document.documentElement.dataset.skin = themeChoisi();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', COULEUR_BARRE[themeChoisi()] || '#7a3e12');
  document.querySelectorAll('[data-theme-choix]').forEach((b) => b.classList.toggle('actif', b.dataset.themeChoix === themeChoisi()));
}
THEMES.forEach(({ code, icone }) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.themeChoix = code;
  b.append(`${icone} `);
  const nom = document.createElement('span');
  nom.dataset.i18n = code;
  b.append(nom);
  b.addEventListener('click', () => {
    memoire.ecrire('thaayam:theme', code);
    appliquerTheme();
    if (session && session.etat && !$('ecran-jeu').hidden) dessinerJeu();
  });
  $('choix-theme').append(b);
});
appliquerTheme();
const stockageAsync = {
  lire: async (k) => memoire.lire(k),
  ecrire: async (k, v) => memoire.ecrire(k, v),
};

let enLigne = null;
async function obtenirEnLigne() {
  if (!enLigne) {
    let createClient;
    try {
      ({ createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'));
    } catch {
      throw new Error(t('errInternet'));
    }
    const client = createClient(SUPABASE_URL, SUPABASE_CLE_PUBLIQUE, { auth: { persistSession: false } });
    enLigne = creerEnLigne(client, stockageAsync);
  }
  return enLigne;
}

// ---------------------------------------------------------------- navigation
function aller(nom) {
  document.querySelectorAll('.ecran').forEach((e) => { e.hidden = e.id !== `ecran-${nom}`; });
  window.scrollTo(0, 0);
}
document.querySelectorAll('[data-aller]').forEach((b) =>
  b.addEventListener('click', () => { arreterSuivi(); aller(b.dataset.aller); afficherAccueil(); })
);

function pseudo() {
  const v = $('pseudo').value.trim();
  memoire.ecrire('thaayam:pseudo', v);
  return v;
}
function message(id, texte, erreur = false) {
  const el = $(id);
  el.textContent = texte || '';
  el.classList.toggle('erreur', !!erreur);
}

// ---------------------------------------------------------------- accueil
function afficherAccueil() {
  const params = new URLSearchParams(location.search);
  if (params.get('code')) $('code-rejoindre').value = params.get('code').toUpperCase();
  $('hors-ligne').hidden = navigator.onLine !== false;
  afficherMesParties();
  afficherStats();
  afficherReplays();
  afficherSocial();
  majNotifs();
}
window.addEventListener('online', () => { if (!$('ecran-accueil').hidden) afficherAccueil(); });
window.addEventListener('offline', () => { $('hors-ligne').hidden = false; });

// ---------------------------------------------------------------- statistiques
function lireStats() {
  try { return normaliserStats(JSON.parse(memoire.lire('thaayam:stats') || 'null')); } catch { return statsVides(); }
}
function afficherStats() {
  const lignes = resumeStatsTraduit(lireStats(), t);
  $('mes-stats').hidden = lignes.length === 0;
  $('liste-stats').innerHTML = '';
  lignes.forEach((l) => $('liste-stats').append(el('li', {}, l)));
}
$('btn-stats-zero').addEventListener('click', () => {
  if (!window.confirm(t('statsZeroConfirmer'))) return;
  memoire.ecrire('thaayam:stats', JSON.stringify(statsVides()));
  afficherStats();
});
/** Compte la partie une seule fois, quand elle se termine (et la garde pour la revoir). */
function noterStats(etat) {
  if (!session || etat.phase !== 'fini' || session.statsNotees === etat) return;
  session.statsNotees = etat;
  garderReplay(etat);
  const s = noterFin(lireStats(), etat, session.mode === 'ligne'
    ? { mode: 'ligne', place: session.place, code: session.partie.code } : { mode: 'local' });
  memoire.ecrire('thaayam:stats', JSON.stringify(s));
}

/** Parties en ligne de cet appareil, pour les reprendre en un clic. */
async function afficherMesParties() {
  const carte = $('mes-parties');
  let liste = [];
  try { liste = JSON.parse(memoire.lire('thaayam:mes-parties') || '[]'); } catch { /* rien */ }
  if (!liste.length) { carte.hidden = true; return; }
  try {
    const parties = await (await obtenirEnLigne()).mesParties();
    const zone = $('liste-mes-parties');
    zone.innerHTML = '';
    parties.forEach((p) => {
      const noms = p.joueurs.map((j) => nomAffiche(j.nom)).join(', ');
      const etat = p.statut === 'attente' ? t('partieAttente') : p.aMoi ? t('partieAMoi') : t('partieEnCours');
      const b = el('button', { class: p.aMoi ? 'principal' : '' },
        el('span', { class: 'code-partie' }, p.code), ' ', el('span', { class: 'petit' }, `${etat} · ${noms}`));
      b.addEventListener('click', async () => {
        try { await ouvrirPartieEnLigne(p.code, p.place, p.jeton); } catch (e) { message('message-accueil', traduireErreur(e.message, t), true); }
      });
      zone.append(b);
    });
    carte.hidden = parties.length === 0;
  } catch {
    carte.hidden = true; // hors ligne : on n'affiche rien
  }
}

$('pseudo').value = memoire.lire('thaayam:pseudo') || '';
// Pseudo changé : on met à jour le profil (amis, classement) s'il existe
$('pseudo').addEventListener('change', async () => {
  const p = pseudo();
  if (!p) return afficherSocial();
  try {
    const api = await obtenirEnLigne();
    if (await api.profilLocal()) await api.profil(p);
  } catch { /* hors ligne */ }
  afficherSocial();
});

// ---------------------------------------------------------------- amis, invitations, classement
let social = null; // { profil, amis, invitations, classement }
let minuteurSocial = null;
function cacherSocial(texte) {
  $('zone-amis').innerHTML = '';
  $('zone-amis').append(el('p', { class: 'attenue petit' }, texte));
  $('carte-invitations').hidden = true;
  $('carte-classement').hidden = true;
}
async function afficherSocial() {
  clearTimeout(minuteurSocial);
  const p = $('pseudo').value.trim();
  if (!p) return cacherSocial(t('amisPseudo'));
  try {
    social = await (await obtenirEnLigne()).social(p);
  } catch (e) {
    social = null;
    return cacherSocial(navigator.onLine === false ? t('amisHorsLigne') : traduireErreur(e.message, t));
  }
  dessinerSocial();
  // Les invitations arrivent sans recharger la page
  minuteurSocial = setTimeout(() => { if (!$('ecran-accueil').hidden) afficherSocial(); }, 20000);
}

function dessinerSocial() {
  const s = social;
  const zone = $('zone-amis');
  zone.innerHTML = '';
  zone.append(el('div', { class: 'mon-code-ami' }, el('span', { class: 'attenue petit' }, t('monCodeAmi')),
    el('strong', { class: 'code-ami' }, s.profil.code_ami)));
  zone.append(el('button', { type: 'button', onclick: async () => {
    const texte = t('messageCodeAmi', { code: s.profil.code_ami });
    if (navigator.share) {
      try { await navigator.share({ title: 'Thaayam', text: texte, url: `${location.origin}${location.pathname}` }); } catch { /* annulé */ }
    } else {
      try { await navigator.clipboard.writeText(texte); message('message-amis', t('codeAmiCopie')); } catch { message('message-amis', texte); }
    }
  } }, t('partagerCodeAmi')));
  const champ = el('input', { maxlength: 6, placeholder: t('codeAmiPlaceholder'), autocapitalize: 'characters', class: 'champ-code' });
  const ajouter = el('button', { type: 'button', class: 'principal' }, t('ajouterAmi'));
  ajouter.addEventListener('click', async () => {
    const code = champ.value.trim().toUpperCase();
    if (code.length !== 6) return message('message-amis', t('errCodeAmi'), true);
    ajouter.disabled = true;
    try {
      const a = await (await obtenirEnLigne()).ajouterAmi(code);
      await afficherSocial();
      message('message-amis', t('amiAjoute', { nom: a.pseudo }));
    } catch (e) {
      message('message-amis', traduireErreur(e.message, t), true);
      ajouter.disabled = false;
    }
  });
  zone.append(el('div', { class: 'ligne' }, champ, ajouter), el('p', { id: 'message-amis', class: 'message petit' }));
  if (!s.amis.length) zone.append(el('p', { class: 'attenue petit' }, t('aucunAmi')));
  const liste = el('ul', { class: 'liste-amis' });
  s.amis.forEach((a) => {
    liste.append(el('li', {}, el('span', { class: 'nom-ami' }, a.pseudo),
      el('button', { type: 'button', class: 'discret petit', onclick: async () => {
        if (!window.confirm(t('retirerAmiConfirmer', { nom: a.pseudo }))) return;
        try { await (await obtenirEnLigne()).retirerAmi(a.id); afficherSocial(); } catch (e) { message('message-amis', traduireErreur(e.message, t), true); }
      } }, t('retirerAmi'))));
  });
  zone.append(liste);

  // Invitations reçues
  $('carte-invitations').hidden = !s.invitations.length;
  $('liste-invitations').innerHTML = '';
  s.invitations.forEach((inv) => {
    $('liste-invitations').append(el('button', { class: 'principal', onclick: () => rejoindrePartie(inv.code) },
      t('invitePar', { nom: inv.de, code: inv.code })));
  });

  // Classement : moi et mes amis
  const lignes = trierClassement(s.classement);
  $('carte-classement').hidden = !s.amis.length && !lignes.some((x) => x.parties);
  const ol = $('liste-classement');
  ol.innerHTML = '';
  if (!lignes.some((x) => x.parties)) ol.append(el('li', { class: 'attenue petit' }, t('classementVide')));
  lignes.forEach((x) => {
    const nv = niveauJoueur(x.victoires);
    ol.append(el('li', { class: x.moi ? 'moi' : '' },
      el('span', { class: 'rang' }, ['🥇', '🥈', '🥉'][x.rang - 1] || `${x.rang}.`),
      el('div', { class: 'qui' },
        el('div', { class: 'nom' }, x.pseudo + (x.moi ? t('toi') : '')),
        el('div', { class: 'attenue petit' }, `${nv.icone} ${t(nv.cle)} · ${t('classementLigne', { v: x.victoires, p: x.parties })}`),
        x.moi && nv.prochain ? el('div', { class: 'attenue petit' }, t('prochainNiveau', { n: nv.prochain })) : '')));
  });
}

async function rejoindrePartie(code) {
  if (!pseudo()) return message('message-accueil', t('errPseudo'), true);
  message('message-accueil', t('connexion'));
  try {
    const api = await obtenirEnLigne();
    const r = await api.rejoindre(code, pseudo());
    await ouvrirPartieEnLigne(r.code, r.place, r.jeton);
    message('message-accueil', '');
  } catch (e) {
    message('message-accueil', traduireErreur(e.message, t), true);
  }
}

/** Dans le salon : inviter mes amis dans la partie. */
async function afficherAmisSalon() {
  const carte = $('salon-amis');
  if (!session || session.mode !== 'ligne' || session.partie.statut !== 'attente') { carte.hidden = true; return; }
  if (!social) {
    try { social = await (await obtenirEnLigne()).social(pseudo() || session.partie.joueurs[session.place].nom); } catch { carte.hidden = true; return; }
  }
  const presents = new Set(session.partie.joueurs.map((j) => j.nom));
  const amis = social.amis.filter((a) => !presents.has(a.pseudo));
  carte.hidden = !amis.length;
  const zone = $('salon-liste-amis');
  zone.innerHTML = '';
  session.invites = session.invites || new Set();
  amis.forEach((a) => {
    const deja = session.invites.has(a.id);
    const b = el('button', { type: 'button', class: deja ? '' : 'principal', disabled: deja }, deja ? t('invite') : t('inviter'));
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await (await obtenirEnLigne()).inviter(a.id, session.partie.code);
        session.invites.add(a.id);
        b.textContent = t('invite');
        b.className = '';
      } catch (e) {
        message('salon-message', traduireErreur(e.message, t), true);
        b.disabled = false;
      }
    });
    zone.append(el('div', { class: 'ligne-ami' }, el('span', { class: 'nom-ami' }, a.pseudo), b));
  });
}

// ---------------------------------------------------------------- dernières parties (à revoir)
const CLE_REPLAYS = 'thaayam:replays';
function lireReplays() {
  try { const l = JSON.parse(memoire.lire(CLE_REPLAYS) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; }
}
function garderReplay(etat) {
  if (!Array.isArray(etat.histo) || !etat.histo.length) return;
  const empreinte = JSON.stringify(etat.histo);
  const liste = lireReplays().filter((r) => r && r.etat && JSON.stringify(r.etat.histo) !== empreinte);
  memoire.ecrire(CLE_REPLAYS, JSON.stringify([{ quand: Date.now(), etat }, ...liste].slice(0, 5)));
}
function afficherReplays() {
  const liste = lireReplays();
  $('carte-replays').hidden = !liste.length;
  $('liste-replays').innerHTML = '';
  liste.forEach((r) => {
    const e = r.etat;
    const date = new Date(r.quand).toLocaleString(t.langue, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    $('liste-replays').append(el('button', { type: 'button', onclick: () => ouvrirRevoir(e, 'accueil') },
      el('span', { class: 'petit' }, `${date} · ${e.joueurs.map((j) => nomAffiche(j.nom)).join(', ')}`),
      el('span', { class: 'petit attenue' }, t('replayGagnant', { nom: nomAffiche(e.joueurs[e.gagnant].nom) }))));
  });
}

// ---------------------------------------------------------------- notifications et mode hors ligne
const swPret = 'serviceWorker' in navigator
  ? navigator.serviceWorker.register('sw.js').catch(() => null)
  : Promise.resolve(null);
function appareilId() {
  let id = memoire.lire('thaayam:appareil');
  if (!id) {
    id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    memoire.ecrire('thaayam:appareil', id);
  }
  return id.slice(0, 64);
}
const notifsPossibles = () => 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
const notifsActives = () => notifsPossibles() && memoire.lire('thaayam:notifs') === 'oui' && Notification.permission === 'granted';
function majNotifs() {
  const actif = notifsActives();
  $('btn-notifs').textContent = actif ? t('notifsActives') : t('notifsActiver');
  $('btn-notifs').disabled = actif;
  $('btn-notifs').classList.toggle('principal', !actif);
  $('btn-notifs-couper').hidden = !actif;
}
function octetsCle(base64) {
  const b = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
}
/** Abonne cet appareil (notifications même quand le jeu est fermé). Renvoie false si le serveur n'est pas prêt. */
async function abonnerAppareil() {
  const api = await obtenirEnLigne();
  if (!(await api.profilLocal())) await api.profil(pseudo());
  const cle = await api.cleNotifs();
  if (!cle) return false;
  const reg = await swPret;
  if (!reg) return false;
  await navigator.serviceWorker.ready;
  let abo = await reg.pushManager.getSubscription();
  if (!abo) abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: octetsCle(cle) });
  await api.abonner(appareilId(), 'web', abo.toJSON(), t.langue);
  return true;
}
$('btn-notifs').addEventListener('click', async () => {
  if (!notifsPossibles()) return message('message-notifs', t('notifsIndispo'), true);
  if (!pseudo()) return message('message-notifs', t('errPseudo'), true);
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return message('message-notifs', t('notifsRefusees'), true);
  memoire.ecrire('thaayam:notifs', 'oui');
  majNotifs();
  try {
    message('message-notifs', (await abonnerAppareil()) ? '' : t('notifsPasPretes'));
  } catch (e) {
    message('message-notifs', traduireErreur(e.message, t), true);
  }
});
$('btn-notifs-couper').addEventListener('click', async () => {
  memoire.ecrire('thaayam:notifs', 'non');
  majNotifs();
  message('message-notifs', '');
  try {
    await (await obtenirEnLigne()).abonner(appareilId(), 'web', null, t.langue);
    const reg = await swPret;
    const abo = reg && (await reg.pushManager.getSubscription());
    if (abo) await abo.unsubscribe();
  } catch { /* hors ligne */ }
});
/** La langue des notifications suit celle du jeu. */
function reabonnerLangue() {
  if (typeof notifsActives === 'function' && notifsActives()) abonnerAppareil().catch(() => {});
}

/** C'est à moi de jouer : son, vibration, et notification si le jeu est en arrière-plan. */
const titreNormal = document.title;
document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = titreNormal; });
async function signalerMonTour(code) {
  sons.tour();
  if (!document.hidden) return;
  document.title = t('titreTonTour');
  if (!notifsPossibles() || Notification.permission !== 'granted') return;
  try {
    const reg = await swPret;
    if (reg) reg.showNotification('Thaayam', { body: t('notifTour', { code }), tag: `thaayam-${code}`, icon: 'icone-192.png',
      badge: 'icone-192.png', data: { url: `${location.origin}${location.pathname}?code=${code}` } });
  } catch { /* ignoré */ }
}

$('btn-creer').addEventListener('click', () => {
  if (!pseudo()) return message('message-accueil', t('errPseudo'), true);
  ouvrirReglages('ligne');
});
$('btn-local').addEventListener('click', () => { ordiLocal = [false, false, false, false]; ouvrirReglages('local'); });
$('btn-ordi').addEventListener('click', () => { nbLocal = 2; ordiLocal = [false, true, true, true]; ouvrirReglages('local'); });
$('btn-rejoindre').addEventListener('click', () => {
  const code = $('code-rejoindre').value.trim().toUpperCase();
  if (!pseudo()) return message('message-accueil', t('errPseudo'), true);
  if (code.length !== 5) return message('message-accueil', t('errCode'), true);
  rejoindrePartie(code);
});
$('btn-guide').addEventListener('click', () => {
  session = { mode: 'local', guide: true, etat: nouvellePartieGuidee(pseudo()) };
  aller('jeu');
  dessinerJeu();
});

// ---------------------------------------------------------------- réglages
let modeReglages = 'ligne';
let edition = null;
let nbLocal = 2;
let ordiLocal = [false, true, true, true]; // joueurs joués par l'ordinateur
let niveauOrdi = (() => { try { return localStorage.getItem('thaayam:niveau') || 'normal'; } catch { return 'normal'; } })();

function ouvrirReglages(mode) {
  modeReglages = mode;
  try {
    edition = avecReglesFixes(normaliserRegles(JSON.parse(memoire.lire('thaayam:regles:v5')) || REGLES_PAR_DEFAUT).regles);
  } catch {
    edition = avecReglesFixes(copieRegles());
  }
  $('titre-reglages').textContent = mode === 'local' ? t('titreLocal') : t('titreLigne');
  $('btn-valider-regles').textContent = mode === 'local' ? t('commencer') : t('creerLaPartie');
  construireFormulaire();
  aller('reglages');
}

function el(tag, attrs = {}, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  enfants.flat().forEach((c) => e.append(c));
  return e;
}

function choix(options, actuel, surChoix) {
  const boite = el('div', { class: 'choix' });
  options.forEach(([valeur, texte]) => {
    const b = el('button', { type: 'button', class: valeur === actuel ? 'actif' : '' }, texte);
    b.addEventListener('click', () => {
      boite.querySelectorAll('button').forEach((x) => x.classList.remove('actif'));
      b.classList.add('actif');
      surChoix(valeur);
    });
    boite.append(b);
  });
  return boite;
}

function caseACocher(texte, coche, surChange, aide) {
  return el('label', { class: 'case' },
    el('input', { type: 'checkbox', checked: coche, onchange: (e) => { surChange(e.target.checked); verifierReglages(); } }),
    el('span', {}, texte, aide ? el('div', { class: 'aide' }, aide) : ''));
}

function construireFormulaire() {
  const f = $('form-regles');
  f.innerHTML = '';
  const r = edition;

  if (modeReglages === 'local') {
    const noms = el('div', { class: 'formulaire' });
    const dessinerNoms = () => {
      noms.innerHTML = '';
      for (let i = 0; i < nbLocal; i++) {
        const nomParDefaut = ordiLocal[i] ? t('ordiCouleur', { couleur: nomAffiche(COULEURS[i].nom).toLowerCase() }) : i === 0 ? ($('pseudo').value.trim() || nomAffiche(COULEURS[i].nom)) : nomAffiche(COULEURS[i].nom);
        noms.append(el('div', { class: 'ligne-joueur' },
          el('label', {},
            el('span', {}, el('span', { class: 'pastille', style: `display:inline-block;background:${COULEURS[i].code};vertical-align:middle;margin-right:6px` }), t('joueurN', { n: i + 1 })),
            el('input', { id: `nom-${i}`, maxlength: 20, value: nomParDefaut })),
          el('label', { class: 'case' },
            el('input', { type: 'checkbox', id: `ordi-${i}`, checked: ordiLocal[i],
              onchange: (e) => { ordiLocal[i] = e.target.checked; dessinerNoms(); } }),
            el('span', {}, t('ordinateur')))));
      }
    };
    dessinerNoms();
    f.append(el('fieldset', {}, el('legend', {}, t('joueurs')),
      choix([2, 3, 4].map((n) => [n, t('nJoueurs', { n })]), nbLocal, (v) => { nbLocal = v; dessinerNoms(); }),
      noms,
      el('label', {}, t('niveauOrdi'),
        choix(['facile', 'normal', 'fort'].map((n) => [n, t(n)]), niveauOrdi, (v) => {
          niveauOrdi = v;
          try { localStorage.setItem('thaayam:niveau', v); } catch { /* ignoré */ }
        }))));
  }

  // Plateau toujours en croix (REGLES_FIXES) : seul le nombre de pions se choisit
  f.append(el('fieldset', {}, el('legend', {}, t('plateau')),
    el('label', {}, t('pionsParJoueur'),
      (() => {
        const s = el('select', { onchange: (e) => { r.nbPions = Number(e.target.value); verifierReglages(); } });
        for (let i = 1; i <= 12; i++) s.append(el('option', { value: i, selected: i === r.nbPions }, String(i)));
        return s;
      })())));

  const blocCauris = el('div', { class: 'formulaire' },
    el('label', {}, t('nbCauris'),
      (() => {
        const s = el('select', { onchange: (e) => { r.des.nbCauris = Number(e.target.value); verifierReglages(); } });
        for (let i = 2; i <= 7; i++) s.append(el('option', { value: i, selected: i === r.des.nbCauris }, String(i)));
        return s;
      })()),
    el('label', {}, t('valeurZeroCauri'),
      el('input', { type: 'number', min: 1, max: 24, value: r.des.valeurZero, inputmode: 'numeric',
        oninput: (e) => { r.des.valeurZero = Number(e.target.value); verifierReglages(); } }),
      el('span', { class: 'aide' }, 'Souvent 8 avec 4 cauris, 12 avec 6 cauris.')));
  const blocDes = el('div', { class: 'formulaire' },
    el('label', {}, t('nbDes'),
      (() => {
        const s = el('select', { onchange: (e) => { r.des.nbDes = Number(e.target.value); verifierReglages(); } });
        for (let i = 1; i <= 3; i++) s.append(el('option', { value: i, selected: i === r.des.nbDes }, String(i)));
        return s;
      })()),
    el('label', {}, t('faces'),
      el('input', { value: r.des.faces.join(', '), oninput: (e) => { r.des.faces = lireListe(e.target.value); verifierReglages(); } }),
      el('span', { class: 'aide' }, t('aideFaces'))),
    el('label', {}, t('toutZero'),
      el('input', { type: 'number', min: 0, max: 24, value: r.des.valeurToutZero, inputmode: 'numeric',
        oninput: (e) => { r.des.valeurToutZero = Number(e.target.value); verifierReglages(); } }),
      el('span', { class: 'aide' }, t('aideToutZero'))),
    el('label', {}, t('doubles'),
      el('input', { id: 'champ-doubles', value: r.doublesRejouer.join(', '),
        oninput: (e) => { r.doublesRejouer = lireListe(e.target.value); verifierReglages(); } }),
      el('span', { class: 'aide' }, t('aideDoubles'))));
  const entree = el('input', { id: 'champ-entree', value: r.valeursEntree.join(', '),
    oninput: (e) => { r.valeursEntree = lireListe(e.target.value); verifierReglages(); } });
  const rejouer = el('input', { id: 'champ-rejouer', value: r.valeursRejouer.join(', '),
    oninput: (e) => { r.valeursRejouer = lireListe(e.target.value); verifierReglages(); } });
  // Cauris : plus proposés (remplacés par le dé classique) ; le dé classique n'a rien à régler
  const montrerDes = () => { blocCauris.hidden = r.des.type !== 'cauris'; blocDes.hidden = r.des.type !== 'desLongs'; };
  montrerDes();

  f.append(el('fieldset', {}, el('legend', {}, t('lancerLegende')),
    choix([['desLongs', t('desLongs')], ['de6', t('de6')]], r.des.type, (v) => {
      r.des.type = v;
      // Dé classique : 1 dé, faces 1 à 6 ; retour aux dés longs : 2 dés, faces 0 à 3
      r.des.nbDes = v === 'de6' ? 1 : 2;
      r.des.faces = v === 'de6' ? [1, 2, 3, 4, 5, 6] : [0, 1, 2, 3];
      blocDes.querySelector('select').value = String(r.des.nbDes);
      blocDes.querySelectorAll('input')[0].value = r.des.faces.join(', ');
      r.valeursEntree = [...PRESETS_DES[v].valeursEntree];
      r.valeursRejouer = [...PRESETS_DES[v].valeursRejouer];
      r.doublesRejouer = [...PRESETS_DES[v].doublesRejouer];
      blocDes.querySelector('#champ-doubles').value = r.doublesRejouer.join(', ');
      entree.value = r.valeursEntree.join(', ');
      rejouer.value = r.valeursRejouer.join(', ');
      montrerDes();
      verifierReglages();
    }),
    blocCauris, blocDes,
    el('div', { id: 'valeurs-possibles', class: 'aide' }),
    el('label', {}, t('valeursEntree'), entree),
    el('label', {}, t('valeursRejouer'), rejouer)));

  // Déplacements : règles fixes (REGLES_FIXES), plus de choix à faire


  verifierReglages();
}

function verifierReglages() {
  const { erreurs } = normaliserRegles(edition);
  const vp = $('valeurs-possibles');
  if (vp) vp.textContent = t('valeursPossibles', { v: valeursPossibles(edition).join(', ') });
  message('erreurs-regles', erreurs.map((e) => traduireErreur(e, t)).join(' '), true);
  $('btn-valider-regles').disabled = erreurs.length > 0;
  return erreurs.length === 0;
}

$('form-regles').addEventListener('submit', (e) => e.preventDefault());
$('btn-valider-regles').addEventListener('click', async () => {
  if (!verifierReglages()) return;
  const regles = avecReglesFixes(normaliserRegles(edition).regles);
  memoire.ecrire('thaayam:regles:v5', JSON.stringify(regles));
  if (modeReglages === 'local') {
    // Les noms par défaut sont gardés en français (« Rouge », « Ordi vert ») pour être traduits à l'affichage
    const nomCanonique = (i) => {
      const brut = $(`nom-${i}`).value.trim();
      const defauts = [COULEURS[i].nom, `Ordi ${COULEURS[i].nom.toLowerCase()}`];
      return defauts.find((d) => nomAffiche(d) === brut) || brut || COULEURS[i].nom;
    };
    const joueurs = Array.from({ length: nbLocal }, (_, i) => ({ nom: nomCanonique(i), ordi: ordiLocal[i] ? niveauOrdi : false }));
    session = { mode: 'local', etat: nouvellePartie(regles, joueurs) };
    aller('jeu');
    dessinerJeu();
    return;
  }
  const b = $('btn-valider-regles');
  b.disabled = true;
  message('erreurs-regles', t('creation'));
  try {
    const api = await obtenirEnLigne();
    const r = await api.creer(regles, pseudo());
    message('erreurs-regles', '');
    await ouvrirPartieEnLigne(r.code, r.place, r.jeton);
  } catch (e) {
    message('erreurs-regles', traduireErreur(e.message, t), true);
  } finally {
    b.disabled = false;
  }
});

// ---------------------------------------------------------------- en ligne
let session = null; // { mode, etat, partie?, place?, jeton?, arret? }

function arreterSuivi() {
  if (session && session.arret) session.arret();
  if (session) session.arret = null;
  arreterPartieSociale();
}

async function ouvrirPartieEnLigne(code, place, jeton) {
  arreterSuivi();
  const api = await obtenirEnLigne();
  const partie = await api.lire(code);
  session = { mode: 'ligne', partie, etat: partie.etat, place, jeton, reactionVue: partie.reaction ? partie.reaction.n : 0 };
  session.arret = api.suivre(code, (nouvelle) => traiterMiseAJour(nouvelle));
  history.replaceState(null, '', `?code=${code}`);
  demarrerPartieSociale(code);
  afficherPartieEnLigne();
}

/** Mise à jour reçue du serveur (coup d'un autre joueur, message rapide, revanche…). */
function traiterMiseAJour(nouvelle) {
    if (!session || session.mode !== 'ligne' || nouvelle.code !== session.partie.code) return;
    if (nouvelle.reaction && nouvelle.reaction.n !== session.reactionVue) {
      session.reactionVue = nouvelle.reaction.n;
      montrerReaction(nouvelle.reaction);
    }
    if (nouvelle.revanche && nouvelle.revanche !== session.partie.revanche) {
      session.partie = { ...session.partie, revanche: nouvelle.revanche };
      if (session.etat && session.etat.phase === 'fini') dessinerJeu();
    }
    // Mon propre coup qui revient du serveur : rien à rejouer, on garde juste la version
    if (session.envoi && nouvelle.etat && nouvelle.etat.numero <= session.envoi.numero && nouvelle.statut !== 'attente') {
      if (nouvelle.version > session.partie.version) session.partie = { ...nouvelle, etat: session.partie.etat };
      return;
    }
    // Pendant une animation, on garde la mise à jour la plus récente pour juste après
    if (animation) { session.enAttente = nouvelle; return; }
    const changementStatut = nouvelle.statut !== session.partie.statut;
    const plusRecente = nouvelle.version > session.partie.version ||
      (nouvelle.statut === 'attente' && JSON.stringify(nouvelle.joueurs) !== JSON.stringify(session.partie.joueurs));
    if (!plusRecente && !changementStatut) return;
    const avant = session.etat;
    session.partie = nouvelle;
    const e = nouvelle.etat;
    if (e && e.phase !== 'fini' && e.tour === session.place && (!avant || avant.tour !== session.place)) {
      signalerMonTour(nouvelle.code);
    }
    if (nouvelle.statut !== 'attente' && avant && nouvelle.etat) montrer(avant, nouvelle.etat);
    else {
      session.etat = nouvelle.etat;
      afficherPartieEnLigne();
    }
}

function lienPartie() {
  return `${location.origin}${location.pathname}?code=${session.partie.code}`;
}

function afficherPartieEnLigne() {
  const p = session.partie;
  if (p.statut === 'attente') {
    aller('salon');
    $('salon-code').textContent = p.code;
    $('salon-joueurs').innerHTML = '';
    p.joueurs.forEach((j, i) =>
      $('salon-joueurs').append(el('li', {}, el('span', { class: 'pastille', style: `background:${COULEURS[i].code}` }),
        nomAffiche(j.nom), i === session.place ? t('toi') : '', i === 0 ? t('createur') : '')));
    $('salon-regles').innerHTML = '';
    resumeReglesTraduit(p.regles, t).forEach((l) => $('salon-regles').append(el('li', {}, l)));
    const createur = session.place === 0;
    $('btn-demarrer').hidden = !createur;
    $('btn-demarrer').disabled = p.joueurs.length < 2;
    message('salon-message', createur
      ? (p.joueurs.length < 2 ? t('salonPeu') : t('salonPrets', { n: p.joueurs.length }))
      : t('salonAttente'));
    afficherAmisSalon();
    placerZonePartie();
    return;
  }
  dessinerJeu();
}

$('btn-copier').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(lienPartie());
    message('salon-message', t('lienCopie'));
  } catch {
    message('salon-message', lienPartie());
  }
});
$('btn-partager').addEventListener('click', async () => {
  const texte = t('invitation', { code: session.partie.code });
  if (navigator.share) {
    try { await navigator.share({ title: 'Thaayam', text: texte, url: lienPartie() }); } catch { /* annulé */ }
  } else {
    $('btn-copier').click();
  }
});
$('btn-demarrer').addEventListener('click', async () => {
  $('btn-demarrer').disabled = true;
  try {
    const api = await obtenirEnLigne();
    const p = await api.lire(session.partie.code);
    await api.demarrer(p, session.jeton);
    session.partie = await api.lire(p.code);
    session.etat = session.partie.etat;
    afficherPartieEnLigne();
  } catch (e) {
    message('salon-message', traduireErreur(e.message, t), true);
    $('btn-demarrer').disabled = false;
  }
});

// ---------------------------------------------------------------- discussion et appels (en ligne)
const EMOJIS = ['😀', '😂', '😍', '😎', '😮', '😢', '😡', '👍', '👏', '🔥', '🎉', '🙏', '💪', '❤️'];
const EMOJI_SEUL = /^(\p{Extended_Pictographic}|\p{Emoji_Modifier}|️|‍){1,8}$/u;
let discussion = { arret: null, messages: [] };
let appel = null;
let canalAppel = null;

/** Discussion et appels apparaissent dans le salon d'attente, puis sous le plateau pendant la partie. */
function placerZonePartie() {
  const zone = $('zone-partie-ligne');
  const enLigne = session && session.mode === 'ligne';
  zone.hidden = !enLigne;
  if (!enLigne) return;
  if (session.partie.statut === 'attente') {
    if (zone.parentElement !== $('ecran-salon')) $('ecran-salon').append(zone);
  } else if (zone.previousElementSibling !== $('jeu-message')) {
    $('jeu-message').after(zone);
  }
}

function nomDeLaPlace(place) {
  const j = (session.etat && session.etat.joueurs[place]) || session.partie.joueurs[place];
  return j ? nomAffiche(j.nom) : '?';
}

async function demarrerPartieSociale(code) {
  arreterPartieSociale();
  discussion = { arret: null, messages: [] };
  redessinerMessages();
  const s0 = session;
  try {
    const api = await obtenirEnLigne();
    if (session !== s0) return;
    discussion.arret = api.suivreMessages(code, (m) => ajouterMessage(m, true));
    (await api.messages(code)).forEach((m) => ajouterMessage(m, false));
    canalAppel = api.canalAppel(code, (m) => { if (appel) appel.recevoir(m); });
    appel = creerAppel({ canal: canalAppel, place: session.place, nom: nomDeLaPlace(session.place), surChange: dessinerAppel,
      surSonnerie: montrerSonnerie, serveurs: () => api.serveursAppel(code, session.jeton) });
  } catch { /* hors ligne */ }
  dessinerAppel();
}

function arreterPartieSociale() {
  if (discussion.arret) discussion.arret();
  discussion.arret = null;
  if (appel) appel.raccrocher();
  if (canalAppel) canalAppel.arreter();
  appel = null;
  canalAppel = null;
  montrerSonnerie(null);
  document.querySelectorAll('#appel-videos video').forEach((v) => { v.srcObject = null; });
  $('appel-videos').innerHTML = '';
}

function ajouterMessage(m, nouveau) {
  if (discussion.messages.some((x) => x.id === m.id)) return;
  discussion.messages.push(m);
  discussion.messages.sort((a, b) => a.id - b.id);
  redessinerMessages();
  if (!nouveau) return;
  if (EMOJI_SEUL.test(m.texte)) lancerEmojiVolant(m.texte);
  if (session && m.place !== session.place) vibrer(30);
}

function redessinerMessages() {
  const liste = $('messages');
  liste.innerHTML = '';
  if (!discussion.messages.length) {
    liste.append(el('li', { class: 'vide' }, t('aucunMessage')));
    return;
  }
  discussion.messages.forEach((m) => {
    const moi = session && m.place === session.place;
    const couleur = COULEURS[m.place] ? COULEURS[m.place].code : '';
    liste.append(el('li', { class: `${moi ? 'moi' : ''}${EMOJI_SEUL.test(m.texte) ? ' emoji-seul' : ''}` },
      el('span', { class: 'auteur', style: `color:${couleur}` }, moi ? t('moi') : nomDeLaPlace(m.place)),
      el('span', { class: 'texte' }, m.texte)));
  });
  liste.scrollTop = liste.scrollHeight;
}

function lancerEmojiVolant(texte) {
  const zone = $('emojis-volants');
  for (let k = 0; k < 3; k++) {
    const e = el('span', { class: 'emoji-volant', style: `left:${10 + Math.random() * 75}%;animation-delay:${k * 0.25}s` }, texte);
    zone.append(e);
    setTimeout(() => e.remove(), 3400);
  }
}

async function envoyerMessage(texte) {
  if (!session || session.mode !== 'ligne' || !texte.trim()) return false;
  try {
    await (await obtenirEnLigne()).ecrire(session.partie.code, session.jeton, texte);
    message('message-discussion', '');
    return true;
  } catch (e) {
    message('message-discussion', traduireErreur(e.message, t), true);
    return false;
  }
}
EMOJIS.forEach((e) => $('emojis').append(el('button', { type: 'button', 'aria-label': e, onclick: () => envoyerMessage(e) }, e)));
$('form-message').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const champ = $('champ-message');
  if (await envoyerMessage(champ.value)) champ.value = '';
});

/** Tuiles vidéo (ou avatar pour un appel vocal) et boutons de l'appel. */
function dessinerAppel() {
  const possible = appelsPossibles();
  const a = appel ? appel.etat : null;
  const actif = !!(a && a.actif);
  $('appel-depart').hidden = actif || !possible;
  $('appel-en-cours').hidden = !actif;
  if (!possible) message('message-appel', t('appelIndispo'), true);
  if (!actif) {
    document.querySelectorAll('#appel-videos video').forEach((v) => { v.srcObject = null; });
    $('appel-videos').innerHTML = '';
    $('appel-attente').hidden = true;
    return;
  }
  $('btn-micro').textContent = a.micro ? t('micOui') : t('micNon');
  $('btn-camera').textContent = a.camera ? t('camOui') : t('camNon');
  $('btn-camera').hidden = !a.video;
  $('appel-attente').hidden = [...a.pairs.values()].some((p) => p.flux);
  const tuiles = [{ cle: 'moi', place: session.place, flux: a.local, moi: true }];
  a.pairs.forEach((p, place) => { if (p.flux) tuiles.push({ cle: `p${place}`, place, flux: p.flux }); });
  const zone = $('appel-videos');
  // On garde les tuiles existantes (sinon la vidéo clignote à chaque mise à jour)
  [...zone.children].forEach((x) => { if (!tuiles.some((tu) => tu.cle === x.dataset.cle)) x.remove(); });
  tuiles.forEach((tu) => {
    let tuile = zone.querySelector(`[data-cle="${tu.cle}"]`);
    if (!tuile) {
      const video = el('video', { autoplay: true, playsinline: true });
      video.muted = !!tu.moi; // on ne s'entend pas soi-même
      tuile = el('div', { class: `tuile${tu.moi ? ' moi' : ''}`, 'data-cle': tu.cle }, video,
        el('div', { class: 'avatar' }), el('span', { class: 'nom-tuile' }));
      zone.append(tuile);
    }
    const video = tuile.querySelector('video');
    if (video.srcObject !== tu.flux) video.srcObject = tu.flux;
    const avecImage = tu.flux.getVideoTracks().some((p) => p.enabled && p.readyState === 'live') && (!tu.moi || a.camera);
    video.style.visibility = avecImage ? 'visible' : 'hidden';
    const couleur = COULEURS[tu.place] ? COULEURS[tu.place].code : '#555';
    const avatar = tuile.querySelector('.avatar');
    avatar.hidden = avecImage;
    avatar.style.background = couleur;
    avatar.textContent = (tu.moi ? t('moi') : nomDeLaPlace(tu.place)).slice(0, 1).toUpperCase();
    tuile.querySelector('.nom-tuile').textContent = tu.moi ? t('moi') : nomDeLaPlace(tu.place);
  });
}

let sonnerieActuelle = null;
function montrerSonnerie(s) {
  sonnerieActuelle = s;
  $('sonnerie').hidden = !s;
  if (!s) return;
  const nom = s.de !== undefined && session ? nomDeLaPlace(s.de) : s.nom;
  $('sonnerie-texte').textContent = s.enCours ? t('enAppel', { nom }) : s.video ? t('tAppelleVideo', { nom }) : t('tAppelle', { nom });
  if (!s.enCours) sons.tour();
}

/** Le jeu demande d'abord l'accord du joueur, puis le navigateur demande l'autorisation du micro (et de la caméra). */
async function entrerDansAppel(video, accepter) {
  if (!appel) return;
  if (!appelsPossibles()) return message('message-appel', t('appelIndispo'), true);
  if (!window.confirm(video ? t('confirmerCamera') : t('confirmerMicro'))) return;
  message('message-appel', '');
  try {
    if (accepter) await appel.accepter(video);
    else await appel.demarrer(video);
  } catch {
    message('message-appel', t('appelPermission'), true);
    montrerSonnerie(null);
  }
}
$('btn-appel-vocal').addEventListener('click', () => entrerDansAppel(false, false));
$('btn-appel-video').addEventListener('click', () => entrerDansAppel(true, false));
$('btn-accepter').addEventListener('click', () => entrerDansAppel(false, true));
$('btn-accepter-video').addEventListener('click', () => entrerDansAppel(true, true));
$('btn-refuser').addEventListener('click', () => { if (appel) appel.refuser(); else montrerSonnerie(null); });
$('btn-raccrocher').addEventListener('click', () => { if (appel) appel.raccrocher(); });
$('btn-micro').addEventListener('click', () => { if (appel) appel.basculerMicro(); });
$('btn-camera').addEventListener('click', () => { if (appel) appel.basculerCamera(); });

// ---------------------------------------------------------------- jeu
let occupe = false;
let animation = false;
let voirTrajet = false;

function jePeuxJouer() {
  const e = session && session.etat;
  if (!e || e.phase === 'fini' || occupe || animation) return false;
  if (session.mode === 'local') return !e.joueurs[e.tour].ordi;
  return e.tour === session.place;
}

// L'ordinateur joue tout seul, avec une petite pause pour qu'on suive.
let minuteurOrdi = null;
function faireJouerOrdi() {
  clearTimeout(minuteurOrdi);
  const e = session && session.etat;
  if (!e || animation || session.mode !== 'local' || e.phase === 'fini' || !e.joueurs[e.tour].ordi) return;
  minuteurOrdi = setTimeout(() => {
    const s = session && session.etat;
    if (s !== e) return; // la partie a changé entre-temps
    if (e.phase === 'lancer') {
      secouerDes();
      appliquer(lancer(e, tirageAleatoire()));
    } else {
      const coup = choisirCoup(e);
      if (coup) appliquer(jouer(e, coup.pion, !!coup.groupe));
    }
  }, e.phase === 'lancer' ? 450 : 550);
}

function secouerDes() {
  $('des').classList.remove('secoue');
  void $('des').offsetWidth;
  $('des').classList.add('secoue');
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Les dés roulent un instant (faces au hasard) avant de montrer le vrai lancer. */
async function roulerDes(etat) {
  const zone = $('des');
  const l = etat.dernierLancer;
  if (!l) return;
  const d = etat.regles.des;
  zone.classList.add('roule');
  for (let k = 0; k < 5; k++) {
    zone.innerHTML = '';
    if (d.type === 'cauris') l.detail.forEach(() => zone.append(cauri(Math.random() < 0.5)));
    else if (d.type === 'de6') l.detail.forEach(() => zone.append(deCube(1 + Math.floor(Math.random() * 6))));
    else l.detail.forEach(() => zone.append(deLong(d.faces[Math.floor(Math.random() * d.faces.length)])));
    await pause(70);
  }
  zone.classList.remove('roule');
}

/** Éclat lumineux sur une case (pion mangé, pion arrivé), effacé après l'animation. */
function eclat(k, couleur) {
  if (!session) return;
  session.eclat = { k, couleur };
  setTimeout(() => {
    if (session && session.eclat && session.eclat.k === k) {
      session.eclat = null;
      if (!animation && !$('ecran-jeu').hidden) dessinerJeu();
    }
  }, 700);
}

/**
 * Passe de l'état `ancien` à `nouveau` : les dés roulent, le pion déplacé avance
 * case par case en sautillant, puis sons, vibrations et éclats.
 */
async function montrer(ancien, nouveau) {
  const nouveauCoup = ancien && nouveau && nouveau.numero > ancien.numero;
  if (!nouveauCoup) {
    session.etat = nouveau;
    dessinerJeu();
    return;
  }
  const g = geometrie(nouveau.regles, nouveau.joueurs.length);
  const s0 = session;
  const dc = nouveau.dernierCoup;
  const coupJoue = dc && JSON.stringify(dc) !== JSON.stringify(ancien.dernierCoup);
  const nouveauLancer = nouveau.dernierLancer && JSON.stringify(nouveau.dernierLancer) !== JSON.stringify(ancien.dernierLancer);
  animation = true;
  try {
    if (nouveauLancer && !coupJoue) {
      sons.des();
      await roulerDes(nouveau);
    }
    if (coupJoue && dc.depuis >= 0 && session === s0) {
      // Le pion glisse de case en case (animation fluide, sans redessiner le plateau)
      const bouges = dc.groupe || [dc.pion];
      const vue = JSON.parse(JSON.stringify(ancien));
      vue.lancer = null;
      s0.masques = new Set(bouges.map((i) => `${dc.joueur}:${i}`));
      session.etat = vue;
      dessinerJeu();
      await glisser(g, dc.joueur, [dc.depuis, ...etapesCoup(g, dc.depuis, dc.vers)], ancien.joueurs[dc.joueur].couleur, bouges.length);
      s0.masques = null;
    }
  } finally {
    animation = false; // toujours, même si la partie a été quittée pendant l'animation
  }
  if (session !== s0) return;
  session.etat = nouveau;
  if (coupJoue) {
    const capturesAvant = ancien.joueurs.reduce((s, j) => s + j.captures, 0);
    const capturesApres = nouveau.joueurs.reduce((s, j) => s + j.captures, 0);
    const k = cle(g.chemins[dc.joueur][dc.vers]);
    if (nouveau.phase === 'fini') { sons.victoire(); eclat(k, '#ffd54a'); }
    else if (capturesApres > capturesAvant) { sons.capture(); eclat(k, '#ff4d4d'); }
    else if (dc.vers === g.arrivee) { sons.arrivee(); eclat(k, '#ffd54a'); }
    else if (dc.depuis === -1) sons.entree();
    else sons.pas();
  }
  // Contre l'ordinateur : petit signal quand c'est de nouveau à un humain de jouer
  if (session.mode === 'local' && nouveau.phase !== 'fini' && nouveau.tour !== ancien.tour &&
    !nouveau.joueurs[nouveau.tour].ordi && ancien.joueurs[ancien.tour].ordi) sons.tour();
  dessinerJeu();
  // Une mise à jour est arrivée pendant l'animation : on la traite maintenant
  if (session.enAttente) {
    const suivante = session.enAttente;
    session.enAttente = null;
    traiterMiseAJour(suivante);
  }
}

/**
 * Fait glisser un pion (ou un groupe) par les cases `positions` de son chemin.
 * Animation confiée au navigateur (carte graphique) : fluide même sur un petit téléphone.
 */
const PAS_MS = 125;
function glisser(g, joueur, positions, couleur, nombre) {
  const racine = $('plateau');
  const couche = racine._glisse; // groupe tourné comme le plateau : sert à convertir les positions
  const conteneur = racine.parentElement;
  if (!couche || positions.length < 2 || !couche.getScreenCTM) return Promise.resolve();
  const zone = zoneCase(g, 100);
  const T = themePlateau(themeChoisi());
  const ctm = couche.getScreenCTM();
  const boite = conteneur.getBoundingClientRect();
  const echelle = Math.hypot(ctm.a, ctm.b);
  // Positions à l'écran (en pixels, dans la zone du plateau), plateau tourné compris
  const pts = positions.map((p) => {
    const z = zone(cle(g.chemins[joueur][p]));
    const pt = new DOMPoint(z.x + z.w / 2, z.y + z.w / 2).matrixTransform(ctm);
    return [pt.x - boite.left, pt.y - boite.top];
  });
  const d = 68 * echelle;
  // Le pion qui glisse est un disque posé au-dessus du dessin : le téléphone le déplace sans repeindre le plateau
  const pion = document.createElement('div');
  pion.className = 'pion-glisse';
  pion.style.cssText = `width:${d}px;height:${d}px;margin:${-d / 2}px 0 0 ${-d / 2}px;background:${couleur};` +
    `border:${Math.max(1.5, 3 * echelle)}px solid ${T.pionTrait};transform:translate(${pts[0][0]}px,${pts[0][1]}px)`;
  if (nombre > 1) pion.textContent = `×${nombre}`;
  conteneur.append(pion);
  const sonsPas = pts.slice(1).map((_, i) => setTimeout(() => sons.pas(), PAS_MS * (i + 1)));
  const fin = () => { sonsPas.forEach(clearTimeout); pion.remove(); };
  const images = [];
  pts.forEach(([x, y], i) => {
    images.push({ transform: `translate(${x}px,${y}px) scale(1)`, offset: i / (pts.length - 1), easing: 'ease-in-out' });
    if (i < pts.length - 1) {
      const [x2, y2] = pts[i + 1];
      images.push({ transform: `translate(${(x + x2) / 2}px,${(y + y2) / 2}px) scale(1.18)`, offset: (i + 0.5) / (pts.length - 1), easing: 'ease-in-out' });
    }
  });
  const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof pion.animate !== 'function' || reduit) return pause(reduit ? 0 : PAS_MS * (pts.length - 1)).then(fin);
  const a = pion.animate(images, { duration: PAS_MS * (pts.length - 1), fill: 'forwards' });
  return a.finished.then(fin, fin);
}

async function appliquer(nouvelEtat) {
  const avant = session.etat;
  if (session.mode === 'local') {
    await montrer(avant, nouvelEtat);
    return;
  }
  occupe = true;
  const ancien = session.partie;
  // Le coup part au serveur tout de suite, pendant que le pion avance à l'écran
  session.envoi = nouvelEtat;
  const envoi = obtenirEnLigne().then((api) => api.envoyer(ancien.code, session.jeton, ancien.version, nouvelEtat));
  envoi.catch(() => {});
  await montrer(avant, nouvelEtat);
  try {
    const v = await envoi;
    if (v >= session.partie.version) {
      session.partie = { ...session.partie, etat: nouvelEtat, version: v, statut: nouvelEtat.phase === 'fini' ? 'finie' : 'en_cours' };
    }
    message('jeu-message', '');
  } catch (e) {
    message('jeu-message', traduireErreur(e.message, t), true);
    try {
      const api = await obtenirEnLigne();
      session.partie = await api.lire(ancien.code);
      session.etat = session.partie.etat;
    } catch { /* hors ligne */ }
  } finally {
    if (session) session.envoi = null;
    occupe = false;
    dessinerJeu();
  }
}

function tirageAleatoire() {
  if (window.crypto && crypto.getRandomValues) {
    const t = new Uint32Array(1);
    return () => { crypto.getRandomValues(t); return t[0] / 4294967296; };
  }
  return Math.random;
}

$('btn-lancer').addEventListener('click', () => {
  if (!jePeuxJouer() || session.etat.phase !== 'lancer') return;
  secouerDes();
  appliquer(lancer(session.etat, tirageAleatoire(), session.guide ? lancerGuide(session.etat) : null));
});
$('btn-entrer').addEventListener('click', () => {
  const coup = coupsPossibles(session.etat).find((c) => c.depuis === -1 && !c.groupe);
  if (coup && jePeuxJouer()) appliquer(jouer(session.etat, coup.pion));
});
$('btn-entrer-groupe').addEventListener('click', () => {
  const coup = coupsPossibles(session.etat).find((c) => c.groupe);
  if (coup && jePeuxJouer()) appliquer(jouer(session.etat, coup.pion, true));
});
$('btn-quitter').addEventListener('click', () => {
  arreterSuivi();
  clearTimeout(minuteurOrdi);
  session = null;
  history.replaceState(null, '', location.pathname);
  aller('accueil');
  afficherAccueil();
});
$('btn-regles-jeu').addEventListener('click', () => { $('jeu-regles').hidden = !$('jeu-regles').hidden; });
$('btn-rejouer').addEventListener('click', () => {
  const e = session && session.etat;
  if (!e || session.mode !== 'local') return;
  session.etat = session.guide ? nouvellePartieGuidee(pseudo())
    : nouvellePartie(e.regles, e.joueurs.map((j) => ({ nom: j.nom, ordi: j.ordi || false })));
  session.statsNotees = null;
  dessinerJeu();
});
$('btn-revoir').addEventListener('click', () => { if (session && session.etat) ouvrirRevoir(session.etat, 'jeu'); });
$('btn-son').addEventListener('click', () => { basculerSon(); majBoutonSon(); });
$('btn-vibr').addEventListener('click', () => { basculerVibrations(); majBoutonVibr(); });
function majBoutonVibr() {
  $('btn-vibr').textContent = vibrationsActives() ? t('vibrOui') : t('vibrNon');
  $('btn-vibr').hidden = !('vibrate' in navigator);
}
majBoutonVibr();
$('btn-trajet').addEventListener('click', () => {
  voirTrajet = !voirTrajet;
  majBoutonTrajet();
  dessinerJeu();
});
function majBoutonTrajet() { $('btn-trajet').textContent = voirTrajet ? t('cacherTrajet') : t('voirTrajet'); }
function majBoutonSon() { $('btn-son').textContent = sonActif() ? t('son') : t('muet'); }
majBoutonSon();
majBoutonTrajet();

function dessinerDes(etat, zone = $('des')) {
  zone.innerHTML = '';
  const l = etat.lancer || etat.dernierLancer;
  if (!l) {
    zone.append(el('span', { class: 'attenue' }, t('lanceLesDes')));
    return;
  }
  if (!etat.lancer) zone.append(el('span', { class: 'attenue petit' }, t('dernierLancer', { nom: nomAffiche(etat.joueurs[l.joueur].nom) })));
  if (etat.regles.des.type === 'cauris') {
    l.detail.forEach((ouvert) => zone.append(cauri(ouvert)));
  } else if (etat.regles.des.type === 'de6') {
    l.detail.forEach((f) => zone.append(deCube(f)));
  } else {
    l.detail.forEach((f) => zone.append(deLong(f)));
  }
  zone.append(el('span', { class: 'valeur' }, nomLancer(etat.regles, l)));
}

/** Dé classique vu de dessus : 1 à 6 points placés comme sur un vrai dé. */
const POINTS_DE6 = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function deCube(valeur) {
  const d = el('div', { class: 'de-cube', 'aria-label': String(valeur) });
  for (let i = 0; i < 9; i++) d.append(el('span', { class: (POINTS_DE6[valeur] || []).includes(i) ? 'point' : '' }));
  return d;
}

/** Dé long (dayakattai) vu de dessus : une face avec 0 à 3 points. */
function deLong(points) {
  const d = el('div', { class: 'de-long', 'aria-label': String(points) });
  if (points > 3) d.append(String(points));
  else for (let i = 0; i < points; i++) d.append(el('span', { class: 'point' }));
  return d;
}

function cauri(ouvert) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 30 40');
  s.setAttribute('width', '28');
  s.setAttribute('height', '38');
  s.innerHTML = ouvert
    ? '<ellipse cx="15" cy="20" rx="13" ry="18" fill="#f4ead5" stroke="#8a6a3b" stroke-width="2"/><path d="M15 6 Q11 20 15 34 Q19 20 15 6" fill="#5b3a1a"/><path d="M12 12h-3M12 17h-4M12 22h-4M12 27h-3M18 12h3M18 17h4M18 22h4M18 27h3" stroke="#8a6a3b" stroke-width="1.2"/>'
    : '<ellipse cx="15" cy="20" rx="13" ry="18" fill="#d8b98a" stroke="#8a6a3b" stroke-width="2"/><ellipse cx="13" cy="15" rx="5" ry="7" fill="#f2dfbd" opacity="0.7"/>';
  s.setAttribute('aria-label', ouvert ? 'cauri ouvert' : 'cauri fermé');
  return s;
}

/** Bandeau des joueurs : pions à la maison, arrivés, captures. */
function dessinerBandeau(etat, g, moi, bandeau) {
  const cleBandeau = `${t.langue}|${moi}|${etat.tour}|${etat.phase}|${JSON.stringify(etat.joueurs.map((j) => [j.nom, j.pions, j.captures]))}`;
  if (bandeau.dataset.cle === cleBandeau) return; // rien n'a changé
  bandeau.dataset.cle = cleBandeau;
  bandeau.innerHTML = '';
  etat.joueurs.forEach((j, i) => {
    const arrives = j.pions.filter((p) => p === g.arrivee).length;
    const maison = j.pions.filter((p) => p === -1).length;
    bandeau.append(el('div', { class: `joueur${i === etat.tour && etat.phase !== 'fini' ? ' actif' : ''}` },
      el('span', { class: 'pastille', style: `background:${j.couleur}` }),
      el('div', { style: 'min-width:0' },
        el('div', { class: 'nom' }, nomAffiche(j.nom) + (i === moi ? t('toi') : '')),
        el('div', { class: 'stats' }, `🏠 ${maison} · 🎯 ${arrives}/${j.pions.length} · ⚔️ ${j.captures}`))));
  });
}

function dessinerJeu() {
  if (!session) return;
  const etat = session.etat;
  if (!etat) return;
  if ($('ecran-jeu').hidden) aller('jeu');
  const g = geometrie(etat.regles, etat.joueurs.length);
  const moi = session.mode === 'ligne' ? session.place : null;
  const actif = etat.joueurs[etat.tour];
  const peut = jePeuxJouer();
  const coups = peut ? coupsPossibles(etat) : [];

  dessinerBandeau(etat, g, moi, $('jeu-joueurs'));
  dessinerPlateau(etat, g, coups);
  if (!animation || !$('des').classList.contains('roule')) dessinerDes(etat);

  // Partie guidée : le conseil du moment
  $('guide').hidden = !session.guide;
  if (session.guide) {
    const c = conseilGuide(etat);
    $('guide-texte').textContent = t(c.cle, c.params);
  }

  // Consigne
  let consigne;
  const nomActif = nomAffiche(actif.nom);
  if (etat.phase === 'fini') consigne = t('gagne', { nom: nomAffiche(etat.joueurs[etat.gagnant].nom) });
  else if (session.mode === 'ligne' && etat.tour !== moi) consigne = t('tourDe', { nom: nomActif });
  else if (animation) consigne = t('pionAvance');
  else if (actif.ordi) consigne = t('reflechit', { nom: nomActif });
  else if (etat.phase === 'lancer') consigne = session.mode === 'local' ? t('aToiLocal', { nom: nomActif }) : t('aToi');
  else consigne = t('touchePionBlanc');
  $('jeu-consigne').textContent = consigne;
  $('jeu-consigne').style.color = etat.phase === 'fini' ? '' : actif.couleur;

  $('btn-lancer').disabled = !(peut && etat.phase === 'lancer');
  $('btn-lancer').hidden = etat.phase === 'fini';
  $('btn-rejouer').hidden = !(etat.phase === 'fini' && session.mode === 'local');
  $('btn-revoir').hidden = !(etat.phase === 'fini' && Array.isArray(etat.histo));
  const enLigneFinie = etat.phase === 'fini' && session.mode === 'ligne';
  $('btn-revanche').hidden = !enLigneFinie;
  $('btn-revanche').textContent = session.partie && session.partie.revanche ? t('rejoindreRevanche') : t('revanche');
  $('reactions').hidden = session.mode !== 'ligne';
  placerZonePartie();
  noterStats(etat);
  const entree = coups.find((c) => c.depuis === -1 && !c.groupe);
  $('btn-entrer').hidden = !entree;
  const groupe = coups.find((c) => c.groupe);
  $('btn-entrer-groupe').hidden = !groupe;
  if (groupe) $('btn-entrer-groupe').textContent = t('entrerGroupe', { n: groupe.groupe.length });

  // Journal et règles : reconstruits seulement s'ils ont changé (plus fluide)
  const journal = $('journal');
  const cleJournal = `${t.langue}|${etat.numero}|${etat.journal.length}|${etat.journal[etat.journal.length - 1]}`;
  if (journal.dataset.cle !== cleJournal) {
    journal.dataset.cle = cleJournal;
    journal.replaceChildren(...etat.journal.map((l) => el('li', {}, traduireJournal(l, t))));
  }
  const cleRegles = `${t.langue}|${JSON.stringify(etat.regles)}`;
  if ($('jeu-regles').dataset.cle !== cleRegles) {
    $('jeu-regles').dataset.cle = cleRegles;
    $('jeu-regles').replaceChildren(...resumeReglesTraduit(etat.regles, t).map((l) => el('li', {}, l)));
  }
  faireJouerOrdi();
}

// ---------------------------------------------------------------- revanche et messages rapides
$('btn-revanche').addEventListener('click', async () => {
  if (!session || session.mode !== 'ligne') return;
  $('btn-revanche').disabled = true;
  try {
    const api = await obtenirEnLigne();
    const code = await api.revanche(session.partie.code, session.jeton);
    await ouvrirPartieEnLigne(code, session.place, session.jeton);
  } catch (e) {
    message('jeu-message', traduireErreur(e.message, t), true);
  } finally {
    $('btn-revanche').disabled = false;
  }
});

REACTIONS.forEach((texte) => {
  const b = el('button', { class: 'reaction', 'data-reaction': texte }, traduireReaction(texte, t));
  b.addEventListener('click', async () => {
    if (!session || session.mode !== 'ligne') return;
    try {
      await (await obtenirEnLigne()).reagir(session.partie.code, session.jeton, texte);
    } catch (e) {
      message('jeu-message', traduireErreur(e.message, t), true);
    }
  });
  $('reactions').append(b);
});

let minuteurBulle = null;
/** Affiche un message rapide reçu (ou envoyé) pendant 3 secondes. */
function montrerReaction(reaction) {
  const j = session && session.etat && session.etat.joueurs[reaction.place];
  const nom = nomAffiche(j ? j.nom : (session.partie.joueurs[reaction.place] || {}).nom || '?');
  const bulle = $('bulle-reaction');
  bulle.textContent = `${nom}${reaction.place === session.place ? t('toi') : ''} : ${traduireReaction(reaction.texte, t)}`;
  bulle.style.borderColor = COULEURS[reaction.place] ? COULEURS[reaction.place].code : '';
  bulle.hidden = false;
  clearTimeout(minuteurBulle);
  minuteurBulle = setTimeout(() => { bulle.hidden = true; }, 3000);
}

function svg(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
}

/** Dessine le plateau dans `plateau` (svg). avecTrajet : dessiner le trajet d'un joueur (aide). */
function dessinerPlateau(etat, g, coups, plateau = $('plateau'), avecTrajet = voirTrajet) {
  const n = g.n;
  const S = 100;
  const racine = plateau;
  const zone = zoneCase(g, S);
  const T = themePlateau(themeChoisi());
  const id = (nom) => `${racine.id}-${nom}`; // identifiants propres à ce dessin (plusieurs plateaux dans la page)
  // En ligne, chaque joueur voit son bras en bas, face à lui : on tourne tout le plateau
  const angle = racine.id === 'plateau' && session && session.mode === 'ligne' ? angleVue(g, session.place) : 0;
  // Trajet d'aide : en ligne, son propre trajet ; en local, celui du joueur humain qui joue (ou du premier humain)
  const premierHumain = Math.max(0, etat.joueurs.findIndex((j) => !j.ordi));
  const qui = !(avecTrajet && session) ? null
    : session.mode === 'ligne' ? session.place : (etat.joueurs[etat.tour].ordi ? premierHumain : etat.tour);

  const avecLueur = {};
  // Pour la fluidité : le décor (fond, cases, arcs, trajet) n'est dessiné qu'une fois ;
  // ensuite, seuls les pions et les repères sont redessinés.
  const cleDecor = JSON.stringify([themeChoisi(), g.forme, n, angle, etat.joueurs.map((j) => j.couleur), qui]);
  if (racine._cleDecor === cleDecor && racine._mobile) {
    racine._mobile.innerHTML = '';
    plateau = racine._mobile;
    dessinerPionsEtRepères();
    return;
  }
  racine.innerHTML = '';
  racine.setAttribute('viewBox', `0 0 ${n * S} ${n * S}`);
  const tourne = svg('g', angle ? { transform: `rotate(${angle} ${(n * S) / 2} ${(n * S) / 2})` } : {}, racine);
  plateau = svg('g', {}, tourne);

  // Dégradés du thème
  const defs = svg('defs', {}, plateau);
  if (T.fondLueur) {
    const rg = svg('radialGradient', { id: id('fond-lueur'), cx: '50%', cy: '50%', r: '60%' }, defs);
    svg('stop', { offset: '0%', 'stop-color': T.fondLueur }, rg);
    svg('stop', { offset: '100%', 'stop-color': T.fond }, rg);
    const lg = svg('linearGradient', { id: id('verre'), x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    svg('stop', { offset: '0%', 'stop-color': '#ffffff', 'stop-opacity': 0.10 }, lg);
    svg('stop', { offset: '55%', 'stop-color': '#ffffff', 'stop-opacity': 0 }, lg);
  }
  // (Plus de filtre de flou : il rendait le jeu lent sur téléphone. La lueur vient de traits doublés.)

  // Couleur de chaque joueur : sa case de départ, sa colonne d'arrivée (croix) et ses croix
  const teintes = new Map();
  etat.joueurs.forEach((j, i) => {
    const ch = g.chemins[i];
    teintes.set(cle(ch[0]), j.couleur);
    if (g.forme === 'croix') ch.slice(0, g.debutBoucle + 1).forEach((p) => teintes.set(cle(p), j.couleur));
  });

  if (g.forme === 'croix') {
    svg('rect', { x: 0, y: 0, width: n * S, height: n * S, rx: 24, fill: T.fondLueur ? `url(#${id('fond-lueur')})` : T.fond }, plateau);
    if (T.lueur) {
      // Grille d'hologramme très fine, plus visible au centre
      const motif = svg('pattern', { id: id('holo'), width: S / 4, height: S / 4, patternUnits: 'userSpaceOnUse' }, defs);
      svg('path', { d: `M${S / 4} 0V${S / 4}M0 ${S / 4}H${S / 4}`, stroke: T.diagonaleLueur, 'stroke-width': 0.6, opacity: 0.35, fill: 'none' }, motif);
      svg('rect', { x: 0, y: 0, width: n * S, height: n * S, rx: 24, fill: `url(#${id('holo')})`, opacity: 0.6 }, plateau);
    }
    // Diagonales : des coins du plateau jusqu'au centre, à travers les cases de coin
    const { r: r0, c: c0, taille: t } = g.centre;
    const coins = [[0, 0, c0, r0], [n, 0, c0 + t, r0], [0, n, c0, r0 + t], [n, n, c0 + t, r0 + t]];
    coins.forEach(([x1, y1, x2, y2]) => {
      svg('line', { x1: x1 * S, y1: y1 * S, x2: x2 * S, y2: y2 * S, stroke: T.diagonale, 'stroke-width': 10, 'stroke-linecap': 'round' }, plateau);
      svg('line', { x1: x1 * S, y1: y1 * S, x2: x2 * S, y2: y2 * S, stroke: T.diagonaleLueur, 'stroke-width': 3, opacity: 0.7, ...avecLueur }, plateau);
    });
    // 3 arcs à chaque coin du centre : passage d'un bras au suivant
    arcsCroix(g, S).forEach((d) => {
      svg('path', { d, fill: 'none', stroke: T.arc, 'stroke-width': 7, 'stroke-linecap': 'round' }, plateau);
      if (T.lueur) svg('path', { d, fill: 'none', stroke: T.arcLueur, 'stroke-width': 7, opacity: 0.18 }, plateau);
      svg('path', { d, fill: 'none', stroke: T.arcLueur, 'stroke-width': 2.5, opacity: 0.85, ...avecLueur }, plateau);
    });
    // Écriture tamoule dans les coins du haut, comme sur les plateaux du commerce
    [['தாயம்', 2.4], ['விளையாட்டு', n - 2.4]].forEach(([texte, cx]) => {
      const t = svg('text', { x: cx * S, y: 0.62 * S, 'text-anchor': 'middle', 'font-size': 0.48 * S, 'font-weight': 700,
        fill: T.ecriture, opacity: 0.9, 'font-family': "'Noto Sans Tamil', 'Latha', sans-serif", ...avecLueur }, racine); // écriture jamais à l'envers
      t.textContent = texte;
    });
  }
  g.cases.forEach((k) => {
    const [r, c] = k.split(',').map(Number);
    if (g.forme === 'carre' && r === g.centre.r && c === g.centre.c) return;
    const x = c * S, y = r * S;
    const teinte = teintes.get(k);
    svg('rect', { x: x + 2, y: y + 2, width: S - 4, height: S - 4, rx: 6, fill: T.caseFond, stroke: T.caseTrait, 'stroke-width': 3 }, plateau);
    if (teinte) svg('rect', { x: x + 2, y: y + 2, width: S - 4, height: S - 4, rx: 6, fill: teinte, 'fill-opacity': T.teinteOpacite }, plateau);
    if (T.fondLueur) svg('rect', { x: x + 4, y: y + 4, width: S - 8, height: S - 8, rx: 5, fill: `url(#${id('verre')})` }, plateau);
    if (g.refuges.has(k)) {
      svg('path', { d: `M${x + 14} ${y + 14}L${x + S - 14} ${y + S - 14}M${x + S - 14} ${y + 14}L${x + 14} ${y + S - 14}`,
        stroke: teinte || T.croixRefuge, 'stroke-width': 7, 'stroke-linecap': 'round', opacity: teinte ? 0.95 : 0.6 }, plateau);
    }
  });

  // Centre (pazham)
  const ct = zone(cle([g.chemins[0][g.arrivee][0], g.chemins[0][g.arrivee][1]]));
  svg('rect', { x: ct.x + 2, y: ct.y + 2, width: ct.w - 4, height: ct.w - 4, rx: 8, fill: g.forme === 'croix' ? T.centreFond : '#c98b3c',
    stroke: T.centreTrait, 'stroke-width': 3, ...(g.forme === 'croix' ? avecLueur : {}) }, plateau);
  svg('path', { d: g.forme === 'croix'
    ? `M${ct.x + 6} ${ct.y + 6}L${ct.x + ct.w - 6} ${ct.y + ct.w - 6}M${ct.x + ct.w - 6} ${ct.y + 6}L${ct.x + 6} ${ct.y + ct.w - 6}`
    : `M${ct.x + 50} ${ct.y + 14}L${ct.x + 86} ${ct.y + 50}L${ct.x + 50} ${ct.y + 86}L${ct.x + 14} ${ct.y + 50}Z`,
  fill: 'none', stroke: g.forme === 'croix' ? T.centreCroix : '#fff3da', 'stroke-width': g.forme === 'croix' ? 3 : 4, opacity: 0.8 }, plateau);

  // Trajet d'un joueur (aide) : ligne pointillée avec des flèches
  if (qui !== null) {
    const centre = (p) => { const z = zone(cle(p)); return `${z.x + z.w / 2},${z.y + z.w / 2}`; };
    const ch = g.chemins[qui];
    const couleur = etat.joueurs[qui].couleur;
    const marqueur = svg('marker', { id: id('fleche'), viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' }, defs);
    svg('path', { d: 'M0 0L10 5L0 10Z', fill: couleur }, marqueur);
    svg('polyline', { points: ch.map(centre).join(' '), fill: 'none', stroke: couleur, 'stroke-width': 8,
      'stroke-dasharray': '4 14', 'stroke-linecap': 'round', opacity: 0.85 }, plateau);
    for (let i = 2; i < ch.length; i += 3) {
      svg('line', { x1: centre(ch[i - 1]).split(',')[0], y1: centre(ch[i - 1]).split(',')[1], x2: centre(ch[i]).split(',')[0],
        y2: centre(ch[i]).split(',')[1], stroke: couleur, 'stroke-width': 8, 'marker-end': `url(#${id('fleche')})`, opacity: 0.9 }, plateau);
    }
  }

  // Couche mobile (pions, dernier coup, destinations, éclat) : redessinée à chaque fois
  racine._cleDecor = cleDecor;
  racine._mobile = svg('g', {}, tourne);
  racine._glisse = svg('g', {}, tourne); // repère tourné comme le plateau (pour placer le pion qui glisse)
  plateau = racine._mobile;
  dessinerPionsEtRepères();

  function dessinerPionsEtRepères() {
  // Dernier coup joué
  if (etat.dernierCoup) {
    const z = zone(cle(g.chemins[etat.dernierCoup.joueur][etat.dernierCoup.vers]));
    svg('rect', { x: z.x + 6, y: z.y + 6, width: z.w - 12, height: z.w - 12, rx: 8, fill: 'none',
      stroke: T.dernierCoup || etat.joueurs[etat.dernierCoup.joueur].couleur, 'stroke-width': 5, opacity: 0.8, ...avecLueur }, plateau);
  }

  // Destinations possibles
  coups.forEach((cp) => {
    const z = zone(cle(g.chemins[etat.tour][cp.vers]));
    svg('circle', { cx: z.x + z.w / 2, cy: z.y + z.w / 2, r: z.w / 2 - 10, fill: 'none', stroke: etat.joueurs[etat.tour].couleur,
      'stroke-width': 5, 'stroke-dasharray': '10 8' }, plateau);
  });

  // Pions
  const jouables = new Set(coups.filter((c) => c.depuis >= 0).map((c) => `${etat.tour}:${c.pion}`));
  // Plateau en croix : pions à la maison et pions arrivés dessinés dans le centre
  const auCentre = pionsAuCentre(g, etat, S);
  const cleCentre = cle(g.chemins[0][g.arrivee]);
  const entree = coups.find((c) => c.depuis === -1 && !c.groupe);
  auCentre.forEach((p) => {
    const j = etat.joueurs[p.joueur];
    const jouable = !p.arrive && !!entree && p.joueur === etat.tour;
    const grp = svg('g', { class: jouable ? 'pion-jouable' : '' }, plateau);
    if (jouable) svg('circle', { cx: p.cx, cy: p.cy, r: p.r + 12, fill: T.jouable, opacity: 0.28 }, grp);
    if (p.arrive) svg('circle', { cx: p.cx, cy: p.cy, r: p.r + 6, fill: T.arrive, stroke: T.arriveTrait, 'stroke-width': 2, ...avecLueur }, grp);
    svg('circle', { cx: p.cx, cy: p.cy, r: p.r, fill: j.couleur, stroke: jouable ? T.jouable : T.pionTrait, 'stroke-width': jouable ? 5 : 2.5, ...avecLueur }, grp);
    svg('circle', { cx: p.cx - p.r * 0.3, cy: p.cy - p.r * 0.3, r: p.r * 0.3, fill: T.pionReflet, opacity: 0.35 }, grp);
    if (jouable) {
      const cible = svg('circle', { cx: p.cx, cy: p.cy, r: Math.max(p.r, 40), fill: 'transparent' }, grp);
      cible.style.cursor = 'pointer';
      grp.addEventListener('click', () => { if (jePeuxJouer()) appliquer(jouer(session.etat, entree.pion)); });
    }
  });
  pionsParCase(etat).forEach((liste, k) => {
    if (auCentre.length && k === cleCentre) return;
    const z = zone(k);
    const cote = Math.ceil(Math.sqrt(liste.length));
    const pas = (z.w - 16) / cote;
    const rayon = Math.min(38, pas * 0.45);
    liste.forEach((p, i) => {
      const cx = z.x + 8 + pas * (i % cote) + pas / 2;
      const cy = z.y + 8 + pas * Math.floor(i / cote) + pas / 2;
      if (racine.id === 'plateau' && session && session.masques && session.masques.has(`${p.joueur}:${p.pion}`)) return;
      const j = etat.joueurs[p.joueur];
      const jouable = jouables.has(`${p.joueur}:${p.pion}`);
      const bouge = racine.id === 'plateau' && session && session.enMouvement &&
        session.enMouvement.joueur === p.joueur && session.enMouvement.pion === p.pion;
      const grp = svg('g', { class: jouable ? 'pion-jouable' : bouge ? 'pion-bouge' : '' }, plateau);
      if (jouable) svg('circle', { cx, cy, r: rayon + 12, fill: T.jouable, opacity: 0.28 }, grp);
      svg('circle', { cx, cy, r: rayon, fill: j.couleur, stroke: jouable ? T.jouable : T.pionTrait, 'stroke-width': jouable ? 6 : 3, ...avecLueur }, grp);
      svg('circle', { cx: cx - rayon * 0.3, cy: cy - rayon * 0.3, r: rayon * 0.3, fill: T.pionReflet, opacity: 0.35 }, grp);
      if (jouable) {
        // zone de toucher plus large que le pion
        const cible = svg('circle', { cx, cy, r: Math.max(rayon, 60), fill: 'transparent' }, grp);
        cible.style.cursor = 'pointer';
        grp.addEventListener('click', () => {
          if (jePeuxJouer()) appliquer(jouer(session.etat, p.pion));
        });
      }
    });
  });

  // Éclat (pion mangé, pion arrivé)
  if (racine.id === 'plateau' && session && session.eclat) {
    const z = zone(session.eclat.k);
    svg('circle', { cx: z.x + z.w / 2, cy: z.y + z.w / 2, r: z.w / 2, fill: 'none', stroke: session.eclat.couleur,
      'stroke-width': 10, class: 'eclat' }, plateau);
  }
  }
}

// ---------------------------------------------------------------- revoir une partie
let revoir = null; // { etats, i, retour, minuteur }

/** Lignes du journal ajoutées entre deux états (le journal garde seulement les 30 dernières). */
function lignesAjoutees(avant, apres) {
  const a = avant.journal, b = apres.journal;
  for (let n = 1; n <= 4; n++) {
    const debutB = b.slice(0, b.length - n);
    const finA = a.slice(a.length - debutB.length);
    if (debutB.length === finA.length && debutB.every((l, i) => l === finA[i])) return b.slice(b.length - n);
  }
  return b.slice(-1);
}

function ouvrirRevoir(etatFinal, retour) {
  const etats = revoirPartie(etatFinal);
  if (!etats) {
    message(retour === 'jeu' ? 'jeu-message' : 'message-accueil', t('pasDeReplay'), true);
    return;
  }
  arreterLecture();
  revoir = { etats, i: 0, retour, minuteur: null };
  $('revoir-curseur').max = etats.length - 1;
  aller('revoir');
  dessinerRevoir();
}

function dessinerRevoir() {
  if (!revoir) return;
  const e = revoir.etats[revoir.i];
  const g = geometrie(e.regles, e.joueurs.length);
  dessinerBandeau(e, g, null, $('revoir-joueurs'));
  dessinerPlateau(e, g, [], $('plateau-revoir'), false);
  dessinerDes(e, $('des-revoir'));
  $('revoir-ligne').textContent = revoir.i === 0 ? t('debutPartieReplay')
    : lignesAjoutees(revoir.etats[revoir.i - 1], e).map((l) => traduireJournal(l, t)).join(' ');
  $('revoir-ligne').style.color = revoir.i === 0 ? '' : e.joueurs[(e.dernierLancer || { joueur: 0 }).joueur].couleur;
  $('revoir-etape').textContent = t('etapeN', { n: revoir.i, total: revoir.etats.length - 1 });
  $('revoir-curseur').value = String(revoir.i);
  const fin = revoir.i >= revoir.etats.length - 1;
  $('revoir-debut').disabled = $('revoir-prec').disabled = revoir.i === 0;
  $('revoir-suiv').disabled = $('revoir-fin').disabled = fin;
  $('revoir-lecture').textContent = revoir.minuteur ? t('rPause') : t('rLecture');
}

function allerEtape(i) {
  if (!revoir) return;
  revoir.i = Math.max(0, Math.min(revoir.etats.length - 1, i));
  if (revoir.i >= revoir.etats.length - 1) arreterLecture();
  dessinerRevoir();
}
function arreterLecture() {
  if (revoir && revoir.minuteur) clearInterval(revoir.minuteur);
  if (revoir) revoir.minuteur = null;
}
$('revoir-debut').addEventListener('click', () => { arreterLecture(); allerEtape(0); });
$('revoir-prec').addEventListener('click', () => { arreterLecture(); allerEtape(revoir.i - 1); });
$('revoir-suiv').addEventListener('click', () => { arreterLecture(); allerEtape(revoir.i + 1); });
$('revoir-fin').addEventListener('click', () => { arreterLecture(); allerEtape(Infinity); });
$('revoir-curseur').addEventListener('input', (e) => { arreterLecture(); allerEtape(Number(e.target.value)); });
$('revoir-lecture').addEventListener('click', () => {
  if (!revoir) return;
  if (revoir.minuteur) { arreterLecture(); dessinerRevoir(); return; }
  if (revoir.i >= revoir.etats.length - 1) revoir.i = 0;
  revoir.minuteur = setInterval(() => allerEtape(revoir.i + 1), 900);
  dessinerRevoir();
});
$('btn-revoir-retour').addEventListener('click', () => {
  arreterLecture();
  const retour = revoir ? revoir.retour : 'accueil';
  revoir = null;
  if (retour === 'jeu' && session && session.etat) { aller('jeu'); dessinerJeu(); }
  else { aller('accueil'); afficherAccueil(); }
});

// ---------------------------------------------------------------- démarrage
async function demarrage() {
  afficherAccueil();
  const code = new URLSearchParams(location.search).get('code');
  if (!code) return;
  const place = (() => { try { return JSON.parse(memoire.lire(`thaayam:${code.toUpperCase()}`)); } catch { return null; } })();
  if (!place) return;
  try {
    await ouvrirPartieEnLigne(code.toUpperCase(), place.place, place.jeton);
  } catch (e) {
    message('message-accueil', traduireErreur(e.message, t), true);
  }
}
appliquerLangue();
demarrage();
