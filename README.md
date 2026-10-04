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
- Plateau **en croix** (thaayam kattai) : 4 bras de 3 colonnes × 6 cases, 4 cases de coin et un grand centre.
  2 à 4 joueurs, 6 pions chacun, départ sur la croix au bout de son bras.
- 2 dés longs à faces 0, 1, 2, 3 : on additionne, et 0 + 0 = 12.
- Un pion entre avec un « thaayam » (total de 1) ; on rejoue avec 1, 5, 6, 12 et après une capture.
- Tour complet de la croix dans le sens inverse des aiguilles d'une montre (par les colonnes extérieures des bras
  et les cases de coin), retour sur la case de départ, puis remontée de la colonne du milieu de son bras jusqu'au
  centre (arrivée exacte).
- Croix (refuges) : bout de chaque bras, case du milieu au bord du centre, 4 cases de coin, centre.
- Il faut avoir capturé un pion adverse pour entrer à l'intérieur ; un seul pion par case hors refuges.

Tout est réglable avant la partie : plateau en croix ou carré (5/7/9), 1 à 12 pions, dés longs ou cauris, valeurs d'entrée et de
relance, sens de rotation, refuges, capture obligatoire, arrivée exacte, un pion par case.

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

### 4. Publier la page web (Netlify)
Créer un site Netlify relié à ce dépôt : `netlify.toml` est déjà prêt (dossier publié : `web/`).

## Limites connues
- En ligne, le serveur vérifie que c'est bien ton tour et que personne n'a joué entre-temps, mais les coups
  eux-mêmes sont calculés par l'appli : c'est fait pour jouer entre amis, pas pour un tournoi.
- Les parties terminées restent dans la base (on pourra ajouter un ménage automatique).
