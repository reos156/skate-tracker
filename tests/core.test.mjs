import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTime,
  formatTime,
  rankResults,
  gapPct,
  isComparableInSeconds,
  project,
  normalizeName,
  matchAthlete,
  extractRowsFromOcr,
  extractRowsFromText,
  sameClub,
} from '../src/core.js';

test('parseTime reads the sheet format min\'sec"ms', () => {
  assert.equal(parseTime(`0'25"828`), 25828);
  assert.equal(parseTime(`1'05"989`), 65989);
  assert.equal(parseTime(`2'14"779`), 134779);
  assert.equal(parseTime(`0'17"546`), 17546);
});

test('parseTime accepts typographic quotes and stray spaces', () => {
  assert.equal(parseTime('0\u201925\u201d828'), 25828);
  assert.equal(parseTime(`  0'25"828 `), 25828);
});

test('parseTime acepta las formas que deja el OCR al perder el apóstrofo', () => {
  // Evidencia real: 2'01"424 sale como 201424 o 201"424, y 0'18"222 como 018"222.
  assert.equal(parseTime(`201"424`), 121424);
  assert.equal(parseTime('201424'), 121424);
  assert.equal(parseTime(`018"222`), 18222);
  assert.equal(parseTime('18447'), 18447);
  assert.equal(parseTime('214779'), 134779);
  assert.equal(parseTime('25828'), 25828);
});

test('parseTime sigue rechazando lo que no es un tiempo', () => {
  assert.equal(parseTime('DNF'), null);
  assert.equal(parseTime('ELIM'), null);
  assert.equal(parseTime(''), null);
  assert.equal(parseTime(null), null);
  assert.equal(parseTime(`0'25"`), null);
  assert.equal(parseTime('2102306'), null, 'siete dígitos son ambiguos');
  assert.equal(parseTime('405'), null, 'un dorsal no es un tiempo');
  assert.equal(parseTime(`0'75"000`), null, 'setenta y cinco segundos no existe');
});

test('formatTime prints minutes even when they are zero', () => {
  assert.equal(formatTime(25828), `0'25"828`);
  assert.equal(formatTime(134779), `2'14"779`);
  assert.equal(formatTime(59000), `0'59"000`);
  assert.equal(formatTime(null), '—');
});

test('rankResults uses competition ranking so ties share the place', () => {
  const rows = [
    { id: 'a', ms: 61587 },
    { id: 'b', ms: 61587 },
    { id: 'c', ms: 62966 },
    { id: 'd', ms: 65989 },
  ];
  assert.deepEqual(rankResults(rows).map((r) => r.pos), [1, 1, 3, 4]);
});

test('rankResults keeps statuses without a time out of the ranking', () => {
  const rows = [
    { id: 'a', ms: 23946 },
    { id: 'dnf', ms: null, status: 'dnf' },
    { id: 'b', ms: 24660 },
    { id: 'elim', ms: null, status: 'elim' },
  ];
  const ranked = rankResults(rows);
  assert.deepEqual(ranked.filter((r) => r.status === 'ok').map((r) => r.pos), [1, 2]);
  assert.equal(ranked.find((r) => r.id === 'dnf').pos, null);
  assert.equal(ranked.find((r) => r.id === 'elim').pos, null);
});

test('gapPct reports the percentage behind the reference', () => {
  assert.equal(gapPct(25828, 23946).toFixed(2), '7.86');
  assert.equal(gapPct(23946, 23946), 0);
  assert.equal(gapPct(null, 23946), null);
});

test('isComparableInSeconds is false when the basis changed', () => {
  const v1 = { id: 'a', ms: 65989, distanceM: null, circuit: null };
  const v2 = { id: 'b', ms: 134779, distanceM: 600, circuit: null };
  const h14 = { id: 'c', ms: 16322, distanceM: null, circuit: '14' };
  const h19 = { id: 'd', ms: 18447, distanceM: null, circuit: '19' };
  const same = { id: 'e', ms: 25828, distanceM: 200, circuit: null };

  assert.equal(isComparableInSeconds(v1, v2), false);
  assert.equal(isComparableInSeconds(h14, h19), false);
  assert.equal(isComparableInSeconds(same, { ...same, id: 'f' }), true);
});

test('project refuses to extrapolate from two points', () => {
  const one = project([{ index: 0, ms: 25923 }]);
  const two = project([{ index: 0, ms: 25923 }, { index: 1, ms: 25828 }]);

  assert.equal(one.status, 'insufficient');
  assert.equal(one.need, 3);
  assert.equal(two.status, 'insufficient');
  assert.equal(two.have, 2);
  assert.equal(two.need, 3);
  assert.equal(two.nextMs, undefined);
});

test('project extrapolates a straight trend once three points exist', () => {
  const p = project([
    { index: 0, ms: 26200 },
    { index: 1, ms: 26000 },
    { index: 2, ms: 25800 },
  ]);
  assert.equal(p.status, 'ready');
  assert.equal(Math.round(p.slopeMsPerValida), -200);
  assert.equal(Math.round(p.nextMs), 25600);
});

test('normalizeName folds accents, case and spacing', () => {
  assert.equal(normalizeName('  Salomé   Rendón Erazo '), 'salome rendon erazo');
  assert.equal(normalizeName('MARIANGEL GONZÁLEZ  CASAS'), 'mariangel gonzalez casas');
});

test('matchAthlete resolves a printed name against the roster', () => {
  const roster = [
    { id: 'salome-rendon', name: 'Salomé Rendón Erazo' },
    { id: 'salome-munoz', name: 'Salomé Muñoz Hernández' },
  ];
  assert.equal(matchAthlete('SALOME RENDON ERAZO', roster).id, 'salome-rendon');
  assert.equal(matchAthlete('salomé rendón erazo', roster).id, 'salome-rendon');
  assert.equal(matchAthlete('SALOME MUÑOZ HERNANDEZ', roster).id, 'salome-munoz');
  assert.equal(matchAthlete('Pepito Nadie', roster), null);
});

test('extractRowsFromOcr pairs each time with the name on its line', () => {
  const words = [
    { text: 'SALOME', x0: 110, y0: 200, x1: 180, y1: 214 },
    { text: 'RENDON', x0: 186, y0: 200, x1: 250, y1: 214 },
    { text: 'ERAZO', x0: 256, y0: 200, x1: 312, y1: 214 },
    { text: 'PAEN', x0: 330, y0: 200, x1: 366, y1: 214 },
    { text: `0'25"828`, x0: 590, y0: 201, x1: 660, y1: 215 },
    { text: 'LUCIANA', x0: 110, y0: 220, x1: 190, y1: 234 },
    { text: 'PERAFAN', x0: 196, y0: 220, x1: 266, y1: 234 },
    { text: `0'24"660`, x0: 590, y0: 221, x1: 660, y1: 235 },
  ];
  const rows = extractRowsFromOcr(words);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].raw, `0'25"828`);
  assert.equal(rows[0].ms, 25828);
  assert.equal(rows[0].name, 'SALOME RENDON ERAZO');
  assert.equal(rows[1].name, 'LUCIANA PERAFAN');
  assert.equal(rows[1].ms, 24660);
});

test('extractRowsFromOcr keeps status rows and drops lines without a time', () => {
  const words = [
    { text: 'PATINADOR', x0: 110, y0: 100, x1: 220, y1: 114 },
    { text: 'T.Fin', x0: 590, y0: 100, x1: 640, y1: 114 },
    { text: 'MARIANGEL', x0: 110, y0: 300, x1: 200, y1: 314 },
    { text: 'OSPINA', x0: 206, y0: 300, x1: 268, y1: 314 },
    { text: 'DNF', x0: 600, y0: 301, x1: 640, y1: 315 },
  ];
  const rows = extractRowsFromOcr(words);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'dnf');
  assert.equal(rows[0].ms, null);
  assert.equal(rows[0].name, 'MARIANGEL OSPINA');
});
test('extractRowsFromText descarta la columna del club antes del tiempo', () => {
  const rows = extractRowsFromText(`14\tSALOME RENDON ERAZO\tPAEN\t0'25"828`, { clubNames: ['Paen'] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ms, 25828);
  assert.equal(rows[0].name, 'SALOME RENDON ERAZO', 'el club no es parte del nombre');
});

test('extractRowsFromOcr usa los separadores de columna para separar el club', () => {
  // Forma real de una línea de la planilla leída con PSM 4.
  const words = [
    { text: '23', x0: 20, y0: 200, x1: 36, y1: 214 },
    { text: '|', x0: 40, y0: 200, x1: 44, y1: 214 },
    { text: 'GABRIELA', x0: 50, y0: 200, x1: 130, y1: 214 },
    { text: 'GUTIERREZ', x0: 136, y0: 200, x1: 210, y1: 214 },
    { text: 'RUJE', x0: 216, y0: 200, x1: 258, y1: 214 },
    { text: '|', x0: 262, y0: 200, x1: 266, y1: 214 },
    { text: 'Paen', x0: 272, y0: 200, x1: 306, y1: 214 },
    { text: '|', x0: 310, y0: 200, x1: 314, y1: 214 },
    { text: `207"114`, x0: 320, y0: 200, x1: 380, y1: 214 },
  ];
  const rows = extractRowsFromOcr(words);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'GABRIELA GUTIERREZ RUJE');
  assert.equal(rows[0].ms, 127114);
  assert.equal(rows[0].status, 'ok');
});

test('extractRowsFromOcr no descarta una fila con tiempo ilegible', () => {
  const words = [
    { text: '405', x0: 20, y0: 300, x1: 44, y1: 314 },
    { text: '|', x0: 46, y0: 300, x1: 50, y1: 314 },
    { text: 'NELCY', x0: 56, y0: 300, x1: 110, y1: 314 },
    { text: 'JOHANNA', x0: 116, y0: 300, x1: 190, y1: 314 },
    { text: '|', x0: 194, y0: 300, x1: 198, y1: 314 },
    { text: 'Patinemos', x0: 204, y0: 300, x1: 270, y1: 314 },
    { text: '|', x0: 274, y0: 300, x1: 278, y1: 314 },
    { text: `7:14'779`, x0: 284, y0: 300, x1: 360, y1: 314 },
  ];
  const rows = extractRowsFromOcr(words);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'NELCY JOHANNA');
  assert.equal(rows[0].ms, null);
  assert.equal(rows[0].unreadable, true);
  assert.equal(rows[0].status, 'dns');
});

test('sameClub tolera un error de lectura pero no otro club', () => {
  assert.equal(sameClub('Paen', 'Paen'), true);
  assert.equal(sameClub('PAEN', 'Paen'), true);
  assert.equal(sameClub('Pain', 'Paen'), true);
  assert.equal(sameClub('Paem', 'Paen'), true);
  assert.equal(sameClub('Pacal', 'Paen'), false);
  assert.equal(sameClub('Patin Bello', 'Paen'), false);
  assert.equal(sameClub('Patinemos Tds', 'Paen'), false);
  assert.equal(sameClub('', 'Paen'), false);
  assert.equal(sameClub(null, 'Paen'), false);
});

test('extractRowsFromText se queda con el nombre y el club por separado', () => {
  const rows = extractRowsFromText(`23\tGABRIELA GUTIERREZ RUJE\tPaen\t2'07"114`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'GABRIELA GUTIERREZ RUJE');
  assert.equal(rows[0].club, 'Paen');
  assert.equal(rows[0].ms, 127114);
});

test('extractRowsFromOcr devuelve el club de la columna siguiente al nombre', () => {
  const words = [
    { text: '|', x0: 16, y0: 200, x1: 20, y1: 214 },
    { text: 'MARIA', x0: 26, y0: 200, x1: 80, y1: 214 },
    { text: 'JOSE', x0: 86, y0: 200, x1: 130, y1: 214 },
    { text: 'AMAYA', x0: 136, y0: 200, x1: 190, y1: 214 },
    { text: '|', x0: 194, y0: 200, x1: 198, y1: 214 },
    { text: 'Paen', x0: 204, y0: 200, x1: 240, y1: 214 },
    { text: '|', x0: 244, y0: 200, x1: 248, y1: 214 },
    { text: `207"114`, x0: 254, y0: 200, x1: 320, y1: 214 },
  ];
  const rows = extractRowsFromOcr(words);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'MARIA JOSE AMAYA');
  assert.equal(rows[0].club, 'Paen');
});

test('matchAthlete resuelve un nombre con palabras pegadas por el OCR', () => {
  const roster = [
    { id: 'samai', name: 'Samai Valeria Berthi Jacanamijoy' },
    { id: 'maria-jose', name: 'María José Amaya Restrepo' },
  ];
  assert.equal(matchAthlete('SAMAIVALERIA BERTHI JACANAMIJOY', roster).id, 'samai');
  assert.equal(matchAthlete('MARIAJOSE AMAYA RESTREPO', roster).id, 'maria-jose');
});

test('matchAthlete tolera una letra distinta entre la planilla y el plantel', () => {
  const roster = [
    { id: 'gabriela', name: 'Gabriela Gutiérrez Ruie' },
    { id: 'samai', name: 'Samai Valeria Berthi Jacanamijoy' },
  ];
  assert.equal(matchAthlete('GABRIELA GUTIERREZ RUJE', roster).id, 'gabriela');
  assert.equal(matchAthlete('GABRIELA GUTIERREZ RUIE', roster).id, 'gabriela');
});

test('matchAthlete no confunde patinadoras distintas por una letra', () => {
  const roster = [
    { id: 'salome-rendon', name: 'Salomé Rendón Erazo' },
    { id: 'salome-munoz', name: 'Salomé Muñoz Hernández' },
  ];
  assert.equal(matchAthlete('SALOME RENDON ERAZO', roster).id, 'salome-rendon');
  assert.equal(matchAthlete('SALOME MUÑOZ HERNANDEZ', roster).id, 'salome-munoz');
  assert.equal(matchAthlete('SALOME RENDON MUNOZ', roster), null);
});
