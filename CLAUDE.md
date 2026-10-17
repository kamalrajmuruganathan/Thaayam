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

- Ordinateur : `moteur/ia.js` (`choisirCoup`), niveaux `facile`, `normal`, `fort` (évaluation + un lancer d'avance).
- Règles validées par Kamal (par défaut) : croix 3 × 4, pions au départ dans le centre, sortie sur la case de sa
  colonne collée au centre → descente → tour anti-horaire → retour au bout du bras → remontée sur les 3 arcs du coin
  à gauche de son bras (positions non entières, `ARCS_RAYONS`) → centre (`cheminCroix`), 4 pions, dés longs 0-3, 0 + 0 = Kaapal (on passe les dés),
  entrée avec 1, relance avec 1, 5, 6, 2 + 2 et après capture, capture obligatoire, empilement (groupe mangé en
  entier, groupe mangé qui rentre ensemble avec une valeur de relance). Page `web/regles.html` + écran `ReglesJeu`.

## Règles absolues
1. Ne jamais afficher ni committer une clé `sb_secret_…` (la clé publishable et l'URL sont publiques).
2. Ne jamais publier (Netlify, `main`, PR) sans l'accord explicite de Kamal. Kamal a accepté que `main` soit
   publié sur Cloudflare (https://thaayam.kamalraj-28.workers.dev, gratuit) à chaque changement validé.
3. Tout changement de règle passe par `moteur/` + un test dans `moteur/moteur.test.js` (`npm test`).

## Vérifications
- `npm test` (moteur) ; `cd app && npx expo export --platform web` (l'appli compile).
- Si on modifie `supabase/thaayam.sql`, il doit rester ré-exécutable (`create or replace`, `if not exists`).
