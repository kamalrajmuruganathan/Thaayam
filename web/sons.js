/**
 * Petits sons du jeu, fabriqués avec Web Audio (aucun fichier à télécharger).
 * Le navigateur n'autorise le son qu'après un premier toucher de l'écran :
 * le contexte audio est donc créé à la demande.
 */
let ctx = null;
let actif = true;
try { actif = localStorage.getItem('thaayam:son') !== 'non'; } catch { /* navigation privée */ }

let vibrations = true;
try { vibrations = localStorage.getItem('thaayam:vibr') !== 'non'; } catch { /* navigation privée */ }

export function sonActif() { return actif; }
export function vibrationsActives() { return vibrations; }
export function basculerVibrations() {
  vibrations = !vibrations;
  try { localStorage.setItem('thaayam:vibr', vibrations ? 'oui' : 'non'); } catch { /* ignoré */ }
  if (vibrations) vibrer(60);
  return vibrations;
}
/** Fait vibrer le téléphone (durée en ms, ou motif [vibre, pause, vibre…]) si les vibrations sont activées. */
export function vibrer(motif) {
  if (!vibrations) return;
  try { navigator.vibrate && navigator.vibrate(motif); } catch { /* ignoré */ }
}
export function basculerSon() {
  actif = !actif;
  try { localStorage.setItem('thaayam:son', actif ? 'oui' : 'non'); } catch { /* ignoré */ }
  return actif;
}

function contexte() {
  if (!actif) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function note(freq, debut, duree, { type = 'sine', volume = 0.2, glisse = null } = {}) {
  const c = contexte();
  if (!c) return;
  const t = c.currentTime + debut;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glisse) osc.frequency.exponentialRampToValueAtTime(glisse, t + duree);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duree);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + duree + 0.02);
}

/** Bruit court filtré : le choc des dés longs en bois. */
function choc(debut, volume = 0.35) {
  const c = contexte();
  if (!c) return;
  const t = c.currentTime + debut;
  const longueur = Math.floor(c.sampleRate * 0.05);
  const tampon = c.createBuffer(1, longueur, c.sampleRate);
  const donnees = tampon.getChannelData(0);
  for (let i = 0; i < longueur; i++) donnees[i] = (Math.random() * 2 - 1) * (1 - i / longueur) ** 2;
  const src = c.createBufferSource();
  src.buffer = tampon;
  const filtre = c.createBiquadFilter();
  filtre.type = 'bandpass';
  filtre.frequency.value = 1800 + Math.random() * 900;
  const gain = c.createGain();
  gain.gain.value = volume;
  src.connect(filtre).connect(gain).connect(c.destination);
  src.start(t);
}

export const sons = {
  des() { choc(0); choc(0.07, 0.25); choc(0.15, 0.2); },
  pas() { note(660, 0, 0.06, { type: 'triangle', volume: 0.08 }); },
  entree() { note(523, 0, 0.12, { volume: 0.15 }); note(784, 0.08, 0.15, { volume: 0.15 }); },
  capture() {
    note(392, 0, 0.18, { type: 'sawtooth', volume: 0.12, glisse: 130 });
    note(196, 0.12, 0.22, { type: 'square', volume: 0.06, glisse: 90 });
    vibrer([90, 40, 140]);
  },
  arrivee() { [784, 988, 1175].forEach((f, i) => note(f, i * 0.09, 0.25, { volume: 0.14 })); vibrer(80); },
  victoire() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => note(f, i * 0.13, 0.3, { type: 'triangle', volume: 0.16 })); vibrer([100, 60, 100, 60, 250]); },
  /** C'est à toi : petit carillon à deux notes et une courte vibration. */
  tour() { note(880, 0, 0.16, { volume: 0.12 }); note(1320, 0.12, 0.22, { volume: 0.1 }); vibrer([40, 50, 40]); },
};
