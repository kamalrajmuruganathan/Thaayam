# Thaayam (தாயம்)

Jeu de plateau traditionnel tamoul, de la famille du Pachisi et du Ludo, à jouer **en ligne entre amis**
ou **à plusieurs sur un même appareil**. Toutes les règles sont réglables avant la partie.

Deux versions qui partagent le même moteur de jeu :
- `web/` : page web simple (HTML + JavaScript, sans installation) ;
- `app/` : appli Expo / React Native (Android, iOS et web).

## Organisation

| Dossier | Contenu |
|---|---|
| `moteur/` | Règles, plateau, déroulement d'une partie, jeu en ligne (partagé web + appli) + tests |
| `web/` | La page web (`index.html`, `app.js`, `style.css`, `config.js`) |
| `app/` | L'appli Expo (`App.js`, `src/`) |
| `supabase/thaayam.sql` | Tables et fonctions du jeu en ligne, à exécuter une fois dans Supabase |

## Règles réglables

- Plateau 5 × 5, 7 × 7 ou 9 × 9 ; de 1 à 6 pions par joueur ; 2 à 4 joueurs.
- Cauris (2 à 7, valeur quand aucun n'est ouvert : 8, 12…) ou dés longs (nombre et valeurs des faces).
- Valeurs qui font entrer un pion (« thaayam ») et valeurs qui font rejouer ; rejouer après une capture.
- Capture obligatoire avant d'entrer à l'intérieur (sinon on retourne sur l'anneau extérieur).
- Arrivée exacte au centre ou non ; sens de rotation ; sens alterné entre les anneaux.
- Cases refuges : départs et centre, plus (au choix) milieux et coins des anneaux intérieurs.

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
