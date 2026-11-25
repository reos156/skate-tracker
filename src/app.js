// Skate Tracker — interfaz. Todo el cálculo vive en core.js y store.js;
// acá solo se pinta y se conectan los eventos.

import {
  TESTS,
  project,
  formatTime,
  formatDelta,
  parseTime,
  extractRowsFromOcr,
  extractRowsFromText,
  matchAthlete,
  sameClub,
  matchesAnyClub,
  clubInName,
} from './core.js';
import { KNOWN_CLUBS } from './data.js';
import { parseSheetJson } from './json-import.js';
import {
  loadState,
  saveState,
  orderedEvents,
  clubBoard,
  deltaVsPrevious,
  projectionFor,
  coverage,
  applyImport,
  addEvent,
  testMismatch,
  inferMeta,
  personalBest,
  athleteById,
} from './store.js';

const view = document.getElementById('view');
const toastEl = document.getElementById('toast');

let state = loadState();
let ui = {
  eventId: null,
  test: 'remates200',
  capture: null,
};

/* ------------------------------------------------------------------ utils */

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

function testLabel(id) {
  return TESTS.find((test) => test.id === id)?.label ?? id;
}

function statusLabel(status) {
  return { ok: 'tiempo', elim: 'ELIM', dnf: 'DNF', dns: 'DNS' }[status] ?? status;
}

/** Brecha corta en segundos: 1.882 ms → «1,882 s». */
function seconds(ms) {
  return `${(Math.abs(ms) / 1000).toFixed(3).replace('.', ',')} s`;
}

function currentEventId() {
  const events = orderedEvents(state);
  if (ui.eventId && events.some((event) => event.id === ui.eventId)) return ui.eventId;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (state.results.some((result) => result.eventId === events[i].id)) return events[i].id;
  }
  return events[events.length - 1]?.id ?? null;
}

/* -------------------------------------------------------------- datos vista */

function basisLabel({ distanceM, circuit }) {
  if (circuit) return `circuito #${circuit}`;
  if (distanceM) return `${distanceM} m`;
  return 'base sin registrar';
}

/* ------------------------------------------------------------------- carril */

/**
 * Carril del club: cada patinadora es un punto sobre el eje del tiempo y el
 * número de dentro es su dorsal, el mismo de la tabla. Así el punto se puede
 * correlacionar con la fila sin adivinar.
 */
function laneSvg(board, { levels: levelOffsets = [-20, 0, 20], radius = 8 } = {}) {
  const timed = board.sorted.filter((row) => row.status === 'ok' && typeof row.ms === 'number');
  if (timed.length === 0) {
    return '<p class="note">Sin tiempos válidos en esta prueba.</p>';
  }
  const W = 322;
  // El alto sale de los niveles y del radio: así ningún punto queda cortado
  // por el borde del viewBox, que es lo que pasaba con el nivel de abajo.
  const mineRadius = radius + 1.5;
  const top = Math.min(...levelOffsets) - mineRadius - 2;
  const bottom = Math.max(...levelOffsets) + mineRadius + 2;
  const height = bottom - top;
  const levels = levelOffsets;
  const min = Math.min(...timed.map((row) => row.ms));
  const max = Math.max(...timed.map((row) => row.ms));
  const padL = 18;
  const padR = 18;
  const span = max - min || 1;
  const x = (ms) => padL + ((ms - min) / span) * (W - padL - padR);
  const baseY = -top; // el nivel 0 queda sobre esta línea
  const lastX = levels.map(() => -Infinity);
  // Dos círculos no se tocan si sus centros están a más de 2 radios: con r=8
  // son 16 px, así que se pide 21 para dejar aire entre uno y otro.
  const MIN_GAP = 21;

  const dots = timed
    .map((row) => {
      const px = x(row.ms);
      let level = levels.length - 1;
      for (let i = 0; i < levels.length; i += 1) {
        if (px - lastX[i] >= MIN_GAP) {
          level = i;
          break;
        }
      }
      lastX[level] = px;
      const cy = baseY + levels[level];
      const mine = row.athleteId === state.me;
      const label = row.bib === null || row.bib === undefined ? String(row.pos ?? '·') : String(row.bib);
      // Solo el dorsal: el tiempo ya vive en la tabla y encima del punto
      // tapaba a las compañeras vecinas.
      return mine
        ? `<circle cx="${px.toFixed(1)}" cy="${cy}" r="9.5" fill="#D9480F" stroke="#FFF" stroke-width="2.5"/>
           <text x="${px.toFixed(1)}" y="${(cy + 3.3).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="800" fill="#FFF">${esc(label)}</text>`
        : `<circle cx="${px.toFixed(1)}" cy="${cy}" r="8" fill="#EEF3F6" stroke="#C6D3DA" stroke-width="1.4"/>
           <text x="${px.toFixed(1)}" y="${(cy + 3.1).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="#5A707D">${esc(label)}</text>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${W} ${height}" role="img" aria-label="Las ${timed.length} del club sobre el tiempo de esta prueba; el número de cada punto es el dorsal">
      <line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" stroke="#EAF1F5" stroke-width="2"/>
      ${dots}
    </svg>
    <div class="axis"><span>${formatTime(min)}</span><span>${formatTime(Math.round((min + max) / 2))}</span><span>${formatTime(max)}</span></div>`;
}

/* -------------------------------------------------------------------- hero */

function heroBlock({ topLeft, topRight = '', title, meta, bigtime, bigtimeLabel, chips }) {
  return `<header class="hero">
    <div class="hero-top"><span>${esc(topLeft)}</span>${topRight}</div>
    <h1>${esc(title)}</h1>
    <p class="meta">${esc(meta)}</p>
    ${bigtime ? `<div class="bigtime">${esc(bigtime)}</div><span class="bigtime-label">${esc(bigtimeLabel ?? '')}</span>` : ''}
    ${chips ? `<div class="chips">${chips.map((chip) => `<span class="chip ${chip.tone ?? ''}">${esc(chip.text)}</span>`).join('')}</div>` : ''}
  </header>`;
}

/* --------------------------------------------------------------------- HOY */

function renderHoy() {
  const eventId = currentEventId();
  const event = orderedEvents(state).find((item) => item.id === eventId) ?? null;
  const athlete = athleteById(state, state.me);
  const board = eventId ? clubBoard(state, eventId, ui.test) : { sorted: [], best: null, timedCount: 0 };
  const mine = board.sorted.find((row) => row.athleteId === state.me) ?? null;
  const delta = eventId ? deltaVsPrevious(state, ui.test, eventId) : null;
  const best = personalBest(state, ui.test);
  const bib = mine?.bib ?? state.results.find((result) => result.athleteId === state.me)?.bib ?? null;

  const chips = [];
  if (delta && delta.comparable && delta.deltaMs !== null) {
    chips.push({
      tone: delta.deltaMs <= 0 ? 'g' : 'b',
      text: `${delta.deltaMs <= 0 ? '▲' : '▼'} ${seconds(delta.deltaMs)} vs ${delta.previous.event.label.replace(/ · .*/, '')}`,
    });
  } else if (delta && !delta.comparable && delta.deltaGapPct !== null) {
    chips.push({
      tone: delta.deltaGapPct <= 0 ? 'g' : 'b',
      text: `prueba distinta · ${mine?.pos ?? '—'}.ª del club`,
    });
  }
  if (mine?.pos) chips.push({ tone: 'y', text: `${mine.pos}.º de ${board.timedCount} en PAEN` });


  const cards = TESTS.map((test) => {
    const testBoard = clubBoard(state, eventId, test.id);
    const row = testBoard.sorted.find((item) => item.athleteId === state.me) ?? null;
    const testDelta = deltaVsPrevious(state, test.id, eventId);
    // El subtítulo habla de puestos, igual que Evolución: es lo que se entiende
    // y lo que no depende de que la base de la prueba haya cambiado.
    let arrow = 'f';
    let arrowChar = '·';
    let sub = 'sin registro en esta válida';
    if (!row) {
      sub = 'sin registro en esta válida';
    } else if (row.status !== 'ok') {
      sub = `${statusLabel(row.status)} · sin tiempo válido`;
    } else if (testDelta && testDelta.posChange !== null) {
      arrow = testDelta.posChange > 0 ? 'g' : testDelta.posChange < 0 ? 'b' : 'f';
      arrowChar = testDelta.posChange > 0 ? '▲' : testDelta.posChange < 0 ? '▼' : '–';
      const anterior = testDelta.previous.event.label.replace(/ · .*/, '').toLowerCase();
      sub = `${positionWords(testDelta.posChange)} desde la ${anterior}`;
    } else {
      sub = `primera válida con tiempo · ${formatTime(row.ms)}`;
    }
    return `<button class="testcard" data-action="set-test" data-test="${test.id}" aria-pressed="${test.id === ui.test}">
      <span class="arrow ${arrow}" aria-hidden="true">${arrowChar}</span>
      <span class="nm"><b>${esc(test.label)}</b><small>${esc(sub)}</small></span>
      <span class="tm">${row?.status === 'ok' ? esc(formatTime(row.ms)) : row ? esc(statusLabel(row.status)) : '—'}</span>
      <span class="rk"><b>${row?.pos ? `${row.pos}.ª` : '—'}</b></span>
    </button>`;
  }).join('');

  const eventOptions = orderedEvents(state)
    .map((item) => `<option value="${esc(item.id)}" ${item.id === eventId ? 'selected' : ''}>${esc(item.label)}</option>`)
    .join('');

  view.innerHTML = `
    ${heroBlock({
      topLeft: 'Skate · PAEN',
      topRight: `<select data-action="set-event" aria-label="Válida">${eventOptions}</select>`,
      title: athlete?.name ?? 'Salomé Rendón Erazo',
      meta: `${state.events[0]?.category ?? 'Preinfantil 10 Damas'}${bib ? ` · dorsal ${bib}` : ''}`,
      bigtime: mine?.status === 'ok' ? formatTime(mine.ms) : statusLabel(mine?.status ?? 'dns'),
      bigtimeLabel: testLabel(ui.test),
      chips,
    })}
    <div class="sheet">
      <div class="seg" role="group" aria-label="Prueba">
        ${TESTS.map(
          (test) =>
            `<button data-action="set-test" data-test="${test.id}" aria-pressed="${test.id === ui.test}">${esc(test.short)}</button>`,
        ).join('')}
      </div>

      ${goalsBlock({ board, mine, delta, best })}

      <h2 class="sect">Sus tres pruebas <span>${esc(event?.label ?? 'sin válidas')}</span></h2>
      <div class="tests">${cards}</div>

      <button class="btn ghost" style="margin-top:14px" data-action="go" data-href="#club">Ver el club completo</button>
    </div>`;
}

/**
 * Metas de la prueba elegida: a cuánto está el rival de adelante y a cuánto el
 * podio. Son las dos cifras que sirven para decidir, y se dicen en segundos.
 */
function goalsBlock({ board, mine, delta, best }) {
  if (!mine) {
    return `<div class="empty"><h3>Sin registro en esta válida</h3><p>La válida no tiene su fila para esta prueba.</p></div>`;
  }
  if (mine.status !== 'ok') {
    return `<div class="empty"><h3>${esc(statusLabel(mine.status))} en esta prueba</h3><p>La planilla no trae un tiempo válido, así que no hay distancia que calcular. El estado nunca se cuenta como cero.</p></div>`;
  }

  const index = board.sorted.findIndex((row) => row.athleteId === state.me);
  const ahead = index > 0 ? board.sorted[index - 1] : null;
  const third = board.sorted.find((row) => row.pos === 3) ?? null;
  const pos = mine.pos;

  const secNum = (ms) => (Math.abs(ms) / 1000).toFixed(3).replace('.', ',');

  const nextGoal = ahead
    ? {
        label: `Para alcanzar a ${esc(ahead.athlete?.name?.split(' ').slice(0, 2).join(' ') ?? 'la de adelante')} · ${ahead.pos}.ª`,
        num: secNum(mine.ms - ahead.ms),
        unit: 's',
      }
    : null;
  const podiumGoal =
    pos !== null && pos > 3 && third
      ? { label: 'Para el podio · 3.ª', num: secNum(mine.ms - third.ms), unit: 's' }
      : { label: 'Podio', num: pos !== null && pos <= 3 ? 'adentro' : '—', unit: null };

  const moved = delta?.posChange
    ? `${delta.posChange > 0 ? 'subió' : 'bajó'} ${Math.abs(delta.posChange)} ${Math.abs(delta.posChange) === 1 ? 'puesto' : 'puestos'} desde la válida anterior`
    : 'primera válida con tiempo';

  const goals = [nextGoal, podiumGoal].filter(Boolean);

  return `<section class="goals">
    ${goals
      .map(
        (goal) => `<div class="goal">
          <p class="goal-lbl">${goal.label}</p>
          <p class="goal-num">${esc(goal.num)}${goal.unit ? ` <span>${esc(goal.unit)}</span>` : ''}</p>
        </div>`,
      )
      .join('')}
    <p class="goals-note">Mejor marca propia <b>${esc(formatTime(best.ms))}</b>${best.ms === null ? '' : ` · ${esc(basisLabel(best))}`} · ${esc(moved)}</p>
  </section>`;
}

/* -------------------------------------------------------------------- CLUB */

function renderClub() {
  const eventId = currentEventId();
  const event = orderedEvents(state).find((item) => item.id === eventId) ?? null;
  const board = clubBoard(state, eventId, ui.test);
  const mine = board.sorted.find((row) => row.athleteId === state.me) ?? null;
  const delta = deltaVsPrevious(state, ui.test, eventId);

  const timed = board.sorted.filter((row) => row.status === 'ok');
  const out = board.sorted.filter((row) => row.status !== 'ok');
  const podium = timed.slice(0, 3);
  const rest = timed.slice(3);
  // Orden visual del podio: segunda, primera, tercera.
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean);
  const podiumBest = podium.length ? Math.min(...podium.map((row) => row.ms)) : 0;
  const podiumWorst = podium.length ? Math.max(...podium.map((row) => row.ms)) : 1;
  const podiumSpan = Math.max(podiumWorst - podiumBest, 1);

  const rowHtml = (row) => {
    const isMine = row.athleteId === state.me;
    const isOut = row.status !== 'ok';
    const moved =
      isMine && delta?.posChange
        ? `<small>${delta.posChange > 0 ? 'subió' : 'bajó'} ${Math.abs(delta.posChange)} ${Math.abs(delta.posChange) === 1 ? 'puesto' : 'puestos'}</small>`
        : '';
    return `<div class="clubrow ${isMine ? 'me' : ''} ${isOut ? 'out' : ''}">
      <span class="pos">${row.pos ?? '—'}</span>
      <span class="bib">${row.bib ?? '·'}</span>
      <span class="nm">${esc(row.athlete?.name ?? 'sin identificar')}${moved}</span>
      <span class="tm">${isOut ? esc(statusLabel(row.status)) : esc(formatTime(row.ms))}</span>
      <span class="gp">${isOut || row.gap === null ? '—' : row.gap === 0 ? 'mejor' : `+${esc(seconds(row.ms - board.best).replace(' s', ''))}`}</span>
    </div>`;
  };

  const podiumHtml = podiumOrder
    .map((row) => {
      // Más alta = más rápida: la altura sale del tiempo, no de un porcentaje.
      const height = Math.round(100 - ((row.ms - podiumBest) / podiumSpan) * 26);
      const isMine = row.athleteId === state.me;
      return `<div class="pl ${row.pos === 1 ? 'one' : ''} ${isMine ? 'mine' : ''}">
        <div class="plbar" style="height:${height}px">
          <span class="plrank">${row.pos}</span>
          <span class="plname">${esc(row.athlete?.name ?? '—')}</span>
          <span class="pltime num">${esc(formatTime(row.ms))}</span>
        </div>
      </div>`;
    })
    .join('');

  const noTimeNotice =
    mine && mine.status !== 'ok'
      ? `<p class="note" style="margin-top:10px">Esta válida no tiene un tiempo válido para Salomé en esta prueba: no hay puesto ni brecha que mostrar. El estado viene de la planilla y nunca se cuenta como cero.</p>`
      : '';

  view.innerHTML = `
    ${heroBlock({
      topLeft: 'Comparativa interna',
      topRight: `<span class="heropill">${esc(TESTS.find((test) => test.id === ui.test)?.short ?? '')}</span>`,
      title: `PAEN, ${esc(event?.label.replace(/^Válida /, 'válida ') ?? 'sin válidas')}`,
      meta: `${board.timedCount} patinadoras con tiempo válido${board.outCount ? ` · ${board.outCount} sin tiempo` : ''}`,
    })}
    <div class="sheet">
      <div class="seg" role="group" aria-label="Prueba">
        ${TESTS.map(
          (test) =>
            `<button data-action="set-test" data-test="${test.id}" aria-pressed="${test.id === ui.test}">${esc(test.short)}</button>`,
        ).join('')}
      </div>

      ${
        podium.length
          ? `<h2 class="sect">El podio del club <span>más alta = más rápida</span></h2>
             <div class="podium">${podiumHtml}</div>`
          : ''
      }

      <h2 class="sect">${podium.length ? 'Y el resto del club' : 'El club'} <span>le falta al 1.º</span></h2>
      <div class="clubrows">
        ${rest.map(rowHtml).join('')}
        ${out.map(rowHtml).join('')}
      </div>
      ${noTimeNotice}

      <h2 class="sect">El carril y la regla de los puestos</h2>
      <div class="lane">
          <div class="lane-head"><h3>${esc(testLabel(ui.test))}</h3><span class="mine">${board.timedCount} tiempos</span></div>
          ${laneSvg(board)}
        </div>
        <p class="note">El número de cada punto es el <b>dorsal</b>, el mismo de la tabla. El <i>Pos.</i> impreso en la planilla viene cortado y los empates se imprimen en bloques con el mismo tiempo: acá el puesto se recalcula desde los tiempos con ranking de competencia. Quien no tiene tiempo válido (DNF, ELIM) no se rankea y nunca cuenta como cero.</p>
    </div>`;
}

/* ---------------------------------------------------------------- EVOLUCIÓN */

/**
 * Franja de una válida: todas las del club con tiempo sobre el mismo eje.
 * Compartir el dominio entre las dos válidas es lo que hace que la diferencia
 * de centésimas se vea como lo que es: chica.
 */
function miniStrip(rows, domain) {
  const W = 320;
  const y = 11;
  const span = domain.max - domain.min || 1;
  const x = (ms) => 6 + ((ms - domain.min) / span) * (W - 12);
  const dots = rows
    .map((row) => {
      if (row.athleteId === state.me) {
        return `<circle cx="${x(row.ms).toFixed(1)}" cy="${y}" r="6.5" fill="#D9480F" stroke="#fff" stroke-width="2"/>`;
      }
      return `<circle cx="${x(row.ms).toFixed(1)}" cy="${y}" r="3.4" fill="#B6C0CA"/>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${W} 22" role="img" aria-label="Las ${rows.length} del club sobre el tiempo de esta prueba">
      <line x1="6" y1="${y}" x2="${W - 6}" y2="${y}" stroke="#EAF1F5" stroke-width="2"/>
      ${dots}
    </svg>`;
}

/** «subió 4 puestos», en palabras, sin porcentajes. */
function positionWords(change) {
  if (change === null) return 'sin referencia anterior';
  if (change === 0) return 'mismo puesto';
  return `${change > 0 ? 'subió' : 'bajó'} ${Math.abs(change)} ${Math.abs(change) === 1 ? 'puesto' : 'puestos'}`;
}

/** Desvío entre las marcas del club: sirve para decir si un cambio es grande o ruido. */
function fieldNoise(rows) {
  const values = rows.map((row) => row.ms).filter((ms) => typeof ms === 'number');
  if (values.length < 4) return null;
  const mean = values.reduce((sum, ms) => sum + ms, 0) / values.length;
  const variance = values.reduce((sum, ms) => sum + (ms - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function renderEvolucion() {
  const events = orderedEvents(state);

  const tests = TESTS.map((test) => {
    const series = events.map((event) => {
      const board = clubBoard(state, event.id, test.id);
      return {
        event,
        board,
        mine: board.sorted.find((row) => row.athleteId === state.me) ?? null,
        timed: board.sorted.filter((row) => row.status === 'ok' && typeof row.ms === 'number'),
      };
    });
    const withTime = series.filter((point) => point.mine && typeof point.mine.ms === 'number');
    const now = withTime[withTime.length - 1] ?? null;
    const before = withTime.length >= 2 ? withTime[withTime.length - 2] : null;
    const comparable =
      Boolean(now && before) &&
      (now.mine.distanceM ?? null) === (before.mine.distanceM ?? null) &&
      (now.mine.circuit ?? null) === (before.mine.circuit ?? null);

    return {
      test,
      series,
      now,
      before,
      comparable,
      change: now && before ? (before.mine.pos ?? 0) - (now.mine.pos ?? 0) : null,
    };
  });

  const improved = tests.filter((item) => item.change !== null && item.change > 0).length;
  const worsened = tests.filter((item) => item.change !== null && item.change < 0).length;
  const headline =
    improved === 0 && worsened === 0
      ? 'Todavía no hay con qué comparar'
      : improved === 0
        ? 'Esta vez no se ganaron puestos'
        : `Subiste puestos en ${improved} ${improved === 1 ? 'prueba' : 'de 3 pruebas'}`;

  // Dominio compartido por las dos franjas de cada prueba.
  const visibleTests = tests
    .map((item) => {
      const shown = item.series.filter((point) => point.timed.length > 0).slice(-2);
      const all = shown.flatMap((point) => point.timed.map((row) => row.ms));
      const domain = all.length ? { min: Math.min(...all), max: Math.max(...all) } : null;
      return { ...item, shown, domain };
    })
    .filter((item) => item.now || item.series.some((point) => point.mine));

  const cards = visibleTests
    .map((item) => {
      const { test, now, before, comparable, change, shown, domain } = item;
      if (!now) {
        return `<div class="testcard-block">
          <div class="row1"><h3>${esc(test.label)}</h3><span class="pos">sin tiempo válido</span></div>
          <p class="timenow">${esc(statusLabel(item.series[item.series.length - 1]?.mine?.status ?? 'dns'))} en la última válida</p>
        </div>`;
      }

      const posNow = now.mine.pos;
      const totalNow = now.board.timedCount;
      const ahead = now.timed.find((row) => row.pos === posNow - 1) ?? null;
      const third = now.timed.find((row) => row.pos === 3) ?? null;
      const deltaMs = comparable && before ? now.mine.ms - before.mine.ms : null;
      const noise = fieldNoise(now.timed);
      const withinNoise = deltaMs !== null && noise !== null && Math.abs(deltaMs) < noise * 0.2;

      const strips = shown
        .map((point) => {
          const label = point.mine?.status === 'ok' ? '' : statusLabel(point.mine?.status ?? 'dns');
          return `<div class="strip">
            <div class="lab"><span>${esc(point.event.label)}</span><i>${point.mine?.pos ?? '—'}.ª${label ? ` · ${esc(label)}` : ''}</i></div>
            ${miniStrip(point.timed, domain)}
          </div>`;
        })
        .join('');

      const gaps = [];
      if (ahead && typeof ahead.ms === 'number') {
        gaps.push(
          `Te faltan <b>${seconds(now.mine.ms - ahead.ms)}</b> para alcanzar a <i>${esc(ahead.athlete?.name?.split(' ').slice(0, 2).join(' ') ?? 'la de adelante')}</i>, que va ${ahead.pos}.ª.`,
        );
      } else if (posNow === 1) {
        gaps.push('<i>Es la primera del club</i> en esta prueba.');
      }
      if (third && typeof third.ms === 'number' && posNow > 3) {
        gaps.push(
          `Y <b>${seconds(now.mine.ms - third.ms)}</b> para entrar al podio, en la 3.ª.`,
        );
      } else if (posNow <= 3 && posNow !== null) {
        gaps.push('<i>Estás en el podio.</i>');
      }

      const basisNote = !comparable && before
        ? `<div class="note">${
            test.id === 'habilidad'
              ? 'El circuito cambió entre las dos válidas, así que el tiempo no se compara. El puesto sí.'
              : 'La distancia cambió entre las dos válidas, así que el tiempo no se compara. El puesto sí.'
          }</div>`
        : '';

      const noiseNote = withinNoise
        ? `<div class="note">La diferencia es de centésimas: puede ser del día y no del entrenamiento. El puesto es la señal más firme.</div>`
        : '';

      return `<div class="testcard-block">
        <div class="row1">
          <h3>${esc(test.label)}</h3>
          <span class="pos">ahora <b>${posNow ?? '—'}.ª</b> de ${totalNow}</span>
        </div>
        <p class="timenow">
          ${esc(formatTime(now.mine.ms))}
          ${deltaMs !== null ? `<span class="${deltaMs <= 0 ? 'good' : 'bad'}">${deltaMs <= 0 ? '▼' : '▲'} ${esc(seconds(deltaMs))}</span>` : ''}
          · ${esc(positionWords(change))}${before ? ` desde la ${esc(before.event.label.replace(/ · .*/, '').toLowerCase())}` : ''}
        </p>
        ${strips}
        ${gaps.length ? `<p class="gap">${gaps.join(' ')}</p>` : ''}
        ${basisNote}
        ${noiseNote}
      </div>`;
    })
    .join('');

  const projected = tests.map((item) => {
    const valid = item.series
      .filter((point) => point.mine && typeof point.mine.ms === 'number')
      .map((point, index) => ({ index, ms: point.mine.ms }));
    return { test: item.test, result: project(valid) };
  });
  const pending = projected.filter((item) => item.result.status === 'insufficient');
  const ready = projected.filter((item) => item.result.status === 'ready');

  const projection = `
    ${
      pending.length
        ? `<div class="lock">
            <h3>Falta ${pending[0].result.need - pending[0].result.have} válida para proyectar</h3>
            ${pending
              .map((item) => {
                const steps = Array.from({ length: item.result.need }, (_, index) => `<i class="${index < item.result.have ? 'on' : ''}"></i>`).join('');
                return `<div class="projline"><span>${esc(item.test.short)}</span><div class="steps">${steps}</div><span class="c">${item.result.have} de ${item.result.need}</span></div>`;
              })
              .join('')}
            <p style="margin-top:8px">Con dos puntos la recta la elegimos nosotros, no los datos. La proyección aparece sola con la tercera válida.</p>
          </div>`
        : ''
    }
    ${ready
      .map(
        (item) => `<div class="evcard">
          <div class="hh"><h3>${esc(item.test.label)}</h3><span class="dd ${item.result.slopeMsPerValida < 0 ? 'g' : 'b'}">${item.result.slopeMsPerValida < 0 ? '−' : '+'}${Math.abs(Math.round(item.result.slopeMsPerValida))} ms/válida</span></div>
          <p class="cap">Estimación: <b class="num">${esc(formatTime(Math.round(item.result.nextMs)))}</b> sobre ${item.result.points} válidas</p>
        </div>`,
      )
      .join('')}`;

  view.innerHTML = `
    ${heroBlock({
      topLeft: 'Evolución',
      topRight: `<span>${tests[0].series.filter((point) => point.mine).length} válidas</span>`,
      title: headline,
      meta: 'puestos en el club, en segundos y milésimas',
    })}
    <div class="sheet">
      ${cards}
      <h2 class="sect">Proyección <span>solo con datos suficientes</span></h2>
      ${projection}
      <p class="note">Cada punto gris es una compañera del club con tiempo válido; el naranja es Salomé. Las dos franjas comparten la misma escala de tiempo.</p>
    </div>`;
}

/* ------------------------------------------------------------------ CARGAR */

function captureState() {
  if (!ui.capture) {
    const events = orderedEvents(state);
    const inferred = inferMeta(state, ui.test);
    ui.capture = {
      step: 'pick',
      eventId: events[events.length - 1]?.id ?? '',
      newEvent: false,
      newCode: '',
      test: ui.test,
      distanceM: inferred.distanceM ?? '',
      circuit: inferred.circuit ?? '',
      json: '',
      sheet: null,
      rows: null,
      error: null,
    };
  }
  return ui.capture;
}

/** Deja la carga lista para revisar a partir del JSON ya leído. */
function startReview(cap, sheet) {
  // La prueba y su base salen del subtítulo de la planilla: es la única fuente
  // que no se puede equivocar de selector.
  if (sheet.test) {
    cap.test = sheet.test;
    if (sheet.meta?.circuit !== undefined) cap.circuit = sheet.meta.circuit ?? '';
    if (sheet.meta?.distanceM !== undefined) cap.distanceM = sheet.meta.distanceM ?? '';
  }
  const preparadas = applyClubFallback(decorateRows(sheet.rows));
  cap.rows = preparadas.rows;
  cap.clubUnreadable = preparadas.clubUnreadable;
  cap.sheet = sheet;
  cap.error = null;
  cap.step = 'review';
  renderCargar();
}

/** Motivo por el que una fila pide revisión, en palabras y no en una etiqueta. */
function rowReason(row) {
  if (row.unreadable && row.ms === null) {
    return `No pude leer el tiempo «${row.raw}». Escribilo como 0'18"222.`;
  }
  if (!row.athleteId) {
    return 'El nombre no está en el plantel: se agrega como patinadora nueva.';
  }
  if (row.status === 'dnf' || row.status === 'elim' || row.status === 'dns') {
    return `La planilla marca ${statusLabel(row.status)}: no tiene tiempo válido y no se rankea.`;
  }
  if (!row.club) {
    return 'No pude leer el club de esta fila. Confirmá que sea del PAEN antes de guardarla.';
  }
  return null;
}

function decorateRows(rows) {
  return rows.map((row, index) => {
    const athlete = matchAthlete(row.name, state.athletes);
    // Lo que importa es el PAEN: una fila entra si el club leído es el nuestro
    // o si la patinadora ya está en el plantel. Si el club no se pudo leer, la
    // fila se muestra igual para no perderla en silencio.
    const ours = athlete?.club === state.club || sameClub(row.club, state.club);
    // El OCR a veces pega el club al final del nombre: se busca ahí también.
    const club = row.club ?? clubInName(row.name, KNOWN_CLUBS);
    // Solo se descarta cuando el club es otro club conocido de la categoría.
    // Si no se pudo leer, la fila se muestra igual para no perderla.
    const otherClub = !ours && matchesAnyClub(club, KNOWN_CLUBS);
    const decorated = {
      ...row,
      club,
      index,
      athleteId: athlete?.id ?? null,
      matchedName: athlete?.name ?? null,
      inScope: ours || !otherClub,
      // Club ilegible: la fila se ve, pero no entra salvo que el adulto la marque.
      unknownClub: !ours,
      include: ours,
    };
    decorated.lowConfidence = decorated.inScope && rowReason(decorated) !== null;
    return decorated;
  });
}

/**
 * Si en toda la planilla no se reconoció ni un club conocido, el problema es
 * la lectura de esa columna y no las filas: se muestran todas para que el
 * adulto marque las del PAEN, en vez de dejarlo en una pantalla sin salida.
 */
function applyClubFallback(rows) {
  const clubDetectado = rows.some((row) => matchesAnyClub(row.club, KNOWN_CLUBS));
  if (clubDetectado || rows.length === 0) return { rows, clubUnreadable: false };
  return {
    rows: rows.map((row) => ({ ...row, inScope: true, unknownClub: true, include: false })),
    clubUnreadable: true,
  };
}

/** Filas que se van a guardar: las que tienen tiempo legible o un estado real. */
function savableRows(rows) {
  return rows.filter((row) => row.include !== false && !(row.unreadable && row.ms === null));
}

/** Repinta una fila de la revisión sin volver a renderizar toda la vista. */
function refreshRow(target, row) {
  row.lowConfidence = rowReason(row) !== null;
  const container = target.closest('.rrow');
  if (!container) return;
  container.classList.toggle('flag', row.lowConfidence);

  const small = container.querySelector('small');
  if (small) small.textContent = row.matchedName ? 'reconocida en el plantel' : 'no está en el plantel';

  const tag = container.querySelector('.tag');
  if (tag) {
    tag.textContent = row.lowConfidence ? 'REVISAR' : 'OK';
    tag.className = `tag ${row.lowConfidence ? 'md' : 'hi'}`;
  }

  const why = container.querySelector('.why');
  const reason = rowReason(row);
  if (why) {
    why.textContent = reason ?? '';
    why.hidden = reason === null;
  }
}

function renderCargar() {
  const cap = captureState();
  const events = orderedEvents(state);
  const meta = { distanceM: cap.distanceM === '' ? null : Number(cap.distanceM), circuit: cap.circuit === '' ? null : String(cap.circuit) };

  const eventField = cap.newEvent
    ? `<div class="field">
        <label for="new-code">Código de la válida nueva</label>
        <input id="new-code" type="text" inputmode="numeric" placeholder="202702" value="${esc(cap.newCode)}" data-action="set-new-code">
        <p class="hint">Tiene que ser único. Es el prefijo de las planillas, por ejemplo 202702.</p>
      </div>`
    : '';

  let body = '';

  if (cap.step === 'pick') {
    body = `
      <div class="field">
        <label for="cap-event">Válida</label>
        <select id="cap-event" data-action="set-capture-event">
          ${events.map((event) => `<option value="${esc(event.id)}" ${event.id === cap.eventId && !cap.newEvent ? 'selected' : ''}>${esc(event.label)}</option>`).join('')}
          <option value="__new" ${cap.newEvent ? 'selected' : ''}>Nueva válida…</option>
        </select>
      </div>
      ${eventField}

      <div class="field">
        <label for="cap-json">JSON de la planilla</label>
        <textarea id="cap-json" data-action="set-json" placeholder='{
  "categoria": "PREINFANTIL 10 DAMAS",
  "clasificacion": "CLASIFICACIÓN GENERAL Habilidad Circuito #19",
  "resultados": [
    { "numero": 14, "patinador": "SALOME RENDON ERAZO", "club": "Paen", "t_final": "0\'18\"447" }
  ]
}'>${esc(cap.json)}</textarea>
        <p class="hint">La prueba y su base se leen del campo <b>clasificacion</b>: no hay que elegirlas a mano. Igual podés revisarlas abajo.</p>
      </div>

      <input class="file-input" id="cap-file" type="file" accept="application/json,.json" data-action="pick-json">
      <button class="btn ghost" data-action="choose-json">Elegir un archivo .json</button>
      <button class="btn" style="margin-top:8px" data-action="load-json" ${cap.json.trim() ? '' : 'disabled'}>Leer el JSON</button>

      <div class="field" style="margin-top:18px">
        <label for="cap-test">Prueba (se detecta del JSON, se puede cambiar)</label>
        <select id="cap-test" data-action="set-capture-test">
          ${TESTS.map((test) => `<option value="${esc(test.id)}" ${test.id === cap.test ? 'selected' : ''}>${esc(test.label)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="cap-basis">Base de la prueba</label>
        <input id="cap-basis" type="text" value="${esc(cap.test === 'habilidad' ? cap.circuit : cap.distanceM)}" placeholder="${cap.test === 'habilidad' ? 'número de circuito, ej. 19' : 'distancia en metros, ej. 600'}" data-action="set-capture-basis">
        <p class="hint">Si cambia respecto de la válida anterior, los tiempos dejan de ser comparables en segundos y la app compara por puesto en el club.</p>
      </div>
    `;
  }

  if (cap.step === 'review') {
    const leidas = cap.rows ?? [];
    // Solo el PAEN: la comparación es contra sus compañeras.
    const rows = leidas.filter((row) => row.inScope);
    const fuera = leidas.length - rows.length;

    // Nada del club: se dice claro y se ofrecen las dos salidas, sin dejar al
    // adulto en una pantalla sin acciones.
    if (rows.length === 0) {
      body = `
        <div class="empty">
          <h3>No reconocí ninguna fila del PAEN</h3>
          <p>Leí ${leidas.length} ${leidas.length === 1 ? 'fila' : 'filas'} en la planilla, pero ninguna figura como del club PAEN. No se guardó nada.</p>
          <button class="btn" data-action="capture-back">Probar con otra foto</button>
          <button class="btn ghost" data-action="paste-mode">Pegar las filas como texto</button>
          <button class="btn ghost" data-action="show-all">Ver las ${leidas.length} filas leídas</button>
        </div>
        <p class="note">Si estás seguro de que la foto es de una válida del PAEN, probá con una captura más nítida de la planilla, o pegá las filas copiadas del Excel del club.</p>
      `;
    } else {
      const flagged = rows.filter((row) => row.lowConfidence).length;
      const unknown = rows.filter((row) => row.unknownClub);
      const ours = rows.length - unknown.length;
      const mismatch = testMismatch(
        state,
        cap.test,
        rows.filter((row) => row.status === 'ok').map((row) => row.ms),
        { distanceM: cap.distanceM === '' ? null : Number(cap.distanceM), circuit: cap.circuit === '' ? null : String(cap.circuit) },
      );
      const willSave = savableRows(rows).length;
      const skipped = rows.length - willSave;
      const replacing = state.results.filter(
        (result) => result.eventId === cap.eventId && result.test === cap.test,
      ).length;
      const eventLabel = orderedEvents(state).find((item) => item.id === cap.eventId)?.label ?? 'esta válida';
      const shrinks = replacing > 0 && willSave < replacing;

      body = `
        <div class="summary">
          <div class="a"><b>${ours}</b>${ours === 1 ? 'fila del PAEN' : 'filas del PAEN'}</div>
          <div class="b"><b>${unknown.length}</b>club ilegible</div>
        </div>

        ${
          mismatch.suspect
            ? `<div class="warnbox"><b>Estos tiempos no se parecen a los de ${esc(testLabel(cap.test))}.</b> La mediana de lo leído es <b class="num">${esc(formatTime(Math.round(mismatch.observedMedian)))}</b> y en las válidas anteriores es <b class="num">${esc(formatTime(Math.round(mismatch.expectedMedian)))}</b>. Puede que la foto sea de otra prueba: revisá el selector antes de guardar.</div>`
            : ''
        }

        ${
          cap.clubUnreadable
            ? `<div class="warnbox"><b>No pude leer la columna del club en esta foto.</b> Ninguna fila quedó identificada como PAEN, así que no se guarda nada por defecto. Marcá las que sí son del club —o marcalas todas si la planilla es de una válida del PAEN— y después guardá.</div>
               <button class="btn ghost" data-action="mark-all" style="margin-bottom:12px">Marcar todas como PAEN</button>`
            : unknown.length
              ? `<div class="warnbox"><b>${unknown.length} ${unknown.length === 1 ? 'fila tiene' : 'filas tienen'} el club ilegible.</b> No se guardan salvo que las marques como del PAEN: la comparación es contra sus compañeras.</div>`
              : ''
        }

        <p class="note" style="margin-top:0">Planilla leída: <b>${esc(testLabel(cap.test))}</b> · ${esc(
          cap.test === 'habilidad'
            ? cap.circuit === '' ? 'base sin registrar' : `circuito #${cap.circuit}`
            : cap.distanceM === '' ? 'base sin registrar' : `${cap.distanceM} m`,
        )}${cap.sheet?.categoria ? ` · ${esc(cap.sheet.categoria)}` : ''}${fuera ? `. Las otras ${fuera} filas son de clubes distintos al PAEN y no se guardan.` : '.'}</p>

        ${
          replacing
            ? `<div class="warnbox"><b>Esta carga reemplaza ${replacing} ${replacing === 1 ? 'fila' : 'filas'}.</b> Ya había datos de ${esc(testLabel(cap.test))} en ${esc(eventLabel)} y se van a sustituir por las ${willSave} que confirmes acá.${
                shrinks ? ' <b>Ojo: son menos filas de las que había.</b> Si la foto no salió completa, cancelá y volvé a intentar.' : ''
              }</div>`
            : ''
        }

        ${
          flagged
            ? `<div class="warnbox"><b>Qué revisar.</b> El formato del tiempo es <b class="num">0'18"222</b> (minutos, segundos, milisegundos). Abajo de cada fila amarilla te digo qué falló.</div>`
            : ''
        }

        ${
          skipped
            ? `<div class="warnbox"><b>${skipped} ${skipped === 1 ? 'fila no se va a guardar' : 'filas no se van a guardar'}.</b> Tienen un tiempo que no se pudo leer. Corregilas si querés incluirlas.</div>`
            : ''
        }

        <div class="review">
          ${rows
            .map((row, index) => {
              const reason = rowReason(row);
              return `<div class="rrow ${row.lowConfidence ? 'flag' : ''}">
                <span class="who">
                  <input class="name-input" type="text" value="${esc(row.name)}" aria-label="Nombre de la fila ${index + 1}" data-row-name="${index}">
                  <small>${row.matchedName ? 'reconocida en el plantel' : 'no está en el plantel'}${row.club ? ` · ${esc(row.club)}` : ' · club sin leer'}</small>
                </span>
                <input type="text" value="${esc(row.raw)}" aria-label="Tiempo de ${esc(row.name)}" data-row-time="${index}" placeholder="0'00\"000" inputmode="text">
                ${
                  row.unknownClub
                    ? `<label class="pick"><input type="checkbox" data-row-include="${index}" ${row.include ? 'checked' : ''}><span>PAEN</span></label>`
                    : `<span class="tag ${row.lowConfidence ? 'md' : 'hi'}">${row.lowConfidence ? 'REVISAR' : 'OK'}</span>`
                }
                ${reason ? `<span class="why">${esc(reason)}</span>` : ''}
              </div>`;
            })
            .join('')}
        </div>

        <div class="sticky-actions">
          <button class="btn ok" data-action="save-import" ${willSave === 0 ? 'disabled' : ''}>${
            willSave === 1 ? 'Guardar 1 fila' : `Guardar ${willSave} filas`
          }</button>
          <div class="actions-row">
            <button class="btn ghost" data-action="capture-back">Otra foto</button>
            <button class="btn ghost" data-action="paste-mode">Pegar texto</button>
          </div>
        </div>
      `;
    }
  }

  if (cap.step === 'saved') {
    const event = orderedEvents(state).find((item) => item.id === cap.savedEventId) ?? null;
    const board = clubBoard(state, cap.savedEventId, cap.savedTest);
    const mine = board.sorted.find((row) => row.athleteId === state.me) ?? null;
    body = `
      <div class="empty" style="border-style:solid">
        <h3>Guardado y comparado</h3>
        <p>${cap.savedCount} filas de ${esc(testLabel(cap.savedTest))} entraron al registro de ${esc(event?.label ?? 'la válida')}.</p>
      </div>
      <div class="evcard" style="margin-top:12px">
        <div class="hh"><h3>Salomé en el club</h3><span class="dd ${mine?.pos ? 'g' : 'f'}">${mine?.pos ?? '—'}.º</span></div>
        <p class="cap">${mine?.status === 'ok' ? `${esc(formatTime(mine.ms))} · ${mine.pos}.ª de ${board.timedCount} del club` : 'Sin tiempo válido en esta prueba'}</p>
      </div>
      <button class="btn" data-action="go" data-href="#club">Ver el club</button>
      <button class="btn ghost" data-action="capture-back">Cargar otra prueba</button>
    `;
  }

  view.innerHTML = `
    ${heroBlock({
      topLeft: 'Cargar',
      topRight: `<span>${
        cap.step === 'pick' ? 'paso 1 de 2' : cap.step === 'review' ? 'paso 2 de 2' : 'listo'
      }</span>`,
      title: cap.step === 'review' ? 'Esto es lo que voy a guardar' : cap.step === 'saved' ? 'Confirmado' : 'Cargá una válida',
      meta:
        cap.step === 'review'
          ? 'nada se guarda sin este paso'
          : cap.step === 'saved'
            ? 'la comparación ya está actualizada'
            : 'pegá el JSON de la planilla y confirmá las filas del PAEN',
    })}
    <div class="sheet">
      ${cap.error ? `<div class="warnbox"><b>${esc(cap.error.title)}</b> ${esc(cap.error.detail)}</div>` : ''}
      ${body}
      ${
        cap.step === 'pick'
          ? `<p class="note">El JSON tiene que traer <b>resultados</b> con al menos <b>patinador</b> y <b>t_final</b> por fila. Si falta el club, esas filas se muestran aparte para que las marques. No hace falta que el archivo esté ordenado ni completo: se guardan solo las filas del PAEN.</p>`
          : ''
      }
    </div>`;
}

/* ------------------------------------------------------------------ router */

const ROUTES = {
  hoy: renderHoy,
  club: renderClub,
  evolucion: renderEvolucion,
  cargar: renderCargar,
};

function currentRoute() {
  const name = (location.hash || '#hoy').replace('#', '');
  return ROUTES[name] ? name : 'hoy';
}

function render() {
  const route = currentRoute();
  ROUTES[route]();
  document.querySelectorAll('.tabbar a').forEach((link) => {
    if (link.dataset.tab === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ------------------------------------------------------------------ eventos */

function persist() {
  if (!saveState(state)) toast('No se pudo guardar en este dispositivo');
}

function setTest(testId) {
  ui.test = testId;
  if (ui.capture && ui.capture.step === 'pick') {
    ui.capture.test = testId;
    const inferred = inferMeta(state, testId);
    ui.capture.distanceM = inferred.distanceM ?? '';
    ui.capture.circuit = inferred.circuit ?? '';
  }
  render();
}

view.addEventListener('click', async (event) => {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;
  const action = trigger.dataset.action;

  if (action === 'set-test') {
    setTest(trigger.dataset.test);
    return;
  }

  if (action === 'go') {
    location.hash = trigger.dataset.href;
    return;
  }

  if (action === 'choose-file') {
    document.getElementById('cap-file')?.click();
    return;
  }

  if (action === 'choose-json') {
    document.getElementById('cap-file')?.click();
    return;
  }

  if (action === 'load-json') {
    const cap = captureState();
    const sheet = parseSheetJson(cap.json ?? '');
    if (!sheet.ok) {
      cap.error = { title: 'El JSON no sirve todavía.', detail: sheet.error };
      renderCargar();
      return;
    }
    startReview(cap, sheet);
    return;
  }

  if (action === 'mark-all') {
    const cap = captureState();
    cap.rows = (cap.rows ?? []).map((row) => (row.inScope ? { ...row, include: true, unknownClub: false } : row));
    renderCargar();
    return;
  }

  if (action === 'show-all') {
    const cap = captureState();
    cap.rows = (cap.rows ?? []).map((row) => ({ ...row, inScope: true, unknownClub: true, include: false }));
    cap.clubUnreadable = true;
    renderCargar();
    return;
  }

  if (action === 'capture-back') {
    if (ui.capture?.url) URL.revokeObjectURL(ui.capture.url);
    ui.capture = null;
    renderCargar();
    return;
  }

  if (action === 'extract-text') {
    const cap = captureState();
    const clubNames = [...new Set(state.athletes.map((athlete) => athlete.club).filter(Boolean))];
    const preparadas = applyClubFallback(
      decorateRows(extractRowsFromText(cap.paste ?? '', { clubNames, knownClubs: KNOWN_CLUBS })),
    );
    const rows = preparadas.rows;
    cap.clubUnreadable = preparadas.clubUnreadable;
    if (rows.length === 0) {
      cap.error = { title: 'No encontré filas.', detail: 'Cada línea necesita un nombre y un tiempo como 0\'25"828.' };
      renderCargar();
      return;
    }
    cap.error = null;
    cap.rows = rows;
    cap.step = 'review';
    renderCargar();
    return;
  }

  if (action === 'save-import') {
    const cap = captureState();
    const rows = savableRows((cap.rows ?? []).filter((row) => row.inScope));
    if (rows.length === 0) {
      cap.error = { title: 'No hay nada para guardar.', detail: 'Ninguna fila tiene un tiempo legible todavía.' };
      renderCargar();
      return;
    }
    let next = state;

    if (cap.newEvent) {
      const code = String(cap.newCode || '').trim();
      if (!/^\d{6}$/.test(code)) {
        cap.error = { title: 'El código de la válida no sirve.', detail: 'Usá seis dígitos, por ejemplo 202702.' };
        renderCargar();
        return;
      }
      next = addEvent(next, { code });
      cap.eventId = code;
      cap.newEvent = false;
    }

    const distanceM = cap.test === 'habilidad' ? null : cap.distanceM === '' ? null : Number(cap.distanceM);
    const circuit = cap.test === 'habilidad' ? (cap.circuit === '' ? null : String(cap.circuit)) : null;

    next = applyImport(next, {
      eventId: cap.eventId,
      test: cap.test,
      rows: rows.map((row) => ({
        name: row.matchedName ?? row.name,
        athleteId: row.athleteId,
        // Todo lo que llega acá pasó el filtro de club: la patinadora es del PAEN.
        club: state.club,
        ms: row.ms,
        status: row.status,
        raw: row.raw,
        index: row.index,
      })),
      meta: { distanceM, circuit },
    });

    state = next;
    persist();
    ui.eventId = cap.eventId;
    cap.savedEventId = cap.eventId;
    cap.savedTest = cap.test;
    cap.savedCount = rows.length;
    cap.step = 'saved';
    cap.error = null;
    renderCargar();
    toast(`${rows.length} filas guardadas`);
  }
});

view.addEventListener('change', async (event) => {
  const target = event.target;

  const includeIndex = target.dataset.rowInclude;
  if (includeIndex !== undefined) {
    const cap = captureState();
    const row = cap.rows?.[Number(includeIndex)];
    if (row) {
      row.include = target.checked;
      renderCargar();
    }
    return;
  }

  const action = target.dataset.action;

  if (action === 'set-event') {
    ui.eventId = target.value;
    render();
    return;
  }

  if (action === 'set-capture-event') {
    const cap = captureState();
    if (target.value === '__new') {
      cap.newEvent = true;
      cap.eventId = '';
    } else {
      cap.newEvent = false;
      cap.eventId = target.value;
    }
    renderCargar();
    return;
  }

  if (action === 'set-engine') {
    const cap = captureState();
    cap.engine = target.value === 'gemma' ? 'gemma' : 'tesseract';
    renderCargar();
    return;
  }

  if (action === 'set-capture-test') {
    const cap = captureState();
    cap.test = target.value;
    const inferred = inferMeta(state, cap.test);
    cap.distanceM = inferred.distanceM ?? '';
    cap.circuit = inferred.circuit ?? '';
    renderCargar();
    return;
  }

  if (action === 'pick-json') {
    const file = target.files?.[0];
    if (!file) return;
    const cap = captureState();
    try {
      cap.json = await file.text();
    } catch {
      cap.error = { title: 'No pude leer el archivo.', detail: 'Probá copiando el contenido y pegándolo en el cuadro.' };
      renderCargar();
      return;
    }
    const sheet = parseSheetJson(cap.json);
    if (!sheet.ok) {
      cap.error = { title: `${file.name} no es un JSON de planilla.`, detail: sheet.error };
      renderCargar();
      return;
    }
    startReview(cap, sheet);
  }
});

view.addEventListener('input', (event) => {
  const target = event.target;

  if (target.dataset.action === 'set-new-code') {
    captureState().newCode = target.value;
    return;
  }

  if (target.dataset.action === 'set-json') {
    const cap = captureState();
    cap.json = target.value;
    const button = view.querySelector('[data-action="load-json"]');
    if (button) button.disabled = target.value.trim() === '';
    return;
  }

  const nameIndex = target.dataset.rowName;
  if (nameIndex !== undefined) {
    const cap = captureState();
    const row = cap.rows?.[Number(nameIndex)];
    if (!row) return;
    const athlete = matchAthlete(target.value, state.athletes);
    row.name = target.value;
    row.athleteId = athlete?.id ?? null;
    row.matchedName = athlete?.name ?? null;
    refreshRow(target, row);
    return;
  }

  if (target.dataset.action === 'set-capture-basis') {
    const cap = captureState();
    if (cap.test === 'habilidad') cap.circuit = target.value.trim();
    else cap.distanceM = target.value.trim();
    return;
  }

  const rowIndex = target.dataset.rowTime;
  if (rowIndex !== undefined) {
    const cap = captureState();
    const row = cap.rows?.[Number(rowIndex)];
    if (!row) return;
    const parsed = parseTime(target.value);
    row.raw = target.value;
    row.ms = parsed;
    row.unreadable = parsed === null && !/^(dnf|elim|dns)$/i.test(target.value.trim());
    row.status = parsed !== null
      ? 'ok'
      : /^dnf$/i.test(target.value.trim())
        ? 'dnf'
        : /^elim$/i.test(target.value.trim())
          ? 'elim'
          : 'dns';
    refreshRow(target, row);
  }
});

window.addEventListener('hashchange', render);
window.addEventListener('beforeunload', () => {
  if (ui.capture?.url) URL.revokeObjectURL(ui.capture.url);
});

/* --------------------------------------------------------------- arranque */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* sin service worker la app sigue funcionando, solo pierde el modo offline */
    });
  });
}

render();