/**
 * Sons et vibrations de l'appli.
 * Sons : petits fichiers WAV (assets/sons), joués avec expo-audio.
 * Vibrations : expo-haptics (sans effet sur le web).
 * Les deux se coupent séparément ; le choix est gardé sur l'appareil.
 */
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { stockage } from './enLigne';

const FICHIERS = {
  des: require('../assets/sons/des.wav'),
  pas: require('../assets/sons/pas.wav'),
  entree: require('../assets/sons/entree.wav'),
  capture: require('../assets/sons/capture.wav'),
  arrivee: require('../assets/sons/arrivee.wav'),
  victoire: require('../assets/sons/victoire.wav'),
  tour: require('../assets/sons/tour.wav'),
};

const reglages = { son: true, vibr: true };
stockage.lire('thaayam:son').then((v) => { if (v === 'non') reglages.son = false; }).catch(() => {});
stockage.lire('thaayam:vibr').then((v) => { if (v === 'non') reglages.vibr = false; }).catch(() => {});
// Les sons du jeu se mêlent à la musique du téléphone sans la couper, et respectent le mode silencieux.
setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});

const lecteurs = {};
function jouer(nom) {
  if (!reglages.son) return;
  try {
    if (!lecteurs[nom]) lecteurs[nom] = createAudioPlayer(FICHIERS[nom]);
    const l = lecteurs[nom];
    Promise.resolve(l.seekTo(0)).catch(() => {});
    l.play();
  } catch { /* son indisponible : on continue sans */ }
}

function vibrer(type) {
  if (!reglages.vibr) return;
  const f = {
    leger: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    fort: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
    succes: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    alerte: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  }[type];
  if (f) f().catch(() => {});
}

export const sons = {
  des() { jouer('des'); vibrer('leger'); },
  pas() { jouer('pas'); },
  entree() { jouer('entree'); vibrer('leger'); },
  capture() { jouer('capture'); vibrer('fort'); },
  arrivee() { jouer('arrivee'); vibrer('succes'); },
  victoire() { jouer('victoire'); vibrer('succes'); },
  tour() { jouer('tour'); vibrer('alerte'); },
};

export const sonActif = () => reglages.son;
export const vibrationsActives = () => reglages.vibr;
export function basculerSon() {
  reglages.son = !reglages.son;
  stockage.ecrire('thaayam:son', reglages.son ? 'oui' : 'non').catch(() => {});
  return reglages.son;
}
export function basculerVibrations() {
  reglages.vibr = !reglages.vibr;
  stockage.ecrire('thaayam:vibr', reglages.vibr ? 'oui' : 'non').catch(() => {});
  if (reglages.vibr) vibrer('leger');
  return reglages.vibr;
}
