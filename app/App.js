import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Share, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Bouton, Carte, Champ, Choix, Texte, useCouleurs, ThemeContexte, LangueContexte, themeLumineux } from './src/ui';
import { THEME_PAR_DEFAUT, THEMES, themeValide } from '../moteur/themes.js';
import { Ambiance } from './src/Ambiance';
import Social, { InviterAmis } from './src/ecrans/Social';
import Revoir from './src/ecrans/Revoir';
import Discussion, { CoucheEmojis } from './src/ecrans/Discussion';
import { sons } from './src/sons';
import { ecouterOuvertures } from './src/notifs';
import { nouvellePartieGuidee } from '../moteur/guide.js';
import { cle } from '../moteur/plateau.js';
import { LANGUES, traducteur, traduireErreur, traduireNom, traduireReaction, resumeReglesTraduit, resumeStatsTraduit } from '../moteur/i18n.js';
import Reglages from './src/ecrans/Reglages';
import Jeu from './src/ecrans/Jeu';
import ReglesJeu from './src/ecrans/ReglesJeu';
import { enLigne, stockage } from './src/enLigne';
import { COULEURS, copieRegles, normaliserRegles, resumeRegles } from '../moteur/regles.js';
import { nouvellePartie, lancer, jouer, geometrie, etapesCoup } from '../moteur/partie.js';
import { choisirCoup } from '../moteur/ia.js';
import { noterFin, resumeStats, normaliserStats, statsVides } from '../moteur/stats.js';

export default function App() {
  return (
    <SafeAreaProvider>
      <Racine />
    </SafeAreaProvider>
  );
}

function Racine() {
  // Thème choisi (Cristal ou Bois), mémorisé sur l'appareil
  const [theme, setTheme] = useState(THEME_PAR_DEFAUT);
  useEffect(() => {
    stockage.lire('thaayam:theme').then((t) => t && setTheme(themeValide(t))).catch(() => {});
  }, []);
  const choisirTheme = (t) => { setTheme(t); stockage.ecrire('thaayam:theme', t).catch(() => {}); };
  // Langue choisie, mémorisée sur l'appareil
  const [langue, setLangue] = useState('fr');
  useEffect(() => {
    stockage.lire('thaayam:langue').then((l) => LANGUES.some((x) => x.code === l) && setLangue(l)).catch(() => {});
  }, []);
  const choisirLangue = (l) => { setLangue(l); stockage.ecrire('thaayam:langue', l).catch(() => {}); };
  const t = useMemo(() => traducteur(langue), [langue]);
  return (
    <LangueContexte.Provider value={t}>
      <ThemeContexte.Provider value={theme}>
        <Ecrans theme={theme} choisirTheme={choisirTheme} langue={langue} choisirLangue={choisirLangue} t={t} />
      </ThemeContexte.Provider>
    </LangueContexte.Provider>
  );
}

function Ecrans({ theme, choisirTheme, langue, choisirLangue, t }) {
  const N = (nom) => traduireNom(nom, t);
  const c = useCouleurs();
  const [ecran, setEcran] = useState('accueil'); // accueil | reglages | salon | jeu | regles
  const [retourRegles, setRetourRegles] = useState('accueil');
  const voirReglesJeu = () => { setRetourRegles(ecran); setEcran('regles'); };
  const [pseudo, setPseudo] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState('ligne');
  const [ordiInitial, setOrdiInitial] = useState([false, true, true, true]);
  const [regles, setRegles] = useState(copieRegles());
  const [occupe, setOccupe] = useState(false);
  // Partie en cours : { mode, etat } en local ; { mode, partie, etat, place, jeton } en ligne
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  sessionRef.current = session;
  const arretRef = useRef(null);
  const animRef = useRef(false);
  // Animations : dés qui roulent, pion qui avance, éclat d'une capture
  const [desRoulent, setDesRoulent] = useState(null);
  const [enMouvement, setEnMouvement] = useState(null);
  const [eclat, setEclat] = useState(null);
  // Revoir une partie : état final de la partie, et écran où revenir
  const [aRevoir, setARevoir] = useState(null);
  const [retourRevoir, setRetourRevoir] = useState('accueil');
  const [replays, setReplays] = useState([]);
  // Emojis de la discussion qui s'envolent sur l'écran
  const [volants, setVolants] = useState([]);
  const { width: largeurEcran } = useWindowDimensions();
  const envolerEmoji = (texte) => setVolants((l) => [...l, ...[0, 1, 2].map((k) => ({
    id: `${Date.now()}-${k}-${Math.random()}`, texte, gauche: largeurEcran * (0.1 + Math.random() * 0.75), retard: k * 250,
  }))]);
  const discussion = (s) => (
    <Discussion code={s.partie.code} jeton={s.jeton} place={s.place} surEmoji={envolerEmoji}
      nomDe={(pl) => N(((s.etat && s.etat.joueurs[pl]) || s.partie.joueurs[pl] || { nom: '?' }).nom)} />
  );
  const revoirPartie = (etat, retour) => { setARevoir(etat); setRetourRevoir(retour); setEcran('revoir'); };
  // Toucher une notification ouvre la partie concernée
  useEffect(() => ecouterOuvertures(async (codeNotif) => {
    const moi = await enLigne.maPlace(codeNotif);
    if (moi) ouvrirEnLigne(codeNotif, moi.place, moi.jeton).catch(() => {});
    else { setCode(codeNotif); setEcran('accueil'); }
  }), []);

  useEffect(() => {
    stockage.lire('thaayam:pseudo').then((p) => p && setPseudo(p)).catch(() => {});
    stockage.lire('thaayam:regles:v5').then((r) => r && setRegles(normaliserRegles(JSON.parse(r)).regles)).catch(() => {});
    return () => arretRef.current && arretRef.current();
  }, []);

  // L'ordinateur joue tout seul en partie locale, avec une petite pause.
  useEffect(() => {
    const e = session && session.mode === 'local' ? session.etat : null;
    if (!e || animRef.current || e.phase === 'fini' || !e.joueurs[e.tour].ordi) return undefined;
    const m = setTimeout(() => {
      const s = sessionRef.current;
      if (!s || s.etat !== e) return;
      if (e.phase === 'lancer') agir(lancer(e));
      else {
        const coup = choisirCoup(e);
        if (coup) agir(jouer(e, coup.pion, !!coup.groupe, coup.ival));
      }
    }, e.phase === 'lancer' ? 450 : 550);
    return () => clearTimeout(m);
  }, [session]);

  // Parties en ligne de cet appareil et statistiques, rechargées à chaque retour à l'accueil
  const [mesParties, setMesParties] = useState([]);
  const [stats, setStats] = useState(statsVides());
  useEffect(() => {
    if (ecran !== 'accueil') return undefined;
    let actif = true;
    enLigne.mesParties().then((l) => actif && setMesParties(l)).catch(() => actif && setMesParties([]));
    stockage.lire('thaayam:replays').then((x) => { try { if (actif) setReplays(JSON.parse(x || '[]')); } catch { /* abîmé */ } }).catch(() => {});
    stockage.lire('thaayam:stats').then((t) => actif && setStats(normaliserStats(JSON.parse(t || 'null')))).catch(() => {});
    return () => { actif = false; };
  }, [ecran]);

  // Compte chaque partie terminée une seule fois
  const statsNoteesRef = useRef(null);
  useEffect(() => {
    const e = session && session.etat;
    if (!e || e.phase !== 'fini' || statsNoteesRef.current === e) return;
    statsNoteesRef.current = e;
    const infos = session.mode === 'ligne' ? { mode: 'ligne', place: session.place, code: session.partie.code } : { mode: 'local' };
    stockage.lire('thaayam:stats')
      .then((t) => stockage.ecrire('thaayam:stats', JSON.stringify(noterFin(normaliserStats(JSON.parse(t || 'null')), e, infos))))
      .catch(() => {});
    // Garder les 5 dernières parties pour les revoir
    if (Array.isArray(e.histo) && e.histo.length) {
      stockage.lire('thaayam:replays').then((x) => {
        let liste = [];
        try { liste = JSON.parse(x || '[]'); } catch { /* abîmé */ }
        const empreinte = JSON.stringify(e.histo);
        liste = [{ quand: Date.now(), etat: e }, ...liste.filter((r) => r && r.etat && JSON.stringify(r.etat.histo) !== empreinte)].slice(0, 5);
        return stockage.ecrire('thaayam:replays', JSON.stringify(liste));
      }).catch(() => {});
    }
  }, [session]);

  // Messages rapides reçus (affichés 3 secondes)
  const [bulle, setBulle] = useState(null);
  const minuteurBulle = useRef(null);
  function montrerReaction(r, s) {
    const nom = (s.etat && s.etat.joueurs[r.place] && s.etat.joueurs[r.place].nom) || (s.partie.joueurs[r.place] || {}).nom || '?';
    setBulle({ texte: `${N(nom)}${r.place === s.place ? t('toi') : ''} : ${traduireReaction(r.texte, t)}`, place: r.place });
    clearTimeout(minuteurBulle.current);
    minuteurBulle.current = setTimeout(() => setBulle(null), 3000);
  }
  async function reagir(texte) {
    const s = sessionRef.current;
    try { await enLigne.reagir(s.partie.code, s.jeton, texte); } catch (e) { setMessage(traduireErreur(e.message, t)); }
  }
  async function revanche() {
    const s = sessionRef.current;
    setOccupe(true);
    try {
      const nouveau = await enLigne.revanche(s.partie.code, s.jeton);
      await ouvrirEnLigne(nouveau, s.place, s.jeton);
      setMessage('');
    } catch (e) {
      setMessage(traduireErreur(e.message, t));
    } finally {
      setOccupe(false);
    }
  }

  const memoriserPseudo = (p) => { setPseudo(p); stockage.ecrire('thaayam:pseudo', p.trim()).catch(() => {}); };

  function arreterSuivi() {
    if (arretRef.current) arretRef.current();
    arretRef.current = null;
  }

  async function ouvrirEnLigne(codePartie, place, jeton) {
    arreterSuivi();
    const partie = await enLigne.lire(codePartie);
    const reactionVue = { n: partie.reaction ? partie.reaction.n : 0 };
    setSession({ mode: 'ligne', partie, etat: partie.etat, place, jeton });
    setEcran(partie.statut === 'attente' ? 'salon' : 'jeu');
    // Mises à jour reçues pendant une animation : on garde la plus récente et on la traite juste après.
    let enAttente = null;
    const traiter = (nouvelle) => {
      const s = sessionRef.current;
      if (!s || s.mode !== 'ligne' || nouvelle.code !== s.partie.code) return;
      if (nouvelle.reaction && nouvelle.reaction.n !== reactionVue.n) {
        reactionVue.n = nouvelle.reaction.n;
        montrerReaction(nouvelle.reaction, s);
      }
      if (nouvelle.revanche && nouvelle.revanche !== s.partie.revanche) {
        const x = { ...s, partie: { ...s.partie, revanche: nouvelle.revanche } };
        sessionRef.current = x;
        setSession(x);
      }
      if (animRef.current) { enAttente = nouvelle; return; }
      const ref = sessionRef.current;
      const plusRecente = nouvelle.version > ref.partie.version || nouvelle.statut !== ref.partie.statut ||
        (nouvelle.statut === 'attente' && JSON.stringify(nouvelle.joueurs) !== JSON.stringify(ref.partie.joueurs));
      if (!plusRecente) return;
      const avant = ref.etat;
      const e = nouvelle.etat;
      if (e && e.phase !== 'fini' && e.tour === ref.place && (!avant || avant.tour !== ref.place)) sons.tour();
      const fixer = () => {
        const x = sessionRef.current;
        if (!x || x.mode !== 'ligne' || x.partie.code !== nouvelle.code) return;
        const n = { ...x, partie: nouvelle, etat: nouvelle.etat };
        sessionRef.current = n; // tout de suite, pour la mise à jour suivante
        setSession(n);
        if (nouvelle.statut !== 'attente') setEcran('jeu');
      };
      if (nouvelle.statut !== 'attente' && avant && e && e.numero > avant.numero) {
        // Coup d'un autre joueur : on le montre (dés, pion qui avance), puis on garde le nouvel état
        animer(avant, e).then(() => {
          fixer();
          const suivante = enAttente;
          enAttente = null;
          if (suivante) traiter(suivante);
        });
        return;
      }
      fixer();
    };
    arretRef.current = enLigne.suivre(codePartie, traiter);
  }

  const rejoindre = () => rejoindreCode(code);
  async function rejoindreCode(codePartie) {
    if (!pseudo.trim()) return setMessage(t('errPseudo'));
    if (codePartie.trim().length !== 5) return setMessage(t('errCode'));
    setOccupe(true);
    setMessage('');
    try {
      const r = await enLigne.rejoindre(codePartie, pseudo.trim());
      await ouvrirEnLigne(r.code, r.place, r.jeton);
    } catch (e) {
      setMessage(traduireErreur(e.message, t));
    } finally {
      setOccupe(false);
    }
  }

  async function valider(reglesChoisies, joueursLocaux) {
    setRegles(reglesChoisies);
    stockage.ecrire('thaayam:regles:v5', JSON.stringify(reglesChoisies)).catch(() => {});
    if (mode === 'local') {
      setSession({ mode: 'local', etat: nouvellePartie(reglesChoisies, joueursLocaux) });
      setEcran('jeu');
      return;
    }
    setOccupe(true);
    setMessage('');
    try {
      const r = await enLigne.creer(reglesChoisies, pseudo.trim());
      await ouvrirEnLigne(r.code, r.place, r.jeton);
    } catch (e) {
      setMessage(traduireErreur(e.message, t));
    } finally {
      setOccupe(false);
    }
  }

  async function demarrer() {
    setOccupe(true);
    setMessage('');
    try {
      const p = await enLigne.lire(session.partie.code);
      await enLigne.demarrer(p, session.jeton);
      const maj = await enLigne.lire(p.code);
      setSession((s) => ({ ...s, partie: maj, etat: maj.etat }));
      setEcran('jeu');
    } catch (e) {
      setMessage(traduireErreur(e.message, t));
    } finally {
      setOccupe(false);
    }
  }

  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  /**
   * Montre le passage de `ancien` à `nouveau` : les dés roulent, le pion avance case par case
   * (en plus gros), puis sons, vibrations et éclat lumineux.
   */
  async function animer(ancien, nouveau) {
    if (!ancien || !nouveau || nouveau.numero <= ancien.numero) return;
    const s0 = sessionRef.current;
    const dc = nouveau.dernierCoup;
    const coupJoue = dc && JSON.stringify(dc) !== JSON.stringify(ancien.dernierCoup);
    const nouveauLancer = nouveau.dernierLancer && JSON.stringify(nouveau.dernierLancer) !== JSON.stringify(ancien.dernierLancer);
    const g = geometrie(nouveau.regles, nouveau.joueurs.length);
    animRef.current = true;
    setOccupe(true);
    try {
      if (nouveauLancer && !coupJoue) {
        sons.des();
        const d = nouveau.regles.des;
        for (let k = 0; k < 5; k++) {
          setDesRoulent({ joueur: nouveau.dernierLancer.joueur, valeur: nouveau.dernierLancer.valeur, detail: nouveau.dernierLancer.detail.map(() => (d.type === 'cauris'
            ? Math.random() < 0.5 : d.faces[Math.floor(Math.random() * d.faces.length)])) });
          await attendre(70);
        }
        setDesRoulent(null);
      }
      if (coupJoue && dc.depuis >= 0) {
        setEnMouvement({ joueur: dc.joueur, pion: dc.pion });
        for (const pos of etapesCoup(g, dc.depuis, dc.vers).slice(0, -1)) {
          if (sessionRef.current !== s0 && (!sessionRef.current || !s0 || sessionRef.current.mode !== s0.mode)) break;
          const vue = JSON.parse(JSON.stringify(ancien));
          vue.lancer = null;
          (dc.groupe || [dc.pion]).forEach((i) => { vue.joueurs[dc.joueur].pions[i] = pos; });
          setSession((x) => (x ? { ...x, etat: vue } : x));
          sons.pas();
          await attendre(140);
          if (!sessionRef.current) break;
        }
      }
      if (coupJoue) {
        const captures = (e) => e.joueurs.reduce((n, j) => n + j.captures, 0);
        const k = cle(g.chemins[dc.joueur][dc.vers]);
        let couleur = null;
        if (nouveau.phase === 'fini') { sons.victoire(); couleur = '#ffd54a'; }
        else if (captures(nouveau) > captures(ancien)) { sons.capture(); couleur = '#ff4d4d'; }
        else if (dc.vers === g.arrivee) { sons.arrivee(); couleur = '#ffd54a'; }
        else if (dc.depuis === -1) sons.entree();
        else sons.pas();
        if (couleur) {
          setEclat({ k, couleur });
          setTimeout(() => setEclat(null), 650);
        }
      }
      // Contre l'ordinateur : petit signal quand c'est de nouveau à un humain
      if (s0 && s0.mode === 'local' && nouveau.phase !== 'fini' && nouveau.tour !== ancien.tour &&
        !nouveau.joueurs[nouveau.tour].ordi && ancien.joueurs[ancien.tour].ordi) sons.tour();
    } finally {
      setDesRoulent(null);
      setEnMouvement(null);
      animRef.current = false;
      setOccupe(false);
    }
  }

  async function agir(nouvelEtat) {
    const s = sessionRef.current;
    if (!s) return;
    // En ligne, le coup part au serveur tout de suite, pendant que le pion avance à l'écran
    const envoi = s.mode === 'ligne' ? enLigne.envoyer(s.partie.code, s.jeton, s.partie.version, nouvelEtat) : null;
    if (envoi) envoi.catch(() => {});
    await animer(s.etat, nouvelEtat);
    if (!sessionRef.current) return;
    if (s.mode === 'local') return setSession({ ...sessionRef.current, etat: nouvelEtat });
    setOccupe(true);
    setSession({ ...sessionRef.current, etat: nouvelEtat });
    try {
      const v = await envoi;
      setSession((x) => (x.partie.version >= v ? x : {
        ...x, etat: nouvelEtat,
        partie: { ...x.partie, etat: nouvelEtat, version: v, statut: nouvelEtat.phase === 'fini' ? 'finie' : 'en_cours' },
      }));
      setMessage('');
    } catch (e) {
      setMessage(traduireErreur(e.message, t));
      try {
        const p = await enLigne.lire(s.partie.code);
        setSession((x) => ({ ...x, partie: p, etat: p.etat }));
      } catch { /* hors ligne */ }
    } finally {
      setOccupe(false);
    }
  }

  function quitter() {
    arreterSuivi();
    setSession(null);
    setMessage('');
    setEcran('accueil');
  }

  let contenu;
  if (ecran === 'revoir' && aRevoir) {
    contenu = <Revoir etatFinal={aRevoir} surRetour={() => setEcran(retourRevoir === 'jeu' && sessionRef.current ? 'jeu' : 'accueil')} />;
  } else if (ecran === 'regles') {
    contenu = (
      <>
        <Bouton titre={t('retour')} onPress={() => setEcran(retourRegles)} />
        <ReglesJeu />
        <Bouton principal titre={t('retour')} onPress={() => setEcran(retourRegles)} />
      </>
    );
  } else if (ecran === 'reglages') {
    contenu = (
      <>
        <Bouton titre={t('retour')} onPress={() => { setMessage(''); setEcran('accueil'); }} />
        <Texte style={{ fontSize: 22, fontWeight: '800' }}>{mode === 'local' ? t('titreLocal') : t('titreLigne')}</Texte>
        <Reglages mode={mode} reglesInitiales={regles} ordiInitial={ordiInitial} pseudo={pseudo.trim()} occupe={occupe} erreurServeur={message} surValider={valider} />
      </>
    );
  } else if (ecran === 'salon' && session) {
    const p = session.partie;
    const createur = session.place === 0;
    contenu = (
      <>
        <Bouton titre={t('accueil')} onPress={quitter} />
        <Texte attenue style={{ textAlign: 'center' }}>Code de la partie</Texte>
        <Texte selectable style={{ fontSize: 48, fontWeight: '800', letterSpacing: 10, textAlign: 'center', color: c.accent }}>{p.code}</Texte>
        <Bouton titre={t('partagerCode')} onPress={() => Share.share({ message: t('invitation', { code: p.code }) }).catch(() => {})} />
        <Carte titre={t('joueurs')}>
          {p.joueurs.map((j, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: COULEURS[i].code }} />
              <Texte>{N(j.nom)}{i === session.place ? t('toi') : ''}{i === 0 ? t('createur') : ''}</Texte>
            </View>
          ))}
        </Carte>
        <Carte titre={t('regles')}>
          {resumeReglesTraduit(p.regles, t).map((x, i) => <Texte key={i} attenue>• {x}</Texte>)}
        </Carte>
        <InviterAmis code={p.code} presents={p.joueurs.map((j) => j.nom)} pseudo={pseudo.trim()} />
        {discussion(session)}
        {createur ? (
          <Bouton principal titre={t('commencerPartie')} desactive={p.joueurs.length < 2 || occupe} onPress={demarrer} />
        ) : null}
        <Texte attenue={!message} erreur={!!message}>
          {message || (createur
            ? (p.joueurs.length < 2 ? t('salonPeu') : t('salonPrets', { n: p.joueurs.length }))
            : t('salonAttente'))}
        </Texte>
      </>
    );
  } else if (ecran === 'jeu' && session && session.etat) {
    contenu = (
      <>
      <Jeu etat={session.etat} moi={session.mode === 'ligne' ? session.place : null} occupe={occupe}
        guide={!!session.guide} desRoulent={desRoulent} enMouvement={enMouvement} eclat={eclat}
        surRevoir={() => revoirPartie(session.etat, 'jeu')}
        message={message} surAction={agir} surQuitter={quitter} surReglesJeu={voirReglesJeu}
        bulle={bulle} surReaction={session.mode === 'ligne' ? reagir : null}
        surRevanche={session.mode === 'ligne' ? revanche : null} revancheExiste={!!(session.partie && session.partie.revanche)}
        surRejouer={() => setSession((s) => ({
          ...s,
          etat: s.guide ? nouvellePartieGuidee(pseudo.trim())
            : nouvellePartie(s.etat.regles, s.etat.joueurs.map((j) => ({ nom: j.nom, ordi: j.ordi || false }))),
        }))} />
      {session.mode === 'ligne' ? discussion(session) : null}
      </>
    );
  } else {
    contenu = (
      <>
        <View style={{ alignItems: 'center', marginVertical: 8 }}>
          <Texte attenue style={{ fontSize: 26 }}>தாயம்</Texte>
          <Texte style={{ fontSize: 36, fontWeight: '800', color: c.accent }}>Thaayam</Texte>
          <Texte attenue>{t('sousTitre')}</Texte>
        </View>
        <Carte titre={t('langue')}>
          <Choix options={LANGUES.map((l) => [l.code, l.nom])} valeur={langue} onChange={choisirLangue} />
        </Carte>
        <Carte titre={t('apparence')}>
          <Choix options={THEMES.map(({ code: c2, icone }) => [c2, `${icone} ${t(c2)}`])} valeur={theme} onChange={choisirTheme} />
        </Carte>
        {resumeStatsTraduit(stats, t).length ? (
          <Carte titre={t('mesStats')}>
            {resumeStatsTraduit(stats, t).map((l) => <Texte key={l}>• {l}</Texte>)}
          </Carte>
        ) : null}
        {mesParties.length ? (
          <Carte titre={t('mesParties')}>
            {mesParties.map((p) => (
              <Bouton key={p.code} principal={p.aMoi}
                titre={`${p.code} · ${p.statut === 'attente' ? t('partieAttente') : p.aMoi ? t('partieAMoi') : t('partieEnCours')}`}
                onPress={() => ouvrirEnLigne(p.code, p.place, p.jeton).catch((e) => setMessage(traduireErreur(e.message, t)))} />
            ))}
          </Carte>
        ) : null}
        <Champ libelle={t('pseudo')} value={pseudo} onChangeText={memoriserPseudo} maxLength={20} placeholder={t('pseudoExemple')} />
        <Social pseudo={pseudo.trim()} surRejoindre={(c2) => { setCode(c2); rejoindreCode(c2); }} />
        <Carte titre={t('jouerEnLigne')}>
          <Bouton principal titre={t('creerPartie')} desactive={occupe}
            onPress={() => { if (!pseudo.trim()) return setMessage(t('errPseudo')); setMessage(''); setMode('ligne'); setEcran('reglages'); }} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Champ value={code} onChangeText={(t) => setCode(t.toUpperCase())} maxLength={5} placeholder={t('code')} autoCapitalize="characters"
                style={{ letterSpacing: 4, fontWeight: '700' }} />
            </View>
            <Bouton titre={occupe ? '…' : t('rejoindre')} desactive={occupe} onPress={rejoindre} />
          </View>
        </Carte>
        <Carte titre={t('jouerAppareil')}>
          <Bouton principal titre={t('contreOrdi')}
            onPress={() => { setMessage(''); setOrdiInitial([false, true, true, true]); setMode('local'); setEcran('reglages'); }} />
          <Bouton titre={t('plusieurs')}
            onPress={() => { setMessage(''); setOrdiInitial([false, false, false, false]); setMode('local'); setEcran('reglages'); }} />
          <Bouton titre={t('partieGuidee')}
            onPress={() => { setMessage(''); setSession({ mode: 'local', guide: true, etat: nouvellePartieGuidee(pseudo.trim()) }); setEcran('jeu'); }} />
          <Texte attenue style={{ fontSize: 13 }}>{t('partieGuideeAide')}</Texte>
        </Carte>
        {replays.length ? (
          <Carte titre={t('mesReplays')}>
            {replays.map((r) => (
              <Bouton key={r.quand} titre={`${new Date(r.quand).toLocaleDateString(langue)} · ${r.etat.joueurs.map((j) => N(j.nom)).join(', ')} · ${t('replayGagnant', { nom: N(r.etat.joueurs[r.etat.gagnant].nom) })}`}
                onPress={() => revoirPartie(r.etat, 'accueil')} />
            ))}
          </Carte>
        ) : null}
        <Bouton titre={t('reglesDessins')} onPress={voirReglesJeu} />
        {message ? <Texte erreur>{message}</Texte> : null}
      </>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.fond }}>
      <StatusBar style={themeLumineux(theme) ? 'light' : theme === 'temple' ? 'dark' : 'auto'} />
      <Ambiance />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled">
        {contenu}
      </ScrollView>
      <CoucheEmojis volants={volants} retirer={(id) => setVolants((l) => l.filter((e) => e.id !== id))} />
    </SafeAreaView>
  );
}
