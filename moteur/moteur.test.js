import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chemin, refuges, cle, cheminCroix, casesCroix, refugesCroix } from './plateau.js';
import { normaliserRegles, valeursPossibles, copieRegles, REGLES_PAR_DEFAUT } from './regles.js';
import { nouvellePartie, lancer, jouer, coupsPossibles, geometrie, tirerDes } from './partie.js';

const t = (valeur) => ({ valeur, detail: [] });
const CAURIS5 = normaliserRegles({ forme: 'carre', taille: 5, nbPions: 4, des: { type: 'cauris', nbCauris: 4, valeurZero: 8 }, valeursEntree: [1], valeursRejouer: [1, 4, 8], sensInterieurs: 'alterne' }).regles;
const voisins = ([a, b], [c, d]) => Math.max(Math.abs(a - c), Math.abs(b - d)) === 1;

test('chaque chemin passe une fois par chaque case et finit au centre', () => {
  for (const n of [5, 7, 9])
    for (const sens of ['anti-horaire', 'horaire'])
      for (const alt of ['inverse', 'meme', 'alterne'])
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
  assert.equal(refuges(7, { coinsDeuxiemeAnneau: true }).size, 9);
  assert.ok(refuges(7, { coinsDeuxiemeAnneau: true }).has('5,1'));
  assert.equal(refuges(7, { milieuxInterieurs: true, coinsDeuxiemeAnneau: true }).size, 5 + 8 + 4);
});

test('plateau en croix : chemin, cases et croix', () => {
  const cases = casesCroix();
  assert.equal(cases.size, 4 * 12);
  assert.equal(refugesCroix().size, 9);
  for (let cote = 0; cote < 4; cote++) {
    for (const sens of ['anti-horaire', 'horaire']) {
      const { cases: ch, longueurExterieur } = cheminCroix(cote, sens);
      assert.equal(longueurExterieur, 36);
      assert.equal(ch.length, 41);
      assert.equal(new Set(ch.slice(0, 36).map(cle)).size, 36);
      assert.deepEqual(ch[36], ch[0]); // retour sur la case de départ
      ch.slice(0, 40).forEach((p) => assert.ok(cases.has(cle(p)), cle(p)));
      for (let i = 1; i < 40; i++) {
        const [a, b] = ch[i - 1], [c, d] = ch[i];
        assert.equal(Math.max(Math.abs(a - c), Math.abs(b - d)), 1, `saut ${i}`);
      }
      assert.deepEqual(ch[40], [5, 5]);
    }
  }
  const bas = cheminCroix(0).cases;
  assert.deepEqual(bas.slice(0, 3), [[10, 5], [10, 6], [9, 6]]);
  assert.deepEqual(bas.slice(4, 6), [[7, 6], [6, 7]]); // passage en diagonale par les arcs
  assert.deepEqual(bas.slice(36, 41), [[10, 5], [9, 5], [8, 5], [7, 5], [5, 5]]);
});

test('7 × 7 classique : extérieur anti-horaire, puis intérieur horaire par le coin en croix', () => {
  const { cases } = chemin(7, 0, 'anti-horaire', 'inverse');
  assert.equal(REGLES_PAR_DEFAUT.forme, 'croix');
  assert.deepEqual(cases.slice(0, 2), [[6, 3], [6, 4]]);
  assert.deepEqual(cases.slice(23, 26), [[6, 2], [5, 2], [5, 1]]);
  assert.deepEqual(cases.slice(39, 41), [[5, 3], [4, 3]]);
  assert.deepEqual(cases.at(-1), [3, 3]);
});

test('valeurs possibles', () => {
  assert.deepEqual(valeursPossibles(REGLES_PAR_DEFAUT), [1, 2, 3, 4, 5, 6, 12]);
  assert.deepEqual(valeursPossibles(CAURIS5), [1, 2, 3, 4, 8]);
  const r = copieRegles();
  r.des = { ...r.des, nbDes: 2, faces: [1, 2, 3, 4] };
  assert.deepEqual(valeursPossibles(r), [2, 3, 4, 5, 6, 7, 8]);
});

test('dés longs : 0 + 0 = 12', () => {
  const zero = () => 0; // face d'indice 0 = 0
  assert.equal(tirerDes(REGLES_PAR_DEFAUT, zero).valeur, 12);
  const vals = new Set();
  for (let i = 0; i < 3000; i++) vals.add(tirerDes(REGLES_PAR_DEFAUT).valeur);
  assert.deepEqual([...vals].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 12]);
});

test('un seul pion par case sauf refuge', () => {
  let e = nouvellePartie(REGLES_PAR_DEFAUT, [{ nom: 'A' }, { nom: 'B' }]);
  e.joueurs[0].pions[0] = 2;
  e.joueurs[0].pions[1] = 4;
  e = lancer(e, undefined, t(2));
  assert.ok(!coupsPossibles(e).some((c) => c.pion === 0)); // 4 est déjà pris
  assert.ok(coupsPossibles(e).some((c) => c.pion === 1));
});

test('règles incohérentes refusées', () => {
  const r = copieRegles(CAURIS5);
  r.valeursEntree = [5];
  assert.ok(normaliserRegles(r).erreurs.length > 0);
  r.valeursEntree = [1];
  r.valeursRejouer = [1, 2, 3, 4, 8];
  assert.ok(normaliserRegles(r).erreurs.length > 0);
  assert.equal(normaliserRegles(CAURIS5).erreurs.length, 0);
});


test('entrée, rejouer, capture', () => {
  let e = nouvellePartie(CAURIS5, [{ nom: 'A' }, { nom: 'B' }]);
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
  let e = nouvellePartie(CAURIS5, [{ nom: 'A' }, { nom: 'B' }]);
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
  const r = copieRegles(CAURIS5);
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
      const r = copieRegles(nb === 2 ? REGLES_PAR_DEFAUT : CAURIS5);
      r.taille = taille;
      if (nb === 4) r.forme = 'croix';
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
  for (let i = 0; i < 2000; i++) vals.add(tirerDes(CAURIS5).valeur);
  assert.deepEqual([...vals].sort((a, b) => a - b), [1, 2, 3, 4, 8]);
});

test("l'ordinateur termine ses parties et bat un joueur au hasard", async () => {
  const { choisirCoup } = await import('./ia.js');
  let graine = 7;
  const rng = () => ((graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648);
  let victoires = 0;
  const N = 20;
  for (let k = 0; k < N; k++) {
    let e = nouvellePartie(REGLES_PAR_DEFAUT, [{ nom: 'Ordi', ordi: true }, { nom: 'Hasard' }]);
    let n = 0;
    while (e.phase !== 'fini' && n++ < 200000) {
      if (e.phase === 'lancer') e = lancer(e, rng);
      else if (e.tour === 0) e = jouer(e, choisirCoup(e, rng).pion);
      else {
        const c = coupsPossibles(e);
        e = jouer(e, c[Math.floor(rng() * c.length)].pion);
      }
    }
    assert.equal(e.phase, 'fini');
    assert.equal(e.joueurs[0].ordi, 'normal');
    if (e.gagnant === 0) victoires++;
  }
  assert.ok(victoires >= N * 0.6, `seulement ${victoires}/${N} victoires`);
});

test('étapes d’un déplacement (animation)', async () => {
  const { etapesCoup } = await import('./partie.js');
  const g = geometrie(REGLES_PAR_DEFAUT, 2);
  assert.deepEqual(etapesCoup(g, 3, 6), [4, 5, 6]);
  assert.deepEqual(etapesCoup(g, -1, 0), [0]);
  assert.deepEqual(etapesCoup(g, 34, 2), [35, 0, 1, 2]); // refait un tour
  assert.deepEqual(etapesCoup(g, 38, 40), [39, 40]);
});
