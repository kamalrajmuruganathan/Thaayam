/**
 * Classement entre amis : niveau d'un joueur selon ses victoires en ligne, et tri du classement.
 */

/** Niveaux, du plus bas au plus haut : à partir de `min` victoires. */
export const NIVEAUX_JOUEUR = [
  { min: 0, cle: 'nvDebutant', icone: '🌱' },
  { min: 3, cle: 'nvApprenti', icone: '🎲' },
  { min: 10, cle: 'nvConfirme', icone: '⭐' },
  { min: 25, cle: 'nvExpert', icone: '🏅' },
  { min: 50, cle: 'nvMaitre', icone: '👑' },
];

/** { cle, icone, prochain } : prochain = victoires qu'il faut pour le niveau suivant (null au plus haut). */
export function niveauJoueur(victoires) {
  const v = Number.isInteger(victoires) && victoires > 0 ? victoires : 0;
  let i = 0;
  while (i + 1 < NIVEAUX_JOUEUR.length && v >= NIVEAUX_JOUEUR[i + 1].min) i++;
  const suivant = NIVEAUX_JOUEUR[i + 1];
  return { ...NIVEAUX_JOUEUR[i], prochain: suivant ? suivant.min - v : null };
}

/**
 * Trie le classement : plus de victoires d'abord, puis meilleur pourcentage, puis pseudo.
 * Entrée : [{ pseudo, victoires, parties, moi }] ; sortie : la même liste avec `rang` (ex æquo partagés).
 */
export function trierClassement(liste) {
  const pct = (x) => (x.parties ? x.victoires / x.parties : 0);
  const tries = [...(liste || [])].map((x) => ({ ...x, victoires: Number(x.victoires) || 0, parties: Number(x.parties) || 0 }))
    .sort((a, b) => b.victoires - a.victoires || pct(b) - pct(a) || String(a.pseudo).localeCompare(String(b.pseudo)));
  tries.forEach((x, i) => {
    const prec = tries[i - 1];
    x.rang = prec && prec.victoires === x.victoires && pct(prec) === pct(x) ? prec.rang : i + 1;
  });
  return tries;
}
