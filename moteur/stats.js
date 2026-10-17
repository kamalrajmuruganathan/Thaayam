/**
 * Statistiques du joueur sur cet appareil (victoires et défaites).
 * Objet simple, enregistré en JSON par la page web ou l'appli.
 */

export const NIVEAUX = ['facile', 'normal', 'fort'];

export function statsVides() {
  return {
    ordi: { facile: { v: 0, d: 0 }, normal: { v: 0, d: 0 }, fort: { v: 0, d: 0 } },
    ligne: { v: 0, d: 0 },
    local: 0, // parties à plusieurs sur le même appareil, sans ordinateur
    notees: [], // codes des parties en ligne déjà comptées
  };
}

const entier = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);
const bilan = (b) => ({ v: entier(b && b.v), d: entier(b && b.d) });

/** Relit des statistiques enregistrées (ou abîmées) sans jamais planter. */
export function normaliserStats(brut) {
  const s = statsVides();
  if (!brut || typeof brut !== 'object') return s;
  NIVEAUX.forEach((n) => { s.ordi[n] = bilan(brut.ordi && brut.ordi[n]); });
  s.ligne = bilan(brut.ligne);
  s.local = entier(brut.local);
  s.notees = Array.isArray(brut.notees) ? brut.notees.filter((c) => typeof c === 'string').slice(-50) : [];
  return s;
}

/**
 * Compte une partie terminée.
 * mode 'ligne' : `place` = ma place, `code` = code de la partie (comptée une seule fois).
 * mode 'local' : contre l'ordinateur si des joueurs sont des ordinateurs, sinon partie à plusieurs.
 */
export function noterFin(stats, etat, { mode, place = null, code = null }) {
  const s = normaliserStats(stats);
  if (!etat || etat.phase !== 'fini' || etat.gagnant == null) return s;
  if (mode === 'ligne') {
    if (!code || s.notees.includes(code)) return s;
    s.notees = [...s.notees, code].slice(-50);
    if (etat.gagnant === place) s.ligne.v += 1;
    else s.ligne.d += 1;
    return s;
  }
  const humains = etat.joueurs.map((j, i) => (j.ordi ? -1 : i)).filter((i) => i >= 0);
  const ordi = etat.joueurs.find((j) => j.ordi);
  if (!humains.length) return s; // l'ordinateur contre lui-même : rien à compter
  if (!ordi) {
    s.local += 1;
    return s;
  }
  const niveau = NIVEAUX.includes(ordi.ordi) ? ordi.ordi : 'normal';
  if (humains.includes(etat.gagnant)) s.ordi[niveau].v += 1;
  else s.ordi[niveau].d += 1;
  return s;
}

const mot = (n, singulier, pluriel) => `${n} ${n > 1 ? pluriel : singulier}`;
const ligneBilan = (b) => `${mot(b.v, 'victoire', 'victoires')}, ${mot(b.d, 'défaite', 'défaites')}`;

/** Lignes lisibles ; tableau vide si aucune partie n'a encore été jouée. */
export function resumeStats(stats) {
  const s = normaliserStats(stats);
  const lignes = [];
  NIVEAUX.forEach((n) => {
    const b = s.ordi[n];
    if (b.v + b.d) lignes.push(`Contre l'ordinateur (${n}) : ${ligneBilan(b)}`);
  });
  if (s.ligne.v + s.ligne.d) lignes.push(`En ligne : ${ligneBilan(s.ligne)}`);
  if (s.local) lignes.push(`À plusieurs sur cet appareil : ${mot(s.local, 'partie', 'parties')}`);
  return lignes;
}
