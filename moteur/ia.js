/**
 * Ordinateur : choisit un coup parmi coupsPossibles() avec des règles simples
 * de bon joueur (capturer, se mettre à l'abri, sortir des pions, avancer).
 */
import { coupsPossibles, destination, geometrie, jouer, lancer } from './partie.js';
import { valeursPossibles, valeurDesLongs } from './regles.js';
import { cle } from './plateau.js';

/** Cases « r,c » qu'un adversaire peut atteindre au prochain lancer. */
function casesMenacees(etat, joueur) {
  const g = geometrie(etat.regles, etat.joueurs.length);
  const valeurs = valeursPossibles(etat.regles);
  const menace = new Set();
  etat.joueurs.forEach((adv, a) => {
    if (a === joueur) return;
    adv.pions.forEach((pos, i) => {
      if (pos < 0 || pos === g.arrivee) return;
      valeurs.forEach((v) => {
        const t = destination(etat, a, i, v);
        if (t !== null) menace.add(cle(g.chemins[a][t]));
      });
    });
  });
  return menace;
}

/** Tous les lancers possibles avec leur probabilité : [{ tirage: { valeur, detail }, p }]. */
export function distributionLancers(regles) {
  const d = regles.des;
  let tirages = [[]];
  const nb = d.type === 'cauris' ? d.nbCauris : d.nbDes;
  const faces = d.type === 'cauris' ? [false, true] : d.faces;
  for (let i = 0; i < nb; i++) {
    const suivants = [];
    for (const t of tirages) for (const f of faces) suivants.push([...t, f]);
    tirages = suivants;
  }
  const p = 1 / tirages.length;
  return tirages.map((detail) => {
    const ouverts = detail.filter(Boolean).length;
    const valeur = d.type === 'cauris' ? (ouverts === 0 ? d.valeurZero : ouverts) : valeurDesLongs(d, detail);
    return { tirage: { valeur, detail }, p };
  });
}

// Poids de l'évaluation (réglés en faisant jouer « fort » contre « normal »).
const W = { cap: 80, risque: 15, rejoue: 40, arr: 90, col: 40, attaque: 1, prof: 1 };
/** Valeur d'une position de pion pour son propriétaire (plus il est avancé, plus elle vaut). */
function valeurPion(g, pos) {
  if (pos < 0) return 0;
  if (pos === g.arrivee) return W.arr;
  if (pos >= g.longueurExterieur) return W.col + pos; // dans sa colonne : à l'abri
  return 12 + pos;
}

/**
 * Probabilité que le joueur `adv` puisse tomber sur chaque case au prochain lancer :
 * Map « r,c » → probabilité.
 */
function risques(etat, adv, distribution) {
  const g = geometrie(etat.regles, etat.joueurs.length);
  const pions = etat.joueurs[adv].pions;
  const res = new Map();
  for (const { tirage, p } of distribution) {
    const touchees = new Set();
    pions.forEach((pos, i) => {
      if (pos === g.arrivee) return;
      if (pos === -1 && i !== pions.indexOf(-1)) return;
      const t = destination(etat, adv, i, tirage.valeur);
      if (t !== null) touchees.add(cle(g.chemins[adv][t]));
    });
    touchees.forEach((k) => res.set(k, (res.get(k) || 0) + p));
  }
  return res;
}

/** Évaluation d'une position du point de vue du joueur `moi` (après son coup). */
function evaluer(etat, moi, distribution) {
  const g = geometrie(etat.regles, etat.joueurs.length);
  const n = etat.joueurs.length;
  if (etat.phase === 'fini') return etat.gagnant === moi ? 1e6 : -1e6;
  const total = (j) => j.pions.reduce((s, pos) => s + valeurPion(g, pos), 0) + (j.captures > 0 ? W.cap : 0);
  let score = total(etat.joueurs[moi]);
  let adversaires = 0;
  etat.joueurs.forEach((j, a) => { if (a !== moi) adversaires += total(j); });
  score -= adversaires / (n - 1);
  // Danger : mes pions qu'un adversaire peut manger au prochain lancer.
  const rejoue = etat.phase === 'lancer' && etat.tour === moi;
  for (let k = 1; k < n; k++) {
    const adv = (moi + k) % n;
    const poids = rejoue ? 0.5 : k === 1 ? 1 : 0.6;
    const r = risques(etat, adv, distribution);
    etat.joueurs[moi].pions.forEach((pos) => {
      if (pos < g.debutBoucle || pos >= g.longueurExterieur) return; // à la maison ou dans sa colonne
      const kc = cle(g.chemins[moi][pos]);
      if (g.refuges.has(kc)) return;
      score -= poids * (r.get(kc) || 0) * (valeurPion(g, pos) + W.risque);
    });
  }
  // Attaque : pions adverses que je pourrai manger à mon prochain lancer
  if (W.attaque) {
    const r = risques(etat, moi, distribution);
    etat.joueurs.forEach((adv, a) => {
      if (a === moi) return;
      adv.pions.forEach((pos) => {
        if (pos < g.debutBoucle || pos >= g.longueurExterieur) return;
        const kc = cle(g.chemins[a][pos]);
        if (g.refuges.has(kc)) return;
        score += W.attaque * (rejoue ? 1 : 0.4) * (r.get(kc) || 0) * (valeurPion(g, pos) + W.risque) / (n - 1);
      });
    });
  }
  if (rejoue) score += W.rejoue; // un lancer de plus
  return score;
}

/**
 * Valeur attendue d'une position (phase « lancer ») en regardant `prof` lancers
 * plus loin : moyenne sur tous les lancers possibles ; le joueur qui joue prend
 * le meilleur coup pour lui (le pire pour `moi` s'il s'agit d'un adversaire).
 */
function esperance(etat, moi, distribution, prof) {
  if (etat.phase === 'fini' || prof === 0) return evaluer(etat, moi, distribution);
  if (etat.phase === 'deplacer') {
    // Cumul des lancers : il reste des valeurs à jouer ce tour-ci
    const suite = coupsPossibles(etat).map((c) => {
      const e = jouer(etat, c.pion, !!c.groupe, c.ival);
      return (etat.reserve || []).length > 1 ? evaluer(e, moi, distribution) : esperance(e, moi, distribution, prof);
    });
    if (!suite.length) return evaluer(etat, moi, distribution);
    return etat.tour === moi ? Math.max(...suite) : Math.min(...suite);
  }
  const joueur = etat.tour;
  let total = 0;
  for (const { tirage, p } of distribution) {
    const e = lancer(etat, undefined, tirage);
    let v;
    if (e.phase !== 'deplacer') v = esperance(e, moi, distribution, prof - 1);
    else {
      const valeurs = coupsPossibles(e).map((c) => evaluer(jouer(e, c.pion, !!c.groupe, c.ival), moi, distribution));
      v = joueur === moi ? Math.max(...valeurs) : Math.min(...valeurs);
    }
    total += p * v;
  }
  return total;
}

/**
 * niveau : 'facile' (joue au hasard), 'normal' ou 'fort'. Par défaut, le niveau
 * enregistré pour le joueur (joueur.ordi = 'facile' | 'normal' | true).
 */
export function choisirCoup(etat, rng = Math.random, niveau = etat.joueurs[etat.tour].ordi) {
  const coups = coupsPossibles(etat);
  if (coups.length <= 1) return coups[0] || null;
  if (niveau === 'facile') return coups[Math.floor(rng() * coups.length)];
  if (niveau === 'fort') {
    const distribution = distributionLancers(etat.regles);
    let meilleur = null;
    for (const c of coups) {
      const s = esperance(jouer(etat, c.pion, !!c.groupe, c.ival), etat.tour, distribution, W.prof) + rng() * 0.01;
      if (!meilleur || s > meilleur.s) meilleur = { c, s };
    }
    return meilleur.c;
  }
  const g = geometrie(etat.regles, etat.joueurs.length);
  const moi = etat.tour;
  const menace = casesMenacees(etat, moi);
  const noter = (c) => {
    const ici = c.depuis >= 0 ? cle(g.chemins[moi][c.depuis]) : null;
    const la = cle(g.chemins[moi][c.vers]);
    const abri = g.refuges.has(la) || c.vers === g.arrivee;
    let score = c.captures.length * 100;
    if (c.vers === g.arrivee) score += 80;
    if (c.depuis === -1) score += 45 + (c.groupe ? 40 * (c.groupe.length - 1) : 0);
    if (abri) score += 20;
    else if (menace.has(la)) score -= 40;
    if (ici && menace.has(ici) && !g.refuges.has(ici)) score += 25; // fuir le danger
    if (c.depuis >= 0) score += (c.vers / g.arrivee) * 10;
    return score + rng(); // départage au hasard
  };
  return coups.reduce((meilleur, c) => {
    const s = noter(c);
    return s > meilleur.s ? { c, s } : meilleur;
  }, { c: null, s: -Infinity }).c;
}
