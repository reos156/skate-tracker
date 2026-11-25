// Pruebas de la capa de render: src/app.js corrido sobre un DOM mínimo.
// Cubren las specs que viven en la interfaz (S2-S5, S8-S10) — el punto ciego
// que un test de solo-lógica no ve.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedState, applyImport, addEvent } from '../src/store.js';

const APP = new URL('../src/app.js', import.meta.url).href;
let caseId = 0;

function el(id) {
  const node = {
    id,
    html: '',
    attrs: {},
    dataset: {},
    style: {},
    textContent: '',
    classList: {
      set: new Set(),
      add(name) { this.set.add(name); },
      remove(name) { this.set.delete(name); },
      toggle(name, on) { if (on) this.set.add(name); else this.set.delete(name); },
      contains(name) { return this.set.has(name); },
    },
    set innerHTML(value) { this.html = String(value); },
    get innerHTML() { return this.html; },
    addEventListener(type, fn) { (this.listeners ??= {})[type] = (this.listeners[type] ?? []).concat(fn); },
    dispatch(type, event) { for (const fn of this.listeners?.[type] ?? []) fn(event); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute(key, value) { this.attrs[key] = value; },
    removeAttribute(key) { delete this.attrs[key]; },
    closest() { return null; },
    click() {},
    appendChild() {},
  };
  return node;
}

/** Arranca src/app.js contra un DOM mínimo. `state` precarga el almacenamiento. */
async function boot({ state, hash = '#hoy' } = {}) {
  const view = el('view');
  const tabs = ['hoy', 'club', 'evolucion', 'cargar'].map((tab) => {
    const link = el(tab);
    link.dataset.tab = tab;
    return link;
  });
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };
  if (state) memory.set('skate-tracker/v1', JSON.stringify(state));

  const location = { hash };
  globalThis.location = location;
  globalThis.document = {
    getElementById: (id) => (id === 'view' ? view : el(id)),
    querySelector: () => null,
    querySelectorAll: (selector) => (selector === '.tabbar a' ? tabs : []),
    addEventListener() {},
    createElement: () => el('script'),
    head: el('head'),
    body: el('body'),
  };
  globalThis.window = {
    addEventListener(type, fn) { (this.listeners ??= {})[type] = (this.listeners[type] ?? []).concat(fn); },
    dispatch(type, event) { for (const fn of this.listeners?.[type] ?? []) fn(event); },
    scrollTo() {},
    location,
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { serviceWorker: { register: async () => {} } },
    configurable: true,
  });
  globalThis.URL.createObjectURL = () => 'blob:x';
  globalThis.URL.revokeObjectURL = () => {};

  await import(`${APP}?case=${(caseId += 1)}`);

  const render = (route) => {
    location.hash = `#${route}`;
    globalThis.window.dispatch('hashchange', {});
    return view.html;
  };
  const click = (action, dataset = {}) => {
    const target = { dataset: { action, ...dataset }, closest: () => target };
    view.dispatch('click', { target });
    return view.html;
  };
  const change = (dataset, value, extra = {}) => {
    view.dispatch('change', { target: { dataset, value, ...extra } });
    return view.innerHTML;
  };
  const input = (dataset, value) =>
    view.dispatch('input', { target: { dataset, value, closest: () => null } });

  return { view, render, click, change, input, memory };
}

test('S1/S2/S3: #hoy pinta la marca, el delta y el puesto en el club', async () => {
  const { render } = await boot();
  const html = render('hoy');
  assert.ok(html.includes(`0'25&quot;828`), 'la marca de 200 m de 202611');
  assert.match(html, /8\.º de 12 en PAEN/);
  assert.match(html, /4 puestos desde la válida anterior/);
  // Las metas se dicen en segundos: al rival de adelante y al podio.
  assert.match(html, /Para alcanzar a Samai Valeria · 7\.ª/);
  assert.match(html, /Para el podio · 3\.ª/);
  assert.match(html, /0,188 <span>s<\/span>/);
  assert.match(html, /1,167 <span>s<\/span>/);
});

test('S3/S9/S10: #club recalcula puestos y muestra DNF y ELIM, nunca cero', async () => {
  const { render, click } = await boot();
  let html = render('club');
  assert.ok(html.includes('DNF'));
  assert.match(html, /—<\/span>\s*<span class="bib">16<\/span>\s*<span class="nm">Mariangel Ospina Trejos/);
  html = click('set-test', { test: 'olimpica' });
  assert.ok(html.includes('Luciana Villa Castillo'));
  assert.ok(html.includes('ELIM'));
  assert.ok(!html.includes(`0'00"000`));
});

test('S10: los empates comparten puesto y el siguiente salta', async () => {
  const { render, change, click } = await boot();
  render('hoy');
  change({ action: 'set-event' }, '202608');
  click('set-test', { test: 'olimpica' });
  const html = render('club');

  // Tres tiempos idénticos de 1'01"587: el podio muestra tres primeros.
  const podium = [...html.matchAll(/<span class="plrank">([^<]*)</g)].map((match) => match[1]);
  assert.deepEqual(podium, ['1', '1', '1']);

  // Y el resto salta el bloque empatado: 4, 7, 10, 11.
  const positions = [...html.matchAll(/<span class="pos">([^<]*)</g)].map((match) => match[1]);
  assert.deepEqual(positions, ['4', '4', '4', '7', '7', '7', '10', '11', '11', '11']);
});

test('S4: con dos válidas informa lo que falta y no inventa una cifra', async () => {
  const { render } = await boot();
  const html = render('evolucion');
  assert.match(html, /Falta 1 válida para proyectar/);
  assert.match(html, /2 de 3/, 'debe informar que tiene 2 de 3');
  assert.ok(!html.includes('Estimación'), 'no debe estimar con dos puntos');
});

test('S14: Evolución habla de puestos y milésimas, no de porcentajes', async () => {
  const { render } = await boot();
  const html = render('evolucion');

  assert.match(html, /Subiste puestos en 2 de 3 pruebas/);
  assert.match(html, /ahora <b>8\.ª<\/b> de 12/, 'el puesto en los 200 m');
  assert.match(html, /subió 4 puestos/, 'el movimiento en puestos');
  assert.ok(!/%/.test(html.replace(/<svg[\s\S]*?<\/svg>/g, '')), 'ningún porcentaje en la vista');
});

test('S15: además del próximo rival, dice cuánto falta para el podio', async () => {
  const { render } = await boot();
  const html = render('evolucion');

  // 200 m: 7.ª es Samai 0'25"640 → 0,188 s; 3.ª es 0'24"661 → 1,167 s
  assert.match(html, /Te faltan <b>0,188 s<\/b> para alcanzar a/);
  assert.match(html, /Y <b>1,167 s<\/b> para entrar al podio, en la 3\.ª/);

  // Habilidad: 6.ª Sara 0'18"439 → 0,008 s; 3.ª 0'18"034 → 0,413 s
  assert.match(html, /Te faltan <b>0,008 s<\/b>/);
  assert.match(html, /Y <b>0,413 s<\/b> para entrar al podio/);
});

test('S4: con tres válidas proyecta la próxima', async () => {
  const state = applyImport(addEvent(seedState(), { code: '202702' }), {
    eventId: '202702',
    test: 'remates200',
    rows: [
      { name: 'Salomé Rendón Erazo', athleteId: 'salome-rendon', ms: 25700, status: 'ok', raw: `0'25"700`, index: 0 },
    ],
    meta: { distanceM: 200, circuit: null },
  });
  const { render } = await boot({ state, hash: '#evolucion' });
  const html = render('evolucion');
  assert.ok(html.includes('Estimación'), 'con tres puntos debe estimar');
  assert.ok(!/NaN|undefined/.test(html));
});

const PLANILLA = {
  categoria: 'PREINFANTIL 10 DAMAS',
  clasificacion: 'CLASIFICACIÓN GENERAL Habilidad Circuito #19',
  resultados: [
    { pos: '1-', numero: 393, patinador: 'MARÍA ISABEL OSPINA MARÍN', club: 'Golden Skate', t_final: `0'17"051`, penalizacion: 0 },
    { pos: null, numero: 16, patinador: 'MARIANGEL OSPINA TREJOS', club: 'Paen', t_final: `0'17"546`, penalizacion: 0 },
    { pos: null, numero: 14, patinador: 'SALOME RENDON ERAZO', club: 'Paen', t_final: `0'18"447`, penalizacion: 0 },
    { pos: null, numero: 18, patinador: 'MARIA ANTONIA RAMIREZ GIRALDO', club: 'Paen', t_final: `0'20"454`, penalizacion: 0 },
  ],
};

async function cargar(objeto) {
  const harness = await boot({ hash: '#cargar' });
  harness.input({ action: 'set-json' }, typeof objeto === 'string' ? objeto : JSON.stringify(objeto));
  const html = harness.click('load-json');
  return { ...harness, html };
}

test('S5: nada se guarda antes de confirmar y sí después', async () => {
  const { click, memory } = await cargar(PLANILLA);
  assert.equal(memory.get('skate-tracker/v1'), undefined, 'sin confirmar no se escribe nada');

  click('save-import');
  const saved = JSON.parse(memory.get('skate-tracker/v1'));
  const filas = saved.results.filter((r) => r.eventId === '202611' && r.test === 'habilidad');
  assert.equal(filas.length, 3, 'solo las tres del PAEN');
  assert.ok(filas.some((r) => r.athleteId === 'salome-rendon' && r.ms === 18447));
});

test('S5: la prueba y el circuito salen del subtítulo de la planilla', async () => {
  const { html } = await cargar(PLANILLA);
  assert.match(html, /Habilidad circuito/);
  assert.ok(html.includes('circuito #19'), 'la base detectada se muestra en la revisión o en el resumen');
});

test('S5: la revisión avisa cuántas filas reemplaza', async () => {
  const { html } = await cargar(PLANILLA);
  assert.match(html, /reemplaza 12 filas/);
  assert.match(html, /Guardar 3 filas</);
});

test('S5: un tiempo ilegible explica el motivo y no se guarda', async () => {
  const { html, click, memory } = await cargar({
    clasificacion: 'Habilidad Circuito #19',
    resultados: [
      { patinador: 'SALOME RENDON ERAZO', club: 'Paen', t_final: `0'18"447` },
      { patinador: 'ISABELLA MEJIAS CARVAJAL', club: 'Paen', t_final: `7:14'779` },
    ],
  });
  assert.match(html, /No pude leer el tiempo/);
  assert.match(html, /no se va a guardar/);
  assert.match(html, /Guardar 1 fila</);

  click('save-import');
  const saved = JSON.parse(memory.get('skate-tracker/v1'));
  const filas = saved.results.filter((r) => r.eventId === '202611' && r.test === 'habilidad');
  assert.equal(filas.length, 1, 'la ilegible no entra');
});

test('S11: la revisión se queda solo con las filas del PAEN', async () => {
  const { html } = await cargar(PLANILLA);
  assert.match(html, /3<\/b>filas del PAEN/);
  assert.match(html, /son de clubes distintos al PAEN y no se guardan/);
  assert.ok(!html.includes('MARÍA ISABEL OSPINA MARÍN'), 'la de otro club no se muestra');
});

test('S11: una fila sin club se ve, pero no entra salvo que se marque', async () => {
  const { html, change } = await cargar({
    clasificacion: 'Habilidad Circuito #19',
    resultados: [
      { patinador: 'SALOME RENDON ERAZO', club: 'Paen', t_final: `0'18"447` },
      { patinador: 'ISABELLA MEJIAS CARVAJAL', t_final: `0'18"173` },
    ],
  });
  assert.match(html, /1<\/b>fila del PAEN/);
  assert.match(html, /1<\/b>club ilegible/);
  assert.match(html, /Guardar 1 fila</, 'por defecto no entra la que no tiene club');

  const marcada = change({ rowInclude: '1' }, '', { checked: true });
  assert.match(marcada, /Guardar 2 filas</, 'marcarla la suma a la carga');
});

test('S5: un JSON inválido se explica y no rompe la pantalla', async () => {
  const { html } = await cargar('{ esto no es json }');
  assert.match(html, /El JSON no sirve todavía/);
  assert.match(html, /no es JSON válido/);
});

test('S5: la pantalla de carga ya no ofrece foto', async () => {
  const { render } = await boot({ hash: '#cargar' });
  const html = render('cargar');
  assert.ok(!html.includes('Tomar o elegir foto'), 'no hay carga por foto');
  assert.ok(!html.includes('Motor de lectura'), 'no hay selector de OCR');
  assert.ok(html.includes('JSON de la planilla'));
});

test('S16: ningún porcentaje en toda la app', async () => {
  const { render } = await boot();
  for (const route of ['hoy', 'club', 'evolucion', 'cargar']) {
    const html = render(route).replace(/<svg[\s\S]*?<\/svg>/g, ' ');
    assert.ok(!html.includes('%'), `${route} todavía muestra un porcentaje`);
  }
});

test('S17: el carril y la regla de los puestos están siempre visibles', async () => {
  const { render } = await boot();
  const html = render('club');
  assert.ok(!html.includes('<details'), 'no puede estar escondido detrás de un desplegable');
  assert.match(html, /El carril y la regla de los puestos/);
});

test('S18: el punto del carril lleva el dorsal que aparece en la tabla', async () => {
  const { render } = await boot();
  const html = render('club');

  // columna de dorsal en la tabla
  assert.match(html, /<span class="bib">14<\/span>/, 'Salomé, dorsal 14');
  assert.match(html, /<span class="bib">16<\/span>/, 'Mariangel Ospina, dorsal 16');

  // y el mismo número dentro de cada punto del carril
  const lane = html.slice(html.indexOf('class="lane"'));
  const dots = [...lane.matchAll(/<text[^>]*font-weight="(?:700|800)"[^>]*>(\d+)<\/text>/g)].map((m) => m[1]);
  assert.ok(dots.includes('14'), 'el punto de Salomé muestra 14');
  assert.ok(dots.includes('19'), 'el punto de Luciana Villa muestra 19');
  assert.equal(dots.length, 12, 'un punto por cada una de las 12 con tiempo válido');
  assert.ok(!dots.includes('16'), 'Mariangel Ospina es DNF: no tiene punto porque no tiene tiempo');
});

test('S19: las tres tarjetas de Hoy dicen el movimiento en puestos', async () => {
  const { render } = await boot();
  const html = render('hoy');

  assert.match(html, /subió 4 puestos desde la válida 1/, '200 m: 12.ª → 8.ª');
  assert.match(html, /mismo puesto desde la válida 1/, 'olímpica: 10.ª → 10.ª');
  assert.match(html, /subió 6 puestos desde la válida 1/, 'habilidad: 13.ª → 7.ª');

  // y no se perdió nada de lo que ya decía Evolución
  const evolucion = render('evolucion');
  assert.match(evolucion, /Te faltan <b>0,188 s<\/b>/);
  assert.match(evolucion, /para entrar al podio/);
  assert.match(evolucion, /puede ser del día y no del entrenamiento/);
});
