# Thaayam (தாயம்)

Jeu de plateau traditionnel tamoul, de la famille du Pachisi et du Ludo, à jouer **en ligne entre amis**,
**contre l'ordinateur** ou **à plusieurs sur un même appareil**. Toutes les règles sont réglables avant la partie.

Deux versions qui partagent le même moteur de jeu :
- `web/` : page web simple (HTML + JavaScript, sans installation) ;
- `app/` : appli Expo / React Native (Android, iOS et web).

## Organisation

| Dossier | Contenu |
|---|---|
| `moteur/` | Règles, plateau, déroulement d'une partie, ordinateur (`ia.js`), jeu en ligne (partagé web + appli) + tests |
| `web/` | La page web (`index.html`, `app.js`, `style.css`, `config.js`) |
| `app/` | L'appli Expo (`App.js`, `src/`) |
| `supabase/thaayam.sql` | Tables et fonctions du jeu en ligne, à exécuter une fois dans Supabase |

## Règles

Par défaut : le **Thaayam / Dayakattai classique** du Tamil Nadu.
- Plateau **en croix** (thaayam kattai) : 4 bras de 3 colonnes × 4 cases, un grand centre, 3 arcs dessinés entre deux bras.
  2 à 4 joueurs, 4 pions chacun ; au début, les pions attendent au centre, du côté de leur bras.
- 2 dés longs à faces 0, 1, 2, 3 : on additionne. 0 + 0 = « Kaapal » : on ne bouge pas et on passe les dés au joueur suivant.
- Un pion entre avec un « thaayam » (total de 1) ; on rejoue avec 1, 5, 6, avec 2 sur chaque dé (2 + 2, mais pas 1 + 3) et après une capture.
- Trajet : le pion sort du centre sur la 1re case de sa colonne (colonne du milieu de son bras), descend sa colonne,
  fait le tour complet de la croix dans le sens inverse des aiguilles d'une montre (par les colonnes extérieures des
  bras, passage direct en diagonale aux arcs), revient au bout de son bras et remonte sa colonne jusqu'au centre
  (arrivée exacte).
- Pas de refuge dans les bras : seul le centre est protégé.
- Il faut avoir capturé un pion adverse pour monter vers le centre.
- On peut empiler ses propres pions sur une case ; un adversaire qui tombe sur le groupe le mange en entier.
  Le joueur mangé peut faire rentrer ce groupe d'un coup avec une valeur qui fait rejouer (1, 5, 6, 2 + 2), ou un seul pion avec 1.

Tout est réglable avant la partie : plateau en croix ou carré (5/7/9), 1 à 12 pions, dés longs ou cauris, valeurs d'entrée et de
relance, sens de rotation, refuges, capture obligatoire, arrivée exacte, un pion par case ou empilement.

## Confort de jeu (page web)
- Les pions avancent case par case ; sons des dés, des captures, de l'arrivée et de la victoire
  (bouton 🔊 pour couper), vibration du téléphone quand un pion est mangé.
- Bouton « Voir le trajet » : dessine le chemin complet de son pion.
- Accueil : « Mes parties en ligne » pour reprendre une partie en cours (et voir si c'est à soi de jouer).
- Accueil : « Mes statistiques » (victoires et défaites contre l'ordinateur par niveau, en ligne, parties à plusieurs).
- En ligne : messages rapides (👏 😂 « Bien joué ! »…) et bouton « Revanche ! » en fin de partie (mêmes joueurs,
  mêmes règles, sans retaper de code).
- Ordinateur en niveau facile (joue au hasard), normal ou fort (il calcule les risques et regarde un lancer plus loin).
- Page « Règles du jeu » avec des dessins (`web/regles.html`, et l'écran « Règles du jeu » dans l'appli), à partager aux amis.

## Mise en route

### 1. Activer le jeu en ligne (une seule fois)
1. Ouvrir le projet Supabase → **SQL Editor** → **New query**.
2. Coller tout le contenu de `supabase/thaayam.sql` et cliquer sur **Run**.

Le jeu utilise le même projet Supabase que Kamal Campus. Tout est préfixé `thaayam_` : rien d'existant n'est
modifié. Pas besoin de compte pour jouer : chaque joueur reçoit un jeton secret gardé sur son appareil.

### 2. Tester la page web
```bash
npm test        # tests du moteur
npm run web     # puis ouvrir http://localhost:8080
```

### 3. Tester l'appli
```bash
cd app
npm install
npx expo start  # puis scanner le QR code avec Expo Go
```

### 4. Publier la page web (Cloudflare)
Le site https://thaayam.kamalraj-28.workers.dev est relié à la branche `main` : chaque push sur `main` le republie
(`wrangler.jsonc` copie le moteur dans `web/moteur` avant la publication). `netlify.toml` reste disponible.

### 5. Installer le site comme une appli
Sur le téléphone, ouvrir le site puis menu du navigateur → « Ajouter à l'écran d'accueil » : Thaayam s'ouvre
alors en plein écran, avec son icône.

### 6. Fabriquer l'appli Android (fichier .apk à installer, sans Play Store)
1. Créer un compte gratuit sur https://expo.dev.
2. Dans le Codespace :
   ```bash
   cd app
   npx eas-cli login
   npx eas-cli build --platform android --profile apk
   ```
3. À la fin, Expo donne un lien (et un QR code) : l'ouvrir sur le téléphone Android pour télécharger et installer
   Thaayam (autoriser l'installation d'applis de sources inconnues si le téléphone le demande).

Pour le Play Store, utiliser le profil `production` (fichier .aab) et un compte développeur Google.

## Limites connues
- En ligne, le serveur vérifie que c'est bien ton tour et que personne n'a joué entre-temps, mais les coups
  eux-mêmes sont calculés par l'appli : c'est fait pour jouer entre amis, pas pour un tournoi.
- Ménage automatique (`thaayam_menage`) : les parties finies ou jamais commencées sont effacées après un jour,
  les parties abandonnées après 7 jours (à chaque création de partie, et chaque nuit si pg_cron est activé).
