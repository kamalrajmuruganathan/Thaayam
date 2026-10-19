/**
 * Thèmes visuels du plateau (données pures, partagées par la page web et l'appli).
 * « cristal » : tableau de bord haut de gamme (verre fumé, lueurs cyan, chiffres blancs).
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

export function themePlateau(nom) {
  return THEMES_PLATEAU[nom] || THEMES_PLATEAU[THEME_PAR_DEFAUT];
}
