# CLAUDE.md — Thaayam

## Le projet
- Jeu de plateau tamoul Thaayam, en ligne entre amis + local. Propriétaire : Kamal (pas développeur de métier :
  explications simples, étapes numérotées, **en français correct**).
- `moteur/` = source unique des règles (ES modules purs, sans API navigateur). Utilisé par `web/` (copié dans
  `web/moteur/` par `npm run web` et par le build Netlify — ce dossier copié est ignoré par git) et par `app/`
  (Metro surveille `../moteur` via `metro.config.js`).
- En ligne : Supabase (même projet que Kamal Campus), tables `thaayam_parties` / `thaayam_jetons`, RPC
  `thaayam_creer`, `thaayam_rejoindre`, `thaayam_demarrer`, `thaayam_jouer` (`supabase/thaayam.sql`).
  L'état complet du jeu (JSON) est stocké dans `thaayam_parties.etat` ; `version` évite les coups en double.

- Ordinateur : `moteur/ia.js` (`choisirCoup`), utilisé en partie locale (joueur avec `ordi: true`).

## Règles absolues
1. Ne jamais afficher ni committer une clé `sb_secret_…` (la clé publishable et l'URL sont publiques).
2. Ne jamais publier (Netlify, `main`, PR) sans l'accord explicite de Kamal.
3. Tout changement de règle passe par `moteur/` + un test dans `moteur/moteur.test.js` (`npm test`).

## Vérifications
- `npm test` (moteur) ; `cd app && npx expo export --platform web` (l'appli compile).
- Si on modifie `supabase/thaayam.sql`, il doit rester ré-exécutable (`create or replace`, `if not exists`).
