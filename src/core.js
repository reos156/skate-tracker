// Núcleo puro de Skate Tracker: sin DOM, sin red, sin estado.
// Todo lo que decide números vive acá para poder probarlo con node --test.

/** Las tres pruebas de la categoría. El orden es el orden de la app. */
export const TESTS = [
  { id: 'remates200', label: 'Remates 200 m + distancia', short: '200 m' },
  { id: 'olimpica', label: 'Velocidad olímpica', short: 'Olímpica' },
  { id: 'habilidad', label: 'Habilidad circuito', short: 'Habilidad' },
];

export const TEST_IDS = TESTS.map((t) => t.id);

// El OCR de una planilla fotografiada pierde el apóstrofo de los minutos con
// mucha facilidad: 2'01"424 se lee 201424, 201"424 o 018"222. Estos patrones
// cubren las formas que el formato de la planilla hace inequívocas; todo lo
// demás sigue siendo null.
const TIME_RE = /^(\d+)'(\d{2})"(\d{1,3})$/;
const NO_APOSTROPHE_TIME = /^(\d)?(\d{2})"(\d{1,3})$/;
const DIGITS_TIME = /^(\d)(\d{2})(\d{3})$/;
const SHORT_DIGITS_TIME = /^(\d{2})(\d{3})$/;
const STATUS_TOKENS = new Map([
  ['dnf', 'dnf'],
  ['elim', 'elim'],
  ['dns', 'dns'],
  ['el', 'elim'],
]);

function straighten(value) {
  return String(value)
    .replace(/[\u2018\u2019\u02BC\u00B4]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .trim();
}

/**
 * Lee un tiempo impreso como 0'25"828 y devuelve milisegundos.
 * Devuelve null para DNF/ELIM, texto vacío o cualquier formato inesperado:
 * un tiempo ilegible nunca se convierte en cero.
 */
export function parseTime(raw) {
  if (raw === null || raw === undefined) return null;
  const text = straighten(raw).replace(/\s+/g, '');

  let minutes;
  let seconds;
  let millis;

  const strict = TIME_RE.exec(text);
  if (strict) {
    [, minutes, seconds, millis] = strict;
  } else {
    const apostropheLost = NO_APOSTROPHE_TIME.exec(text);
    const bareDigits = DIGITS_TIME.exec(text);
    const shortDigits = SHORT_DIGITS_TIME.exec(text);
    if (apostropheLost) {
      [, minutes, seconds, millis] = apostropheLost;
      minutes = minutes ?? '0';
    } else if (bareDigits) {
      [, minutes, seconds, millis] = bareDigits;
    } else if (shortDigits) {
      [, seconds, millis] = shortDigits;
      minutes = '0';
    } else {
      return null;
    }
  }

  const m = Number(minutes);
  const sec = Number(seconds);
  const ms = Number(millis.padEnd(3, '0'));
  // La categoría corre en minutos de un dígito y los segundos nunca llegan a 60:
  // fuera de eso el token es ruido del OCR, no un tiempo.
  if (m > 9 || sec > 59) return null;
  return m * 60000 + sec * 1000 + ms;
}

/** Imprime milisegundos con el mismo formato de las planillas. */
export function formatTime(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '—';
  const total = Math.round(ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${minutes}'${String(seconds).padStart(2, '0')}"${String(millis).padStart(3, '0')}`;
}

/** Diferencia con signo, en el formato de la planilla: −0"095. */
export function formatDelta(ms) {
  const abs = formatTime(Math.abs(ms));
  return `${ms < 0 ? '−' : '+'}${abs}`;
}

/**
 * Ranking de competencia: los empates comparten puesto y el siguiente
 * salta (1, 1, 1, 4). Las filas sin tiempo válido no se rankean.
 */
export function rankResults(rows) {
  // La identidad de la fila no siempre es `id`: las filas recién importadas de
  // un JSON traen `index`. Sin una clave única los puestos colapsan en uno solo.
  const normalized = rows.map((row, position) => ({
    ...row,
    key: row.id ?? row.index ?? `row-${position}`,
    status: row.status ?? 'ok',
    penalties: row.penalties ?? 0,
  }));
  // Una penalización no cambia el tiempo impreso pero sí el puesto: la planilla
  // manda al final a quien tiene faltas, así que el orden es faltas y después tiempo.
  const timed = normalized
    .filter((row) => row.status === 'ok' && typeof row.ms === 'number')
    .sort((a, b) => (a.penalties > 0) - (b.penalties > 0) || a.ms - b.ms);
  const byId = new Map();
  let lastMs = null;
  let lastPos = 0;
  timed.forEach((row, index) => {
    const pos = row.ms === lastMs ? lastPos : index + 1;
    byId.set(row.key, pos);
    lastMs = row.ms;
    lastPos = pos;
  });
  return normalized.map((row) => ({ ...row, pos: byId.get(row.key) ?? null }));
}

/** Brecha porcentual contra la referencia. Menos es mejor. */
export function gapPct(ms, referenceMs) {
  if (typeof ms !== 'number' || typeof referenceMs !== 'number' || referenceMs === 0) return null;
  return ((ms - referenceMs) / referenceMs) * 100;
}

/**
 * Dos resultados solo se pueden comparar en segundos si miden lo mismo.
 * La olímpica cambió de base entre 202608 y 202611 y el circuito de
 * habilidad cambió de #14 a #19: esos pares se comparan en brecha %.
 */
export function isComparableInSeconds(a, b) {
  if (!a || !b) return false;
  return (a.distanceM ?? null) === (b.distanceM ?? null) && (a.circuit ?? null) === (b.circuit ?? null);
}

/** Puntos mínimos para que una proyección sea una tendencia y no un dibujo. */
export const PROJECTION_MIN_POINTS = 3;

/**
 * Tendencia lineal sobre los puntos ya ordenados por válida.
 * Con menos de tres puntos devuelve el estado insuficiente con el conteo,
 * nunca una cifra inventada.
 */
export function project(series) {
  const points = (series ?? []).filter((point) => typeof point.ms === 'number');
  if (points.length < PROJECTION_MIN_POINTS) {
    return {
      status: 'insufficient',
      have: points.length,
      need: PROJECTION_MIN_POINTS,
    };
  }
  const n = points.length;
  const meanX = points.reduce((sum, point) => sum + point.index, 0) / n;
  const meanY = points.reduce((sum, point) => sum + point.ms, 0) / n;
  const covariance = points.reduce((sum, point) => sum + (point.index - meanX) * (point.ms - meanY), 0);
  const variance = points.reduce((sum, point) => sum + (point.index - meanX) ** 2, 0);
  const slopeMsPerValida = variance === 0 ? 0 : covariance / variance;
  const nextIndex = points[n - 1].index + 1;
  return {
    status: 'ready',
    slopeMsPerValida,
    nextIndex,
    nextMs: meanY + slopeMsPerValida * (nextIndex - meanX),
    points: n,
  };
}

/** Minúsculas, sin acentos, sin espacios de sobra. */
export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distancia de edición, acotada: solo interesa si es 0 o 1. */
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * ¿El club impreso corresponde al esperado? El OCR lee «Paen» como «Pain»,
 * «Paem» o «PAEN!», así que se tolera un carácter de diferencia. Un club
 * distinto («Pacal», «Patinemos») queda lejos y no pasa.
 */
export function sameClub(printed, expected) {
  const a = normalizeName(printed);
  const b = normalizeName(expected);
  if (!a || !b) return false;
  return editDistance(a.split(' ')[0], b.split(' ')[0]) <= 1;
}

/** ¿El texto impreso coincide con alguno de los clubes conocidos? */
export function matchesAnyClub(printed, clubs = []) {
  return clubs.some((club) => sameClub(printed, club));
}

/**
 * Busca un club conocido pegado al final del nombre, que es como el OCR lo
 * deja cuando no separa la columna: «… UrakanesBello», «… atentos De Antioquia».
 */
export function clubInName(name, clubs = []) {
  const words = normalizeName(name).split(' ').filter(Boolean);
  for (let take = 1; take <= Math.min(4, words.length); take += 1) {
    const tail = words.slice(-take);
    const glued = tail.join('');
    for (const club of clubs) {
      const key = normalizeName(club).replace(/ /g, '');
      if (tail.length && sameClub(tail.join(' '), club)) return club;
      if (glued.length >= 4 && editDistance(glued, key) <= 1) return club;
    }
  }
  return null;
}

/** Resuelve un nombre impreso contra el plantel. Sin coincidencia devuelve null. */
export function matchAthlete(printedName, roster) {
  const printed = normalizeName(printedName);
  if (!printed) return null;
  let best = null;
  for (const athlete of roster) {
    const candidate = normalizeName(athlete.name);
    if (candidate === printed) return athlete;
    const full = candidate.split(' ');
    const incoming = printed.split(' ');
    // Una palabra impresa cuenta como la del plantel si es igual, si la
    // contiene (el OCR pega palabras: «samaivaleria») o si difiere en una letra
    // («RUJE» por «RUIE», como viene impreso en la planilla).
    const wordMatches = (word) =>
      full.includes(word) ||
      full.some((part) => part.length >= 5 && word.includes(part)) ||
      full.some((part) => part.length >= 4 && word.length >= 4 && editDistance(word, part) <= 1);
    const covers = incoming.length >= 2 && incoming.every(wordMatches);
    if (covers && (!best || full.length < best.words)) {
      best = { athlete, words: full.length };
    }
  }
  return best ? best.athlete : null;
}

const ROW_TOLERANCE = 6;
const LOOKS_LIKE_TIME = /\d{1,2}\s*[:'\u2019"]\s*\d{2}\s*["\u201d]?\s*\d{0,3}/;
const LETTER = /[a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00fc\u00f1]/i;

/**
 * Parte las palabras de una línea en celdas usando los separadores de columna
 * que deja el OCR (`|`, `_|`, `|NOMBRE`, tabulaciones). Es la señal más
 * confiable para distinguir nombre de club: la planilla es
 * posición | dorsal | nombre | club | tiempo.
 */
function toCells(tokens) {
  const cells = [[]];
  const push = () => {
    if (cells[cells.length - 1].length) cells.push([]);
  };
  for (const token of tokens) {
    const text = String(token.text).replace(/\t/g, '|');
    if (/^[|_\s]+$/.test(text)) {
      push();
      continue;
    }
    const parts = text.split('|');
    parts.forEach((part, index) => {
      if (index > 0) push();
      const clean = part.replace(/^[|_\s]+|[|_\s]+$/g, '');
      if (clean) cells[cells.length - 1].push({ ...token, text: clean });
    });
  }
  return cells.filter((cell) => cell.length > 0);
}

/** Primeras palabras con letras de la celda, sin dorsales ni numeración delante. */
function cellName(cell) {
  const tokens = [...cell];
  while (tokens.length > 0 && !LETTER.test(tokens[0].text)) tokens.shift();
  const text = tokens
    .map((token) => token.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\s.'\u00b4-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

/**
 * Parte una secuencia de palabras en tramos separados por un hueco mucho
 * mayor que el espacio normal entre palabras. Se usa solo cuando el OCR no
 * dejó separadores de columna.
 */
function splitRuns(words) {
  if (words.length === 0) return [];
  const gaps = [];
  for (let i = 1; i < words.length; i += 1) {
    gaps.push(words[i].x0 - words[i - 1].x1);
  }
  if (gaps.length === 0) return [[words[0]]];
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const threshold = Math.max(median * 2.2, 10);
  const runs = [[words[0]]];
  gaps.forEach((gap, index) => {
    if (gap > threshold) runs.push([words[index + 1]]);
    else runs[runs.length - 1].push(words[index + 1]);
  });
  return runs;
}

/**
 * Elige las palabras del nombre (a la izquierda del tiempo) y, si la línea
 * trae columnas separadas, también el club: la celda siguiente al nombre.
 */
function pickNameTokens(left, knownClubs, allClubs) {
  const cells = toCells(left).filter((cell) => cell.some((token) => LETTER.test(token.text)));
  if (cells.length >= 2) {
    // El OCR puede partir el nombre en varias celdas, así que la columna del
    // club se reconoce por su nombre y no por su posición. Si no coincide con
    // ningún club conocido, el nombre es todo y el club queda sin identificar.
    // Sin lista de clubes se cae a la posición: la última celda con letras es
    // el club. Con lista manda el nombre del club, que aguanta el OCR partido.
    const clubIndex = allClubs.length
      ? cells.findIndex((cell) => matchesAnyClub(cellName(cell), allClubs))
      : cells.length - 1;
    if (clubIndex > 0) {
      const nameTokens = cells.filter((_, index) => index !== clubIndex).flat();
      return { tokens: nameTokens, club: cellName(cells[clubIndex]) };
    }
    return { tokens: cells.flat(), club: null };
  }

  // Sin separadores: el hueco entre palabras suele alcanzar para separar el
  // nombre del club, que es el tramo siguiente.
  const withLetters = left.filter((token) => LETTER.test(token.text));
  const runs = splitRuns(withLetters);
  const tokens = [...(runs[0] ?? [])];
  let club = runs[1] ? cellName(runs[1]) : null;
  while (tokens.length > 1 && knownClubs.has(normalizeName(tokens[tokens.length - 1].text))) {
    club = tokens[tokens.length - 1].text;
    tokens.pop();
  }
  return { tokens, club };
}

/**
 * Agrupa las palabras que devuelve el OCR en filas y extrae (nombre, tiempo).
 * Las palabras se agrupan por línea usando la coordenada vertical; dentro de
 * la línea, el tiempo es el token con formato de tiempo (o un estado como DNF)
 * y el nombre sale de la primera celda con letras a su izquierda.
 */
export function extractRowsFromOcr(words, options = {}) {
  if (!Array.isArray(words) || words.length === 0) return [];
  const knownClubs = new Set((options.clubNames ?? []).map(normalizeName));
  const allClubs = options.knownClubs ?? [];

  const lines = [];
  for (const word of words) {
    const y = (word.y0 + word.y1) / 2;
    const line = lines.find((candidate) => Math.abs(candidate.y - y) <= ROW_TOLERANCE);
    if (line) {
      line.words.push(word);
      line.y = (line.y + y) / 2;
    } else {
      lines.push({ y, words: [word] });
    }
  }
  lines.sort((a, b) => a.y - b.y);

  const rows = [];
  for (const line of lines) {
    const sorted = [...line.words].sort((a, b) => a.x0 - b.x0);
    const timeWord = sorted.find((word) => parseTime(word.text) !== null);
    const statusWord = sorted.find((word) => STATUS_TOKENS.has(normalizeName(word.text)));
    // Un token con forma de tiempo que no se puede leer no se descarta: se
    // muestra para que el adulto lo corrija en la revisión.
    const lookalike = sorted.filter((word) => LOOKS_LIKE_TIME.test(word.text)).at(-1);
    const marker = timeWord ?? statusWord ?? lookalike;
    if (!marker) continue;

    const left = sorted.filter((word) => word.x0 < marker.x0);
    const picked = pickNameTokens(left, knownClubs, allClubs);
    const name = cellName(picked.tokens);
    if (!name) continue;

    const unreadable = !timeWord && !statusWord;
    rows.push({
      name,
      club: picked.club,
      raw: marker.text.trim(),
      ms: timeWord ? parseTime(timeWord.text) : null,
      status: timeWord ? 'ok' : statusWord ? STATUS_TOKENS.get(normalizeName(marker.text)) : 'dns',
      unreadable,
      confidence: timeWord ? 1 : 0.9,
    });
  }
  return rows;
}

/**
 * Lee un bloque de texto con una fila por línea (pegado desde Excel o el texto
 * plano que devuelve el OCR) y arma las mismas filas que extractRowsFromOcr.
 */
export function extractRowsFromText(text, options = {}) {
  const knownClubs = new Set((options.clubNames ?? []).map(normalizeName));
  const allClubs = options.knownClubs ?? [];

  const rows = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const timeMatch = trimmed.match(/([\d]+'?[\d]{2}"[\d]{1,3}|\d{5,6})(?!\d)/);
    const statusMatch = trimmed.match(/\b(DNF|ELIM|DNS)\b/i);
    const lookalike = trimmed.match(/\d{1,2}\s*[:'\u2019"]\s*\d{2}[\d'"\u2019\u201d]{0,4}/);
    const marker = timeMatch ?? statusMatch ?? lookalike;
    if (!marker) continue;
    const unreadableTime = timeMatch !== null && parseTime(timeMatch[1]) === null
      || (timeMatch === null && statusMatch === null);

    const before = trimmed.slice(0, marker.index);
    const cells = before
      .split(/[|\t]/)
      .map((cell) => cell.trim())
      .filter(Boolean);
    const cellTexts = cells.filter((cell) => LETTER.test(cell) && parseTime(cell) === null);
    const clubIndex =
      cellTexts.length >= 2
        ? allClubs.length
          ? cellTexts.findIndex((cell) => matchesAnyClub(cell, allClubs))
          : cellTexts.length - 1
        : -1;
    const club = clubIndex >= 0 ? cellTexts[clubIndex] : null;
    const nameCell = cellTexts.filter((_, index) => index !== clubIndex).join(' ') || null;
    const name = cellName(
      nameCell ? nameCell.split(/\s+/).map((token) => ({ text: token })) : before.split(/\s+/).map((token) => ({ text: token })),
    );
    if (!name) continue;

    const words = name.split(' ');
    let clubFinal = club;
    while (words.length > 1 && knownClubs.has(normalizeName(words[words.length - 1]))) {
      clubFinal = clubFinal ?? words[words.length - 1];
      words.pop();
    }

    const status = timeMatch && !unreadableTime ? 'ok' : statusMatch ? STATUS_TOKENS.get(statusMatch[1].toLowerCase()) : 'dns';
    rows.push({
      name: words.join(' '),
      club: clubFinal,
      raw: marker[1],
      ms: unreadableTime ? null : timeMatch ? parseTime(marker[1]) : null,
      status,
      unreadable: unreadableTime,
      confidence: 1,
    });
  }
  return rows;
}
