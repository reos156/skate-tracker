import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  seedState,
  clubBoard,
  deltaVsPrevious,
  projectionFor,
  coverage,
  applyImport,
  addEvent,
  inferMeta,
  athleteById,
  testMismatch,
} from '../src/store.js';

const state = seedState();

test('la semilla trae las dos válidas y las tres pruebas', () => {
  assert.equal(state.events.length, 2);
  assert.equal(state.athletes.length, 14);
  const tests = new Set(state.results.map((result) => result.test));
  assert.deepEqual([...tests].sort(), ['habilidad', 'olimpica', 'remates200']);
  assert.equal(state.results.length, 76);
});

test('clubBoard rankea desde los tiempos y calcula la brecha al primero', () => {
  const board = clubBoard(state, '202611', 'remates200');
  assert.equal(board.best, 23946);
  assert.equal(board.timedCount, 12);

  const mine = board.sorted.find((row) => row.athleteId === 'salome-rendon');
  assert.equal(mine.pos, 8);
  assert.equal(mine.gap.toFixed(2), '7.86');
});

test('clubBoard manda al final a quien no tiene tiempo y no lo cuenta como cero', () => {
  const board = clubBoard(state, '202611', 'remates200');
  const out = board.sorted.find((row) => row.athleteId === 'mariangel-ospina');
  assert.equal(out.status, 'dnf');
  assert.equal(out.pos, null);
  assert.equal(out.gap, null);
  assert.equal(board.sorted[board.sorted.length - 1].athleteId, 'mariangel-ospina');
  assert.equal(board.outCount, 1);
});

test('clubBoard cuenta ELIM como estado, no como tiempo', () => {
  const board = clubBoard(state, '202611', 'olimpica');
  const elim = board.sorted.find((row) => row.athleteId === 'luciana-villa');
  assert.equal(elim.status, 'elim');
  assert.equal(elim.ms, null);
  assert.equal(elim.pos, null);
  assert.equal(board.timedCount, 10);
});

test('deltaVsPrevious compara en segundos cuando la base es la misma', () => {
  const delta = deltaVsPrevious(state, 'remates200', '202611');
  assert.equal(delta.comparable, true);
  assert.equal(delta.deltaMs, -95);
  assert.equal(delta.posChange, 4);
  assert.equal(delta.deltaGapPct.toFixed(2), '-0.32');
});

test('deltaVsPrevious no inventa segundos cuando la olímpica cambió de base', () => {
  const delta = deltaVsPrevious(state, 'olimpica', '202611');
  assert.equal(delta.comparable, false);
  assert.equal(delta.deltaMs, null);
  assert.equal(delta.deltaGapPct.toFixed(2), '1.93');
  assert.equal(delta.posChange, 0);
});

test('deltaVsPrevious compara la habilidad solo por brecha', () => {
  const delta = deltaVsPrevious(state, 'habilidad', '202611');
  assert.equal(delta.comparable, false);
  assert.equal(delta.deltaGapPct.toFixed(2), '-7.07');
  assert.equal(delta.posChange, 6);
});

test('la primera válida no tiene delta contra sí misma', () => {
  assert.equal(deltaVsPrevious(state, 'remates200', '202608'), null);
});

test('projectionFor se niega a proyectar con dos válidas', () => {
  for (const test of ['remates200', 'olimpica', 'habilidad']) {
    const projection = projectionFor(state, test);
    assert.equal(projection.status, 'insufficient');
    assert.equal(projection.have, 2);
    assert.equal(projection.need, 3);
  }
  assert.deepEqual(
    coverage(state).map((item) => item.have),
    [2, 2, 2],
  );
});

test('projectionFor proyecta en cuanto hay una tercera válida con tiempo', () => {
  const withThird = applyImport(
    addEvent(state, { code: '202702' }),
    {
      eventId: '202702',
      test: 'remates200',
      rows: [
        { name: 'Salomé Rendón Erazo', athleteId: 'salome-rendon', ms: 25700, status: 'ok', raw: `0'25"700` },
        { name: 'Salomé Muñoz Hernández', athleteId: 'salome-munoz', ms: 23800, status: 'ok', raw: `0'23"800` },
      ],
      meta: { distanceM: 200, circuit: null },
    },
  );
  const projection = projectionFor(withThird, 'remates200');
  assert.equal(projection.status, 'ready');
  assert.equal(projection.points, 3);
  assert.ok(projection.nextMs < 25828);
});

test('applyImport reemplaza la prueba cargada y no duplica filas', () => {
  const imported = applyImport(state, {
    eventId: '202611',
    test: 'remates200',
    rows: [
      { name: 'Salomé Rendón Erazo', athleteId: 'salome-rendon', ms: 25700, status: 'ok', raw: `0'25"700` },
      { name: 'Salomé Muñoz Hernández', athleteId: 'salome-munoz', ms: 23800, status: 'ok', raw: `0'23"800` },
    ],
    meta: { distanceM: 200, circuit: null },
  });

  const rows = imported.results.filter(
    (result) => result.eventId === '202611' && result.test === 'remates200',
  );
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((row) => row.athleteId === 'salome-rendon').length, 1);

  // las otras pruebas de la misma válida no se tocan
  assert.equal(
    imported.results.filter((result) => result.eventId === '202611' && result.test === 'olimpica').length,
    12,
  );
});

test('applyImport agrega al plantel los nombres que no conocía', () => {
  const imported = applyImport(state, {
    eventId: '202611',
    test: 'habilidad',
    rows: [{ name: 'Pepita Nadie', ms: 17000, status: 'ok', raw: `0'17"000` }],
    meta: { circuit: '19' },
  });
  const added = imported.athletes.find((athlete) => athlete.name === 'Pepita Nadie');
  assert.ok(added, 'la patinadora nueva tiene que existir en el plantel');
  assert.equal(added.imported, true);
  assert.ok(athleteById(imported, added.id));
});

test('inferMeta precarga la base de la última válida con datos', () => {
  assert.equal(inferMeta(state, 'olimpica').distanceM, 600);
  assert.equal(inferMeta(state, 'habilidad').circuit, '19');
  assert.equal(inferMeta(state, 'remates200').distanceM, 200);
});

test('addEvent no duplica una válida existente', () => {
  const same = addEvent(state, { code: '202611' });
  assert.equal(same.events.length, state.events.length);
  const fresh = addEvent(state, { code: '202702' });
  assert.equal(fresh.events.length, state.events.length + 1);
});
test('testMismatch detecta una foto de habilidad cargada como 200 m', () => {
  // habilidad ronda los 18 s y los 200 m los 25 s: la mediana delata el error.
  const mismatched = testMismatch(state, 'remates200', [18222, 18300, 18447, 18541], { distanceM: 200 });
  assert.equal(mismatched.suspect, true);
  assert.ok(mismatched.ratio < 0.85);
});

test('testMismatch acepta tiempos normales de la prueba elegida', () => {
  const ok = testMismatch(state, 'remates200', [25828, 25913, 26089, 26239], { distanceM: 200 });
  assert.equal(ok.suspect, false);
  assert.ok(ok.ratio > 0.95 && ok.ratio < 1.05);
});

test('testMismatch no opina cuando no hay con qué comparar', () => {
  assert.equal(testMismatch(state, 'olimpica', [120000, 121000, 122000], { distanceM: 600 }).suspect, false);
  assert.equal(testMismatch(state, 'remates200', [25828], { distanceM: 200 }).suspect, false);
  assert.equal(testMismatch(state, 'remates200', [], { distanceM: 200 }).suspect, false);
});
