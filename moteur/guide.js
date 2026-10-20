/**
 * Partie guidée pour débutants : un joueur humain (place 0) contre l'ordinateur en niveau facile.
 * À chaque instant, conseilGuide() dit quoi faire (une clé de traduction + ses paramètres).
 * Les deux premiers lancers du joueur sont choisis pour qu'il voie tout de suite l'essentiel :
 * un 1 (thaayam) qui fait entrer un pion et rejouer, puis un 3 pour avancer.
 */
import { nouvellePartie, coupsPossibles, geometrie, tirageDepuis } from './partie.js';
import { REGLES_PAR_DEFAUT, nomLancer, faitRejouer } from './regles.js';

export const MOI = 0;

/** Nouvelle partie guidée (règles classiques). nom : pseudo du joueur (sinon « Rouge »). */
export function nouvellePartieGuidee(nom) {
  return nouvellePartie(REGLES_PAR_DEFAUT, [{ nom: nom || 'Rouge' }, { nom: 'Ordi vert', ordi: 'facile' }]);
}

/** Lancer imposé au joueur pour ses deux premiers lancers, sinon null (lancer au hasard). */
export function lancerGuide(etat) {
  if (etat.tour !== MOI || etat.phase !== 'lancer' || !Array.isArray(etat.histo)) return null;
  if (etat.histo.length === 0) return tirageDepuis(etat.regles, [1, 0]); // thaayam : entrer un pion
  if (etat.histo.length === 2) return tirageDepuis(etat.regles, [2, 1]); // 3 : avancer
  return null;
}

/** Conseil du moment : { cle, params }. */
export function conseilGuide(etat) {
  const g = geometrie(etat.regles, etat.joueurs.length);
  const moi = etat.joueurs[MOI];
  const dl = etat.dernierLancer;
  if (etat.phase === 'fini') return { cle: etat.gagnant === MOI ? 'gBravo' : 'gPerdu', params: {} };
  if (etat.tour !== MOI) {
    if (dl && dl.joueur === MOI && nomLancer(etat.regles, dl) === 'Kaapal') return { cle: 'gKaapal', params: {} };
    const derniere = Array.isArray(etat.histo) ? etat.histo[etat.histo.length - 1] : '';
    if (dl && dl.joueur === MOI && /^[dc]/.test(derniere || '')) return { cle: 'gBloque', params: { v: dl.valeur } };
    return { cle: 'gAttends', params: {} };
  }
  if (etat.phase === 'lancer') {
    if (!dl) return { cle: 'gPremier', params: {} };
    if (dl.joueur === MOI && !faitRejouer(etat.regles, dl)) return { cle: 'gRejoueCapture', params: {} };
    if (dl.joueur === MOI && faitRejouer(etat.regles, dl)) return { cle: 'gRejoue', params: { v: nomLancer(etat.regles, dl) } };
    if (moi.pions.every((p) => p === -1)) return { cle: 'gSortir', params: {} };
    return { cle: 'gLancer', params: {} };
  }
  // Phase « déplacer »
  const v = etat.lancer.valeur;
  const coups = coupsPossibles(etat);
  if (coups.some((c) => c.captures.length)) return { cle: 'gManger', params: { v } };
  if (coups.some((c) => c.groupe)) return { cle: 'gGroupe', params: {} };
  if (coups.some((c) => c.vers === g.arrivee)) return { cle: 'gArrivee', params: { v } };
  if (coups.some((c) => c.depuis === -1)) {
    return { cle: moi.pions.every((p) => p === -1) ? 'gEntrer' : 'gEntrerOuAvancer', params: { v } };
  }
  if (etat.regles.captureAvantInterieur && moi.captures === 0 &&
    moi.pions.some((p) => p >= 0 && p < g.longueurExterieur && p + v >= g.longueurExterieur)) {
    return { cle: 'gPasCapture', params: { v } };
  }
  return { cle: 'gAvancer', params: { v } };
}
