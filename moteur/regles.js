/**
 * Règles paramétrables du Thaayam.
 * Les règles changent selon les familles et les régions : tout ce qui varie
 * est réglable ici, et normaliserRegles() vérifie que la combinaison est jouable.
 */

export const COULEURS = [
  { nom: 'Rouge', code: '#d6453d' },
  { nom: 'Vert', code: '#2e9e5b' },
  { nom: 'Jaune', code: '#e0a800' },
  { nom: 'Bleu', code: '#2f6fd6' },
];

export const TAILLES = [5, 7, 9];

/**
 * Règles par défaut : Thaayam / Dayakattai classique du Tamil Nadu.
 * Plateau 7 × 7, deux dés longs à faces 0, 1, 2, 3 (0 + 0 = 12),
 * entrée avec un « thaayam » (1), on rejoue avec 1, 5, 6 et 12.
 */
export const REGLES_PAR_DEFAUT = {
  taille: 7,
  nbPions: 6,
  des: {
    type: 'desLongs', // 'desLongs' ou 'cauris'
    nbDes: 2,
    faces: [0, 1, 2, 3],
    valeurToutZero: 12, // valeur quand tous les dés longs montrent 0
    nbCauris: 4,
    valeurZero: 8, // valeur quand aucun cauri ne tombe ouvert
  },
  valeursEntree: [1], // « thaayam » : lancer qui fait entrer un pion
  valeursRejouer: [1, 5, 6, 12],
  rejouerApresCapture: true,
  captureAvantInterieur: true, // il faut avoir « coupé » un pion pour entrer à l'intérieur
  arriveeExacte: true,
  unPionParCase: true, // deux pions d'un même joueur ne partagent pas une case (sauf refuge)
  sens: 'anti-horaire', // sens de l'anneau extérieur
  sensInterieurs: 'inverse', // 'inverse' | 'meme' | 'alterne' (par rapport à l'anneau extérieur)
  refuges: {
    coinsDeuxiemeAnneau: true,
    milieuxInterieurs: false,
  },
};

/** Valeurs par défaut proposées quand on change de type de dés. */
export const PRESETS_DES = {
  desLongs: { valeursEntree: [1], valeursRejouer: [1, 5, 6, 12] },
  cauris: { valeursEntree: [1], valeursRejouer: [1, 4, 8] },
};

export function copieRegles(r = REGLES_PAR_DEFAUT) {
  return JSON.parse(JSON.stringify(r));
}

/** Toutes les valeurs qu'un lancer peut donner, triées. */
export function valeursPossibles(regles) {
  const d = regles.des;
  const ens = new Set();
  if (d.type === 'cauris') {
    for (let k = 1; k <= d.nbCauris; k++) ens.add(k);
    ens.add(d.valeurZero);
  } else {
    let tirages = [[]];
    for (let i = 0; i < d.nbDes; i++) {
      const suivants = [];
      for (const t of tirages) for (const f of d.faces) suivants.push([...t, f]);
      tirages = suivants;
    }
    tirages.forEach((t) => ens.add(valeurDesLongs(d, t)));
  }
  return [...ens].sort((a, b) => a - b);
}

/** Valeur d'un tirage de dés longs : la somme, sauf si tous montrent 0. */
export function valeurDesLongs(d, faces) {
  return faces.every((f) => f === 0) ? d.valeurToutZero : faces.reduce((a, b) => a + b, 0);
}

/** Lit « 1, 4, 8 » → [1, 4, 8] (entiers, sans doublon). */
export function lireListe(texte) {
  return [
    ...new Set(
      String(texte)
        .split(/[\s,;]+/)
        .filter(Boolean)
        .map(Number)
        .filter((n) => Number.isInteger(n))
    ),
  ];
}

const borne = (v, min, max, defaut) =>
  Number.isInteger(v) && v >= min && v <= max ? v : defaut;

/**
 * Corrige les valeurs hors limites et renvoie { regles, erreurs }.
 * S'il y a des erreurs, la partie ne doit pas être lancée.
 */
export function normaliserRegles(source) {
  const d0 = REGLES_PAR_DEFAUT;
  const s = source || {};
  const sd = s.des || {};
  const erreurs = [];

  const r = {
    taille: TAILLES.includes(s.taille) ? s.taille : d0.taille,
    nbPions: borne(s.nbPions, 1, 12, d0.nbPions),
    des: {
      type: sd.type === 'cauris' ? 'cauris' : 'desLongs',
      nbCauris: borne(sd.nbCauris, 2, 7, d0.des.nbCauris),
      valeurZero: borne(sd.valeurZero, 1, 24, d0.des.valeurZero),
      nbDes: borne(sd.nbDes, 1, 3, d0.des.nbDes),
      valeurToutZero: borne(sd.valeurToutZero, 0, 24, d0.des.valeurToutZero),
      faces: Array.isArray(sd.faces)
        ? [...new Set(sd.faces.filter((f) => Number.isInteger(f) && f >= 0 && f <= 12))]
        : [...d0.des.faces],
    },
    valeursEntree: Array.isArray(s.valeursEntree)
      ? s.valeursEntree.filter((v) => Number.isInteger(v) && v > 0)
      : [...d0.valeursEntree],
    valeursRejouer: Array.isArray(s.valeursRejouer)
      ? s.valeursRejouer.filter((v) => Number.isInteger(v) && v > 0)
      : [...d0.valeursRejouer],
    rejouerApresCapture: s.rejouerApresCapture !== false,
    captureAvantInterieur: s.captureAvantInterieur !== false,
    arriveeExacte: s.arriveeExacte !== false,
    sens: s.sens === 'horaire' ? 'horaire' : 'anti-horaire',
    unPionParCase: s.unPionParCase !== false,
    sensInterieurs: ['inverse', 'meme', 'alterne'].includes(s.sensInterieurs) ? s.sensInterieurs : d0.sensInterieurs,
    refuges: {
      coinsDeuxiemeAnneau: !(s.refuges && s.refuges.coinsDeuxiemeAnneau === false),
      milieuxInterieurs: !!(s.refuges && s.refuges.milieuxInterieurs),
    },
  };

  if (r.des.type === 'desLongs' && r.des.faces.length < 2) {
    erreurs.push('Chaque dé long doit avoir au moins 2 faces différentes.');
  }
  const possibles = valeursPossibles(r);
  if (r.valeursEntree.length === 0) {
    erreurs.push("Choisis au moins une valeur qui fait entrer un pion.");
  } else if (!r.valeursEntree.some((v) => possibles.includes(v))) {
    erreurs.push(
      `Aucune valeur d'entrée ne peut sortir avec ces dés (valeurs possibles : ${possibles.join(', ')}).`
    );
  }
  if (possibles.length > 0 && possibles.every((v) => r.valeursRejouer.includes(v))) {
    erreurs.push('Toutes les valeurs font rejouer : le tour ne passerait jamais.');
  }
  if (possibles.every((v) => v === 0)) {
    erreurs.push('Les dés ne peuvent donner que 0 : impossible d’avancer.');
  }
  return { regles: r, erreurs };
}

/** Résumé lisible des règles (une ligne par règle). */
export function resumeRegles(r) {
  const lignes = [];
  lignes.push(`Plateau ${r.taille} × ${r.taille}, ${r.nbPions} pion${r.nbPions > 1 ? 's' : ''} par joueur`);
  if (r.des.type === 'cauris') {
    lignes.push(`${r.des.nbCauris} cauris ; aucun cauri ouvert = ${r.des.valeurZero}`);
  } else {
    lignes.push(
      `${r.des.nbDes} dé${r.des.nbDes > 1 ? 's' : ''} long${r.des.nbDes > 1 ? 's' : ''} (faces ${r.des.faces.join(', ')})` +
        (r.des.faces.includes(0) ? ` ; tout à 0 = ${r.des.valeurToutZero}` : '')
    );
  }
  lignes.push(`Entrée d'un pion avec : ${r.valeursEntree.join(', ')}`);
  lignes.push(
    `On rejoue avec : ${r.valeursRejouer.length ? r.valeursRejouer.join(', ') : 'aucune valeur'}` +
      (r.rejouerApresCapture ? ', et après une capture' : '')
  );
  if (r.unPionParCase) lignes.push('Un seul pion par case, sauf sur les refuges');
  if (r.captureAvantInterieur) lignes.push("Il faut avoir capturé un pion pour entrer à l'intérieur");
  lignes.push(r.arriveeExacte ? 'Il faut tomber pile sur le centre' : 'Pas besoin de tomber pile sur le centre');
  return lignes;
}
