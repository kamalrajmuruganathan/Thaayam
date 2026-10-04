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

export const REGLES_PAR_DEFAUT = {
  taille: 5,
  nbPions: 4,
  des: {
    type: 'cauris', // 'cauris' ou 'desLongs'
    nbCauris: 4,
    valeurZero: 8, // valeur quand aucun cauri ne tombe ouvert
    nbDes: 2,
    faces: [1, 2, 3, 4],
  },
  valeursEntree: [1], // « thaayam » : lancer qui fait entrer un pion
  valeursRejouer: [1, 4, 8],
  rejouerApresCapture: true,
  captureAvantInterieur: true,
  arriveeExacte: true,
  sens: 'anti-horaire', // sens de l'anneau extérieur
  sensAlterne: true, // chaque anneau intérieur se parcourt dans l'autre sens
  refuges: {
    milieuxInterieurs: false,
    coinsInterieurs: false,
  },
};

/** Valeurs par défaut proposées quand on change de type de dés. */
export const PRESETS_DES = {
  cauris: { valeursEntree: [1], valeursRejouer: [1, 4, 8] },
  desLongs: { valeursEntree: [2], valeursRejouer: [2, 8] },
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
    let sommes = [0];
    for (let i = 0; i < d.nbDes; i++) {
      const suivantes = [];
      for (const s of sommes) for (const f of d.faces) suivantes.push(s + f);
      sommes = suivantes;
    }
    sommes.forEach((s) => ens.add(s));
  }
  return [...ens].sort((a, b) => a - b);
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
    nbPions: borne(s.nbPions, 1, 6, d0.nbPions),
    des: {
      type: sd.type === 'desLongs' ? 'desLongs' : 'cauris',
      nbCauris: borne(sd.nbCauris, 2, 7, d0.des.nbCauris),
      valeurZero: borne(sd.valeurZero, 1, 24, d0.des.valeurZero),
      nbDes: borne(sd.nbDes, 1, 3, d0.des.nbDes),
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
    sensAlterne: s.sensAlterne !== false,
    refuges: {
      milieuxInterieurs: !!(s.refuges && s.refuges.milieuxInterieurs),
      coinsInterieurs: !!(s.refuges && s.refuges.coinsInterieurs),
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
      `${r.des.nbDes} dé${r.des.nbDes > 1 ? 's' : ''} long${r.des.nbDes > 1 ? 's' : ''} (faces ${r.des.faces.join(', ')})`
    );
  }
  lignes.push(`Entrée d'un pion avec : ${r.valeursEntree.join(', ')}`);
  lignes.push(
    `On rejoue avec : ${r.valeursRejouer.length ? r.valeursRejouer.join(', ') : 'aucune valeur'}` +
      (r.rejouerApresCapture ? ', et après une capture' : '')
  );
  if (r.captureAvantInterieur) lignes.push("Il faut avoir capturé un pion pour entrer à l'intérieur");
  lignes.push(r.arriveeExacte ? 'Il faut tomber pile sur le centre' : 'Pas besoin de tomber pile sur le centre');
  return lignes;
}
