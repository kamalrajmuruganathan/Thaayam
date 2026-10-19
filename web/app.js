import {
  REGLES_PAR_DEFAUT, PRESETS_DES, TAILLES, COULEURS,
  copieRegles, normaliserRegles, valeursPossibles, lireListe, resumeRegles, nomLancer,
} from './moteur/regles.js';
import { nouvellePartie, lancer, jouer, coupsPossibles, geometrie, pionsParCase, pionsAuCentre, zoneCase, etapesCoup, arcsCroix } from './moteur/partie.js';
import { cle } from './moteur/plateau.js';
import { choisirCoup } from './moteur/ia.js';
import { sons, sonActif, basculerSon } from './sons.js';
import { creerEnLigne, REACTIONS } from './moteur/en-ligne.js';
import { noterFin, resumeStats, normaliserStats, statsVides } from './moteur/stats.js';
import { themePlateau, THEME_PAR_DEFAUT } from './moteur/themes.js';
import {
  LANGUES, traducteur, traduireJournal, traduireErreur, traduireNom, traduireReaction,
  resumeReglesTraduit, resumeStatsTraduit,
} from './moteur/i18n.js';
import { SUPABASE_URL, SUPABASE_CLE_PUBLIQUE } from './config.js';

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';

// ---------------------------------------------------------------- stockage
const memoire = {
  lire(k) { try { return localStorage.getItem(k); } catch { return null; } },
  ecrire(k, v) { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } },
};

// ---------------------------------------------------------------- langue
function langueChoisie() {
  const l = memoire.lire('thaayam:langue');
  if (LANGUES.some((x) => x.code === l)) return l;
  const nav = (navigator.language || 'fr').slice(0, 2);
  return LANGUES.some((x) => x.code === nav) ? nav : 'fr';
}
let t = traducteur(langueChoisie());
const nomAffiche = (nom) => traduireNom(nom, t);
/** Met à jour tous les textes de la page (attributs data-i18n) et l'écran en cours. */
function appliquerLangue() {
  const code = langueChoisie();
  t = traducteur(code);
  document.documentElement.lang = code;
  document.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((e) => { e.placeholder = t(e.dataset.i18nPlaceholder); });
  document.querySelectorAll('#choix-langue button').forEach((b) => b.classList.toggle('actif', b.dataset.langue === code));
  if (typeof majBoutonSon === 'function') majBoutonSon();
  if (typeof majBoutonTrajet === 'function') majBoutonTrajet();
  document.querySelectorAll('[data-reaction]').forEach((b) => { b.textContent = traduireReaction(b.dataset.reaction, t); });
}
LANGUES.forEach(({ code, nom }) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.langue = code;
  b.textContent = nom;
  b.lang = code;
  b.addEventListener('click', () => {
    memoire.ecrire('thaayam:langue', code);
    appliquerLangue();
    // Redessiner l'écran visible dans la nouvelle langue
    if (!$('ecran-accueil').hidden) afficherAccueil();
    if (!$('ecran-reglages').hidden) ouvrirReglages(modeReglages);
    if (session && !$('ecran-salon').hidden) afficherPartieEnLigne();
    if (session && session.etat && !$('ecran-jeu').hidden) dessinerJeu();
  });
  $('choix-langue').append(b);
});

// ---------------------------------------------------------------- thème (Cristal ou Bois)
function themeChoisi() {
  const t = memoire.lire('thaayam:theme');
  return t === 'bois' || t === 'cristal' ? t : THEME_PAR_DEFAUT;
}
function appliquerTheme() {
  document.documentElement.dataset.skin = themeChoisi();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', themeChoisi() === 'cristal' ? '#05080c' : '#7a3e12');
  document.querySelectorAll('[data-theme-choix]').forEach((b) => b.classList.toggle('actif', b.dataset.themeChoix === themeChoisi()));
}
document.querySelectorAll('[data-theme-choix]').forEach((b) => b.addEventListener('click', () => {
  memoire.ecrire('thaayam:theme', b.dataset.themeChoix);
  appliquerTheme();
  if (session && session.etat && !$('ecran-jeu').hidden) dessinerJeu();
}));
appliquerTheme();
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
      throw new Error(t('errInternet'));
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
  afficherMesParties();
  afficherStats();
}

// ---------------------------------------------------------------- statistiques
function lireStats() {
  try { return normaliserStats(JSON.parse(memoire.lire('thaayam:stats') || 'null')); } catch { return statsVides(); }
}
function afficherStats() {
  const lignes = resumeStatsTraduit(lireStats(), t);
  $('mes-stats').hidden = lignes.length === 0;
  $('liste-stats').innerHTML = '';
  lignes.forEach((l) => $('liste-stats').append(el('li', {}, l)));
}
$('btn-stats-zero').addEventListener('click', () => {
  if (!window.confirm(t('statsZeroConfirmer'))) return;
  memoire.ecrire('thaayam:stats', JSON.stringify(statsVides()));
  afficherStats();
});
/** Compte la partie une seule fois, quand elle se termine. */
function noterStats(etat) {
  if (!session || etat.phase !== 'fini' || session.statsNotees === etat) return;
  session.statsNotees = etat;
  const s = noterFin(lireStats(), etat, session.mode === 'ligne'
    ? { mode: 'ligne', place: session.place, code: session.partie.code } : { mode: 'local' });
  memoire.ecrire('thaayam:stats', JSON.stringify(s));
}

/** Parties en ligne de cet appareil, pour les reprendre en un clic. */
async function afficherMesParties() {
  const carte = $('mes-parties');
  let liste = [];
  try { liste = JSON.parse(memoire.lire('thaayam:mes-parties') || '[]'); } catch { /* rien */ }
  if (!liste.length) { carte.hidden = true; return; }
  try {
    const parties = await (await obtenirEnLigne()).mesParties();
    const zone = $('liste-mes-parties');
    zone.innerHTML = '';
    parties.forEach((p) => {
      const noms = p.joueurs.map((j) => nomAffiche(j.nom)).join(', ');
      const etat = p.statut === 'attente' ? t('partieAttente') : p.aMoi ? t('partieAMoi') : t('partieEnCours');
      const b = el('button', { class: p.aMoi ? 'principal' : '' },
        el('span', { class: 'code-partie' }, p.code), ' ', el('span', { class: 'petit' }, `${etat} · ${noms}`));
      b.addEventListener('click', async () => {
        try { await ouvrirPartieEnLigne(p.code, p.place, p.jeton); } catch (e) { message('message-accueil', traduireErreur(e.message, t), true); }
      });
      zone.append(b);
    });
    carte.hidden = parties.length === 0;
  } catch {
    carte.hidden = true; // hors ligne : on n'affiche rien
  }
}

$('pseudo').value = memoire.lire('thaayam:pseudo') || '';

$('btn-creer').addEventListener('click', () => {
  if (!pseudo()) return message('message-accueil', t('errPseudo'), true);
  ouvrirReglages('ligne');
});
$('btn-local').addEventListener('click', () => { ordiLocal = [false, false, false, false]; ouvrirReglages('local'); });
$('btn-ordi').addEventListener('click', () => { nbLocal = 2; ordiLocal = [false, true, true, true]; ouvrirReglages('local'); });
$('btn-rejoindre').addEventListener('click', async () => {
  const code = $('code-rejoindre').value.trim().toUpperCase();
  if (!pseudo()) return message('message-accueil', t('errPseudo'), true);
  if (code.length !== 5) return message('message-accueil', t('errCode'), true);
  message('message-accueil', t('connexion'));
  try {
    const api = await obtenirEnLigne();
    const r = await api.rejoindre(code, pseudo());
    await ouvrirPartieEnLigne(r.code, r.place, r.jeton);
    message('message-accueil', '');
  } catch (e) {
    message('message-accueil', traduireErreur(e.message, t), true);
  }
});

// ---------------------------------------------------------------- réglages
let modeReglages = 'ligne';
let edition = null;
let nbLocal = 2;
let ordiLocal = [false, true, true, true]; // joueurs joués par l'ordinateur
let niveauOrdi = (() => { try { return localStorage.getItem('thaayam:niveau') || 'normal'; } catch { return 'normal'; } })();

function ouvrirReglages(mode) {
  modeReglages = mode;
  try {
    edition = normaliserRegles(JSON.parse(memoire.lire('thaayam:regles:v5')) || REGLES_PAR_DEFAUT).regles;
  } catch {
    edition = copieRegles();
  }
  $('titre-reglages').textContent = mode === 'local' ? t('titreLocal') : t('titreLigne');
  $('btn-valider-regles').textContent = mode === 'local' ? t('commencer') : t('creerLaPartie');
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
        const nomParDefaut = ordiLocal[i] ? t('ordiCouleur', { couleur: nomAffiche(COULEURS[i].nom).toLowerCase() }) : i === 0 ? ($('pseudo').value.trim() || nomAffiche(COULEURS[i].nom)) : nomAffiche(COULEURS[i].nom);
        noms.append(el('div', { class: 'ligne-joueur' },
          el('label', {},
            el('span', {}, el('span', { class: 'pastille', style: `display:inline-block;background:${COULEURS[i].code};vertical-align:middle;margin-right:6px` }), t('joueurN', { n: i + 1 })),
            el('input', { id: `nom-${i}`, maxlength: 20, value: nomParDefaut })),
          el('label', { class: 'case' },
            el('input', { type: 'checkbox', id: `ordi-${i}`, checked: ordiLocal[i],
              onchange: (e) => { ordiLocal[i] = e.target.checked; dessinerNoms(); } }),
            el('span', {}, t('ordinateur')))));
      }
    };
    dessinerNoms();
    f.append(el('fieldset', {}, el('legend', {}, t('joueurs')),
      choix([2, 3, 4].map((n) => [n, t('nJoueurs', { n })]), nbLocal, (v) => { nbLocal = v; dessinerNoms(); }),
      noms,
      el('label', {}, t('niveauOrdi'),
        choix(['facile', 'normal', 'fort'].map((n) => [n, t(n)]), niveauOrdi, (v) => {
          niveauOrdi = v;
          try { localStorage.setItem('thaayam:niveau', v); } catch { /* ignoré */ }
        }))));
  }

  // Options propres au plateau carré (cachées pour la croix)
  const seulementCarre = [];
  const montrerForme = () => seulementCarre.forEach((e) => { e.hidden = r.forme !== 'carre'; });
  const tailles = el('div', {}, choix(TAILLES.map((t) => [t, `${t} × ${t}`]), r.taille, (v) => { r.taille = v; verifierReglages(); }));
  seulementCarre.push(tailles);

  f.append(el('fieldset', {}, el('legend', {}, t('plateau')),
    choix([['croix', t('enCroix')], ['carre', t('carre')]], r.forme, (v) => { r.forme = v; montrerForme(); verifierReglages(); }),
    tailles,
    el('label', {}, t('pionsParJoueur'),
      (() => {
        const s = el('select', { onchange: (e) => { r.nbPions = Number(e.target.value); verifierReglages(); } });
        for (let i = 1; i <= 12; i++) s.append(el('option', { value: i, selected: i === r.nbPions }, String(i)));
        return s;
      })())));

  const blocCauris = el('div', { class: 'formulaire' },
    el('label', {}, t('nbCauris'),
      (() => {
        const s = el('select', { onchange: (e) => { r.des.nbCauris = Number(e.target.value); verifierReglages(); } });
        for (let i = 2; i <= 7; i++) s.append(el('option', { value: i, selected: i === r.des.nbCauris }, String(i)));
        return s;
      })()),
    el('label', {}, t('valeurZeroCauri'),
      el('input', { type: 'number', min: 1, max: 24, value: r.des.valeurZero, inputmode: 'numeric',
        oninput: (e) => { r.des.valeurZero = Number(e.target.value); verifierReglages(); } }),
      el('span', { class: 'aide' }, 'Souvent 8 avec 4 cauris, 12 avec 6 cauris.')));
  const blocDes = el('div', { class: 'formulaire' },
    el('label', {}, t('nbDes'),
      (() => {
        const s = el('select', { onchange: (e) => { r.des.nbDes = Number(e.target.value); verifierReglages(); } });
        for (let i = 1; i <= 3; i++) s.append(el('option', { value: i, selected: i === r.des.nbDes }, String(i)));
        return s;
      })()),
    el('label', {}, t('faces'),
      el('input', { value: r.des.faces.join(', '), oninput: (e) => { r.des.faces = lireListe(e.target.value); verifierReglages(); } }),
      el('span', { class: 'aide' }, t('aideFaces'))),
    el('label', {}, t('toutZero'),
      el('input', { type: 'number', min: 0, max: 24, value: r.des.valeurToutZero, inputmode: 'numeric',
        oninput: (e) => { r.des.valeurToutZero = Number(e.target.value); verifierReglages(); } }),
      el('span', { class: 'aide' }, t('aideToutZero'))),
    el('label', {}, t('doubles'),
      el('input', { id: 'champ-doubles', value: r.doublesRejouer.join(', '),
        oninput: (e) => { r.doublesRejouer = lireListe(e.target.value); verifierReglages(); } }),
      el('span', { class: 'aide' }, t('aideDoubles'))));
  const entree = el('input', { id: 'champ-entree', value: r.valeursEntree.join(', '),
    oninput: (e) => { r.valeursEntree = lireListe(e.target.value); verifierReglages(); } });
  const rejouer = el('input', { id: 'champ-rejouer', value: r.valeursRejouer.join(', '),
    oninput: (e) => { r.valeursRejouer = lireListe(e.target.value); verifierReglages(); } });
  const montrerDes = () => { blocCauris.hidden = r.des.type !== 'cauris'; blocDes.hidden = r.des.type === 'cauris'; };
  montrerDes();

  f.append(el('fieldset', {}, el('legend', {}, t('lancerLegende')),
    choix([['desLongs', t('desLongs')], ['cauris', t('cauris')]], r.des.type, (v) => {
      r.des.type = v;
      r.valeursEntree = [...PRESETS_DES[v].valeursEntree];
      r.valeursRejouer = [...PRESETS_DES[v].valeursRejouer];
      r.doublesRejouer = [...PRESETS_DES[v].doublesRejouer];
      blocDes.querySelector('#champ-doubles').value = r.doublesRejouer.join(', ');
      entree.value = r.valeursEntree.join(', ');
      rejouer.value = r.valeursRejouer.join(', ');
      montrerDes();
      verifierReglages();
    }),
    blocCauris, blocDes,
    el('div', { id: 'valeurs-possibles', class: 'aide' }),
    el('label', {}, t('valeursEntree'), entree),
    el('label', {}, t('valeursRejouer'), rejouer),
    caseACocher(t('rejouerCapture'), r.rejouerApresCapture, (v) => { r.rejouerApresCapture = v; })));

  f.append(el('fieldset', {}, el('legend', {}, t('deplacements')),
    caseACocher(t('captureObligatoire'), r.captureAvantInterieur,
      (v) => { r.captureAvantInterieur = v; }, t('aideCapture')),
    caseACocher(t('arriveeExacte'), r.arriveeExacte, (v) => { r.arriveeExacte = v; }),
    caseACocher(t('unPion'), r.unPionParCase, (v) => { r.unPionParCase = v; },
      t('aideUnPion')),
    caseACocher(t('groupe'), r.groupeRentreEnsemble, (v) => { r.groupeRentreEnsemble = v; },
      t('aideGroupe')),
    el('label', {}, t('sensTour'),
      (() => {
        const s = el('select', { onchange: (e) => { r.sens = e.target.value; } });
        s.append(el('option', { value: 'anti-horaire', selected: r.sens === 'anti-horaire' }, t('antiHoraire')));
        s.append(el('option', { value: 'horaire', selected: r.sens === 'horaire' }, t('horaire')));
        return s;
      })()),
    (() => {
      const l = el('label', {}, t('sensInterieurs'),
        (() => {
          const s = el('select', { onchange: (e) => { r.sensInterieurs = e.target.value; } });
          [['inverse', t('inverse')], ['meme', t('meme')], ['alterne', t('alterne')]]
            .forEach(([v, t]) => s.append(el('option', { value: v, selected: r.sensInterieurs === v }, t)));
          return s;
        })());
      seulementCarre.push(l);
      return l;
    })()));

  const refugesCarre = el('fieldset', {}, el('legend', {}, t('refuges')),
    el('div', { class: 'aide' }, t('aideRefuges')),
    caseACocher(t('coins2'), r.refuges.coinsDeuxiemeAnneau, (v) => { r.refuges.coinsDeuxiemeAnneau = v; }),
    caseACocher(t('milieux'), r.refuges.milieuxInterieurs, (v) => { r.refuges.milieuxInterieurs = v; }));
  seulementCarre.push(refugesCarre);
  f.append(refugesCarre);
  montrerForme();

  verifierReglages();
}

function verifierReglages() {
  const { erreurs } = normaliserRegles(edition);
  const vp = $('valeurs-possibles');
  if (vp) vp.textContent = t('valeursPossibles', { v: valeursPossibles(edition).join(', ') });
  message('erreurs-regles', erreurs.map((e) => traduireErreur(e, t)).join(' '), true);
  $('btn-valider-regles').disabled = erreurs.length > 0;
  return erreurs.length === 0;
}

$('form-regles').addEventListener('submit', (e) => e.preventDefault());
$('btn-valider-regles').addEventListener('click', async () => {
  if (!verifierReglages()) return;
  const { regles } = normaliserRegles(edition);
  memoire.ecrire('thaayam:regles:v5', JSON.stringify(regles));
  if (modeReglages === 'local') {
    // Les noms par défaut sont gardés en français (« Rouge », « Ordi vert ») pour être traduits à l'affichage
    const nomCanonique = (i) => {
      const brut = $(`nom-${i}`).value.trim();
      const defauts = [COULEURS[i].nom, `Ordi ${COULEURS[i].nom.toLowerCase()}`];
      return defauts.find((d) => nomAffiche(d) === brut) || brut || COULEURS[i].nom;
    };
    const joueurs = Array.from({ length: nbLocal }, (_, i) => ({ nom: nomCanonique(i), ordi: ordiLocal[i] ? niveauOrdi : false }));
    session = { mode: 'local', etat: nouvellePartie(regles, joueurs) };
    aller('jeu');
    dessinerJeu();
    return;
  }
  const b = $('btn-valider-regles');
  b.disabled = true;
  message('erreurs-regles', t('creation'));
  try {
    const api = await obtenirEnLigne();
    const r = await api.creer(regles, pseudo());
    message('erreurs-regles', '');
    await ouvrirPartieEnLigne(r.code, r.place, r.jeton);
  } catch (e) {
    message('erreurs-regles', traduireErreur(e.message, t), true);
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
  session = { mode: 'ligne', partie, etat: partie.etat, place, jeton, reactionVue: partie.reaction ? partie.reaction.n : 0 };
  session.arret = api.suivre(code, (nouvelle) => {
    if (!session || session.mode !== 'ligne' || nouvelle.code !== session.partie.code) return;
    if (nouvelle.reaction && nouvelle.reaction.n !== session.reactionVue) {
      session.reactionVue = nouvelle.reaction.n;
      montrerReaction(nouvelle.reaction);
    }
    if (nouvelle.revanche && nouvelle.revanche !== session.partie.revanche) {
      session.partie = { ...session.partie, revanche: nouvelle.revanche };
      if (session.etat && session.etat.phase === 'fini') dessinerJeu();
    }
    const changementStatut = nouvelle.statut !== session.partie.statut;
    const plusRecente = nouvelle.version > session.partie.version ||
      (nouvelle.statut === 'attente' && JSON.stringify(nouvelle.joueurs) !== JSON.stringify(session.partie.joueurs));
    if (!plusRecente && !changementStatut) return;
    const avant = session.etat;
    session.partie = nouvelle;
    if (nouvelle.statut !== 'attente' && avant && nouvelle.etat) montrer(avant, nouvelle.etat);
    else {
      session.etat = nouvelle.etat;
      afficherPartieEnLigne();
    }
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
        nomAffiche(j.nom), i === session.place ? t('toi') : '', i === 0 ? t('createur') : '')));
    $('salon-regles').innerHTML = '';
    resumeReglesTraduit(p.regles, t).forEach((l) => $('salon-regles').append(el('li', {}, l)));
    const createur = session.place === 0;
    $('btn-demarrer').hidden = !createur;
    $('btn-demarrer').disabled = p.joueurs.length < 2;
    message('salon-message', createur
      ? (p.joueurs.length < 2 ? t('salonPeu') : t('salonPrets', { n: p.joueurs.length }))
      : t('salonAttente'));
    return;
  }
  dessinerJeu();
}

$('btn-copier').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(lienPartie());
    message('salon-message', t('lienCopie'));
  } catch {
    message('salon-message', lienPartie());
  }
});
$('btn-partager').addEventListener('click', async () => {
  const texte = t('invitation', { code: session.partie.code });
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
    message('salon-message', traduireErreur(e.message, t), true);
    $('btn-demarrer').disabled = false;
  }
});

// ---------------------------------------------------------------- jeu
let occupe = false;
let animation = false;
let voirTrajet = false;

function jePeuxJouer() {
  const e = session && session.etat;
  if (!e || e.phase === 'fini' || occupe || animation) return false;
  if (session.mode === 'local') return !e.joueurs[e.tour].ordi;
  return e.tour === session.place;
}

// L'ordinateur joue tout seul, avec une petite pause pour qu'on suive.
let minuteurOrdi = null;
function faireJouerOrdi() {
  clearTimeout(minuteurOrdi);
  const e = session && session.etat;
  if (!e || animation || session.mode !== 'local' || e.phase === 'fini' || !e.joueurs[e.tour].ordi) return;
  minuteurOrdi = setTimeout(() => {
    const s = session && session.etat;
    if (s !== e) return; // la partie a changé entre-temps
    if (e.phase === 'lancer') {
      secouerDes();
      appliquer(lancer(e, tirageAleatoire()));
    } else {
      const coup = choisirCoup(e);
      if (coup) appliquer(jouer(e, coup.pion, !!coup.groupe));
    }
  }, e.phase === 'lancer' ? 650 : 850);
}

function secouerDes() {
  $('des').classList.remove('secoue');
  void $('des').offsetWidth;
  $('des').classList.add('secoue');
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Passe de l'état `ancien` à `nouveau` en jouant les sons et en faisant
 * avancer le pion déplacé case par case.
 */
async function montrer(ancien, nouveau) {
  const nouveauCoup = ancien && nouveau && nouveau.numero > ancien.numero;
  if (!nouveauCoup) {
    session.etat = nouveau;
    dessinerJeu();
    return;
  }
  const g = geometrie(nouveau.regles, nouveau.joueurs.length);
  if (nouveau.dernierLancer && JSON.stringify(nouveau.dernierLancer) !== JSON.stringify(ancien.dernierLancer)
    && nouveau.numero === ancien.numero + 1 && nouveau.dernierCoup === ancien.dernierCoup) {
    sons.des();
  }
  const dc = nouveau.dernierCoup;
  const coupJoue = dc && JSON.stringify(dc) !== JSON.stringify(ancien.dernierCoup);
  if (coupJoue && dc.depuis >= 0) {
    animation = true;
    const etapes = etapesCoup(g, dc.depuis, dc.vers);
    const vue = JSON.parse(JSON.stringify(ancien));
    vue.lancer = null;
    for (const pos of etapes.slice(0, -1)) {
      if (!session || (session.etat !== ancien && session.etat !== vue)) break; // partie quittée ou changée
      vue.joueurs[dc.joueur].pions[dc.pion] = pos;
      session.etat = vue;
      dessinerJeu();
      sons.pas();
      await pause(110);
    }
    animation = false;
    if (!session || (session.etat !== vue && session.etat !== ancien)) return;
  }
  session.etat = nouveau;
  if (coupJoue) {
    const capturesAvant = ancien.joueurs.reduce((s, j) => s + j.captures, 0);
    const capturesApres = nouveau.joueurs.reduce((s, j) => s + j.captures, 0);
    if (nouveau.phase === 'fini') sons.victoire();
    else if (capturesApres > capturesAvant) sons.capture();
    else if (dc.vers === g.arrivee) sons.arrivee();
    else if (dc.depuis === -1) sons.entree();
    else sons.pas();
  }
  dessinerJeu();
}

async function appliquer(nouvelEtat) {
  const avant = session.etat;
  if (session.mode === 'local') {
    await montrer(avant, nouvelEtat);
    return;
  }
  occupe = true;
  const ancien = session.partie;
  await montrer(avant, nouvelEtat);
  try {
    const api = await obtenirEnLigne();
    const v = await api.envoyer(ancien.code, session.jeton, ancien.version, nouvelEtat);
    if (v >= session.partie.version) {
      session.partie = { ...session.partie, etat: nouvelEtat, version: v, statut: nouvelEtat.phase === 'fini' ? 'finie' : 'en_cours' };
    }
    message('jeu-message', '');
  } catch (e) {
    message('jeu-message', traduireErreur(e.message, t), true);
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
  secouerDes();
  appliquer(lancer(session.etat, tirageAleatoire()));
});
$('btn-entrer').addEventListener('click', () => {
  const coup = coupsPossibles(session.etat).find((c) => c.depuis === -1 && !c.groupe);
  if (coup && jePeuxJouer()) appliquer(jouer(session.etat, coup.pion));
});
$('btn-entrer-groupe').addEventListener('click', () => {
  const coup = coupsPossibles(session.etat).find((c) => c.groupe);
  if (coup && jePeuxJouer()) appliquer(jouer(session.etat, coup.pion, true));
});
$('btn-quitter').addEventListener('click', () => {
  arreterSuivi();
  clearTimeout(minuteurOrdi);
  session = null;
  history.replaceState(null, '', location.pathname);
  aller('accueil');
  afficherAccueil();
});
$('btn-regles-jeu').addEventListener('click', () => { $('jeu-regles').hidden = !$('jeu-regles').hidden; });
$('btn-rejouer').addEventListener('click', () => {
  const e = session && session.etat;
  if (!e || session.mode !== 'local') return;
  session.etat = nouvellePartie(e.regles, e.joueurs.map((j) => ({ nom: j.nom, ordi: j.ordi || false })));
  session.statsNotees = null;
  dessinerJeu();
});
$('btn-son').addEventListener('click', () => { basculerSon(); majBoutonSon(); });
$('btn-trajet').addEventListener('click', () => {
  voirTrajet = !voirTrajet;
  majBoutonTrajet();
  dessinerJeu();
});
function majBoutonTrajet() { $('btn-trajet').textContent = voirTrajet ? t('cacherTrajet') : t('voirTrajet'); }
function majBoutonSon() { $('btn-son').textContent = sonActif() ? t('son') : t('muet'); }
majBoutonSon();
majBoutonTrajet();

function dessinerDes(etat) {
  const zone = $('des');
  zone.innerHTML = '';
  const l = etat.lancer || etat.dernierLancer;
  if (!l) {
    zone.append(el('span', { class: 'attenue' }, t('lanceLesDes')));
    return;
  }
  if (!etat.lancer) zone.append(el('span', { class: 'attenue petit' }, t('dernierLancer', { nom: nomAffiche(etat.joueurs[l.joueur].nom) })));
  if (etat.regles.des.type === 'cauris') {
    l.detail.forEach((ouvert) => zone.append(cauri(ouvert)));
  } else {
    l.detail.forEach((f) => zone.append(deLong(f)));
  }
  zone.append(el('span', { class: 'valeur' }, nomLancer(etat.regles, l)));
}

/** Dé long (dayakattai) vu de dessus : une face avec 0 à 3 points. */
function deLong(points) {
  const d = el('div', { class: 'de-long', 'aria-label': String(points) });
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
  if (!session) return;
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
        el('div', { class: 'nom' }, nomAffiche(j.nom) + (i === moi ? t('toi') : '')),
        el('div', { class: 'stats' }, `🏠 ${maison} · 🎯 ${arrives}/${j.pions.length} · ⚔️ ${j.captures}`))));
  });

  dessinerPlateau(etat, g, coups);
  dessinerDes(etat);

  // Consigne
  let consigne;
  const nomActif = nomAffiche(actif.nom);
  if (etat.phase === 'fini') consigne = t('gagne', { nom: nomAffiche(etat.joueurs[etat.gagnant].nom) });
  else if (session.mode === 'ligne' && etat.tour !== moi) consigne = t('tourDe', { nom: nomActif });
  else if (animation) consigne = t('pionAvance');
  else if (actif.ordi) consigne = t('reflechit', { nom: nomActif });
  else if (etat.phase === 'lancer') consigne = session.mode === 'local' ? t('aToiLocal', { nom: nomActif }) : t('aToi');
  else consigne = t('touchePion');
  $('jeu-consigne').textContent = consigne;
  $('jeu-consigne').style.color = etat.phase === 'fini' ? '' : actif.couleur;

  $('btn-lancer').disabled = !(peut && etat.phase === 'lancer');
  $('btn-lancer').hidden = etat.phase === 'fini';
  $('btn-rejouer').hidden = !(etat.phase === 'fini' && session.mode === 'local');
  const enLigneFinie = etat.phase === 'fini' && session.mode === 'ligne';
  $('btn-revanche').hidden = !enLigneFinie;
  $('btn-revanche').textContent = session.partie && session.partie.revanche ? t('rejoindreRevanche') : t('revanche');
  $('reactions').hidden = session.mode !== 'ligne';
  noterStats(etat);
  const entree = coups.find((c) => c.depuis === -1 && !c.groupe);
  $('btn-entrer').hidden = !entree;
  const groupe = coups.find((c) => c.groupe);
  $('btn-entrer-groupe').hidden = !groupe;
  if (groupe) $('btn-entrer-groupe').textContent = t('entrerGroupe', { n: groupe.groupe.length });

  const journal = $('journal');
  journal.innerHTML = '';
  etat.journal.forEach((l) => journal.append(el('li', {}, traduireJournal(l, t))));
  $('jeu-regles').innerHTML = '';
  resumeReglesTraduit(etat.regles, t).forEach((l) => $('jeu-regles').append(el('li', {}, l)));
  faireJouerOrdi();
}

// ---------------------------------------------------------------- revanche et messages rapides
$('btn-revanche').addEventListener('click', async () => {
  if (!session || session.mode !== 'ligne') return;
  $('btn-revanche').disabled = true;
  try {
    const api = await obtenirEnLigne();
    const code = await api.revanche(session.partie.code, session.jeton);
    await ouvrirPartieEnLigne(code, session.place, session.jeton);
  } catch (e) {
    message('jeu-message', traduireErreur(e.message, t), true);
  } finally {
    $('btn-revanche').disabled = false;
  }
});

REACTIONS.forEach((texte) => {
  const b = el('button', { class: 'reaction', 'data-reaction': texte }, traduireReaction(texte, t));
  b.addEventListener('click', async () => {
    if (!session || session.mode !== 'ligne') return;
    try {
      await (await obtenirEnLigne()).reagir(session.partie.code, session.jeton, texte);
    } catch (e) {
      message('jeu-message', traduireErreur(e.message, t), true);
    }
  });
  $('reactions').append(b);
});

let minuteurBulle = null;
/** Affiche un message rapide reçu (ou envoyé) pendant 3 secondes. */
function montrerReaction(reaction) {
  const j = session && session.etat && session.etat.joueurs[reaction.place];
  const nom = nomAffiche(j ? j.nom : (session.partie.joueurs[reaction.place] || {}).nom || '?');
  const bulle = $('bulle-reaction');
  bulle.textContent = `${nom}${reaction.place === session.place ? t('toi') : ''} : ${traduireReaction(reaction.texte, t)}`;
  bulle.style.borderColor = COULEURS[reaction.place] ? COULEURS[reaction.place].code : '';
  bulle.hidden = false;
  clearTimeout(minuteurBulle);
  minuteurBulle = setTimeout(() => { bulle.hidden = true; }, 3000);
}

function svg(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
}

function dessinerPlateau(etat, g, coups) {
  const n = g.n;
  const S = 100;
  const plateau = $('plateau');
  plateau.innerHTML = '';
  plateau.setAttribute('viewBox', `0 0 ${n * S} ${n * S}`);
  const zone = zoneCase(g, S);
  const T = themePlateau(themeChoisi());

  // Dégradés et halo lumineux du thème
  const defs = svg('defs', {}, plateau);
  if (T.fondLueur) {
    const rg = svg('radialGradient', { id: 'fond-lueur', cx: '50%', cy: '50%', r: '60%' }, defs);
    svg('stop', { offset: '0%', 'stop-color': T.fondLueur }, rg);
    svg('stop', { offset: '100%', 'stop-color': T.fond }, rg);
    const lg = svg('linearGradient', { id: 'verre', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    svg('stop', { offset: '0%', 'stop-color': '#ffffff', 'stop-opacity': 0.10 }, lg);
    svg('stop', { offset: '55%', 'stop-color': '#ffffff', 'stop-opacity': 0 }, lg);
  }
  if (T.lueur) {
    const f = svg('filter', { id: 'lueur', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    svg('feGaussianBlur', { stdDeviation: 4, result: 'flou' }, f);
    const m = svg('feMerge', {}, f);
    svg('feMergeNode', { in: 'flou' }, m);
    svg('feMergeNode', { in: 'SourceGraphic' }, m);
  }
  const avecLueur = T.lueur ? { filter: 'url(#lueur)' } : {};

  // Couleur de chaque joueur : sa case de départ, sa colonne d'arrivée (croix) et ses croix
  const teintes = new Map();
  etat.joueurs.forEach((j, i) => {
    const ch = g.chemins[i];
    teintes.set(cle(ch[0]), j.couleur);
    if (g.forme === 'croix') ch.slice(0, g.debutBoucle + 1).forEach((p) => teintes.set(cle(p), j.couleur));
  });

  if (g.forme === 'croix') {
    svg('rect', { x: 0, y: 0, width: n * S, height: n * S, rx: 24, fill: T.fondLueur ? 'url(#fond-lueur)' : T.fond }, plateau);
    if (T.lueur) {
      // Grille d'hologramme très fine, plus visible au centre
      const motif = svg('pattern', { id: 'holo', width: S / 4, height: S / 4, patternUnits: 'userSpaceOnUse' }, defs);
      svg('path', { d: `M${S / 4} 0V${S / 4}M0 ${S / 4}H${S / 4}`, stroke: T.diagonaleLueur, 'stroke-width': 0.6, opacity: 0.35, fill: 'none' }, motif);
      const masque = svg('radialGradient', { id: 'holo-masque', cx: '50%', cy: '50%', r: '55%' }, defs);
      svg('stop', { offset: '0%', 'stop-color': '#fff', 'stop-opacity': 0.9 }, masque);
      svg('stop', { offset: '100%', 'stop-color': '#fff', 'stop-opacity': 0.08 }, masque);
      const m = svg('mask', { id: 'holo-m' }, defs);
      svg('rect', { x: 0, y: 0, width: n * S, height: n * S, fill: 'url(#holo-masque)' }, m);
      svg('rect', { x: 0, y: 0, width: n * S, height: n * S, rx: 24, fill: 'url(#holo)', mask: 'url(#holo-m)' }, plateau);
    }
    // Diagonales : des coins du plateau jusqu'au centre, à travers les cases de coin
    const { r: r0, c: c0, taille: t } = g.centre;
    const coins = [[0, 0, c0, r0], [n, 0, c0 + t, r0], [0, n, c0, r0 + t], [n, n, c0 + t, r0 + t]];
    coins.forEach(([x1, y1, x2, y2]) => {
      svg('line', { x1: x1 * S, y1: y1 * S, x2: x2 * S, y2: y2 * S, stroke: T.diagonale, 'stroke-width': 10, 'stroke-linecap': 'round' }, plateau);
      svg('line', { x1: x1 * S, y1: y1 * S, x2: x2 * S, y2: y2 * S, stroke: T.diagonaleLueur, 'stroke-width': 3, opacity: 0.7, ...avecLueur }, plateau);
    });
    // 3 arcs à chaque coin du centre : passage d'un bras au suivant
    arcsCroix(g, S).forEach((d) => {
      svg('path', { d, fill: 'none', stroke: T.arc, 'stroke-width': 7, 'stroke-linecap': 'round' }, plateau);
      svg('path', { d, fill: 'none', stroke: T.arcLueur, 'stroke-width': 2.5, opacity: 0.85, ...avecLueur }, plateau);
    });
    // Écriture tamoule dans les coins du haut, comme sur les plateaux du commerce
    [['தாயம்', 2.4], ['விளையாட்டு', n - 2.4]].forEach(([texte, cx]) => {
      const t = svg('text', { x: cx * S, y: 0.62 * S, 'text-anchor': 'middle', 'font-size': 0.48 * S, 'font-weight': 700,
        fill: T.ecriture, opacity: 0.9, 'font-family': "'Noto Sans Tamil', 'Latha', sans-serif", ...avecLueur }, plateau);
      t.textContent = texte;
    });
  }
  g.cases.forEach((k) => {
    const [r, c] = k.split(',').map(Number);
    if (g.forme === 'carre' && r === g.centre.r && c === g.centre.c) return;
    const x = c * S, y = r * S;
    const teinte = teintes.get(k);
    svg('rect', { x: x + 2, y: y + 2, width: S - 4, height: S - 4, rx: 6, fill: T.caseFond, stroke: T.caseTrait, 'stroke-width': 3 }, plateau);
    if (teinte) svg('rect', { x: x + 2, y: y + 2, width: S - 4, height: S - 4, rx: 6, fill: teinte, 'fill-opacity': T.teinteOpacite }, plateau);
    if (T.fondLueur) svg('rect', { x: x + 4, y: y + 4, width: S - 8, height: S - 8, rx: 5, fill: 'url(#verre)' }, plateau);
    if (g.refuges.has(k)) {
      svg('path', { d: `M${x + 14} ${y + 14}L${x + S - 14} ${y + S - 14}M${x + S - 14} ${y + 14}L${x + 14} ${y + S - 14}`,
        stroke: teinte || T.croixRefuge, 'stroke-width': 7, 'stroke-linecap': 'round', opacity: teinte ? 0.95 : 0.6 }, plateau);
    }
  });

  // Centre (pazham)
  const ct = zone(cle([g.chemins[0][g.arrivee][0], g.chemins[0][g.arrivee][1]]));
  svg('rect', { x: ct.x + 2, y: ct.y + 2, width: ct.w - 4, height: ct.w - 4, rx: 8, fill: g.forme === 'croix' ? T.centreFond : '#c98b3c',
    stroke: T.centreTrait, 'stroke-width': 3, ...(g.forme === 'croix' ? avecLueur : {}) }, plateau);
  svg('path', { d: g.forme === 'croix'
    ? `M${ct.x + 6} ${ct.y + 6}L${ct.x + ct.w - 6} ${ct.y + ct.w - 6}M${ct.x + ct.w - 6} ${ct.y + 6}L${ct.x + 6} ${ct.y + ct.w - 6}`
    : `M${ct.x + 50} ${ct.y + 14}L${ct.x + 86} ${ct.y + 50}L${ct.x + 50} ${ct.y + 86}L${ct.x + 14} ${ct.y + 50}Z`,
  fill: 'none', stroke: g.forme === 'croix' ? T.centreCroix : '#fff3da', 'stroke-width': g.forme === 'croix' ? 3 : 4, opacity: 0.8 }, plateau);

  // Trajet d'un joueur (aide) : ligne pointillée avec des flèches
  if (voirTrajet) {
    // En ligne : son propre trajet ; en local : celui du joueur humain qui joue (ou du premier humain)
    const premierHumain = Math.max(0, etat.joueurs.findIndex((j) => !j.ordi));
    const qui = session.mode === 'ligne' ? session.place : (etat.joueurs[etat.tour].ordi ? premierHumain : etat.tour);
    const centre = (p) => { const z = zone(cle(p)); return `${z.x + z.w / 2},${z.y + z.w / 2}`; };
    const ch = g.chemins[qui];
    const couleur = etat.joueurs[qui].couleur;
    const marqueur = svg('marker', { id: 'fleche', viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' }, defs);
    svg('path', { d: 'M0 0L10 5L0 10Z', fill: couleur }, marqueur);
    svg('polyline', { points: ch.map(centre).join(' '), fill: 'none', stroke: couleur, 'stroke-width': 8,
      'stroke-dasharray': '4 14', 'stroke-linecap': 'round', opacity: 0.85 }, plateau);
    for (let i = 2; i < ch.length; i += 3) {
      svg('line', { x1: centre(ch[i - 1]).split(',')[0], y1: centre(ch[i - 1]).split(',')[1], x2: centre(ch[i]).split(',')[0],
        y2: centre(ch[i]).split(',')[1], stroke: couleur, 'stroke-width': 8, 'marker-end': 'url(#fleche)', opacity: 0.9 }, plateau);
    }
  }

  // Dernier coup joué
  if (etat.dernierCoup) {
    const z = zone(cle(g.chemins[etat.dernierCoup.joueur][etat.dernierCoup.vers]));
    svg('rect', { x: z.x + 6, y: z.y + 6, width: z.w - 12, height: z.w - 12, rx: 8, fill: 'none',
      stroke: T.dernierCoup || etat.joueurs[etat.dernierCoup.joueur].couleur, 'stroke-width': 5, opacity: 0.8, ...avecLueur }, plateau);
  }

  // Destinations possibles
  coups.forEach((cp) => {
    const z = zone(cle(g.chemins[etat.tour][cp.vers]));
    svg('circle', { cx: z.x + z.w / 2, cy: z.y + z.w / 2, r: z.w / 2 - 10, fill: 'none', stroke: etat.joueurs[etat.tour].couleur,
      'stroke-width': 5, 'stroke-dasharray': '10 8' }, plateau);
  });

  // Pions
  const jouables = new Set(coups.filter((c) => c.depuis >= 0).map((c) => `${etat.tour}:${c.pion}`));
  // Plateau en croix : pions à la maison et pions arrivés dessinés dans le centre
  const auCentre = pionsAuCentre(g, etat, S);
  const cleCentre = cle(g.chemins[0][g.arrivee]);
  const entree = coups.find((c) => c.depuis === -1 && !c.groupe);
  auCentre.forEach((p) => {
    const j = etat.joueurs[p.joueur];
    const jouable = !p.arrive && !!entree && p.joueur === etat.tour;
    const grp = svg('g', { class: jouable ? 'pion-jouable' : '' }, plateau);
    if (p.arrive) svg('circle', { cx: p.cx, cy: p.cy, r: p.r + 6, fill: T.arrive, stroke: T.arriveTrait, 'stroke-width': 2, ...avecLueur }, grp);
    svg('circle', { cx: p.cx, cy: p.cy, r: p.r, fill: j.couleur, stroke: jouable ? T.jouable : T.pionTrait, 'stroke-width': jouable ? 5 : 2.5, ...avecLueur }, grp);
    svg('circle', { cx: p.cx - p.r * 0.3, cy: p.cy - p.r * 0.3, r: p.r * 0.3, fill: T.pionReflet, opacity: 0.35 }, grp);
    if (jouable) {
      const cible = svg('circle', { cx: p.cx, cy: p.cy, r: Math.max(p.r, 40), fill: 'transparent' }, grp);
      cible.style.cursor = 'pointer';
      grp.addEventListener('click', () => { if (jePeuxJouer()) appliquer(jouer(session.etat, entree.pion)); });
    }
  });
  pionsParCase(etat).forEach((liste, k) => {
    if (auCentre.length && k === cleCentre) return;
    const z = zone(k);
    const cote = Math.ceil(Math.sqrt(liste.length));
    const pas = (z.w - 16) / cote;
    const rayon = Math.min(38, pas * 0.45);
    liste.forEach((p, i) => {
      const cx = z.x + 8 + pas * (i % cote) + pas / 2;
      const cy = z.y + 8 + pas * Math.floor(i / cote) + pas / 2;
      const j = etat.joueurs[p.joueur];
      const jouable = jouables.has(`${p.joueur}:${p.pion}`);
      const grp = svg('g', { class: jouable ? 'pion-jouable' : '' }, plateau);
      svg('circle', { cx, cy, r: rayon, fill: j.couleur, stroke: jouable ? T.jouable : T.pionTrait, 'stroke-width': jouable ? 6 : 3, ...avecLueur }, grp);
      svg('circle', { cx: cx - rayon * 0.3, cy: cy - rayon * 0.3, r: rayon * 0.3, fill: T.pionReflet, opacity: 0.35 }, grp);
      if (jouable) {
        // zone de toucher plus large que le pion
        const cible = svg('circle', { cx, cy, r: Math.max(rayon, 60), fill: 'transparent' }, grp);
        cible.style.cursor = 'pointer';
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
    message('message-accueil', traduireErreur(e.message, t), true);
  }
}
appliquerLangue();
demarrage();
