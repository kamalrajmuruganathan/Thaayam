/**
 * Analyse d'une partie terminée (comme l'analyse de partie aux échecs) : chaque coup d'un joueur humain est
 * comparé au meilleur coup (note du niveau « fort »), classé (meilleur, bon, imprécision, erreur, grosse
 * erreur) avec la raison principale. Les textes sont des clés de traduction (moteur/i18n-plus.js).
 */
import { coupsPossibles, jouer, geometrie } from './partie.js';
import { noterCoups, dangerMax } from './ia.js';

// Seuils de perte (écart avec le meilleur coup, en points d'évaluation), réglés sur des parties d'ordinateurs.
export const SEUILS = [
  { max: 0.5, cle: 'anMeilleur' },
  { max: 4, cle: 'anBon' },
  { max: 12, cle: 'anImprecision' },
  { max: 30, cle: 'anErreur' },
  { max: Infinity, cle: 'anGaffe' },
];

const memePions = (a, b) => JSON.stringify(a.joueurs.map((j) => j.pions)) === JSON.stringify(b.joueurs.map((j) => j.pions));

/** Le coup joué pour passer de `avant` à `apres` (ou null). */
function coupJoue(avant, apres) {
  if (avant.phase !== 'deplacer' || apres.numero <= avant.numero) return null;
  for (const c of coupsPossibles(avant)) {
    if (memePions(jouer(avant, c.pion, !!c.groupe, c.ival), apres)) return c;
  }
  return null;
}

/** Pourquoi le meilleur coup était meilleur : une clé de motif. */
function motif(avant, joue, meilleur) {
  const g = geometrie(avant.regles, avant.joueurs.length);
  const moi = avant.tour;
  if (meilleur.captures.length > joue.captures.length) return 'anMotifCouper';
  if (meilleur.vers === g.arrivee && joue.vers !== g.arrivee) return 'anMotifArriver';
  if (meilleur.depuis === -1 && joue.depuis !== -1) return 'anMotifSortir';
  const dJoue = dangerMax(jouer(avant, joue.pion, !!joue.groupe, joue.ival), moi);
  const dMeilleur = dangerMax(jouer(avant, meilleur.pion, !!meilleur.groupe, meilleur.ival), moi);
  if (dJoue > dMeilleur + 0.1) return 'anMotifDanger';
  return 'anMotifAutre';
}

/** Analyse le coup qui fait passer de `avant` à `apres`, ou null si ce n'est pas un coup à juger. */
export function analyserCoup(avant, apres) {
  const joue = coupJoue(avant, apres);
  if (!joue) return null;
  const notes = noterCoups(avant);
  if (notes.length <= 1) return { joueur: avant.tour, cle: 'anForce', perte: 0, joue, meilleur: joue };
  const best = notes.reduce((a, b) => (b.note > a.note ? b : a));
  const mien = notes.find((n) => n.coup.pion === joue.pion && n.coup.ival === joue.ival && !!n.coup.groupe === !!joue.groupe) || best;
  const perte = Math.max(0, best.note - mien.note);
  const cle = SEUILS.find((s) => perte < s.max).cle;
  const mauvais = cle === 'anImprecision' || cle === 'anErreur' || cle === 'anGaffe';
  return { joueur: avant.tour, cle, perte, joue, meilleur: best.coup, motif: mauvais ? motif(avant, joue, best.coup) : null, valeur: best.coup.valeur ?? (avant.lancer && avant.lancer.valeur) };
}

/** Précision d'un coup, de 0 à 1 (1 = meilleur coup). */
export const precisionCoup = (a) => Math.max(0, 1 - a.perte / 30);

/** Résumé par joueur : { joueur, coups, precision (0-100), meilleurs, imprecisions, erreurs, gaffes }. */
export function resumerAnalyse(analyses, nbJoueurs) {
  return Array.from({ length: nbJoueurs }, (_, joueur) => {
    const l = analyses.filter((a) => a && a.joueur === joueur && a.cle !== 'anForce');
    const compte = (cle) => l.filter((a) => a.cle === cle).length;
    return {
      joueur, coups: l.length,
      precision: l.length ? Math.round((100 * l.reduce((s, a) => s + precisionCoup(a), 0)) / l.length) : null,
      meilleurs: compte('anMeilleur'), imprecisions: compte('anImprecision'), erreurs: compte('anErreur'), gaffes: compte('anGaffe'),
    };
  });
}
