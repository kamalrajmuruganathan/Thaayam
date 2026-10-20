/**
 * Thèmes visuels du plateau (données pures, partagées par la page web et l'appli).
 * « cristal » : tableau de bord haut de gamme (verre fumé, lueurs cyan, chiffres blancs).
 * « temple » : pierre de temple et dorures, comme les sculptures de Madurai.
 * « nuit » : néons violets et roses sur fond noir.
 * « bois » : plateau traditionnel en bois.
 */
export const THEMES_PLATEAU = {
  cristal: {
    nom: 'Cristal',
    cadre: '#05080c', // bord autour du plateau
    fond: '#081018', // fond du plateau
    fondLueur: '#123a52', // halo bleuté au centre du fond
    diagonale: '#1d4a66',
    diagonaleLueur: '#5fd4ff',
    arc: '#123247',
    arcLueur: '#7fe0ff',
    ecriture: '#bfeeff',
    caseFond: '#0f1b26',
    caseTrait: '#2c6f93',
    teinteOpacite: 0.42,
    centreFond: '#0b1620',
    centreTrait: '#5fd4ff',
    centreCroix: '#2c6f93',
    croixRefuge: '#5fd4ff',
    pionTrait: '#e8f6ff',
    pionReflet: '#ffffff',
    jouable: '#ffffff',
    arrive: '#e6f7ff',
    arriveTrait: '#5fd4ff',
    dernierCoup: '#7fdcff',
    trajetOpacite: 0.9,
    lueur: true, // halo lumineux autour des pions et des lignes
  },
  temple: {
    nom: 'Temple',
    cadre: '#3b2f22',
    fond: '#8d7556', // grès
    fondLueur: '#b39468',
    diagonale: '#4a3923',
    diagonaleLueur: '#e9c46a', // filet doré
    arc: '#4a3923',
    arcLueur: '#f2d488',
    ecriture: '#fbe7a6',
    caseFond: '#e6dac3', // pierre claire
    caseTrait: '#6b5536',
    teinteOpacite: 0.34,
    centreFond: '#f3e6c4',
    centreTrait: '#b8892c',
    centreCroix: '#8a6420',
    croixRefuge: '#8a6420',
    pionTrait: '#2a2118',
    pionReflet: '#ffffff',
    jouable: '#ffffff',
    arrive: '#f2c94c',
    arriveTrait: '#8a6420',
    dernierCoup: '#d9a520',
    trajetOpacite: 0.85,
    lueur: false,
  },
  nuit: {
    nom: 'Nuit',
    cadre: '#07030f',
    fond: '#0c0618',
    fondLueur: '#2a0f45',
    diagonale: '#2b1450',
    diagonaleLueur: '#ff4fd8', // néon rose
    arc: '#241046',
    arcLueur: '#b678ff', // néon violet
    ecriture: '#ffb8f1',
    caseFond: '#140b26',
    caseTrait: '#7a3cff',
    teinteOpacite: 0.45,
    centreFond: '#120822',
    centreTrait: '#ff4fd8',
    centreCroix: '#7a3cff',
    croixRefuge: '#ff4fd8',
    pionTrait: '#fde6ff',
    pionReflet: '#ffffff',
    jouable: '#ffffff',
    arrive: '#fde6ff',
    arriveTrait: '#ff4fd8',
    dernierCoup: '#ff8ae5',
    trajetOpacite: 0.9,
    lueur: true,
  },
  bois: {
    nom: 'Bois',
    cadre: '#6b3a14',
    fond: '#b8653a',
    fondLueur: null,
    diagonale: '#5a2e10',
    diagonaleLueur: '#e9b77f',
    arc: '#5a2e10',
    arcLueur: '#f3d9b0',
    ecriture: '#fbe9cf',
    caseFond: '#f8e9c8',
    caseTrait: '#4a2a12',
    teinteOpacite: 0.3,
    centreFond: '#fbf3e2',
    centreTrait: '#4a2a12',
    centreCroix: '#4a2a12',
    croixRefuge: '#6b3a14',
    pionTrait: '#2b1d10',
    pionReflet: '#ffffff',
    jouable: '#ffffff',
    arrive: '#f5c518',
    arriveTrait: '#7a5418',
    dernierCoup: null, // couleur du joueur
    trajetOpacite: 0.85,
    lueur: false,
  },
};

export const THEME_PAR_DEFAUT = 'cristal';

/** Thèmes proposés, dans l'ordre d'affichage, avec leur icône. */
export const THEMES = [
  { code: 'cristal', icone: '💎' },
  { code: 'temple', icone: '🛕' },
  { code: 'nuit', icone: '🌌' },
  { code: 'bois', icone: '🪵' },
];

/** Nom de thème valide (sinon le thème par défaut). */
export function themeValide(nom) {
  return THEMES_PLATEAU[nom] ? nom : THEME_PAR_DEFAUT;
}

export function themePlateau(nom) {
  return THEMES_PLATEAU[nom] || THEMES_PLATEAU[THEME_PAR_DEFAUT];
}
