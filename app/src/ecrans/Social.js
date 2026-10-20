import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Share, View } from 'react-native';
import { Bouton, Carte, Champ, Texte, useCouleurs, useT } from '../ui';
import { enLigne } from '../enLigne';
import { traduireErreur } from '../../../moteur/i18n.js';
import { niveauJoueur, trierClassement } from '../../../moteur/classement.js';
import { notifsPossibles, notifsActives, activerNotifs, couperNotifs } from '../notifs';

/**
 * Cartes de l'accueil liées aux amis : invitations reçues, mes amis (code ami), classement, notifications.
 * surRejoindre(code) : rejoindre une partie où un ami m'invite.
 */
export default function Social({ pseudo, surRejoindre }) {
  const c = useCouleurs();
  const t = useT();
  const [social, setSocial] = useState(null);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState({ texte: '', erreur: false });
  const [codeAmi, setCodeAmi] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [notifs, setNotifs] = useState(false);
  const [messageNotifs, setMessageNotifs] = useState('');

  // On attend que le pseudo ne bouge plus (pas de profil créé avec un pseudo à moitié tapé)
  const [pseudoStable, setPseudoStable] = useState(pseudo);
  useEffect(() => {
    const m = setTimeout(() => setPseudoStable(pseudo), 900);
    return () => clearTimeout(m);
  }, [pseudo]);
  const pseudoEnvoye = useRef(null);

  const charger = useCallback(async () => {
    if (!pseudoStable) { setSocial(null); return; }
    try {
      // Pseudo changé : on met à jour le profil (amis, classement)
      if (pseudoEnvoye.current !== null && pseudoEnvoye.current !== pseudoStable && (await enLigne.profilLocal())) {
        await enLigne.profil(pseudoStable);
      }
      pseudoEnvoye.current = pseudoStable;
      setSocial(await enLigne.social(pseudoStable));
      setErreur('');
    } catch (e) {
      setSocial(null);
      setErreur(/connexion|internet|fetch/i.test(e.message) ? t('amisHorsLigne') : traduireErreur(e.message, t));
    }
  }, [pseudoStable, t]);

  useEffect(() => {
    charger();
    const m = setInterval(charger, 20000); // les invitations arrivent sans recharger
    return () => clearInterval(m);
  }, [charger]);
  useEffect(() => { notifsActives().then(setNotifs).catch(() => {}); }, []);

  async function ajouter() {
    const code = codeAmi.trim().toUpperCase();
    if (code.length !== 6) return setMessage({ texte: t('errCodeAmi'), erreur: true });
    setOccupe(true);
    try {
      const a = await enLigne.ajouterAmi(code);
      setCodeAmi('');
      await charger();
      setMessage({ texte: t('amiAjoute', { nom: a.pseudo }), erreur: false });
    } catch (e) {
      setMessage({ texte: traduireErreur(e.message, t), erreur: true });
    } finally {
      setOccupe(false);
    }
  }

  async function retirer(a) {
    try { await enLigne.retirerAmi(a.id); charger(); } catch (e) { setMessage({ texte: traduireErreur(e.message, t), erreur: true }); }
  }

  async function basculerNotifs() {
    if (notifs) {
      await couperNotifs(t.langue);
      setNotifs(false);
      setMessageNotifs('');
      return;
    }
    if (!pseudo) return setMessageNotifs(t('errPseudo'));
    try {
      const r = await activerNotifs(pseudo, t.langue);
      setNotifs(r === 'ok');
      setMessageNotifs({ ok: '', indispo: t('notifsIndispo'), refusees: t('notifsRefusees'), pasPretes: t('notifsPasPretes') }[r]);
    } catch (e) {
      setMessageNotifs(traduireErreur(e.message, t));
    }
  }

  const classement = social ? trierClassement(social.classement) : [];
  const avecParties = classement.some((x) => x.parties);

  return (
    <>
      {social && social.invitations.length ? (
        <Carte titre={t('invitationsTitre')}>
          {social.invitations.map((inv) => (
            <Bouton key={inv.code} principal titre={t('invitePar', { nom: inv.de, code: inv.code })} onPress={() => surRejoindre(inv.code)} />
          ))}
        </Carte>
      ) : null}

      <Carte titre={t('amisTitre')}>
        {!pseudo ? <Texte attenue>{t('amisPseudo')}</Texte> : null}
        {pseudo && !social ? <Texte attenue>{erreur || '…'}</Texte> : null}
        {social ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <Texte attenue>{t('monCodeAmi')}</Texte>
              <Texte selectable style={{ fontSize: 26, fontWeight: '800', letterSpacing: 4, color: c.accent }}>{social.profil.code_ami}</Texte>
            </View>
            <Bouton titre={t('partagerCodeAmi')}
              onPress={() => Share.share({ message: t('messageCodeAmi', { code: social.profil.code_ami }) }).catch(() => {})} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Champ value={codeAmi} onChangeText={(x) => setCodeAmi(x.toUpperCase())} maxLength={6} placeholder={t('codeAmiPlaceholder')}
                  autoCapitalize="characters" style={{ letterSpacing: 3, fontWeight: '700' }} />
              </View>
              <Bouton principal titre={t('ajouterAmi')} desactive={occupe} onPress={ajouter} />
            </View>
            {message.texte ? <Texte erreur={message.erreur} attenue={!message.erreur}>{message.texte}</Texte> : null}
            {!social.amis.length ? <Texte attenue>{t('aucunAmi')}</Texte> : null}
            {social.amis.map((a) => (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                paddingVertical: 4, borderBottomWidth: 1, borderColor: c.trait }}>
                <Texte style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>{a.pseudo}</Texte>
                <Bouton titre={t('retirerAmi')} onPress={() => retirer(a)} style={{ minHeight: 34, paddingVertical: 4 }} />
              </View>
            ))}
          </>
        ) : null}
      </Carte>

      {social && (social.amis.length || avecParties) ? (
        <Carte titre={t('classementTitre')}>
          <Texte attenue style={{ fontSize: 13 }}>{t('classementAide')}</Texte>
          {!avecParties ? <Texte attenue>{t('classementVide')}</Texte> : null}
          {classement.map((x) => {
            const nv = niveauJoueur(x.victoires);
            return (
              <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 10, borderWidth: 1,
                borderColor: x.moi ? c.accent : c.trait }}>
                <Texte style={{ fontSize: 22, minWidth: 30, textAlign: 'center', fontWeight: '800' }}>{['🥇', '🥈', '🥉'][x.rang - 1] || `${x.rang}.`}</Texte>
                <View style={{ flex: 1 }}>
                  <Texte style={{ fontWeight: '700' }}>{x.pseudo}{x.moi ? t('toi') : ''}</Texte>
                  <Texte attenue style={{ fontSize: 13 }}>{nv.icone} {t(nv.cle)} · {t('classementLigne', { v: x.victoires, p: x.parties })}</Texte>
                  {x.moi && nv.prochain ? <Texte attenue style={{ fontSize: 13 }}>{t('prochainNiveau', { n: nv.prochain })}</Texte> : null}
                </View>
              </View>
            );
          })}
        </Carte>
      ) : null}

      {notifsPossibles() ? (
        <Carte titre={t('notifsTitre')}>
          <Texte attenue style={{ fontSize: 13 }}>{t('notifsAide')}</Texte>
          <Bouton principal={!notifs} titre={notifs ? `${t('notifsActives')} · ${t('notifsCouper')}` : t('notifsActiver')} onPress={basculerNotifs} />
          {messageNotifs ? <Texte erreur>{messageNotifs}</Texte> : null}
        </Carte>
      ) : null}
    </>
  );
}

/** Dans le salon d'attente : inviter mes amis qui ne sont pas encore dans la partie. */
export function InviterAmis({ code, presents, pseudo }) {
  const c = useCouleurs();
  const t = useT();
  const [amis, setAmis] = useState([]);
  const [invites, setInvites] = useState({});
  const [message, setMessage] = useState('');
  useEffect(() => {
    let actif = true;
    if (pseudo) enLigne.social(pseudo).then((r) => actif && setAmis(r.amis)).catch(() => {});
    return () => { actif = false; };
  }, [pseudo]);
  const libres = amis.filter((a) => !presents.includes(a.pseudo));
  if (!libres.length) return null;
  return (
    <Carte titre={t('inviterAmis')}>
      {libres.map((a) => (
        <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Texte style={{ fontWeight: '700', flex: 1, color: c.texte }} numberOfLines={1}>{a.pseudo}</Texte>
          <Bouton principal={!invites[a.id]} desactive={!!invites[a.id]} titre={invites[a.id] ? t('invite') : t('inviter')}
            onPress={async () => {
              try {
                await enLigne.inviter(a.id, code);
                setInvites((x) => ({ ...x, [a.id]: true }));
              } catch (e) {
                setMessage(traduireErreur(e.message, t));
              }
            }} />
        </View>
      ))}
      {message ? <Texte erreur>{message}</Texte> : null}
    </Carte>
  );
}
