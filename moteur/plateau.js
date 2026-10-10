/**
 * Géométrie du plateau : cases, anneaux, chemins des joueurs et refuges.
 * Coordonnées [ligne, colonne], ligne 0 en haut, colonne 0 à gauche.
 *
 * Un pion part du milieu de son côté, fait le tour de l'anneau extérieur,
 * puis entre dans l'anneau suivant, et ainsi de suite en spirale jusqu'au
 * centre. Chaque case du plateau est visitée exactement une fois.
 */

/** Côtés de départ, dans l'ordre : bas, droite, haut, gauche. */
export const COTES = ['bas', 'droite', 'haut', 'gauche'];

/** Côtés occupés selon le nombre de joueurs (2 joueurs : face à face). */
export function cotesPourJoueurs(nb) {
  if (nb === 2) return [0, 2];
  if (nb === 3) return [0, 1, 2];
  return [0, 1, 2, 3];
}

export const cle = ([r, c]) => `${r},${c}`;

/** Cases de l'anneau k, dans le sens anti-horaire (vu à l'écran). */
function anneauAntiHoraire(n, k) {
  const a = k;
  const b = n - 1 - k;
  if (a === b) return [[a, a]];
  const cases = [];
  for (let c = a; c <= b; c++) cases.push([b, c]); // bas, vers la droite
  for (let r = b - 1; r >= a; r--) cases.push([r, b]); // droite, vers le haut
  for (let c = b - 1; c >= a; c--) cases.push([a, c]); // haut, vers la gauche
  for (let r = a + 1; r <= b - 1; r++) cases.push([r, a]); // gauche, vers le bas
  return cases;
}

/** Case de l'anneau k+1 juste à l'intérieur d'une case de l'anneau k. */
function versInterieur(n, k, [r, c]) {
  const b = n - 1 - k;
  const nr = r === k ? r + 1 : r === b ? r - 1 : r;
  const nc = c === k ? c + 1 : c === b ? c - 1 : c;
  return [nr, nc];
}

/** Rotation d'un quart de tour anti-horaire : le côté bas devient le côté droit. */
function tourner(n, [r, c]) {
  return [n - 1 - c, r];
}

/**
 * Chemin complet d'un joueur partant du côté `cote` (0 à 3).
 * Renvoie { cases: [[r, c], ...], longueurExterieur }.
 */
export function chemin(n, cote = 0, sens = 'anti-horaire', sensInterieurs = 'inverse') {
  const m = (n - 1) / 2;
  let depart = [n - 1, m];
  const exterieur = sens !== 'horaire';
  let antiHoraire = exterieur;
  const cases = [];
  for (let k = 0; k <= m; k++) {
    let anneau = anneauAntiHoraire(n, k);
    if (!antiHoraire) anneau = [anneau[0], ...anneau.slice(1).reverse()];
    const i = anneau.findIndex((p) => p[0] === depart[0] && p[1] === depart[1]);
    if (i < 0) throw new Error(`Chemin impossible (anneau ${k})`);
    const tour = [...anneau.slice(i), ...anneau.slice(0, i)];
    cases.push(...tour);
    if (k < m) depart = versInterieur(n, k, tour[tour.length - 1]);
    if (sensInterieurs === 'alterne') antiHoraire = !antiHoraire;
    else antiHoraire = sensInterieurs === 'meme' ? exterieur : !exterieur;
  }
  let tournees = cases;
  for (let q = 0; q < cote; q++) tournees = tournees.map((p) => tourner(n, p));
  return { cases: tournees, longueurExterieur: 4 * (n - 1) };
}

/** Ensemble des clés « r,c » des cases refuges (marquées d'une croix). */
export function refuges(n, options = {}) {
  const m = (n - 1) / 2;
  const ens = new Set([cle([m, m])]);
  const milieux = (k) => [
    [n - 1 - k, m],
    [m, n - 1 - k],
    [k, m],
    [m, k],
  ];
  const coins = (k) => [
    [k, k],
    [k, n - 1 - k],
    [n - 1 - k, k],
    [n - 1 - k, n - 1 - k],
  ];
  milieux(0).forEach((p) => ens.add(cle(p)));
  for (let k = 1; k < m; k++) {
    if (options.milieuxInterieurs) milieux(k).forEach((p) => ens.add(cle(p)));
  }
  if (options.coinsDeuxiemeAnneau && m > 1) coins(1).forEach((p) => ens.add(cle(p)));
  return ens;
}

// ------------------------------------------------------------------ plateau en croix
/**
 * Plateau en croix (Thaayam kattai) : 4 bras de 3 colonnes × 4 cases autour
 * d'un grand carré central. Il n'y a pas de case entre deux bras : le passage
 * d'un bras au suivant se fait en diagonale, là où sont dessinés 3 arcs.
 * Grille de 11 × 11 ; le bras du joueur du bas occupe les lignes 7 à 10,
 * colonnes 4 à 6 ; le centre occupe les lignes et colonnes 4 à 6.
 *
 * Chemin : départ sur la croix au bout de son bras, tour complet de la croix
 * par les colonnes extérieures des bras, retour sur la case de départ, puis
 * remontée de la colonne du milieu de son bras jusqu'au centre.
 */
export const CROIX = { longueurBras: 4, n: 3 + 2 * 4 };
const L = CROIX.longueurBras;

/** Portion du tour sur le bras du bas : colonne gauche vers le bout, bout, colonne droite vers le centre. */
function segmentBras() {
  const n = CROIX.n;
  const seg = [];
  for (let r = L + 3; r <= n - 1; r++) seg.push([r, L]);
  seg.push([n - 1, L + 1]);
  for (let r = n - 1; r >= L + 3; r--) seg.push([r, L + 2]);
  return seg;
}

export function cheminCroix(cote = 0, sens = 'anti-horaire') {
  const n = CROIX.n;
  const tourner1 = (p) => tourner(n, p);
  const tour = [];
  let seg = segmentBras();
  for (let k = 0; k < 4; k++) {
    tour.push(...seg);
    seg = seg.map(tourner1);
  }
  const i = tour.findIndex(([r, c]) => r === n - 1 && c === L + 1);
  let boucle = [...tour.slice(i), ...tour.slice(0, i)];
  if (sens === 'horaire') boucle = [boucle[0], ...boucle.slice(1).reverse()];
  const cases = [...boucle, [n - 1, L + 1]];
  for (let r = n - 2; r >= L + 3; r--) cases.push([r, L + 1]);
  cases.push([L + 1, L + 1]); // centre (pazham)
  let tournees = cases;
  for (let q = 0; q < cote; q++) tournees = tournees.map(tourner1);
  return { cases: tournees, longueurExterieur: boucle.length };
}

/** Toutes les cases dessinées du plateau en croix (sans le grand centre). */
export function casesCroix() {
  const n = CROIX.n;
  const ens = new Set();
  let bras = [];
  for (let r = L + 3; r <= n - 1; r++) for (let c = L; c <= L + 2; c++) bras.push([r, c]);
  for (let k = 0; k < 4; k++) {
    bras.forEach((p) => ens.add(cle(p)));
    bras = bras.map((p) => tourner(n, p));
  }
  return ens;
}

/** Croix : bout de chaque bras, case du milieu au bord du centre, centre. */
export function refugesCroix() {
  const n = CROIX.n;
  const ens = new Set([cle([L + 1, L + 1])]);
  let pts = [[n - 1, L + 1], [L + 3, L + 1]];
  for (let k = 0; k < 4; k++) {
    pts.forEach((p) => ens.add(cle(p)));
    pts = pts.map((p) => tourner(n, p));
  }
  return ens;
}
