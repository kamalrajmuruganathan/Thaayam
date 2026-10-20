/**
 * Déroulement d'une partie. Fonctions pures : chaque action renvoie un nouvel
 * état (objet JSON simple), ce qui permet de le stocker tel quel en ligne.
 *
 * Position d'un pion : -1 = à la maison, 0 = case de départ,
 * dernier indice du chemin = centre (pion arrivé).
 */
import { normaliserRegles, valeursPossibles, valeurDesLongs, faitRejouer, nomLancer, COULEURS } from './regles.js';
import { chemin, cotesPourJoueurs, refuges, cle, cheminCroix, casesCroix, refugesCroix, CROIX, ARCS_RAYONS } from './plateau.js';

const MAX_JOURNAL = 30;

/** Données calculées à partir des règles (pas stockées dans l'état). */
const cache = new Map();
export function geometrie(regles, nbJoueurs) {
  const k = JSON.stringify([regles.forme, regles.taille, regles.sens, regles.sensInterieurs, regles.refuges, nbJoueurs]);
  if (!cache.has(k) && regles.forme === 'croix') {
    const cotes = cotesPourJoueurs(nbJoueurs);
    const chemins = cotes.map((c) => cheminCroix(c, regles.sens));
    cache.set(k, {
      forme: 'croix',
      n: CROIX.n,
      cotes,
      chemins: chemins.map((ch) => ch.cases),
      longueurExterieur: chemins[0].longueurExterieur,
      debutBoucle: chemins[0].debutBoucle,
      arrivee: chemins[0].cases.length - 1,
      refuges: refugesCroix(),
      cases: casesCroix(),
      centre: { r: CROIX.longueurBras, c: CROIX.longueurBras, taille: 3 }, // grand carré central (pazham)
    });
  }
  if (!cache.has(k)) {
    const cotes = cotesPourJoueurs(nbJoueurs);
    const chemins = cotes.map((c) => chemin(regles.taille, c, regles.sens, regles.sensInterieurs));
    const m = (regles.taille - 1) / 2;
    const cases = new Set();
    for (let r = 0; r < regles.taille; r++) for (let c = 0; c < regles.taille; c++) cases.add(`${r},${c}`);
    cache.set(k, {
      forme: 'carre',
      n: regles.taille,
      cases,
      centre: { r: m, c: m, taille: 1 },
      cotes,
      chemins: chemins.map((ch) => ch.cases),
      longueurExterieur: chemins[0].longueurExterieur,
      debutBoucle: chemins[0].debutBoucle,
      arrivee: chemins[0].cases.length - 1,
      refuges: refuges(regles.taille, regles.refuges),
    });
  }
  return cache.get(k);
}

/** joueurs : [{ nom, ordi? }] (2 à 4). ordi = joué par l'ordinateur. */
export function nouvellePartie(reglesSource, joueurs) {
  const { regles, erreurs } = normaliserRegles(reglesSource);
  if (erreurs.length) throw new Error(erreurs[0]);
  if (joueurs.length < 2 || joueurs.length > 4) throw new Error('Il faut de 2 à 4 joueurs.');
  return {
    regles,
    joueurs: joueurs.map((j, i) => ({
      nom: String(j.nom || `Joueur ${i + 1}`).slice(0, 20),
      couleur: COULEURS[i].code,
      pions: Array(regles.nbPions).fill(-1),
      captures: 0,
      groupes: [], // pions mangés ensemble, qui peuvent rentrer ensemble
      ...(j.ordi ? { ordi: ['facile', 'fort'].includes(j.ordi) ? j.ordi : 'normal' } : {}),
    })),
    tour: 0,
    phase: 'lancer', // 'lancer' | 'deplacer' | 'fini'
    lancer: null, // { valeur, detail }
    dernierLancer: null, // { valeur, detail, joueur }
    dernierCoup: null, // { joueur, pion, depuis, vers }
    gagnant: null,
    numero: 0,
    histo: [], // toutes les actions, pour revoir la partie (voir revoirPartie)
    journal: [`La partie commence. ${joueurs[0].nom || 'Joueur 1'} lance en premier.`],
  };
}

function cloner(etat) {
  return JSON.parse(JSON.stringify(etat));
}

function noter(etat, texte) {
  etat.journal = [...etat.journal, texte].slice(-MAX_JOURNAL);
}

/** Tire les dés. rng() renvoie un nombre dans [0, 1[. */
export function tirerDes(regles, rng = Math.random) {
  const d = regles.des;
  if (d.type === 'cauris') return tirageDepuis(regles, Array.from({ length: d.nbCauris }, () => rng() < 0.5));
  return tirageDepuis(regles, Array.from({ length: d.nbDes }, () => d.faces[Math.floor(rng() * d.faces.length)]));
}

/** Lancer à partir de ce que montrent les dés (faces des dés longs, ou cauris ouverts : true/false). */
export function tirageDepuis(regles, detail) {
  const d = regles.des;
  if (d.type === 'cauris') {
    const nb = detail.filter(Boolean).length;
    return { valeur: nb === 0 ? d.valeurZero : nb, detail: detail.map(Boolean) };
  }
  return { valeur: valeurDesLongs(d, detail), detail: [...detail] };
}

// Historique compact : « d1.0 » (dés longs 1 et 0), « c1010 » (cauris), « p2 » (pion 2), « g2 » (groupe du pion 2).
const noterLancer = (t) => (typeof t.detail[0] === 'boolean' ? `c${t.detail.map((o) => (o ? 1 : 0)).join('')}` : `d${t.detail.join('.')}`);
function lireLancer(regles, a) {
  return tirageDepuis(regles, a[0] === 'c' ? [...a.slice(1)].map((x) => x === '1') : a.slice(1).split('.').map(Number));
}

/**
 * Pour revoir une partie : tous les états successifs, du début à la fin.
 * Renvoie null si la partie n'a pas d'historique (parties créées avant cette fonction).
 */
export function revoirPartie(etat) {
  if (!etat || !Array.isArray(etat.histo)) return null;
  try {
    let e = nouvellePartie(etat.regles, etat.joueurs.map((j) => ({ nom: j.nom, ordi: j.ordi || false })));
    const etats = [e];
    for (const a of etat.histo) {
      e = a[0] === 'd' || a[0] === 'c' ? lancer(e, undefined, lireLancer(e.regles, a)) : jouer(e, Number(a.slice(1)), a[0] === 'g');
      etats.push(e);
    }
    // Historique incomplet (un joueur avait une ancienne version du jeu) : on ne peut pas revoir la partie
    return e.numero === etat.numero ? etats : null;
  } catch {
    return null;
  }
}

/** Destination d'un pion pour une valeur donnée, ou null si le coup est interdit. */
export function destination(etat, joueur, pion, valeur) {
  const g = geometrie(etat.regles, etat.joueurs.length);
  const j = etat.joueurs[joueur];
  const p = j.pions[pion];
  if (p === -1) return etat.regles.valeursEntree.includes(valeur) ? 0 : null;
  if (p === g.arrivee || valeur <= 0) return null;
  let t = p + valeur;
  if (etat.regles.captureAvantInterieur && j.captures === 0 && p < g.longueurExterieur && t >= g.longueurExterieur) {
    // Sans capture, le pion continue de tourner sur l'anneau extérieur.
    t = g.debutBoucle + ((t - g.debutBoucle) % (g.longueurExterieur - g.debutBoucle));
  }
  if (t > g.arrivee) {
    if (etat.regles.arriveeExacte) return null;
    t = g.arrivee;
  }
  if (
    etat.regles.unPionParCase && t !== g.arrivee &&
    !g.refuges.has(cle(g.chemins[joueur][t])) &&
    j.pions.some((q, i) => i !== pion && q === t)
  ) return null;
  return t;
}

/** Pions adverses capturés si `joueur` arrive à l'indice t de son chemin. */
function victimes(etat, joueur, t) {
  const g = geometrie(etat.regles, etat.joueurs.length);
  const k = cle(g.chemins[joueur][t]);
  if (g.refuges.has(k)) return [];
  const res = [];
  etat.joueurs.forEach((adv, a) => {
    if (a === joueur) return;
    adv.pions.forEach((pos, i) => {
      if (pos >= 0 && pos < g.arrivee && cle(g.chemins[a][pos]) === k) res.push({ joueur: a, pion: i });
    });
  });
  return res;
}

/** Coups possibles pour le joueur dont c'est le tour (après le lancer). */
export function coupsPossibles(etat) {
  if (etat.phase !== 'deplacer' || !etat.lancer) return [];
  const j = etat.joueurs[etat.tour];
  const coups = [];
  let maisonVue = false;
  j.pions.forEach((p, i) => {
    if (p === -1) {
      if (maisonVue) return; // un seul coup « entrer un pion » suffit
      maisonVue = true;
    }
    const vers = destination(etat, etat.tour, i, etat.lancer.valeur);
    if (vers !== null) coups.push({ pion: i, depuis: p, vers, captures: victimes(etat, etat.tour, vers) });
  });
  // Un groupe mangé d'un coup rentre d'un coup avec une valeur qui fait rejouer.
  const r = etat.regles;
  if (r.groupeRentreEnsemble && !r.unPionParCase && faitRejouer(r, etat.lancer)) {
    (j.groupes || []).forEach((gr) => {
      if (gr.length < 2 || !gr.every((i) => j.pions[i] === -1)) return;
      coups.push({ pion: gr[0], depuis: -1, vers: 0, captures: victimes(etat, etat.tour, 0), groupe: [...gr] });
    });
  }
  return coups;
}

function retirerDesGroupes(groupes = [], pions) {
  return groupes.map((gr) => gr.filter((i) => !pions.includes(i))).filter((gr) => gr.length >= 2);
}

function joueurSuivant(etat) {
  etat.tour = (etat.tour + 1) % etat.joueurs.length;
  etat.phase = 'lancer';
  etat.lancer = null;
}

/** Action « lancer les dés ». */
export function lancer(etat0, rng = Math.random, tirage = null) {
  if (etat0.phase !== 'lancer') throw new Error("Ce n'est pas le moment de lancer.");
  const etat = cloner(etat0);
  const t = tirage || tirerDes(etat.regles, rng);
  const nom = etat.joueurs[etat.tour].nom;
  const fait = nomLancer(etat.regles, t);
  etat.numero += 1;
  if (Array.isArray(etat.histo)) etat.histo.push(noterLancer(t));
  etat.lancer = t;
  etat.dernierLancer = { ...t, joueur: etat.tour };
  etat.phase = 'deplacer';
  if (coupsPossibles(etat).length === 0) {
    if (faitRejouer(etat.regles, t)) {
      noter(etat, `${nom} fait ${fait} : aucun pion ne peut bouger, mais ${nom} rejoue.`);
      etat.phase = 'lancer';
      etat.lancer = null;
    } else {
      noter(etat, fait === 'Kaapal'
        ? `${nom} fait Kaapal : les dés passent au joueur suivant.`
        : `${nom} fait ${fait} : aucun pion ne peut bouger.`);
      joueurSuivant(etat);
    }
  } else {
    noter(etat, `${nom} fait ${fait}.`);
  }
  return etat;
}

/**
 * Action « déplacer le pion n° pion » avec le dernier lancer.
 * groupe = true : faire entrer d'un coup le groupe mangé dont fait partie ce pion.
 */
export function jouer(etat0, pion, groupe = false) {
  const coups = coupsPossibles(etat0).filter((c) => !!c.groupe === !!groupe);
  const coup = coups.find((c) => c.pion === pion || (c.groupe || []).includes(pion)) ||
    (!groupe && etat0.joueurs[etat0.tour].pions[pion] === -1 && coups.find((c) => c.depuis === -1));
  if (!coup) throw new Error('Ce pion ne peut pas bouger.');
  const etat = cloner(etat0);
  const g = geometrie(etat.regles, etat.joueurs.length);
  const j = etat.joueurs[etat.tour];
  const bouges = coup.groupe || [coup.pion];
  bouges.forEach((i) => { j.pions[i] = coup.vers; });
  if (coup.depuis === -1) j.groupes = retirerDesGroupes(j.groupes, bouges);
  etat.dernierCoup = { joueur: etat.tour, pion: coup.pion, depuis: coup.depuis, vers: coup.vers,
    ...(coup.groupe ? { groupe: coup.groupe } : {}) };
  coup.captures.forEach((v) => {
    etat.joueurs[v.joueur].pions[v.pion] = -1;
  });
  // Les pions d'un même joueur mangés d'un coup forment un groupe.
  etat.joueurs.forEach((adv, a) => {
    const manges = coup.captures.filter((v) => v.joueur === a).map((v) => v.pion);
    if (manges.length < 2) return;
    adv.groupes = [...retirerDesGroupes(adv.groupes, manges), manges];
  });
  j.captures += coup.captures.length;
  etat.numero += 1;
  if (Array.isArray(etat.histo)) etat.histo.push(`${groupe ? 'g' : 'p'}${pion}`);

  if (coup.groupe) noter(etat, `${j.nom} fait entrer ${coup.groupe.length} pions d'un coup.`);
  else if (coup.depuis === -1) noter(etat, `${j.nom} fait entrer un pion.`);
  else if (coup.vers === g.arrivee) noter(etat, `${j.nom} amène un pion au centre !`);
  if (coup.captures.length) {
    const noms = [...new Set(coup.captures.map((v) => etat.joueurs[v.joueur].nom))].join(' et ');
    const n = coup.captures.length;
    noter(etat, `${j.nom} capture ${n} pion${n > 1 ? 's' : ''} de ${noms} !`);
  }

  if (j.pions.every((p) => p === g.arrivee)) {
    etat.phase = 'fini';
    etat.gagnant = etat.tour;
    etat.lancer = null;
    noter(etat, `${j.nom} a gagné la partie !`);
    return etat;
  }
  const rejoue =
    faitRejouer(etat.regles, etat.lancer) || (coup.captures.length > 0 && etat.regles.rejouerApresCapture);
  if (rejoue) {
    etat.phase = 'lancer';
    etat.lancer = null;
    noter(etat, `${j.nom} rejoue.`);
  } else {
    joueurSuivant(etat);
  }
  return etat;
}

/**
 * Pour l'affichage : zone d'une case « r,c » sur un dessin où chaque case
 * mesure S. Le centre du plateau en croix est un grand carré de 3 × 3 cases.
 */
export function zoneCase(g, S) {
  const cleCentre = cle(g.chemins[0][g.arrivee]);
  return (k) => {
    if (k === cleCentre && g.centre.taille > 1) {
      return { x: g.centre.c * S, y: g.centre.r * S, w: g.centre.taille * S };
    }
    const [r, c] = k.split(',').map(Number);
    return { x: c * S, y: r * S, w: S };
  };
}

/**
 * Pour l'animation : positions successives d'un pion qui va de `depuis` à `vers`
 * (sans la position de départ). Gère le retour au début de l'anneau extérieur
 * quand le pion refait un tour faute de capture.
 */
export function etapesCoup(g, depuis, vers) {
  if (depuis < 0 || vers === depuis) return [vers];
  const res = [];
  let p = depuis;
  for (let garde = 0; p !== vers && garde < 200; garde++) {
    p += 1;
    if (vers < depuis && p >= g.longueurExterieur) p = g.debutBoucle;
    if (p > g.arrivee) p = vers;
    res.push(p);
  }
  return res;
}

/**
 * Pour l'affichage du plateau en croix : 3 arcs (chemins SVG) à chacun des
 * 4 coins du grand centre, là où le pion passe d'un bras au suivant.
 */
export function arcsCroix(g, S, rayons = ARCS_RAYONS) {
  const { r: r0, c: c0, taille: t } = g.centre;
  const coins = [[c0, r0, -1, -1], [c0 + t, r0, 1, -1], [c0, r0 + t, -1, 1], [c0 + t, r0 + t, 1, 1]];
  const arcs = [];
  coins.forEach(([cx, cy, dx, dy]) => {
    rayons.forEach((k) => {
      const R = k * S;
      const x = cx * S;
      const y = cy * S;
      arcs.push(`M${x + dx * R} ${y}A${R} ${R} 0 0 ${dx * dy > 0 ? 1 : 0} ${x} ${y + dy * R}`);
    });
  });
  return arcs;
}

/**
 * Pour l'affichage (plateau en croix) : les pions à la maison et les pions
 * arrivés sont dessinés dans le grand centre, dans le triangle tourné vers le
 * bras de leur joueur. Renvoie [{ joueur, pion, cx, cy, r, arrive }].
 */
export function pionsAuCentre(g, etat, S) {
  if (g.forme !== 'croix') return [];
  const { r: r0, c: c0, taille: t } = g.centre;
  const C = [(c0 + t / 2) * S, (r0 + t / 2) * S];
  const res = [];
  etat.joueurs.forEach((j, a) => {
    const liste = [];
    j.pions.forEach((pos, i) => { if (pos === -1) liste.push({ pion: i, arrive: false }); });
    j.pions.forEach((pos, i) => { if (pos === g.arrivee) liste.push({ pion: i, arrive: true }); });
    if (!liste.length) return;
    // Direction du centre vers la case d'entrée du joueur, et direction perpendiculaire
    const [er, ec] = g.chemins[a][0];
    let dx = (ec + 0.5) * S - C[0], dy = (er + 0.5) * S - C[1];
    const L = Math.hypot(dx, dy);
    dx /= L; dy /= L;
    const px = -dy, py = dx;
    const demi = (t / 2) * S; // distance du centre au bord du grand carré
    const essai = (rayon) => {
      const pas = rayon * 2.3;
      const rangs = [0.8, 0.53, 0.27].map((f) => ({ d: f * demi, n: Math.floor((2 * f * demi * 0.85) / pas) }));
      return { rayon, pas, rangs, place: rangs.reduce((s, x) => s + x.n, 0) };
    };
    const choix = [0.2, 0.14, 0.1].map((k) => essai(k * S)).find((e) => e.place >= liste.length) || essai(0.08 * S);
    let k = 0;
    for (const { d, n } of choix.rangs) {
      const dansRang = Math.min(n, liste.length - k);
      for (let m = 0; m < dansRang; m++, k++) {
        const decal = (m - (dansRang - 1) / 2) * choix.pas;
        res.push({ joueur: a, pion: liste[k].pion, arrive: liste[k].arrive, r: choix.rayon,
          cx: C[0] + dx * d + px * decal, cy: C[1] + dy * d + py * decal });
      }
      if (k >= liste.length) break;
    }
  });
  return res;
}

/** Pour l'affichage : pions groupés par case « r,c ». */
export function pionsParCase(etat) {
  const g = geometrie(etat.regles, etat.joueurs.length);
  const cases = new Map();
  etat.joueurs.forEach((j, a) =>
    j.pions.forEach((pos, i) => {
      if (pos < 0) return;
      const k = cle(g.chemins[a][pos]);
      if (!cases.has(k)) cases.set(k, []);
      cases.get(k).push({ joueur: a, pion: i });
    })
  );
  return cases;
}

export { valeursPossibles };
