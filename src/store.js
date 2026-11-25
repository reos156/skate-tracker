// Estado de la app y todo lo derivado de los datos.
// La regla: nada se calcula en el render; se calcula acá y se pinta.

import { rankResults, gapPct, isComparableInSeconds, project } from './core.js';
import { ATHLETES, EVENTS, RESULTS, ME, CLUB } from './data.js';

const STORAGE_KEY = 'skate-tracker/v1';

export function seedState() {
  return {
    version: 1,
    me: ME,
    club: CLUB,
    athletes: ATHLETES.map((athlete) => ({ ...athlete })),
    events: EVENTS.map((event) => ({ ...event })),
    results: RESULTS.map((result) => ({ ...result })),
  };
}

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadState() {
  const store = storage();
  if (!store) return seedState();
  try {
    const saved = store.getItem(STORAGE_KEY);
    if (!saved) return seedState();
    const parsed = JSON.parse(saved);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.results)) return seedState();
    return parsed;
  } catch {
    return seedState();
  }
}

export function saveState(state) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function resetState() {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    /* sin almacenamiento no hay nada que borrar */
  }
}

export function athleteById(state, id) {
  return state.athletes.find((athlete) => athlete.id === id) ?? null;
}

export function eventById(state, id) {
  return state.events.find((event) => event.id === id) ?? null;
}

/** Los eventos en el orden en que se corrieron. */
export function orderedEvents(state) {
  return [...state.events].sort((a, b) => String(a.code).localeCompare(String(b.code)));
}

function rowsFor(state, eventId, test) {
  return state.results.filter((result) => result.eventId === eventId && result.test === test);
}

/**
 * Tablero del club para una prueba y una válida: puesto, tiempo, brecha %
 * contra la mejor marca con tiempo válido. Las filas sin tiempo (DNF/ELIM)
 * viajan al final con `pos: null` y nunca se cuentan como cero.
 */
export function clubBoard(state, eventId, test) {
  const rows = rowsFor(state, eventId, test).map((result) => ({
    ...result,
    athlete: athleteById(state, result.athleteId),
  }));
  const ranked = rankResults(rows);
  const timed = ranked.filter((row) => row.status === 'ok' && typeof row.ms === 'number');
  const best = timed.length ? Math.min(...timed.map((row) => row.ms)) : null;
  const sorted = [...ranked].sort((a, b) => {
    if (a.pos === null && b.pos === null) return 0;
    if (a.pos === null) return 1;
    if (b.pos === null) return -1;
    return a.pos - b.pos;
  });
  return {
    eventId,
    test,
    best,
    sorted: sorted.map((row) => ({ ...row, gap: gapPct(row.ms, best) })),
    timedCount: timed.length,
    outCount: ranked.length - timed.length,
  };
}

export function myRow(state, eventId, test) {
  const board = clubBoard(state, eventId, test);
  return board.sorted.find((row) => row.athleteId === state.me) ?? null;
}

/** Serie de Salomé por prueba, en el orden de las válidas. */
export function mySeries(state, test) {
  const events = orderedEvents(state);
  const points = events.map((event, index) => {
    const board = clubBoard(state, event.id, test);
    const row = board.sorted.find((item) => item.athleteId === state.me) ?? null;
    const clubBestRow = board.sorted.find((item) => item.status === 'ok') ?? null;
    return {
      event,
      index,
      row,
      pos: row?.pos ?? null,
      ms: row?.ms ?? null,
      status: row?.status ?? 'dns',
      gap: row?.gap ?? null,
      best: board.best,
      bestHolder: clubBestRow?.athlete?.name ?? null,
      timedCount: board.timedCount,
      meta: {
        distanceM: row?.distanceM ?? null,
        circuit: row?.circuit ?? null,
      },
    };
  });
  const withTime = points.filter((point) => typeof point.ms === 'number');
  const comparable = withTime.length >= 2 ? isComparableInSeconds(withTime[0], withTime[withTime.length - 1]) : false;
  return { test, points, comparable };
}

/**
 * Delta contra la válida anterior con datos. `comparable: false` significa que
 * la base cambió y el delta en segundos no se muestra: solo la brecha %.
 */
export function deltaVsPrevious(state, test, eventId) {
  const series = mySeries(state, test);
  const position = series.points.findIndex((point) => point.event.id === eventId);
  if (position <= 0) return null;

  let previous = null;
  for (let i = position - 1; i >= 0; i -= 1) {
    if (typeof series.points[i].ms === 'number') {
      previous = series.points[i];
      break;
    }
  }
  if (!previous) return null;

  const current = series.points[position];
  if (typeof current.ms !== 'number') return null;

  const comparable = isComparableInSeconds(
    { distanceM: current.meta.distanceM, circuit: current.meta.circuit },
    { distanceM: previous.meta.distanceM, circuit: previous.meta.circuit },
  );
  return {
    previous,
    comparable,
    deltaMs: comparable ? current.ms - previous.ms : null,
    deltaGapPct: current.gap !== null && previous.gap !== null ? current.gap - previous.gap : null,
    posChange: current.pos !== null && previous.pos !== null ? previous.pos - current.pos : null,
  };
}

/** Proyección de la próxima válida por prueba, con la guarda de 3 puntos. */
export function projectionFor(state, test) {
  const series = mySeries(state, test);
  const valid = series.points.filter((point) => typeof point.ms === 'number');
  const result = project(valid.map((point) => ({ index: point.index, ms: point.ms })));
  return { series, ...result };
}

/**
 * ¿Los tiempos leídos se parecen a los de la prueba elegida? Compara la
 * mediana de lo leído contra la mediana de las válidas anteriores con la misma
 * base. Sirve para atrapar una foto de habilidad cargada como 200 m, que es un
 * error silencioso y carísimo: mete tiempos imposibles en las comparativas.
 */
export function testMismatch(state, test, msValues, meta = {}) {
  const sameBasis = (result) =>
    (result.distanceM ?? null) === (meta.distanceM ?? result.distanceM ?? null) &&
    (result.circuit ?? null) === (meta.circuit ?? result.circuit ?? null);

  const stored = state.results
    .filter((result) => result.test === test && result.status === 'ok' && typeof result.ms === 'number')
    .filter((result) => (meta.distanceM || meta.circuit ? sameBasis(result) : true))
    .map((result) => result.ms);

  const incoming = (msValues ?? []).filter((ms) => typeof ms === 'number');
  if (stored.length < 3 || incoming.length < 3) return { suspect: false, ratio: null };

  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const expected = median(stored);
  const observed = median(incoming);
  const ratio = observed / expected;
  return {
    suspect: ratio < 0.85 || ratio > 1.18,
    ratio,
    expectedMedian: expected,
    observedMedian: observed,
  };
}

/** Estado del perfil de Salomé: cuántas válidas hay por prueba. */
export function coverage(state) {
  return ['remates200', 'olimpica', 'habilidad'].map((test) => {
    const series = mySeries(state, test);
    const have = series.points.filter((point) => typeof point.ms === 'number').length;
    return { test, have, need: 3 };
  });
}

/**
 * Mejor marca de Salomé en una prueba, medida solo dentro de la base más
 * reciente: mezclar 300 m con 600 m no da una mejor marca, da una resta falsa.
 */
export function personalBest(state, test) {
  const matching = state.results.filter(
    (result) => result.test === test && result.athleteId === state.me && result.status === 'ok' && typeof result.ms === 'number',
  );
  if (matching.length === 0) return { ms: null, distanceM: null, circuit: null, validas: 0 };

  const order = orderedEvents(state).map((event) => event.id);
  const latest = [...matching].sort(
    (a, b) => order.indexOf(b.eventId) - order.indexOf(a.eventId),
  )[0];
  const basisKey = (result) => `${result.distanceM ?? 'x'}|${result.circuit ?? 'x'}`;
  const sameBasis = matching.filter((result) => basisKey(result) === basisKey(latest));

  return {
    ms: Math.min(...sameBasis.map((result) => result.ms)),
    distanceM: latest.distanceM ?? null,
    circuit: latest.circuit ?? null,
    validas: sameBasis.length,
  };
}

/** Metadatos de la última válida con datos para una prueba, para precargar el formulario. */
export function inferMeta(state, test) {
  const ordered = [...state.events].sort((a, b) => String(b.code).localeCompare(String(a.code)));
  for (const event of ordered) {
    const found = state.results.find(
      (result) => result.eventId === event.id && result.test === test && (result.distanceM || result.circuit),
    );
    if (found) return { distanceM: found.distanceM ?? null, circuit: found.circuit ?? null };
  }
  return { distanceM: null, circuit: null };
}

/** Agrega filas confirmadas de una carga. Devuelve el estado nuevo. */
export function applyImport(state, { eventId, test, rows, meta }) {
  // La carga reemplaza la prueba completa de esa válida: el set solo evita
  // que una misma patinadora entre dos veces en la misma importación.
  const taken = new Set();

  const athletes = [...state.athletes];
  const results = state.results.filter(
    (result) => !(result.eventId === eventId && result.test === test),
  );

  for (const row of rows) {
    let athlete = row.athleteId ? athletes.find((item) => item.id === row.athleteId) : null;
    if (!athlete) {
      const id = `x-${row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
      athlete = athletes.find((item) => item.id === id) ?? null;
      if (!athlete) {
        athlete = { id, name: row.name, club: row.club ?? null, imported: true };
        athletes.push(athlete);
      }
    }
    if (taken.has(athlete.id)) continue;
    taken.add(athlete.id);
    results.push({
      id: `${eventId}:${test}:${athlete.id}:${row.index ?? results.length}`,
      eventId,
      test,
      athleteId: athlete.id,
      bib: row.bib ?? null,
      ms: row.ms,
      status: row.status ?? 'ok',
      raw: row.raw ?? '',
      distanceM: meta?.distanceM ?? null,
      circuit: meta?.circuit ?? null,
    });
  }

  return { ...state, athletes, results };
}

/** Alta de una válida nueva con sus tres pruebas vacías. */
export function addEvent(state, { code, label, competition }) {
  if (state.events.some((event) => event.code === code)) return state;
  const event = {
    id: code,
    code,
    label: label || `Válida ${state.events.length + 1} · ${code}`,
    competition: competition || 'Copa Antioquia',
    category: 'Preinfantil 10 Damas',
    source: 'carga manual',
  };
  return { ...state, events: [...state.events, event] };
}