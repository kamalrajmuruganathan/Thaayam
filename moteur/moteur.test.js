import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chemin, refuges, cle } from './plateau.js';
import { normaliserRegles, valeursPossibles, copieRegles, REGLES_PAR_DEFAUT } from './regles.js';
import { nouvellePartie, lancer, jouer, coupsPossibles, geometrie, tirerDes } from './partie.js';

const voisins = ([a, b], [c, d]) => Math.max(Math.abs(a - c), Math.abs(b - d)) === 1;

test('chaque chemin passe une fois par chaque case et finit au centre', () => {
  for (const n of [5, 7, 9])
    for (const sens of ['anti-horaire', 'horaire'])
      for (const alt of [true, false])
        for (let cote = 0; cote < 4; cote++) {
          const { cases, longueurExterieur } = chemin(n, cote, sens, alt);
          assert.equal(cases.length, n * n);
          assert.equal(new Set(cases.map(cle)).size, n * n);
          const m = (n - 1) / 2;
          assert.deepEqual(cases.at(-1), [m, m]);
          for (let i = 1; i < cases.length; i++) assert.ok(voisins(cases[i - 1], cases[i]), `saut ${n} ${i}`);
          assert.equal(longueurExterieur, 4 * (n - 1));
        }
});

test('le départ est au milieu du côté, sens anti-horaire', () => {
  const { cases } = chemin(5, 0);
  assert.deepEqual(cases.slice(0, 3), [[4, 2], [4, 3], [4, 4]]);
  assert.deepEqual(chemin(5, 1).cases[0], [2, 4]);
  assert.deepEqual(chemin(5, 2).cases[0], [0, 2]);
  assert.deepEqual(chemin(5, 3).cases[0], [2, 0]);
});

test('refuges', () => {
  assert.equal(refuges(5).size, 5);
  assert.equal(refuges(7, { milieuxInterieurs: true, coinsInterieurs: true }).size, 5 + 2 * 8);
});

test('valeurs possibles', () => {
  assert.deepEqual(valeursPossibles(REGLES_PAR_DEFAUT), [1, 2, 3, 4, 8]);
  const r = copieRegles();
  r.des = { ...r.des, type: 'desLongs', nbDes: 2, faces: [1, 2, 3, 4] };
  assert.deepEqual(valeursPossibles(r), [2, 3, 4, 5, 6, 7, 8]);
});

test('règles incohérentes refusées', () => {
  const r = copieRegles();
  r.valeursEntree = [5];
  assert.ok(normaliserRegles(r).erreurs.length > 0);
  r.valeursEntree = [1];
  r.valeursRejouer = [1, 2, 3, 4, 8];
  assert.ok(normaliserRegles(r).erreurs.length > 0);
  assert.equal(normaliserRegles(REGLES_PAR_DEFAUT).erreurs.length, 0);
});

const t = (valeur) => ({ valeur, detail: [] });

test('entrée, rejouer, capture', () => {
  let e = nouvellePartie(REGLES_PAR_DEFAUT, [{ nom: 'A' }, { nom: 'B' }]);
  e = lancer(e, undefined, t(2)); // aucun pion dehors, 2 ne fait pas entrer
  assert.equal(e.tour, 1);
  e = lancer(e, undefined, t(1));
  assert.equal(coupsPossibles(e).length, 1);
  e = jouer(e, 0);
  assert.equal(e.joueurs[1].pions[0], 0);
  assert.equal(e.tour, 1); // 1 fait rejouer
  e = lancer(e, undefined, t(3));
  e = jouer(e, 0);
  assert.equal(e.tour, 0);

  // B est à l'indice 3 de son chemin ; A le capture.
  const g = geometrie(e.regles, 2);
  const caseB = cle(g.chemins[1][3]);
  const iA = g.chemins[0].findIndex((p) => cle(p) === caseB);
  e.joueurs[0].pions[0] = iA - 2;
  e = lancer(e, undefined, t(2));
  const coup = coupsPossibles(e).find((c) => c.pion === 0);
  assert.equal(coup.captures.length, 1);
  e = jouer(e, 0);
  assert.equal(e.joueurs[1].pions[0], -1);
  assert.equal(e.joueurs[0].captures, 1);
  assert.equal(e.tour, 0); // rejoue après capture
});

test("sans capture, le pion reste sur l'anneau extérieur", () => {
  let e = nouvellePartie(REGLES_PAR_DEFAUT, [{ nom: 'A' }, { nom: 'B' }]);
  e.joueurs[0].pions[0] = 14;
  e = lancer(e, undefined, t(3));
  e = jouer(e, 0);
  assert.equal(e.joueurs[0].pions[0], 1);
  e.joueurs[0].captures = 1;
  e.joueurs[0].pions[0] = 14;
  e.tour = 0;
  e = lancer(e, undefined, t(3));
  e = jouer(e, 0);
  assert.equal(e.joueurs[0].pions[0], 17);
});

test('arrivée exacte et victoire', () => {
  const r = copieRegles();
  r.nbPions = 1;
  let e = nouvellePartie(r, [{ nom: 'A' }, { nom: 'B' }]);
  e.joueurs[0].captures = 1;
  e.joueurs[0].pions[0] = 22; // arrivée = 24
  e = lancer(e, undefined, t(3));
  assert.equal(e.tour, 1); // 3 dépasse : aucun coup
  e.tour = 0;
  e = lancer(e, undefined, t(2));
  e = jouer(e, 0);
  assert.equal(e.phase, 'fini');
  assert.equal(e.gagnant, 0);
});

test('parties aléatoires complètes sans erreur', () => {
  let graine = 42;
  const rng = () => ((graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const taille of [5, 7]) {
    for (const nb of [2, 3, 4]) {
      const r = copieRegles();
      r.taille = taille;
      r.rejouerApresCapture = false;
      let e = nouvellePartie(r, Array.from({ length: nb }, (_, i) => ({ nom: `J${i}` })));
      let n = 0;
      while (e.phase !== 'fini' && n++ < 200000) {
        if (e.phase === 'lancer') e = lancer(e, rng);
        else {
          const c = coupsPossibles(e);
          e = jouer(e, c[Math.floor(rng() * c.length)].pion);
        }
      }
      assert.equal(e.phase, 'fini', `partie ${taille} ${nb} non terminée`);
    }
  }
});

test('tirage des cauris', () => {
  const vals = new Set();
  for (let i = 0; i < 2000; i++) vals.add(tirerDes(REGLES_PAR_DEFAUT).valeur);
  assert.deepEqual([...vals].sort((a, b) => a - b), [1, 2, 3, 4, 8]);
});
