import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chemin, refuges, cle, cheminCroix, casesCroix, refugesCroix } from './plateau.js';
import { normaliserRegles, valeursPossibles, copieRegles, faitRejouer, nomLancer, REGLES_PAR_DEFAUT } from './regles.js';
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
  assert.equal(refugesCroix().size, 1); // seulement le centre
  for (let cote = 0; cote < 4; cote++) {
    for (const sens of ['anti-horaire', 'horaire']) {
      const { cases: ch, longueurExterieur, debutBoucle } = cheminCroix(cote, sens);
      assert.equal(debutBoucle, 3);
      assert.equal(longueurExterieur, 39);
      assert.equal(ch.length, 44);
      assert.equal(new Set(ch.slice(0, 39).map(cle)).size, 39); // descente + tour : chaque case une fois
      assert.deepEqual(ch[39], ch[3]); // retour au bout de son bras
      ch.slice(0, 40).forEach((p) => assert.ok(cases.has(cle(p)), cle(p)));
      ch.slice(40, 43).forEach((p) => assert.ok(!cases.has(cle(p)), `arc ${cle(p)}`)); // remontée sur les arcs
      for (let i = 1; i < 40; i++) {
        const [a, b] = ch[i - 1], [c, d] = ch[i];
        assert.equal(Math.max(Math.abs(a - c), Math.abs(b - d)), 1, `saut ${i}`);
      }
      assert.deepEqual(ch[43], [5, 5]);
    }
  }
  // Trajet validé par Kamal (cases numérotées de 1 à 48, ligne par ligne) :
  // 38 41 44 47 48 45 42 39 33 … 32 37 40 43 46 47 44 41 38 centre
  const numero = new Map();
  [...cases].map((k) => k.split(',').map(Number)).sort((x, y) => x[0] - y[0] || x[1] - y[1]).forEach((q, i) => numero.set(cle(q), i + 1));
  // puis remontée sur les arcs du coin en bas à gauche : BG3 (en face de 44), BG2 (41), BG1 (38)
  const bas = cheminCroix(0).cases.map((q) => numero.get(cle(q)) || cle(q));
  assert.deepEqual(bas, [38, 41, 44, 47, 48, 45, 42, 39, 33, 34, 35, 36, 28, 20, 19, 18, 17, 12, 9, 6, 3, 2, 1, 4, 7, 10,
    16, 15, 14, 13, 21, 29, 30, 31, 32, 37, 40, 43, 46, 47, '8.268,1.732', '7.561,2.439', '6.854,3.146', '5,5']);
  // Chaque arc est dans l'alignement de la ligne de sa case (milieu de l'arc à 45°)
  const arcs = cheminCroix(0).cases.slice(40, 43);
  [[9, 2.5], [8, 1.5], [7, 0.5]].forEach(([ligne, rayon], i) => {
    assert.ok(Math.abs(arcs[i][0] + 0.5 - (7 + rayon * Math.SQRT1_2)) < 1e-3);
    assert.ok(Math.abs(arcs[i][1] + 0.5 - (4 - rayon * Math.SQRT1_2)) < 1e-3);
    assert.ok(ligne >= 7);
  });
  // Les 4 joueurs remontent chacun par un coin différent
  const coinsArcs = new Set([0, 1, 2, 3].map((c) => cle(cheminCroix(c).cases[41])));
  assert.equal(coinsArcs.size, 4);
  // Un autre joueur ne passe jamais dans la colonne du rouge (sauf au bout du bras)
  const autres = new Set([1, 2, 3].flatMap((c) => cheminCroix(c).cases.map(cle)));
  [38, 41, 44].forEach((k) => assert.ok(![...autres].some((x) => numero.get(x) === k), `case ${k}`));
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
  assert.deepEqual(valeursPossibles(REGLES_PAR_DEFAUT), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(valeursPossibles(CAURIS5), [1, 2, 3, 4, 8]);
  const r = copieRegles();
  r.des = { ...r.des, nbDes: 2, faces: [1, 2, 3, 4] };
  assert.deepEqual(valeursPossibles(r), [2, 3, 4, 5, 6, 7, 8]);
});

test('dés longs : 0 + 0 = Kaapal, les dés passent au joueur suivant', () => {
  const zero = () => 0; // face d'indice 0 = 0
  const k = tirerDes(REGLES_PAR_DEFAUT, zero);
  assert.equal(k.valeur, 0);
  assert.equal(nomLancer(REGLES_PAR_DEFAUT, k), 'Kaapal');
  assert.equal(nomLancer(REGLES_PAR_DEFAUT, { valeur: 3, detail: [1, 2] }), '3');
  const vals = new Set();
  for (let i = 0; i < 3000; i++) vals.add(tirerDes(REGLES_PAR_DEFAUT).valeur);
  assert.deepEqual([...vals].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6]);

  let e = nouvellePartie(REGLES_PAR_DEFAUT, [{ nom: 'A' }, { nom: 'B' }]);
  e.joueurs[0].pions[0] = 3; // un pion dehors : il ne bouge pas quand même
  e = lancer(e, undefined, { valeur: 0, detail: [0, 0] });
  assert.equal(e.tour, 1);
  assert.equal(e.joueurs[0].pions[0], 3);
  assert.match(e.journal.at(-1), /Kaapal : les dés passent au joueur suivant/);
  // L'ancien réglage reste possible : 0 + 0 = 12.
  const r = copieRegles();
  r.des.valeurToutZero = 12;
  assert.equal(tirerDes(r, zero).valeur, 12);
});

test('on rejoue avec 1, 5, 6 et avec 2 sur chaque dé (pas 1 + 3)', () => {
  const R = REGLES_PAR_DEFAUT;
  const d = (a, b) => ({ valeur: a + b, detail: [a, b] });
  assert.ok(faitRejouer(R, d(2, 2))); // 4 avec 2 + 2 : on rejoue
  assert.ok(!faitRejouer(R, d(1, 3))); // 4 avec 1 + 3 : on ne rejoue pas
  assert.ok(!faitRejouer(R, d(1, 1))); // autre double : non
  for (const [a, b] of [[0, 1], [2, 3], [3, 3]]) assert.ok(faitRejouer(R, d(a, b)), `${a}+${b}`);
  for (const [a, b] of [[0, 0], [0, 2], [1, 2], [0, 3]]) assert.ok(!faitRejouer(R, d(a, b)), `${a}+${b}`);
  assert.deepEqual(normaliserRegles({}).regles.doublesRejouer, [2]);

  let e = nouvellePartie(R, [{ nom: 'A' }, { nom: 'B' }]);
  e.joueurs[0].pions[0] = 0;
  e = jouer(lancer(e, undefined, d(2, 2)), 0);
  assert.equal(e.tour, 0); // 2 + 2 : A rejoue
  e = jouer(lancer(e, undefined, d(1, 3)), 0);
  assert.equal(e.tour, 1); // 1 + 3 : au tour de B
});

test('un seul pion par case sauf refuge (si la règle est cochée)', () => {
  let e = nouvellePartie({ ...REGLES_PAR_DEFAUT, unPionParCase: true }, [{ nom: 'A' }, { nom: 'B' }]);
  e.joueurs[0].pions[0] = 2;
  e.joueurs[0].pions[1] = 4;
  e = lancer(e, undefined, t(2));
  assert.ok(!coupsPossibles(e).some((c) => c.pion === 0)); // 4 est déjà pris
  assert.ok(coupsPossibles(e).some((c) => c.pion === 1));
});

test('par défaut : 4 pions, on empile, et le groupe est mangé en entier', () => {
  assert.equal(REGLES_PAR_DEFAUT.nbPions, 4);
  assert.equal(normaliserRegles({}).regles.unPionParCase, false);
  let e = nouvellePartie(REGLES_PAR_DEFAUT, [{ nom: 'A' }, { nom: 'B' }]);
  assert.equal(e.joueurs[0].pions.length, 4);
  e.joueurs[0].pions[0] = 2;
  e.joueurs[0].pions[1] = 4;
  e = jouer(lancer(e, undefined, t(2)), 0);
  assert.deepEqual(e.joueurs[0].pions.slice(0, 2), [4, 4]); // deux pions rouges empilés
  // B tombe sur le groupe : les deux pions de A retournent à la maison.
  const g = geometrie(e.regles, 2);
  const iB = g.chemins[1].findIndex((p) => cle(p) === cle(g.chemins[0][4]));
  e.tour = 1;
  e.joueurs[1].pions[0] = iB - 3;
  e = lancer(e, undefined, t(3));
  assert.equal(coupsPossibles(e).find((c) => c.pion === 0).captures.length, 2);
  e = jouer(e, 0);
  assert.deepEqual(e.joueurs[0].pions.slice(0, 2), [-1, -1]);
  assert.equal(e.joueurs[1].captures, 2);
});

test('un groupe mangé d’un coup rentre d’un coup avec une valeur qui fait rejouer', () => {
  const d = (a, b) => ({ valeur: a + b, detail: [a, b] });
  let e = nouvellePartie(REGLES_PAR_DEFAUT, [{ nom: 'A' }, { nom: 'B' }]);
  const g = geometrie(e.regles, 2);
  // Deux pions de A empilés, B tombe dessus et mange le groupe.
  e.joueurs[0].pions[0] = 4;
  e.joueurs[0].pions[1] = 4;
  const iB = g.chemins[1].findIndex((p) => cle(p) === cle(g.chemins[0][4]));
  e.tour = 1;
  e.joueurs[1].pions[0] = iB - 3;
  e = jouer(lancer(e, undefined, d(1, 2)), 0);
  assert.deepEqual(e.joueurs[0].groupes, [[0, 1]]);
  assert.equal(e.tour, 1); // B rejoue après sa capture
  e = lancer(e, undefined, d(0, 0)); // Kaapal : les dés passent à A
  assert.equal(e.tour, 0);

  // Avec 1 + 2 (pas de relance), le groupe ne peut pas rentrer.
  let x = lancer(e, undefined, d(1, 2));
  assert.ok(!coupsPossibles(x).some((c) => c.groupe));
  // Avec 5, 6 ou 2 + 2 : le groupe peut rentrer d'un coup (et pas un pion seul).
  for (const t of [d(2, 3), d(3, 3), d(2, 2)]) {
    x = lancer(e, undefined, t);
    const cs = coupsPossibles(x);
    assert.deepEqual(cs.find((c) => c.groupe).groupe, [0, 1]);
    assert.ok(!cs.some((c) => c.depuis === -1 && !c.groupe));
  }
  // Avec 1 : au choix, un seul pion ou tout le groupe.
  x = lancer(e, undefined, d(0, 1));
  const cs = coupsPossibles(x);
  assert.ok(cs.some((c) => c.depuis === -1 && !c.groupe));
  assert.ok(cs.some((c) => c.groupe));
  const seul = jouer(x, 0);
  assert.deepEqual(seul.joueurs[0].pions.slice(0, 3), [0, -1, -1]);
  assert.deepEqual(seul.joueurs[0].groupes, []); // le groupe est défait
  const tous = jouer(x, 0, true);
  assert.deepEqual(tous.joueurs[0].pions.slice(0, 3), [0, 0, -1]); // le pion jamais sorti reste à la maison
  assert.deepEqual(tous.joueurs[0].groupes, []);
  assert.equal(tous.tour, 0); // 1 fait rejouer
  assert.match(tous.journal.at(-2), /fait entrer 2 pions d'un coup/);

  // Règle décochée : pas d'entrée en groupe.
  const r = copieRegles();
  r.groupeRentreEnsemble = false;
  x = lancer({ ...e, regles: r }, undefined, d(0, 1));
  assert.ok(!coupsPossibles(x).some((c) => c.groupe));
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
          { const k = c[Math.floor(rng() * c.length)]; e = jouer(e, k.pion, !!k.groupe); }
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
      else if (e.tour === 0) { const k = choisirCoup(e, rng); e = jouer(e, k.pion, !!k.groupe); }
      else {
        const c = coupsPossibles(e);
        { const k = c[Math.floor(rng() * c.length)]; e = jouer(e, k.pion, !!k.groupe); }
      }
    }
    assert.equal(e.phase, 'fini');
    assert.equal(e.joueurs[0].ordi, 'normal');
    if (e.gagnant === 0) victoires++;
  }
  assert.ok(victoires >= N * 0.6, `seulement ${victoires}/${N} victoires`);
});

test("l'ordinateur « fort » bat l'ordinateur « normal »", async () => {
  const { choisirCoup, distributionLancers } = await import('./ia.js');
  const dist = distributionLancers(REGLES_PAR_DEFAUT);
  assert.equal(dist.length, 16);
  assert.ok(Math.abs(dist.reduce((a, d) => a + d.p, 0) - 1) < 1e-9);
  // Générateur pseudo-aléatoire de bonne qualité (mulberry32), pour des parties reproductibles
  let graine = 99;
  const rng = () => {
    graine = (graine + 0x6d2b79f5) | 0;
    let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let victoires = 0;
  const N = 120; // les dés comptent beaucoup : il faut assez de parties
  for (let k = 0; k < N; k++) {
    const niv = k % 2 ? ['normal', 'fort'] : ['fort', 'normal']; // chacun commence à son tour
    let e = nouvellePartie(REGLES_PAR_DEFAUT, niv.map((ordi) => ({ nom: ordi, ordi })));
    let n = 0;
    while (e.phase !== 'fini' && n++ < 100000) {
      if (e.phase === 'lancer') e = lancer(e, rng);
      else { const c = choisirCoup(e, rng); e = jouer(e, c.pion, !!c.groupe); }
    }
    assert.equal(e.phase, 'fini');
    if (niv[e.gagnant] === 'fort') victoires++;
  }
  assert.ok(victoires >= N * 0.5, `seulement ${victoires}/${N} victoires`); // environ 60 % sur 1 000 parties
});

test('statistiques : victoires, défaites, une seule fois par partie en ligne', async () => {
  const { statsVides, noterFin, resumeStats, normaliserStats } = await import('./stats.js');
  const fin = (gagnant, joueurs) => ({ phase: 'fini', gagnant, joueurs });
  let s = statsVides();
  assert.deepEqual(resumeStats(s), []);
  s = noterFin(s, fin(0, [{ nom: 'Moi' }, { nom: 'Ordi', ordi: 'fort' }]), { mode: 'local' });
  s = noterFin(s, fin(1, [{ nom: 'Moi' }, { nom: 'Ordi', ordi: 'fort' }]), { mode: 'local' });
  s = noterFin(s, fin(1, [{ nom: 'Moi' }, { nom: 'Ordi', ordi: 'fort' }]), { mode: 'local' });
  s = noterFin(s, fin(0, [{ nom: 'A' }, { nom: 'B' }]), { mode: 'local' });
  s = noterFin(s, fin(2, [{ nom: 'A' }, { nom: 'B' }, { nom: 'C' }]), { mode: 'ligne', place: 2, code: 'ABCDE' });
  s = noterFin(s, fin(2, [{ nom: 'A' }, { nom: 'B' }, { nom: 'C' }]), { mode: 'ligne', place: 2, code: 'ABCDE' }); // déjà comptée
  s = noterFin(s, { phase: 'deplacer', gagnant: null, joueurs: [] }, { mode: 'local' }); // pas finie
  assert.deepEqual(resumeStats(s), [
    "Contre l'ordinateur (fort) : 1 victoire, 2 défaites",
    'En ligne : 1 victoire, 0 défaite',
    'À plusieurs sur cet appareil : 1 partie',
  ]);
  assert.deepEqual(normaliserStats('n’importe quoi'), statsVides());
  assert.equal(normaliserStats(JSON.parse(JSON.stringify(s))).ordi.fort.d, 2);
});

test('traductions : 5 langues complètes, journal, règles et statistiques', async () => {
  const { TEXTES, LANGUES, traducteur, traduireJournal, traduireErreur, resumeReglesTraduit, resumeStatsTraduit, traduireNom } = await import('./i18n.js');
  const { resumeRegles } = await import('./regles.js');
  const { resumeStats, noterFin, statsVides } = await import('./stats.js');
  assert.deepEqual(LANGUES.map((l) => l.code), ['fr', 'en', 'ta', 'hi', 'si']);
  const cles = Object.keys(TEXTES.fr);
  for (const { code } of LANGUES) {
    assert.deepEqual(cles.filter((k) => !(k in TEXTES[code])), [], `clés manquantes en ${code}`);
    assert.deepEqual(Object.keys(TEXTES[code]).filter((k) => !(k in TEXTES.fr)), [], `clés en trop en ${code}`);
  }
  // En français, les textes traduits sont identiques à ceux du moteur
  const fr = traducteur('fr');
  assert.deepEqual(resumeReglesTraduit(REGLES_PAR_DEFAUT, fr), resumeRegles(REGLES_PAR_DEFAUT));
  let s = statsVides();
  s = noterFin(s, { phase: 'fini', gagnant: 0, joueurs: [{ nom: 'A' }, { nom: 'O', ordi: 'fort' }] }, { mode: 'local' });
  s = noterFin(s, { phase: 'fini', gagnant: 1, joueurs: [{ nom: 'A' }, { nom: 'B' }] }, { mode: 'ligne', place: 0, code: 'X' });
  assert.deepEqual(resumeStatsTraduit(s, fr), resumeStats(s));
  // Le journal d'une vraie partie se traduit entièrement (aucune ligne laissée en français)
  const en = traducteur('en');
  let e = nouvellePartie(REGLES_PAR_DEFAUT, [{ nom: 'Rouge' }, { nom: 'Ordi vert', ordi: true }]);
  let graine = 3;
  const rng = () => ((graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648);
  const lignes = new Set();
  for (let i = 0; i < 4000 && e.phase !== 'fini'; i++) {
    if (e.phase === 'lancer') e = lancer(e, rng);
    else { const c = coupsPossibles(e)[0]; e = jouer(e, c.pion, !!c.groupe); }
    e.journal.forEach((l) => lignes.add(l));
  }
  for (const l of lignes) {
    const tr = traduireJournal(l, en);
    assert.notEqual(tr, l, `non traduit : ${l}`);
    assert.ok(!/ fait | rejoue|pion/.test(tr), `reste du français : ${tr}`);
  }
  assert.equal(traduireJournal('Ordi vert fait 5.', en), 'Computer green throws 5.');
  assert.equal(traduireJournal('Rouge capture 2 pions de Vert et Bleu !', en), 'Red captures 2 pieces from Green and Blue!');
  assert.equal(traduireNom('Kamal', en), 'Kamal');
  assert.equal(traduireErreur("Ce n'est pas ton tour", en), "It's not your turn.");
  assert.equal(traduireErreur("Aucune valeur d'entrée ne peut sortir avec ces dés (valeurs possibles : 2, 3).", en),
    'No entry value can come up with these dice (possible values: 2, 3).');
  assert.equal(traducteur('ta')('joueurN', { n: 2 }), 'வீரர் 2');
});

test('étapes d’un déplacement (animation)', async () => {
  const { etapesCoup } = await import('./partie.js');
  const g = geometrie(REGLES_PAR_DEFAUT, 2);
  assert.deepEqual(etapesCoup(g, 3, 6), [4, 5, 6]);
  assert.deepEqual(etapesCoup(g, -1, 0), [0]);
  assert.deepEqual(etapesCoup(g, 37, 5), [38, 3, 4, 5]); // refait un tour (sans capture)
  assert.deepEqual(etapesCoup(g, 38, 41), [39, 40, 41]); // remonte sa colonne
});

test('revoir une partie : l’historique rejoue exactement la partie (dés longs et cauris)', async () => {
  const { revoirPartie } = await import('./partie.js');
  const { choisirCoup } = await import('./ia.js');
  for (const regles of [REGLES_PAR_DEFAUT, CAURIS5]) {
    let graine = 11;
    const rng = () => ((graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648);
    let e = nouvellePartie(regles, [{ nom: 'A', ordi: 'normal' }, { nom: 'B', ordi: 'facile' }, { nom: 'C', ordi: 'normal' }]);
    for (let i = 0; i < 6000 && e.phase !== 'fini'; i++) {
      if (e.phase === 'lancer') e = lancer(e, rng);
      else { const c = choisirCoup(e, rng); e = jouer(e, c.pion, !!c.groupe); }
    }
    assert.equal(e.phase, 'fini');
    const etats = revoirPartie(e);
    assert.equal(etats.length, e.histo.length + 1);
    assert.deepEqual(etats.at(-1), e);
    assert.ok(JSON.stringify(e.histo).length < 12000, 'historique compact');
  }
  assert.equal(revoirPartie({ ...nouvellePartie(REGLES_PAR_DEFAUT, [{ nom: 'A' }, { nom: 'B' }]), histo: undefined }), null);
  // Historique incomplet (ancienne version du jeu chez un joueur) : pas de plantage
  let e2 = nouvellePartie(REGLES_PAR_DEFAUT, [{ nom: 'A' }, { nom: 'B' }]);
  e2 = lancer(e2, () => 0.3);
  assert.equal(revoirPartie({ ...e2, histo: [] }), null);
  assert.equal(revoirPartie({ ...e2, histo: ['p3'] }), null);
});

test('partie guidée : premiers lancers imposés et conseils traduits', async () => {
  const { nouvellePartieGuidee, lancerGuide, conseilGuide } = await import('./guide.js');
  const { TEXTES } = await import('./i18n.js');
  const { choisirCoup } = await import('./ia.js');
  let e = nouvellePartieGuidee('Kamal');
  assert.equal(e.joueurs[1].ordi, 'facile');
  assert.equal(conseilGuide(e).cle, 'gPremier');
  e = lancer(e, Math.random, lancerGuide(e));
  assert.equal(e.lancer.valeur, 1);
  assert.equal(conseilGuide(e).cle, 'gEntrer');
  e = jouer(e, 0);
  assert.equal(conseilGuide(e).cle, 'gRejoue');
  e = lancer(e, Math.random, lancerGuide(e));
  assert.equal(e.lancer.valeur, 3);
  assert.equal(conseilGuide(e).cle, 'gAvancer');
  assert.equal(lancerGuide(jouer(e, 0)), null);
  // Une partie entière : chaque conseil existe dans les 5 langues
  let graine = 5;
  const rng = () => ((graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648);
  const vus = new Set();
  e = nouvellePartieGuidee();
  for (let i = 0; i < 6000 && e.phase !== 'fini'; i++) {
    vus.add(conseilGuide(e).cle);
    if (e.phase === 'lancer') e = lancer(e, rng, lancerGuide(e));
    else { const c = choisirCoup(e, rng, e.tour === 0 ? 'normal' : 'facile'); e = jouer(e, c.pion, !!c.groupe); }
  }
  vus.add(conseilGuide(e).cle);
  for (const cle of vus) for (const l of Object.keys(TEXTES)) assert.ok(TEXTES[l][cle], `${cle} manque en ${l}`);
  assert.ok(vus.size >= 8, [...vus].join(', '));
});

test('classement : niveaux et tri', async () => {
  const { niveauJoueur, trierClassement } = await import('./classement.js');
  assert.deepEqual([0, 2, 3, 9, 10, 25, 50, 80].map((v) => niveauJoueur(v).cle),
    ['nvDebutant', 'nvDebutant', 'nvApprenti', 'nvApprenti', 'nvConfirme', 'nvExpert', 'nvMaitre', 'nvMaitre']);
  assert.equal(niveauJoueur(1).prochain, 2);
  assert.equal(niveauJoueur(60).prochain, null);
  const c = trierClassement([
    { pseudo: 'B', victoires: 3, parties: 10 }, { pseudo: 'A', victoires: 3, parties: 4 },
    { pseudo: 'C', victoires: 0, parties: 0, moi: true }, { pseudo: 'D', victoires: 3, parties: 4 },
  ]);
  assert.deepEqual(c.map((x) => `${x.rang}${x.pseudo}`), ['1A', '1D', '3B', '4C']);
});

test('thèmes : chaque thème a toutes les couleurs', async () => {
  const { THEMES_PLATEAU, THEMES, themeValide } = await import('./themes.js');
  const { TEXTES } = await import('./i18n.js');
  const cles = Object.keys(THEMES_PLATEAU.cristal).sort();
  for (const { code } of THEMES) {
    assert.deepEqual(Object.keys(THEMES_PLATEAU[code]).sort(), cles, code);
    assert.ok(TEXTES.ta[code], `nom du thème ${code}`);
  }
  assert.equal(themeValide('nuit'), 'nuit');
  assert.equal(themeValide('xxx'), 'cristal');
});

test('jeu sans internet : le service worker garde tous les fichiers du moteur', async () => {
  const fs = await import('node:fs');
  const sw = fs.readFileSync(new URL('../web/sw.js', import.meta.url), 'utf8');
  const moteur = fs.readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));
  for (const f of moteur) assert.ok(sw.includes(`'moteur/${f}'`), `moteur/${f} absent de web/sw.js`);
  for (const f of fs.readdirSync(new URL('../web', import.meta.url)).filter((x) => /\.(js|html|css|png|webmanifest)$/.test(x) && x !== 'sw.js')) {
    assert.ok(sw.includes(`'${f}'`), `${f} absent de web/sw.js`);
  }
});

test('règles de déplacement fixes (plus de choix dans les réglages)', async () => {
  const { REGLES_FIXES, avecReglesFixes } = await import('./regles.js');
  const r = avecReglesFixes({ ...REGLES_PAR_DEFAUT, unPionParCase: true, arriveeExacte: false, sens: 'horaire',
    captureAvantInterieur: false, rejouerApresCapture: false, groupeRentreEnsemble: false });
  for (const [k, v] of Object.entries(REGLES_FIXES)) assert.equal(r[k], v, k);
  for (const k of Object.keys(REGLES_FIXES)) assert.equal(REGLES_PAR_DEFAUT[k], REGLES_FIXES[k], `défaut ${k}`);
  assert.equal(normaliserRegles(r).erreurs.length, 0);
});

test('sortie obligatoire : avec un 1 et des pions au centre, on doit en faire sortir un', () => {
  let e = nouvellePartie(REGLES_PAR_DEFAUT, [{ nom: 'A' }, { nom: 'B' }]);
  e.joueurs[0].pions = [5, -1, -1, -1];
  e = lancer(e, Math.random, { valeur: 1, detail: [1, 0] });
  const coups = coupsPossibles(e);
  assert.ok(coups.length > 0 && coups.every((c) => c.depuis === -1), JSON.stringify(coups));
  assert.throws(() => jouer(e, 0));
  // Plus aucun pion au centre : le 1 fait avancer
  let f = nouvellePartie(REGLES_PAR_DEFAUT, [{ nom: 'A' }, { nom: 'B' }]);
  f.joueurs[0].pions = [5, 7, 9, 11];
  f = lancer(f, Math.random, { valeur: 1, detail: [1, 0] });
  assert.equal(coupsPossibles(f).length, 4);
  // Règle désactivée (ancienne partie) : on peut choisir
  let g = nouvellePartie({ ...REGLES_PAR_DEFAUT, sortieObligatoire: false }, [{ nom: 'A' }, { nom: 'B' }]);
  g.joueurs[0].pions = [5, -1, -1, -1];
  g = lancer(g, Math.random, { valeur: 1, detail: [1, 0] });
  assert.ok(coupsPossibles(g).some((c) => c.depuis === 5));
});

test('sortie obligatoire : rentrer un groupe avec un 5 reste un choix', () => {
  let e = nouvellePartie(REGLES_PAR_DEFAUT, [{ nom: 'A' }, { nom: 'B' }]);
  e.joueurs[0].pions = [5, -1, -1, 9];
  e.joueurs[0].groupes = [[1, 2]];
  e = lancer(e, Math.random, { valeur: 5, detail: [3, 2] });
  const coups = coupsPossibles(e);
  assert.ok(coups.some((c) => c.groupe) && coups.some((c) => c.depuis === 5), JSON.stringify(coups));
});

test('dé classique de 1 à 6 : on rejoue avec 1, 5 et 6, le 1 fait entrer', async () => {
  const { PRESETS_DES, resumeRegles } = await import('./regles.js');
  const { resumeReglesTraduit, traducteur } = await import('./i18n.js');
  const { choisirCoup } = await import('./ia.js');
  const r = normaliserRegles({ ...REGLES_PAR_DEFAUT, des: { type: 'de6', nbDes: 3, faces: [0, 1] }, ...PRESETS_DES.de6 });
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.regles.des.nbDes, 1);
  assert.deepEqual(valeursPossibles(r.regles), [1, 2, 3, 4, 5, 6]);
  for (const v of [1, 2, 3, 4, 5, 6]) assert.equal(faitRejouer(r.regles, { valeur: v, detail: [v] }), [1, 5, 6].includes(v), `valeur ${v}`);
  assert.equal(nomLancer(r.regles, { valeur: 6, detail: [6] }), '6');
  assert.deepEqual(resumeReglesTraduit(r.regles, traducteur('fr')), resumeRegles(r.regles));
  // Une partie complète avec le dé classique, et on peut la revoir
  const { revoirPartie } = await import('./partie.js');
  let e = nouvellePartie(r.regles, [{ nom: 'A', ordi: 'normal' }, { nom: 'B', ordi: 'fort' }]);
  for (let i = 0; i < 8000 && e.phase !== 'fini'; i++) {
    if (e.phase === 'lancer') e = lancer(e);
    else { const c = choisirCoup(e); e = jouer(e, c.pion, !!c.groupe); }
  }
  assert.equal(e.phase, 'fini');
  assert.deepEqual(revoirPartie(e).at(-1), e);
});
