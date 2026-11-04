/**
 * Progression du joueur sur cet appareil : points d'expérience (XP) et niveaux, cote (comme aux échecs)
 * et rangs, historique (courbe d'évolution), trophées et défis de la semaine.
 * Objet simple, enregistré en JSON par le site ou l'appli. Toutes les parties comptent (en ligne et contre
 * l'ordinateur) ; le classement entre amis utilise la cote en ligne calculée par le serveur.
 */
import { geometrie } from './partie.js';

export const COTE_DEPART = 1000;
/** Cote fixe de l'ordinateur selon son niveau. */
export const COTE_ORDI = { facile: 850, normal: 1050, fort: 1250 };

/** Rangs selon la cote. */
export const RANGS = [
  { min: 0, cle: 'rgBronze', icone: '🥉' },
  { min: 1100, cle: 'rgArgent', icone: '🥈' },
  { min: 1250, cle: 'rgOr', icone: '🥇' },
  { min: 1400, cle: 'rgPlatine', icone: '💠' },
  { min: 1550, cle: 'rgDiamant', icone: '💎' },
  { min: 1700, cle: 'rgMaitre', icone: '👑' },
];

/** { cle, icone, min, suivant: { cle, icone, min } | null, manque } */
export function rangDe(cote) {
  const c = Number.isFinite(cote) ? cote : COTE_DEPART;
  let i = 0;
  while (i + 1 < RANGS.length && c >= RANGS[i + 1].min) i++;
  const suivant = RANGS[i + 1] || null;
  return { ...RANGS[i], suivant, manque: suivant ? suivant.min - Math.round(c) : 0 };
}

/** XP pour passer du niveau n au niveau n + 1. */
export const xpPourNiveau = (n) => 100 + 50 * (n - 1);

/** { niveau, xpDansNiveau, xpPourSuivant } à partir de l'XP total (niveau 1 au départ). */
export function niveauDe(xp) {
  let reste = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  let niveau = 1;
  while (reste >= xpPourNiveau(niveau)) { reste -= xpPourNiveau(niveau); niveau++; }
  return { niveau, xpDansNiveau: reste, xpPourSuivant: xpPourNiveau(niveau) };
}

/** Probabilité de victoire attendue de a contre b (formule Elo). */
export const attendu = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));

/**
 * Variation de cote après une partie. Le gagnant bat chacun des autres (gain partagé entre eux) ;
 * un perdant ne perd que contre le gagnant. k : 40 pendant les 10 premières parties, puis 24.
 */
export function variationCote(cote, adversaires, gagne, coteGagnant, k = 24) {
  if (gagne) {
    if (!adversaires.length) return 0;
    return Math.round(adversaires.reduce((s, a) => s + (k / adversaires.length) * (1 - attendu(cote, a)), 0));
  }
  return Math.round(k * (0 - attendu(cote, coteGagnant)));
}

// ---------------------------------------------------------------- défis de la semaine
/** Défis possibles : `mesure` = compteur de la semaine qui fait avancer le défi. */
export const DEFIS = [
  { cle: 'dfGagner3', but: 3, mesure: 'victoires' },
  { cle: 'dfCapturer10', but: 10, mesure: 'captures' },
  { cle: 'dfFort', but: 1, mesure: 'victoiresFort' },
  { cle: 'dfLigne2', but: 2, mesure: 'partiesLigne' },
  { cle: 'dfArriver12', but: 12, mesure: 'arrives' },
  { cle: 'dfParties5', but: 5, mesure: 'parties' },
  { cle: 'dfAnalyse', but: 1, mesure: 'analyses' },
];
export const XP_DEFI = 100;

/** Numéro de semaine ISO « 2026-W45 » d'une date. */
export function semaineDe(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const jour = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - jour);
  const debut = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const n = Math.ceil(((d - debut) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(n).padStart(2, '0')}`;
}

/** Les 3 défis de la semaine (les mêmes pour tout le monde cette semaine-là). */
export function defisDeLaSemaine(semaine) {
  let h = 0;
  for (const ch of String(semaine)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const restants = [...DEFIS];
  const choisis = [];
  for (let i = 0; i < 3; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    choisis.push(restants.splice(h % restants.length, 1)[0]);
  }
  return choisis;
}

// ---------------------------------------------------------------- trophées
/** Trophées : `test(p, partie)` reçoit la progression à jour et la partie qui vient d'être comptée (ou null). */
export const TROPHEES = [
  { cle: 'tVictoire1', icone: '🏆', test: (p) => p.victoires >= 1 },
  { cle: 'tVictoire10', icone: '🎖️', test: (p) => p.victoires >= 10 },
  { cle: 'tVictoire50', icone: '👑', test: (p) => p.victoires >= 50 },
  { cle: 'tCapture1', icone: '⚔️', test: (p) => p.captures >= 1 },
  { cle: 'tCapture100', icone: '🗡️', test: (p) => p.captures >= 100 },
  { cle: 'tCapture3', icone: '💥', test: (p, x) => !!x && x.captures >= 3 },
  { cle: 'tFort', icone: '🤖', test: (p, x) => !!x && x.gagne && x.mode === 'fort' },
  { cle: 'tLigne', icone: '🌍', test: (p, x) => !!x && x.gagne && x.mode === 'ligne' },
  { cle: 'tSerie3', icone: '🔥', test: (p) => p.meilleureSerie >= 3 },
  { cle: 'tSerie5', icone: '☄️', test: (p) => p.meilleureSerie >= 5 },
  { cle: 'tNiveau5', icone: '⭐', test: (p) => niveauDe(p.xp).niveau >= 5 },
  { cle: 'tNiveau10', icone: '🌟', test: (p) => niveauDe(p.xp).niveau >= 10 },
  { cle: 'tOr', icone: '🥇', test: (p) => p.cote >= 1250 },
  { cle: 'tAnalyse', icone: '🧠', test: (p) => p.meilleurePrecision >= 90 },
  { cle: 'tDefis', icone: '🎯', test: (p) => p.semaine.faits.length >= 3 },
];

// ---------------------------------------------------------------- état
export function progressionVide() {
  return {
    xp: 0, cote: COTE_DEPART, parties: 0, victoires: 0, serie: 0, meilleureSerie: 0,
    captures: 0, arrives: 0, meilleurePrecision: 0,
    historique: [], // [{ q: date, m: mode, g: gagné, xp, c: cote après }]
    trophees: {}, // cle → date d'obtention
    semaine: { id: '', compteurs: {}, faits: [] },
    notees: [], // codes des parties en ligne déjà comptées
  };
}

const entier = (n, defaut = 0) => (Number.isFinite(n) ? Math.round(n) : defaut);

/** Relit une progression enregistrée (ou abîmée) sans jamais planter. */
export function normaliserProgression(brut) {
  const p = progressionVide();
  if (!brut || typeof brut !== 'object') return p;
  ['xp', 'parties', 'victoires', 'serie', 'meilleureSerie', 'captures', 'arrives', 'meilleurePrecision']
    .forEach((k) => { p[k] = Math.max(0, entier(brut[k])); });
  p.cote = entier(brut.cote, COTE_DEPART);
  p.historique = Array.isArray(brut.historique)
    ? brut.historique.filter((h) => h && Number.isFinite(h.c)).slice(-200) : [];
  if (brut.trophees && typeof brut.trophees === 'object') {
    TROPHEES.forEach((t) => { if (brut.trophees[t.cle]) p.trophees[t.cle] = brut.trophees[t.cle]; });
  }
  const s = brut.semaine;
  if (s && typeof s === 'object' && typeof s.id === 'string') {
    p.semaine.id = s.id;
    if (s.compteurs && typeof s.compteurs === 'object') {
      Object.keys(s.compteurs).forEach((k) => { p.semaine.compteurs[k] = Math.max(0, entier(s.compteurs[k])); });
    }
    p.semaine.faits = Array.isArray(s.faits) ? s.faits.filter((c) => DEFIS.some((d) => d.cle === c)) : [];
  }
  p.notees = Array.isArray(brut.notees) ? brut.notees.filter((c) => typeof c === 'string').slice(-50) : [];
  return p;
}

/** Ajoute des compteurs de la semaine et note les défis terminés (bonus XP). Renvoie les défis finis. */
function avancerSemaine(p, ajouts, maintenant) {
  const id = semaineDe(maintenant);
  if (p.semaine.id !== id) p.semaine = { id, compteurs: {}, faits: [] };
  Object.entries(ajouts).forEach(([k, v]) => { if (v) p.semaine.compteurs[k] = (p.semaine.compteurs[k] || 0) + v; });
  const finis = [];
  defisDeLaSemaine(id).forEach((d) => {
    if (!p.semaine.faits.includes(d.cle) && (p.semaine.compteurs[d.mesure] || 0) >= d.but) {
      p.semaine.faits.push(d.cle);
      p.xp += XP_DEFI;
      finis.push(d.cle);
    }
  });
  return finis;
}

/** Trophées nouvellement obtenus (et notés dans p). */
function nouveauxTrophees(p, partie, maintenant) {
  const res = [];
  TROPHEES.forEach((t) => {
    if (!p.trophees[t.cle] && t.test(p, partie)) { p.trophees[t.cle] = maintenant.getTime(); res.push(t.cle); }
  });
  return res;
}

/**
 * Compte une partie terminée pour le joueur de cet appareil.
 * options : { mode: 'ligne' | 'local', place, code, maintenant }.
 * Renvoie { progression, gain } ; gain = null si la partie ne compte pas (déjà comptée, pas de joueur humain…).
 * gain : { xp, cote, variation, niveauAvant, niveauApres, trophees: [cle], defis: [cle] }.
 */
export function noterPartie(progression, etat, { mode, place = null, code = null, maintenant = new Date() } = {}) {
  const p = normaliserProgression(progression);
  if (!etat || etat.phase !== 'fini' || etat.gagnant == null) return { progression: p, gain: null };
  let moi = null;
  let m;
  let adversaires;
  if (mode === 'ligne') {
    if (!code || p.notees.includes(code) || place == null || !etat.joueurs[place]) return { progression: p, gain: null };
    p.notees = [...p.notees, code].slice(-50);
    moi = place;
    m = 'ligne';
    // La cote des autres joueurs n'est pas connue ici : on prend la cote de départ (le serveur calcule la vraie cote en ligne)
    adversaires = etat.joueurs.map((_, i) => i).filter((i) => i !== moi).map(() => COTE_DEPART);
  } else {
    const humains = etat.joueurs.map((j, i) => (j.ordi ? -1 : i)).filter((i) => i >= 0);
    const ordi = etat.joueurs.find((j) => j.ordi);
    if (humains.length !== 1 || !ordi) {
      // À plusieurs sur le même appareil : seulement un peu d'XP de participation
      if (!humains.length) return { progression: p, gain: null };
      const niveauAvant = niveauDe(p.xp).niveau;
      p.xp += 15;
      return { progression: p, gain: { xp: 15, cote: p.cote, variation: 0, niveauAvant, niveauApres: niveauDe(p.xp).niveau, trophees: [], defis: [] } };
    }
    moi = humains[0];
    m = COTE_ORDI[ordi.ordi] ? ordi.ordi : 'normal';
    adversaires = etat.joueurs.map((j, i) => (i === moi ? null : COTE_ORDI[j.ordi] || COTE_ORDI.normal)).filter((c) => c !== null);
  }
  const g = etat.joueurs[moi];
  const gagne = etat.gagnant === moi;
  const arrivee = geometrie(etat.regles, etat.joueurs.length).arrivee;
  const arrives = g.pions.filter((x) => x === arrivee).length;
  const captures = g.captures || 0;
  const niveauAvant = niveauDe(p.xp).niveau;

  // XP : participation + victoire, selon la difficulté, + captures et pions arrivés
  const mult = { ligne: 1.5, fort: 1.5, normal: 1, facile: 0.6 }[m] || 1;
  const xp = Math.round((20 + (gagne ? 50 : 0)) * mult) + 5 * captures + 5 * arrives;
  p.xp += xp;

  // Cote
  const k = p.parties < 10 ? 40 : 24;
  const coteGagnant = gagne ? p.cote : (mode === 'ligne' ? COTE_DEPART : (COTE_ORDI[etat.joueurs[etat.gagnant].ordi] || COTE_ORDI.normal));
  const variation = variationCote(p.cote, adversaires, gagne, coteGagnant, k);
  p.cote = Math.max(100, p.cote + variation);

  p.parties += 1;
  p.captures += captures;
  p.arrives += arrives;
  if (gagne) { p.victoires += 1; p.serie += 1; p.meilleureSerie = Math.max(p.meilleureSerie, p.serie); } else p.serie = 0;
  p.historique = [...p.historique, { q: maintenant.getTime(), m, g: gagne, xp, c: p.cote }].slice(-200);

  const partie = { mode: m, gagne, captures, arrives };
  const defis = avancerSemaine(p, {
    parties: 1, victoires: gagne ? 1 : 0, captures, arrives,
    victoiresFort: gagne && m === 'fort' ? 1 : 0, partiesLigne: m === 'ligne' ? 1 : 0,
  }, maintenant);
  const trophees = nouveauxTrophees(p, partie, maintenant);
  return {
    progression: p,
    gain: { xp: xp + XP_DEFI * defis.length, cote: p.cote, variation, niveauAvant, niveauApres: niveauDe(p.xp).niveau, trophees, defis },
  };
}

/** Compte une analyse de partie (défi « Analyse une partie », trophée de précision). */
export function noterAnalyse(progression, precision, maintenant = new Date()) {
  const p = normaliserProgression(progression);
  if (Number.isFinite(precision)) p.meilleurePrecision = Math.max(p.meilleurePrecision, Math.round(precision));
  const defis = avancerSemaine(p, { analyses: 1 }, maintenant);
  const trophees = nouveauxTrophees(p, null, maintenant);
  return { progression: p, gain: { defis, trophees } };
}

/** Avancement des défis de la semaine : [{ cle, but, fait, valeur }]. */
export function etatDefis(progression, maintenant = new Date()) {
  const p = normaliserProgression(progression);
  const id = semaineDe(maintenant);
  const memeSemaine = p.semaine.id === id;
  return defisDeLaSemaine(id).map((d) => {
    const valeur = memeSemaine ? Math.min(d.but, p.semaine.compteurs[d.mesure] || 0) : 0;
    return { cle: d.cle, but: d.but, valeur, fait: memeSemaine && p.semaine.faits.includes(d.cle) };
  });
}
