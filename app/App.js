import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Bouton, Carte, Champ, Texte, useCouleurs } from './src/ui';
import Reglages from './src/ecrans/Reglages';
import Jeu from './src/ecrans/Jeu';
import { enLigne, stockage } from './src/enLigne';
import { COULEURS, copieRegles, normaliserRegles, resumeRegles } from '../moteur/regles.js';
import { nouvellePartie, lancer, jouer } from '../moteur/partie.js';
import { choisirCoup } from '../moteur/ia.js';

export default function App() {
  return (
    <SafeAreaProvider>
      <Racine />
    </SafeAreaProvider>
  );
}

function Racine() {
  const c = useCouleurs();
  const [ecran, setEcran] = useState('accueil'); // accueil | reglages | salon | jeu
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

  useEffect(() => {
    stockage.lire('thaayam:pseudo').then((p) => p && setPseudo(p)).catch(() => {});
    stockage.lire('thaayam:regles:v2').then((r) => r && setRegles(normaliserRegles(JSON.parse(r)).regles)).catch(() => {});
    return () => arretRef.current && arretRef.current();
  }, []);

  // L'ordinateur joue tout seul en partie locale, avec une petite pause.
  useEffect(() => {
    const e = session && session.mode === 'local' ? session.etat : null;
    if (!e || e.phase === 'fini' || !e.joueurs[e.tour].ordi) return undefined;
    const m = setTimeout(() => {
      if (e.phase === 'lancer') setSession((s) => (s && s.etat === e ? { ...s, etat: lancer(e) } : s));
      else {
        const coup = choisirCoup(e);
        if (coup) setSession((s) => (s && s.etat === e ? { ...s, etat: jouer(e, coup.pion) } : s));
      }
    }, e.phase === 'lancer' ? 650 : 850);
    return () => clearTimeout(m);
  }, [session]);

  const memoriserPseudo = (p) => { setPseudo(p); stockage.ecrire('thaayam:pseudo', p.trim()).catch(() => {}); };

  function arreterSuivi() {
    if (arretRef.current) arretRef.current();
    arretRef.current = null;
  }

  async function ouvrirEnLigne(codePartie, place, jeton) {
    arreterSuivi();
    const partie = await enLigne.lire(codePartie);
    setSession({ mode: 'ligne', partie, etat: partie.etat, place, jeton });
    setEcran(partie.statut === 'attente' ? 'salon' : 'jeu');
    arretRef.current = enLigne.suivre(codePartie, (nouvelle) => {
      const s = sessionRef.current;
      if (!s || s.mode !== 'ligne' || nouvelle.code !== s.partie.code) return;
      const plusRecente = nouvelle.version > s.partie.version || nouvelle.statut !== s.partie.statut ||
        (nouvelle.statut === 'attente' && JSON.stringify(nouvelle.joueurs) !== JSON.stringify(s.partie.joueurs));
      if (!plusRecente) return;
      setSession({ ...s, partie: nouvelle, etat: nouvelle.etat });
      if (nouvelle.statut !== 'attente') setEcran('jeu');
    });
  }

  async function rejoindre() {
    if (!pseudo.trim()) return setMessage("Écris d'abord ton pseudo.");
    if (code.trim().length !== 5) return setMessage('Le code fait 5 caractères.');
    setOccupe(true);
    setMessage('');
    try {
      const r = await enLigne.rejoindre(code, pseudo.trim());
      await ouvrirEnLigne(r.code, r.place, r.jeton);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setOccupe(false);
    }
  }

  async function valider(reglesChoisies, joueursLocaux) {
    setRegles(reglesChoisies);
    stockage.ecrire('thaayam:regles:v2', JSON.stringify(reglesChoisies)).catch(() => {});
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
      setMessage(e.message);
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
      setMessage(e.message);
    } finally {
      setOccupe(false);
    }
  }

  async function agir(nouvelEtat) {
    const s = sessionRef.current;
    if (s.mode === 'local') return setSession({ ...s, etat: nouvelEtat });
    setOccupe(true);
    setSession({ ...s, etat: nouvelEtat });
    try {
      const v = await enLigne.envoyer(s.partie.code, s.jeton, s.partie.version, nouvelEtat);
      setSession((x) => (x.partie.version >= v ? x : {
        ...x, etat: nouvelEtat,
        partie: { ...x.partie, etat: nouvelEtat, version: v, statut: nouvelEtat.phase === 'fini' ? 'finie' : 'en_cours' },
      }));
      setMessage('');
    } catch (e) {
      setMessage(e.message);
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
  if (ecran === 'reglages') {
    contenu = (
      <>
        <Bouton titre="← Retour" onPress={() => { setMessage(''); setEcran('accueil'); }} />
        <Texte style={{ fontSize: 22, fontWeight: '800' }}>{mode === 'local' ? 'Partie sur cet appareil' : 'Nouvelle partie en ligne'}</Texte>
        <Reglages mode={mode} reglesInitiales={regles} ordiInitial={ordiInitial} pseudo={pseudo.trim()} occupe={occupe} erreurServeur={message} surValider={valider} />
      </>
    );
  } else if (ecran === 'salon' && session) {
    const p = session.partie;
    const createur = session.place === 0;
    contenu = (
      <>
        <Bouton titre="← Accueil" onPress={quitter} />
        <Texte attenue style={{ textAlign: 'center' }}>Code de la partie</Texte>
        <Texte selectable style={{ fontSize: 48, fontWeight: '800', letterSpacing: 10, textAlign: 'center', color: c.accent }}>{p.code}</Texte>
        <Bouton titre="Partager le code" onPress={() => Share.share({ message: `Viens jouer au Thaayam avec moi ! Code : ${p.code}` }).catch(() => {})} />
        <Carte titre="Joueurs">
          {p.joueurs.map((j, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: COULEURS[i].code }} />
              <Texte>{j.nom}{i === session.place ? ' (toi)' : ''}{i === 0 ? ' — créateur' : ''}</Texte>
            </View>
          ))}
        </Carte>
        <Carte titre="Règles">
          {resumeRegles(p.regles).map((x, i) => <Texte key={i} attenue>• {x}</Texte>)}
        </Carte>
        {createur ? (
          <Bouton principal titre="Commencer la partie" desactive={p.joueurs.length < 2 || occupe} onPress={demarrer} />
        ) : null}
        <Texte attenue={!message} erreur={!!message}>
          {message || (createur
            ? (p.joueurs.length < 2 ? 'Envoie le code à tes amis. Il faut au moins 2 joueurs.' : `${p.joueurs.length} joueurs prêts (4 au maximum).`)
            : 'En attente du créateur de la partie…')}
        </Texte>
      </>
    );
  } else if (ecran === 'jeu' && session && session.etat) {
    contenu = (
      <Jeu etat={session.etat} moi={session.mode === 'ligne' ? session.place : null} occupe={occupe}
        message={message} surAction={agir} surQuitter={quitter} />
    );
  } else {
    contenu = (
      <>
        <View style={{ alignItems: 'center', marginVertical: 8 }}>
          <Texte attenue style={{ fontSize: 26 }}>தாயம்</Texte>
          <Texte style={{ fontSize: 36, fontWeight: '800', color: c.accent }}>Thaayam</Texte>
          <Texte attenue>Le jeu de plateau traditionnel tamoul</Texte>
        </View>
        <Champ libelle="Ton pseudo" value={pseudo} onChangeText={memoriserPseudo} maxLength={20} placeholder="Ex. Kamal" />
        <Carte titre="Jouer en ligne">
          <Bouton principal titre="Créer une partie" desactive={occupe}
            onPress={() => { if (!pseudo.trim()) return setMessage("Écris d'abord ton pseudo."); setMessage(''); setMode('ligne'); setEcran('reglages'); }} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Champ value={code} onChangeText={(t) => setCode(t.toUpperCase())} maxLength={5} placeholder="CODE" autoCapitalize="characters"
                style={{ letterSpacing: 4, fontWeight: '700' }} />
            </View>
            <Bouton titre={occupe ? '…' : 'Rejoindre'} desactive={occupe} onPress={rejoindre} />
          </View>
        </Carte>
        <Carte titre="Jouer sur cet appareil">
          <Bouton principal titre="Contre l'ordinateur"
            onPress={() => { setMessage(''); setOrdiInitial([false, true, true, true]); setMode('local'); setEcran('reglages'); }} />
          <Bouton titre="À plusieurs, chacun son tour"
            onPress={() => { setMessage(''); setOrdiInitial([false, false, false, false]); setMode('local'); setEcran('reglages'); }} />
        </Carte>
        {message ? <Texte erreur>{message}</Texte> : null}
      </>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.fond }}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled">
        {contenu}
      </ScrollView>
    </SafeAreaView>
  );
}
