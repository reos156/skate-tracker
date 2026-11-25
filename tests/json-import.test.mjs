// Importación del JSON que el adulto genera desde la foto. Se prueba con la
// planilla real de habilidad #19 (202611), recortada a lo que hace falta.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSheetJson, detectTest } from '../src/json-import.js';
import { rankResults } from '../src/core.js';

const PLANILLA = `{
  "categoria": "PREINFANTIL 10 DAMAS",
  "clasificacion": "CLASIFICACIÓN GENERAL Habilidad Circuito #19",
  "resultados": [
    {"pos":"1-","numero":393,"patinador":"MARÍA ISABEL OSPINA MARÍN","club":"Golden Skate","t_final":"0'17\\"051","penalizacion":0},
    {"pos":null,"numero":16,"patinador":"MARIANGEL OSPINA TREJOS","club":"Paen","t_final":"0'17\\"546","penalizacion":0},
    {"pos":null,"numero":19,"patinador":"LUCIANA VILLA CASTILLO","club":"Paen","t_final":"0'18\\"034","penalizacion":0},
    {"pos":null,"numero":14,"patinador":"SALOME RENDON ERAZO","club":"Paen","t_final":"0'18\\"447","penalizacion":0},
    {"pos":null,"numero":18,"patinador":"MARIA ANTONIA RAMIREZ GIRALDO","club":"Paen","t_final":"0'20\\"454","penalizacion":0},
    {"pos":null,"numero":300,"patinador":"LUCIANA BETANCOURT DUARTE","club":"Gente Nueva","t_final":"0'17\\"628","penalizacion":1},
    {"pos":null,"numero":443,"patinador":"CELESTE GARCIA CASAS","club":"Urakanes Bello","t_final":"ELIM","penalizacion":3}
  ]
}`;

test('lee la planilla completa y deduce la prueba del subtítulo', () => {
  const sheet = parseSheetJson(PLANILLA);
  assert.equal(sheet.ok, true);
  assert.equal(sheet.categoria, 'PREINFANTIL 10 DAMAS');
  assert.equal(sheet.test, 'habilidad');
  assert.equal(sheet.meta.circuit, '19');
  assert.equal(sheet.rows.length, 7);
});

test('lee los campos del formato y los tiempos impresos', () => {
  const sheet = parseSheetJson(PLANILLA);
  const salome = sheet.rows.find((row) => row.name === 'SALOME RENDON ERAZO');
  assert.equal(salome.club, 'Paen');
  assert.equal(salome.bib, 14);
  assert.equal(salome.ms, 18447);
  assert.equal(salome.status, 'ok');
  assert.equal(salome.penalties, 0);
});

test('ELIM queda como estado y nunca como cero', () => {
  const sheet = parseSheetJson(PLANILLA);
  const elim = sheet.rows.find((row) => row.name === 'CELESTE GARCIA CASAS');
  assert.equal(elim.status, 'elim');
  assert.equal(elim.ms, null);
  assert.equal(elim.penalties, 3);
});

test('una penalización no cambia el tiempo pero sí el puesto', () => {
  const sheet = parseSheetJson(PLANILLA);
  const ranked = rankResults(sheet.rows);
  const betancourt = ranked.find((row) => row.penalties === 1);
  const faster = ranked.find((row) => row.name === 'MARÍA ISABEL OSPINA MARÍN');
  assert.equal(faster.pos, 1);
  assert.ok(betancourt.pos > faster.pos, 'con falta va detrás aunque su tiempo sea mejor');
});

test('acepta el array pelado sin el objeto que lo envuelve', () => {
  const sheet = parseSheetJson('[{"patinador":"SALOME RENDON ERAZO","club":"Paen","t_final":"0\'18\\"447"}]');
  assert.equal(sheet.ok, true);
  assert.equal(sheet.rows[0].ms, 18447);
});

test('deduce prueba y base de cada tipo de planilla', () => {
  assert.deepEqual(detectTest('CLASIFICACIÓN GENERAL Habilidad Circuito #14'), {
    test: 'habilidad',
    meta: { circuit: '14', distanceM: null },
  });
  assert.deepEqual(detectTest('VELOCIDAD OLIMPICA 600 metros'), {
    test: 'olimpica',
    meta: { distanceM: 600, circuit: null },
  });
  assert.deepEqual(detectTest('Clas. Gral. REMATES 200 metros + distancia.'), {
    test: 'remates200',
    meta: { distanceM: 200, circuit: null },
  });
  assert.equal(detectTest('').test, null);
});

test('explica el error en vez de romperse', () => {
  assert.match(parseSheetJson('no es json').error, /no es JSON válido/);
  assert.match(parseSheetJson('{"resultados":[]}').error, /vacía/);
  assert.match(parseSheetJson('{"otra":"cosa"}').error, /No encontré la lista/);
  assert.match(parseSheetJson('{"resultados":[{"club":"Paen"}]}').error, /nombre de patinadora/);
  assert.equal(parseSheetJson(null).ok, false);
});

test('un tiempo ilegible no se guarda como cero', () => {
  const sheet = parseSheetJson('[{"patinador":"ISABELLA MEJIAS","club":"Team Fenix","t_final":"7:14\'779"}]');
  assert.equal(sheet.rows[0].ms, null);
  assert.equal(sheet.rows[0].unreadable, true);
  assert.equal(sheet.rows[0].status, 'dns');
});
