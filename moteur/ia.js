/**
 * Ordinateur : choisit un coup parmi coupsPossibles() avec des règles simples
 * de bon joueur (capturer, se mettre à l'abri, sortir des pions, avancer).
 */
import { coupsPossibles, destination, geometrie } from './partie.js';
import { valeursPossibles } from './regles.js';
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

/**
 * niveau : 'facile' (joue au hasard) ou 'normal'. Par défaut, le niveau
 * enregistré pour le joueur (joueur.ordi = 'facile' | 'normal' | true).
 */
export function choisirCoup(etat, rng = Math.random, niveau = etat.joueurs[etat.tour].ordi) {
  const coups = coupsPossibles(etat);
  if (coups.length <= 1) return coups[0] || null;
  if (niveau === 'facile') return coups[Math.floor(rng() * coups.length)];
  const g = geometrie(etat.regles, etat.joueurs.length);
  const moi = etat.tour;
  const menace = casesMenacees(etat, moi);
  const noter = (c) => {
    const ici = c.depuis >= 0 ? cle(g.chemins[moi][c.depuis]) : null;
    const la = cle(g.chemins[moi][c.vers]);
    const abri = g.refuges.has(la) || c.vers === g.arrivee;
    let score = c.captures.length * 100;
    if (c.vers === g.arrivee) score += 80;
    if (c.depuis === -1) score += 45;
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
