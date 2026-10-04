/**
 * Déroulement d'une partie. Fonctions pures : chaque action renvoie un nouvel
 * état (objet JSON simple), ce qui permet de le stocker tel quel en ligne.
 *
 * Position d'un pion : -1 = à la maison, 0 = case de départ,
 * dernier indice du chemin = centre (pion arrivé).
 */
import { normaliserRegles, valeursPossibles, valeurDesLongs, COULEURS } from './regles.js';
import { chemin, cotesPourJoueurs, refuges, cle, cheminCroix, casesCroix, refugesCroix, CROIX } from './plateau.js';

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
      arrivee: chemins[0].cases.length - 1,
      refuges: refugesCroix(),
      cases: casesCroix(),
      centre: { r: 6, c: 6, taille: 3 }, // grand carré central (pazham)
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
      ...(j.ordi ? { ordi: true } : {}),
    })),
    tour: 0,
    phase: 'lancer', // 'lancer' | 'deplacer' | 'fini'
    lancer: null, // { valeur, detail }
    dernierLancer: null, // { valeur, detail, joueur }
    dernierCoup: null, // { joueur, pion, depuis, vers }
    gagnant: null,
    numero: 0,
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
  if (d.type === 'cauris') {
    const ouverts = Array.from({ length: d.nbCauris }, () => rng() < 0.5);
    const nb = ouverts.filter(Boolean).length;
    return { valeur: nb === 0 ? d.valeurZero : nb, detail: ouverts };
  }
  const faces = Array.from({ length: d.nbDes }, () => d.faces[Math.floor(rng() * d.faces.length)]);
  return { valeur: valeurDesLongs(d, faces), detail: faces };
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
    t %= g.longueurExterieur;
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
  return coups;
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
  etat.numero += 1;
  etat.lancer = t;
  etat.dernierLancer = { ...t, joueur: etat.tour };
  etat.phase = 'deplacer';
  if (coupsPossibles(etat).length === 0) {
    if (etat.regles.valeursRejouer.includes(t.valeur)) {
      noter(etat, `${nom} fait ${t.valeur} : aucun pion ne peut bouger, mais ${nom} rejoue.`);
      etat.phase = 'lancer';
      etat.lancer = null;
    } else {
      noter(etat, `${nom} fait ${t.valeur} : aucun pion ne peut bouger.`);
      joueurSuivant(etat);
    }
  } else {
    noter(etat, `${nom} fait ${t.valeur}.`);
  }
  return etat;
}

/** Action « déplacer le pion n° pion » avec le dernier lancer. */
export function jouer(etat0, pion) {
  const coup = coupsPossibles(etat0).find((c) => c.pion === pion) ||
    (etat0.joueurs[etat0.tour].pions[pion] === -1 &&
      coupsPossibles(etat0).find((c) => c.depuis === -1));
  if (!coup) throw new Error('Ce pion ne peut pas bouger.');
  const etat = cloner(etat0);
  const g = geometrie(etat.regles, etat.joueurs.length);
  const j = etat.joueurs[etat.tour];
  const valeur = etat.lancer.valeur;
  j.pions[coup.pion] = coup.vers;
  etat.dernierCoup = { joueur: etat.tour, pion: coup.pion, depuis: coup.depuis, vers: coup.vers };
  coup.captures.forEach((v) => {
    etat.joueurs[v.joueur].pions[v.pion] = -1;
  });
  j.captures += coup.captures.length;
  etat.numero += 1;

  if (coup.depuis === -1) noter(etat, `${j.nom} fait entrer un pion.`);
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
    etat.regles.valeursRejouer.includes(valeur) || (coup.captures.length > 0 && etat.regles.rejouerApresCapture);
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
