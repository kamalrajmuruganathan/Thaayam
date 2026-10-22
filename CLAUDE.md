# CLAUDE.md — Thaayam

## Le projet
- Jeu de plateau tamoul Thaayam, en ligne entre amis + local. Propriétaire : Kamal (pas développeur de métier :
  explications simples, étapes numérotées, **en français correct**).
- `moteur/` = source unique des règles (ES modules purs, sans API navigateur). Utilisé par `web/` (copié dans
  `web/moteur/` par `npm run web` et par le build Cloudflare (`wrangler.jsonc`) — ce dossier copié est ignoré par git) et par `app/`
  (Metro surveille `../moteur` via `metro.config.js`).
- En ligne : Supabase (même projet que Kamal Campus), tables `thaayam_parties` / `thaayam_jetons`, RPC
  `thaayam_creer`, `thaayam_rejoindre`, `thaayam_demarrer`, `thaayam_jouer`, `thaayam_revanche`, `thaayam_reagir`,
  `thaayam_menage` (`supabase/thaayam.sql`). Statistiques locales : `moteur/stats.js`.
  L'état complet du jeu (JSON) est stocké dans `thaayam_parties.etat` ; `version` évite les coups en double.

- Langues : `moteur/i18n.js` (`traducteur(langue)` → `t(cle, params)`, 5 langues, test « toutes les clés ») ; le moteur
  et le serveur écrivent en français, retraduits à l'affichage (`traduireJournal`, `traduireErreur`, `traduireNom`…) ;
  page des règles : `moteur/textes-regles.js`. Tout nouveau texte affiché doit passer par une clé, dans les 5 langues.
- Thèmes : `moteur/themes.js` (couleurs du plateau ; `THEMES` = cristal par défaut, temple, nuit, bois ; `themeValide`) ;
  site : `data-skin` sur `<html>` + règles CSS `:root[data-skin="…"]` dans `web/style.css` ; appli : `ThemeContexte`,
  palettes et `couleursDes` dans `app/src/ui.js`, ambiance futuriste `app/src/Ambiance.js`.
- Textes des nouveautés : `moteur/i18n-plus.js` (une ligne = les 5 langues côte à côte), fusionnés dans `i18n.js`.
- Revoir une partie : `etat.histo` (« d1.0 », « c1010 », « p2 », « g2 », « p2:1 » = valeur n° 1 de la réserve) + `revoirPartie()` (`moteur/partie.js`).
- Partie guidée : `moteur/guide.js` (`conseilGuide`, `lancerGuide`). Classement : `moteur/classement.js`.
- Amis / classement / notifications : RPC `thaayam_profil`, `thaayam_lier`, `thaayam_ajouter_ami`, `thaayam_retirer_ami`,
  `thaayam_inviter`, `thaayam_social`, `thaayam_abonner`, `thaayam_cle_notifs` ; déclencheurs `thaayam_tour` et
  `thaayam_invitation` → `pg_net` → fonction Edge `supabase/functions/thaayam-notifier` (Web Push + Expo).
  Profil de l'appareil : `thaayam:profil` ({ id, secret, code_ami }) dans le stockage local.
- Discussion : table `thaayam_messages` + RPC `thaayam_ecrire` (1 message/s, 300 caractères, 200 derniers gardés),
  `messages` / `ecrire` / `suivreMessages` dans `moteur/en-ligne.js` ; site : `#zone-partie-ligne` (salon puis sous le
  plateau) ; appli : `app/src/ecrans/Discussion.js`. Un message fait d'un seul emoji s'envole sur l'écran.
- Appels audio / vidéo (site seulement) : `web/appel.js` (WebRTC en maillage, 2 à 4 joueurs, STUN Cloudflare/Google
  + relais TURN via `serveursAppel` → fonction Edge `thaayam-notifier` { type: 'turn', code, jeton } : Metered
  (identifiant fixe, région Global, `metered_user` / `metered_pass` dans la table privée `thaayam_config` → global.relay.metered.ca),
  puis secours public freestun.net (`RELAIS_PUBLICS` dans `web/appel.js`) ; diagnostic : { …, diagnostic: true } ;
  reconnexion automatique 3 fois), signalisation par diffusion Supabase (`canalAppel`).
  Test du relais en local : coturn + `politique: 'relay'`. Confirmation du joueur (window.confirm) avant
  d'allumer le micro / la caméra. Appli : il faudrait `react-native-webrtc` (module natif, build EAS).
- Hors ligne et notifications web : `web/sw.js` (liste `FICHIERS` vérifiée par un test : tout nouveau fichier de
  `web/` ou `moteur/` doit y être ajouté). Sons de l'appli : `app/assets/sons/*.wav` + `app/src/sons.js`.
- Ordinateur : `moteur/ia.js` (`choisirCoup`), niveaux `facile`, `normal`, `fort` (évaluation + un lancer d'avance).
- Règles validées par Kamal (par défaut) : croix 3 × 4, pions au départ dans le centre, sortie sur la case de sa
  colonne collée au centre → descente → tour anti-horaire → retour au bout du bras → remontée sur les 3 arcs du coin
  à gauche de son bras (positions non entières, `ARCS_RAYONS`) → centre (`cheminCroix`), 4 pions, dés longs 0-3, 0 + 0 = Kaapal (on passe les dés),
  premier pion sorti avec 1 seulement ; ensuite 1, 5, 6, 2 + 2 font sortir un pion sur la première case (`sortieAvecRejoue`,
  obligatoire tant qu'il reste des pions au centre, `sortieObligatoire`) ; lancers cumulés (`cumulLancers`) : on relance avec
  1, 5, 6, 2 + 2 en gardant les valeurs (`etat.reserve`), puis on les joue dans l'ordre voulu (`jouer(etat, pion, groupe, ival)`,
  historique « p2:1 ») ; Kaapal pendant les relances = tout est perdu ; pas de relance après capture ; capture obligatoire, empilement (groupe mangé en
  entier, groupe mangé qui rentre ensemble avec une valeur de relance). Page `web/regles.html` + écran `ReglesJeu`.

## Règles absolues
1. Ne jamais afficher ni committer une clé `sb_secret_…` (la clé publishable et l'URL sont publiques).
2. Ne jamais publier (Netlify, `main`, PR) sans l'accord explicite de Kamal. Kamal a accepté que `main` soit
   publié sur Cloudflare (https://thaayam.kamalraj-28.workers.dev, gratuit) à chaque changement validé.
3. Tout changement de règle passe par `moteur/` + un test dans `moteur/moteur.test.js` (`npm test`).

## Vérifications
- `npm test` (moteur) ; `cd app && npx expo export --platform web` (l'appli compile).
- SQL : testable en local avec Postgres 16 (rôles `anon`/`authenticated`, publication `supabase_realtime`).
- Si on modifie `supabase/thaayam.sql`, il doit rester ré-exécutable (`create or replace`, `if not exists`).
