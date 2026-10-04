import {
  REGLES_PAR_DEFAUT, PRESETS_DES, TAILLES, COULEURS,
  copieRegles, normaliserRegles, valeursPossibles, lireListe, resumeRegles,
} from './moteur/regles.js';
import { nouvellePartie, lancer, jouer, coupsPossibles, geometrie, pionsParCase } from './moteur/partie.js';
import { cle } from './moteur/plateau.js';
import { creerEnLigne } from './moteur/en-ligne.js';
import { SUPABASE_URL, SUPABASE_CLE_PUBLIQUE } from './config.js';

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';

// ---------------------------------------------------------------- stockage
const memoire = {
  lire(k) { try { return localStorage.getItem(k); } catch { return null; } },
  ecrire(k, v) { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } },
};
const stockageAsync = {
  lire: async (k) => memoire.lire(k),
  ecrire: async (k, v) => memoire.ecrire(k, v),
};

let enLigne = null;
async function obtenirEnLigne() {
  if (!enLigne) {
    let createClient;
    try {
      ({ createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'));
    } catch {
      throw new Error('Impossible de charger le jeu en ligne : vérifie ta connexion internet.');
    }
    const client = createClient(SUPABASE_URL, SUPABASE_CLE_PUBLIQUE, { auth: { persistSession: false } });
    enLigne = creerEnLigne(client, stockageAsync);
  }
  return enLigne;
}

// ---------------------------------------------------------------- navigation
function aller(nom) {
  document.querySelectorAll('.ecran').forEach((e) => { e.hidden = e.id !== `ecran-${nom}`; });
  window.scrollTo(0, 0);
}
document.querySelectorAll('[data-aller]').forEach((b) =>
  b.addEventListener('click', () => { arreterSuivi(); aller(b.dataset.aller); afficherAccueil(); })
);

function pseudo() {
  const v = $('pseudo').value.trim();
  memoire.ecrire('thaayam:pseudo', v);
  return v;
}
function message(id, texte, erreur = false) {
  const el = $(id);
  el.textContent = texte || '';
  el.classList.toggle('erreur', !!erreur);
}

// ---------------------------------------------------------------- accueil
function afficherAccueil() {
  const params = new URLSearchParams(location.search);
  if (params.get('code')) $('code-rejoindre').value = params.get('code').toUpperCase();
}

$('pseudo').value = memoire.lire('thaayam:pseudo') || '';

$('btn-creer').addEventListener('click', () => {
  if (!pseudo()) return message('message-accueil', "Écris d'abord ton pseudo.", true);
  ouvrirReglages('ligne');
});
$('btn-local').addEventListener('click', () => ouvrirReglages('local'));
$('btn-rejoindre').addEventListener('click', async () => {
  const code = $('code-rejoindre').value.trim().toUpperCase();
  if (!pseudo()) return message('message-accueil', "Écris d'abord ton pseudo.", true);
  if (code.length !== 5) return message('message-accueil', 'Le code fait 5 caractères.', true);
  message('message-accueil', 'Connexion…');
  try {
    const api = await obtenirEnLigne();
    const r = await api.rejoindre(code, pseudo());
    await ouvrirPartieEnLigne(r.code, r.place, r.jeton);
    message('message-accueil', '');
  } catch (e) {
    message('message-accueil', e.message, true);
  }
});

// ---------------------------------------------------------------- réglages
let modeReglages = 'ligne';
let edition = null;
let nbLocal = 2;

function ouvrirReglages(mode) {
  modeReglages = mode;
  try {
    edition = normaliserRegles(JSON.parse(memoire.lire('thaayam:regles:v2')) || REGLES_PAR_DEFAUT).regles;
  } catch {
    edition = copieRegles();
  }
  $('titre-reglages').textContent = mode === 'local' ? 'Partie sur cet appareil' : 'Nouvelle partie en ligne';
  $('btn-valider-regles').textContent = mode === 'local' ? 'Commencer' : 'Créer la partie';
  construireFormulaire();
  aller('reglages');
}

function el(tag, attrs = {}, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  enfants.flat().forEach((c) => e.append(c));
  return e;
}

function choix(options, actuel, surChoix) {
  const boite = el('div', { class: 'choix' });
  options.forEach(([valeur, texte]) => {
    const b = el('button', { type: 'button', class: valeur === actuel ? 'actif' : '' }, texte);
    b.addEventListener('click', () => {
      boite.querySelectorAll('button').forEach((x) => x.classList.remove('actif'));
      b.classList.add('actif');
      surChoix(valeur);
    });
    boite.append(b);
  });
  return boite;
}

function caseACocher(texte, coche, surChange, aide) {
  return el('label', { class: 'case' },
    el('input', { type: 'checkbox', checked: coche, onchange: (e) => { surChange(e.target.checked); verifierReglages(); } }),
    el('span', {}, texte, aide ? el('div', { class: 'aide' }, aide) : ''));
}

function construireFormulaire() {
  const f = $('form-regles');
  f.innerHTML = '';
  const r = edition;

  if (modeReglages === 'local') {
    const noms = el('div', { class: 'formulaire' });
    const dessinerNoms = () => {
      noms.innerHTML = '';
      for (let i = 0; i < nbLocal; i++) {
        noms.append(el('label', {},
          el('span', {}, el('span', { class: 'pastille', style: `display:inline-block;background:${COULEURS[i].code};vertical-align:middle;margin-right:6px` }), `Joueur ${i + 1}`),
          el('input', { id: `nom-${i}`, maxlength: 20, value: i === 0 ? ($('pseudo').value.trim() || COULEURS[i].nom) : COULEURS[i].nom })));
      }
    };
    dessinerNoms();
    f.append(el('fieldset', {}, el('legend', {}, 'Joueurs'),
      choix([[2, '2 joueurs'], [3, '3 joueurs'], [4, '4 joueurs']], nbLocal, (v) => { nbLocal = v; dessinerNoms(); }),
      noms));
  }

  f.append(el('fieldset', {}, el('legend', {}, 'Plateau'),
    choix(TAILLES.map((t) => [t, `${t} × ${t}`]), r.taille, (v) => { r.taille = v; verifierReglages(); }),
    el('label', {}, 'Pions par joueur',
      (() => {
        const s = el('select', { onchange: (e) => { r.nbPions = Number(e.target.value); verifierReglages(); } });
        for (let i = 1; i <= 12; i++) s.append(el('option', { value: i, selected: i === r.nbPions }, String(i)));
        return s;
      })())));

  const blocCauris = el('div', { class: 'formulaire' },
    el('label', {}, 'Nombre de cauris',
      (() => {
        const s = el('select', { onchange: (e) => { r.des.nbCauris = Number(e.target.value); verifierReglages(); } });
        for (let i = 2; i <= 7; i++) s.append(el('option', { value: i, selected: i === r.des.nbCauris }, String(i)));
        return s;
      })()),
    el('label', {}, 'Valeur quand aucun cauri ne tombe ouvert',
      el('input', { type: 'number', min: 1, max: 24, value: r.des.valeurZero, inputmode: 'numeric',
        oninput: (e) => { r.des.valeurZero = Number(e.target.value); verifierReglages(); } }),
      el('span', { class: 'aide' }, 'Souvent 8 avec 4 cauris, 12 avec 6 cauris.')));
  const blocDes = el('div', { class: 'formulaire' },
    el('label', {}, 'Nombre de dés longs',
      (() => {
        const s = el('select', { onchange: (e) => { r.des.nbDes = Number(e.target.value); verifierReglages(); } });
        for (let i = 1; i <= 3; i++) s.append(el('option', { value: i, selected: i === r.des.nbDes }, String(i)));
        return s;
      })()),
    el('label', {}, 'Valeurs des faces de chaque dé',
      el('input', { value: r.des.faces.join(', '), oninput: (e) => { r.des.faces = lireListe(e.target.value); verifierReglages(); } }),
      el('span', { class: 'aide' }, 'Séparées par des virgules. Dayakattai classique : 0, 1, 2, 3.')),
    el('label', {}, 'Valeur quand tous les dés montrent 0',
      el('input', { type: 'number', min: 0, max: 24, value: r.des.valeurToutZero, inputmode: 'numeric',
        oninput: (e) => { r.des.valeurToutZero = Number(e.target.value); verifierReglages(); } }),
      el('span', { class: 'aide' }, 'Classique : 0 + 0 = 12.')));
  const entree = el('input', { id: 'champ-entree', value: r.valeursEntree.join(', '),
    oninput: (e) => { r.valeursEntree = lireListe(e.target.value); verifierReglages(); } });
  const rejouer = el('input', { id: 'champ-rejouer', value: r.valeursRejouer.join(', '),
    oninput: (e) => { r.valeursRejouer = lireListe(e.target.value); verifierReglages(); } });
  const montrerDes = () => { blocCauris.hidden = r.des.type !== 'cauris'; blocDes.hidden = r.des.type === 'cauris'; };
  montrerDes();

  f.append(el('fieldset', {}, el('legend', {}, 'Lancer'),
    choix([['desLongs', 'Dés longs'], ['cauris', 'Cauris']], r.des.type, (v) => {
      r.des.type = v;
      r.valeursEntree = [...PRESETS_DES[v].valeursEntree];
      r.valeursRejouer = [...PRESETS_DES[v].valeursRejouer];
      entree.value = r.valeursEntree.join(', ');
      rejouer.value = r.valeursRejouer.join(', ');
      montrerDes();
      verifierReglages();
    }),
    blocCauris, blocDes,
    el('div', { id: 'valeurs-possibles', class: 'aide' }),
    el('label', {}, 'Valeurs qui font entrer un pion (« thaayam »)', entree),
    el('label', {}, 'Valeurs qui font rejouer', rejouer),
    caseACocher('On rejoue aussi après une capture', r.rejouerApresCapture, (v) => { r.rejouerApresCapture = v; })));

  f.append(el('fieldset', {}, el('legend', {}, 'Déplacements'),
    caseACocher("Il faut avoir capturé un pion pour entrer à l'intérieur", r.captureAvantInterieur,
      (v) => { r.captureAvantInterieur = v; }, "Sinon, les pions continuent de tourner sur l'anneau extérieur."),
    caseACocher('Il faut tomber pile sur le centre', r.arriveeExacte, (v) => { r.arriveeExacte = v; }),
    caseACocher('Un seul pion par case (sauf sur les croix)', r.unPionParCase, (v) => { r.unPionParCase = v; },
      'Deux pions du même joueur ne peuvent pas partager une case ordinaire.'),
    el('label', {}, "Sens de l'anneau extérieur",
      (() => {
        const s = el('select', { onchange: (e) => { r.sens = e.target.value; } });
        s.append(el('option', { value: 'anti-horaire', selected: r.sens === 'anti-horaire' }, 'Inverse des aiguilles d’une montre'));
        s.append(el('option', { value: 'horaire', selected: r.sens === 'horaire' }, 'Sens des aiguilles d’une montre'));
        return s;
      })()),
    el('label', {}, 'Sens des anneaux intérieurs',
      (() => {
        const s = el('select', { onchange: (e) => { r.sensInterieurs = e.target.value; } });
        [['inverse', "Tous dans l'autre sens (classique)"], ['meme', 'Même sens que l’extérieur'], ['alterne', 'Un sens sur deux']]
          .forEach(([v, t]) => s.append(el('option', { value: v, selected: r.sensInterieurs === v }, t)));
        return s;
      })())));

  f.append(el('fieldset', {}, el('legend', {}, 'Cases refuges (croix)'),
    el('div', { class: 'aide' }, 'Les cases de départ et le centre sont toujours des refuges.'),
    caseACocher('Coins du 2e anneau (classique)', r.refuges.coinsDeuxiemeAnneau, (v) => { r.refuges.coinsDeuxiemeAnneau = v; }),
    caseACocher('Milieux des anneaux intérieurs', r.refuges.milieuxInterieurs, (v) => { r.refuges.milieuxInterieurs = v; })));

  verifierReglages();
}

function verifierReglages() {
  const { erreurs } = normaliserRegles(edition);
  const vp = $('valeurs-possibles');
  if (vp) vp.textContent = `Valeurs possibles avec ces dés : ${valeursPossibles(edition).join(', ')}`;
  message('erreurs-regles', erreurs.join(' '), true);
  $('btn-valider-regles').disabled = erreurs.length > 0;
  return erreurs.length === 0;
}

$('form-regles').addEventListener('submit', (e) => e.preventDefault());
$('btn-valider-regles').addEventListener('click', async () => {
  if (!verifierReglages()) return;
  const { regles } = normaliserRegles(edition);
  memoire.ecrire('thaayam:regles:v2', JSON.stringify(regles));
  if (modeReglages === 'local') {
    const joueurs = Array.from({ length: nbLocal }, (_, i) => ({ nom: $(`nom-${i}`).value.trim() || COULEURS[i].nom }));
    session = { mode: 'local', etat: nouvellePartie(regles, joueurs) };
    aller('jeu');
    dessinerJeu();
    return;
  }
  const b = $('btn-valider-regles');
  b.disabled = true;
  message('erreurs-regles', 'Création de la partie…');
  try {
    const api = await obtenirEnLigne();
    const r = await api.creer(regles, pseudo());
    message('erreurs-regles', '');
    await ouvrirPartieEnLigne(r.code, r.place, r.jeton);
  } catch (e) {
    message('erreurs-regles', e.message, true);
  } finally {
    b.disabled = false;
  }
});

// ---------------------------------------------------------------- en ligne
let session = null; // { mode, etat, partie?, place?, jeton?, arret? }

function arreterSuivi() {
  if (session && session.arret) session.arret();
  if (session) session.arret = null;
}

async function ouvrirPartieEnLigne(code, place, jeton) {
  arreterSuivi();
  const api = await obtenirEnLigne();
  const partie = await api.lire(code);
  session = { mode: 'ligne', partie, etat: partie.etat, place, jeton };
  session.arret = api.suivre(code, (nouvelle) => {
    if (!session || session.mode !== 'ligne' || nouvelle.code !== session.partie.code) return;
    const changementStatut = nouvelle.statut !== session.partie.statut;
    const plusRecente = nouvelle.version > session.partie.version ||
      (nouvelle.statut === 'attente' && JSON.stringify(nouvelle.joueurs) !== JSON.stringify(session.partie.joueurs));
    if (!plusRecente && !changementStatut) return;
    session.partie = nouvelle;
    session.etat = nouvelle.etat;
    afficherPartieEnLigne();
  });
  history.replaceState(null, '', `?code=${code}`);
  afficherPartieEnLigne();
}

function lienPartie() {
  return `${location.origin}${location.pathname}?code=${session.partie.code}`;
}

function afficherPartieEnLigne() {
  const p = session.partie;
  if (p.statut === 'attente') {
    aller('salon');
    $('salon-code').textContent = p.code;
    $('salon-joueurs').innerHTML = '';
    p.joueurs.forEach((j, i) =>
      $('salon-joueurs').append(el('li', {}, el('span', { class: 'pastille', style: `background:${COULEURS[i].code}` }),
        j.nom, i === session.place ? ' (toi)' : '', i === 0 ? ' — créateur' : '')));
    $('salon-regles').innerHTML = '';
    resumeRegles(p.regles).forEach((l) => $('salon-regles').append(el('li', {}, l)));
    const createur = session.place === 0;
    $('btn-demarrer').hidden = !createur;
    $('btn-demarrer').disabled = p.joueurs.length < 2;
    message('salon-message', createur
      ? (p.joueurs.length < 2 ? 'Envoie le code à tes amis. Il faut au moins 2 joueurs.' : `${p.joueurs.length} joueurs prêts (4 au maximum).`)
      : 'En attente du créateur de la partie…');
    return;
  }
  dessinerJeu();
}

$('btn-copier').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(lienPartie());
    message('salon-message', 'Lien copié !');
  } catch {
    message('salon-message', lienPartie());
  }
});
$('btn-partager').addEventListener('click', async () => {
  const texte = `Viens jouer au Thaayam avec moi ! Code : ${session.partie.code}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Thaayam', text: texte, url: lienPartie() }); } catch { /* annulé */ }
  } else {
    $('btn-copier').click();
  }
});
$('btn-demarrer').addEventListener('click', async () => {
  $('btn-demarrer').disabled = true;
  try {
    const api = await obtenirEnLigne();
    const p = await api.lire(session.partie.code);
    await api.demarrer(p, session.jeton);
    session.partie = await api.lire(p.code);
    session.etat = session.partie.etat;
    afficherPartieEnLigne();
  } catch (e) {
    message('salon-message', e.message, true);
    $('btn-demarrer').disabled = false;
  }
});

// ---------------------------------------------------------------- jeu
let occupe = false;

function jePeuxJouer() {
  const e = session && session.etat;
  if (!e || e.phase === 'fini' || occupe) return false;
  return session.mode === 'local' || e.tour === session.place;
}

async function appliquer(nouvelEtat) {
  if (session.mode === 'local') {
    session.etat = nouvelEtat;
    dessinerJeu();
    return;
  }
  occupe = true;
  const ancien = session.partie;
  session.etat = nouvelEtat;
  dessinerJeu();
  try {
    const api = await obtenirEnLigne();
    const v = await api.envoyer(ancien.code, session.jeton, ancien.version, nouvelEtat);
    if (v >= session.partie.version) {
      session.partie = { ...session.partie, etat: nouvelEtat, version: v, statut: nouvelEtat.phase === 'fini' ? 'finie' : 'en_cours' };
    }
    message('jeu-message', '');
  } catch (e) {
    message('jeu-message', e.message, true);
    try {
      const api = await obtenirEnLigne();
      session.partie = await api.lire(ancien.code);
      session.etat = session.partie.etat;
    } catch { /* hors ligne */ }
  } finally {
    occupe = false;
    dessinerJeu();
  }
}

function tirageAleatoire() {
  if (window.crypto && crypto.getRandomValues) {
    const t = new Uint32Array(1);
    return () => { crypto.getRandomValues(t); return t[0] / 4294967296; };
  }
  return Math.random;
}

$('btn-lancer').addEventListener('click', () => {
  if (!jePeuxJouer() || session.etat.phase !== 'lancer') return;
  $('des').classList.remove('secoue');
  void $('des').offsetWidth;
  $('des').classList.add('secoue');
  appliquer(lancer(session.etat, tirageAleatoire()));
});
$('btn-entrer').addEventListener('click', () => {
  const coup = coupsPossibles(session.etat).find((c) => c.depuis === -1);
  if (coup && jePeuxJouer()) appliquer(jouer(session.etat, coup.pion));
});
$('btn-quitter').addEventListener('click', () => {
  arreterSuivi();
  session = null;
  history.replaceState(null, '', location.pathname);
  aller('accueil');
});
$('btn-regles-jeu').addEventListener('click', () => { $('jeu-regles').hidden = !$('jeu-regles').hidden; });

function dessinerDes(etat) {
  const zone = $('des');
  zone.innerHTML = '';
  const l = etat.lancer || etat.dernierLancer;
  if (!l) {
    zone.append(el('span', { class: 'attenue' }, 'Lance les dés'));
    return;
  }
  if (!etat.lancer) zone.append(el('span', { class: 'attenue petit' }, `Dernier lancer (${etat.joueurs[l.joueur].nom}) :`));
  if (etat.regles.des.type === 'cauris') {
    l.detail.forEach((ouvert) => zone.append(cauri(ouvert)));
  } else {
    l.detail.forEach((f) => zone.append(deLong(f)));
  }
  zone.append(el('span', { class: 'valeur' }, String(l.valeur)));
}

/** Dé long (dayakattai) vu de dessus : une face avec 0 à 3 points. */
function deLong(points) {
  const d = el('div', { class: 'de-long', 'aria-label': `dé long : ${points}` });
  if (points > 3) d.append(String(points));
  else for (let i = 0; i < points; i++) d.append(el('span', { class: 'point' }));
  return d;
}

function cauri(ouvert) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 30 40');
  s.setAttribute('width', '28');
  s.setAttribute('height', '38');
  s.innerHTML = ouvert
    ? '<ellipse cx="15" cy="20" rx="13" ry="18" fill="#f4ead5" stroke="#8a6a3b" stroke-width="2"/><path d="M15 6 Q11 20 15 34 Q19 20 15 6" fill="#5b3a1a"/><path d="M12 12h-3M12 17h-4M12 22h-4M12 27h-3M18 12h3M18 17h4M18 22h4M18 27h3" stroke="#8a6a3b" stroke-width="1.2"/>'
    : '<ellipse cx="15" cy="20" rx="13" ry="18" fill="#d8b98a" stroke="#8a6a3b" stroke-width="2"/><ellipse cx="13" cy="15" rx="5" ry="7" fill="#f2dfbd" opacity="0.7"/>';
  s.setAttribute('aria-label', ouvert ? 'cauri ouvert' : 'cauri fermé');
  return s;
}

function dessinerJeu() {
  const etat = session.etat;
  if (!etat) return;
  if ($('ecran-jeu').hidden) aller('jeu');
  const g = geometrie(etat.regles, etat.joueurs.length);
  const moi = session.mode === 'ligne' ? session.place : null;
  const actif = etat.joueurs[etat.tour];
  const peut = jePeuxJouer();
  const coups = peut ? coupsPossibles(etat) : [];

  // Bandeau des joueurs
  const bandeau = $('jeu-joueurs');
  bandeau.innerHTML = '';
  etat.joueurs.forEach((j, i) => {
    const arrives = j.pions.filter((p) => p === g.arrivee).length;
    const maison = j.pions.filter((p) => p === -1).length;
    bandeau.append(el('div', { class: `joueur${i === etat.tour && etat.phase !== 'fini' ? ' actif' : ''}` },
      el('span', { class: 'pastille', style: `background:${j.couleur}` }),
      el('div', { style: 'min-width:0' },
        el('div', { class: 'nom' }, j.nom + (i === moi ? ' (toi)' : '')),
        el('div', { class: 'stats' }, `🏠 ${maison} · 🎯 ${arrives}/${j.pions.length} · ⚔️ ${j.captures}`))));
  });

  dessinerPlateau(etat, g, coups);
  dessinerDes(etat);

  // Consigne
  let consigne;
  if (etat.phase === 'fini') consigne = `🏆 ${etat.joueurs[etat.gagnant].nom} a gagné !`;
  else if (session.mode === 'ligne' && etat.tour !== moi) consigne = `C'est au tour de ${actif.nom}…`;
  else if (etat.phase === 'lancer') consigne = `${session.mode === 'local' ? actif.nom + ', à toi' : 'À toi'} : lance les dés.`;
  else consigne = 'Touche un pion qui clignote pour le déplacer.';
  $('jeu-consigne').textContent = consigne;
  $('jeu-consigne').style.color = etat.phase === 'fini' ? '' : actif.couleur;

  $('btn-lancer').disabled = !(peut && etat.phase === 'lancer');
  $('btn-lancer').hidden = etat.phase === 'fini';
  const entree = coups.find((c) => c.depuis === -1);
  $('btn-entrer').hidden = !entree;

  const journal = $('journal');
  journal.innerHTML = '';
  etat.journal.forEach((l) => journal.append(el('li', {}, l)));
  $('jeu-regles').innerHTML = '';
  resumeRegles(etat.regles).forEach((l) => $('jeu-regles').append(el('li', {}, l)));
}

function svg(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
}

function dessinerPlateau(etat, g, coups) {
  const n = etat.regles.taille;
  const S = 100;
  const plateau = $('plateau');
  plateau.innerHTML = '';
  plateau.setAttribute('viewBox', `0 0 ${n * S} ${n * S}`);
  const m = (n - 1) / 2;

  // Cases de départ colorées
  const departs = new Map();
  etat.joueurs.forEach((j, i) => departs.set(cle(g.chemins[i][0]), j.couleur));

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const k = `${r},${c}`;
      const x = c * S, y = r * S;
      const centre = r === m && c === m;
      svg('rect', { x: x + 2, y: y + 2, width: S - 4, height: S - 4, rx: 6,
        fill: centre ? '#c98b3c' : departs.has(k) ? departs.get(k) : '#f8e9c8',
        'fill-opacity': departs.has(k) && !centre ? 0.35 : 1, stroke: '#6b3a14', 'stroke-width': 2 }, plateau);
      if (g.refuges.has(k) && !centre) {
        svg('path', { d: `M${x + 18} ${y + 18}L${x + S - 18} ${y + S - 18}M${x + S - 18} ${y + 18}L${x + 18} ${y + S - 18}`,
          stroke: '#6b3a14', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.55 }, plateau);
      }
      if (centre) {
        svg('path', { d: `M${x + 50} ${y + 14}L${x + 86} ${y + 50}L${x + 50} ${y + 86}L${x + 14} ${y + 50}Z`,
          fill: 'none', stroke: '#fff3da', 'stroke-width': 4 }, plateau);
      }
    }
  }

  // Destinations possibles
  coups.forEach((cp) => {
    const [r, c] = g.chemins[etat.tour][cp.vers];
    svg('circle', { cx: c * S + 50, cy: r * S + 50, r: 40, fill: 'none', stroke: etat.joueurs[etat.tour].couleur,
      'stroke-width': 5, 'stroke-dasharray': '10 8' }, plateau);
  });

  // Pions
  const jouables = new Set(coups.filter((c) => c.depuis >= 0).map((c) => `${etat.tour}:${c.pion}`));
  pionsParCase(etat).forEach((liste, k) => {
    const [r, c] = k.split(',').map(Number);
    const cote = Math.ceil(Math.sqrt(liste.length));
    const pas = (S - 16) / cote;
    const rayon = Math.min(30, pas * 0.42);
    liste.forEach((p, i) => {
      const cx = c * S + 8 + pas * (i % cote) + pas / 2;
      const cy = r * S + 8 + pas * Math.floor(i / cote) + pas / 2;
      const j = etat.joueurs[p.joueur];
      const jouable = jouables.has(`${p.joueur}:${p.pion}`);
      const grp = svg('g', { class: jouable ? 'pion-jouable' : '' }, plateau);
      svg('circle', { cx, cy, r: rayon, fill: j.couleur, stroke: jouable ? '#fff' : '#2b1d10', 'stroke-width': jouable ? 6 : 3 }, grp);
      svg('circle', { cx: cx - rayon * 0.3, cy: cy - rayon * 0.3, r: rayon * 0.3, fill: '#fff', opacity: 0.35 }, grp);
      if (jouable) {
        // zone de toucher plus large que le pion
        const zone = svg('circle', { cx, cy, r: Math.max(rayon, 34), fill: 'transparent' }, grp);
        zone.style.cursor = 'pointer';
        grp.addEventListener('click', () => {
          if (jePeuxJouer()) appliquer(jouer(session.etat, p.pion));
        });
      }
    });
  });
}

// ---------------------------------------------------------------- démarrage
async function demarrage() {
  afficherAccueil();
  const code = new URLSearchParams(location.search).get('code');
  if (!code) return;
  const place = (() => { try { return JSON.parse(memoire.lire(`thaayam:${code.toUpperCase()}`)); } catch { return null; } })();
  if (!place) return;
  try {
    await ouvrirPartieEnLigne(code.toUpperCase(), place.place, place.jeton);
  } catch (e) {
    message('message-accueil', e.message, true);
  }
}
demarrage();
