// Importación de una planilla ya transcrita a JSON. Este es el único camino de
// carga: no hay OCR ni modelos. El archivo lo genera el adulto a partir de la
// foto, así que la app solo tiene que entenderlo, validarlo y compararlo.

import { parseTime } from './core.js';

const STATUS_TOKENS = new Set(['ELIM', 'DNF', 'DNS']);

/** Normaliza para comparar: sin acentos, minúsculas, sin espacios de más. */
function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deduce la prueba y su base leyendo el subtítulo de la planilla. Evita el
 * error caro: guardar una planilla de habilidad como si fuera de 200 m.
 */
export function detectTest(clasificacion) {
  const text = fold(clasificacion);
  if (!text) return { test: null, meta: {} };

  const cir = text.match(/#\s*(\d+)/);
  const metros = text.match(/(\d{2,4})\s*m(?:etros)?\b/);

  if (text.includes('habilidad')) {
    return { test: 'habilidad', meta: { circuit: cir ? cir[1] : null, distanceM: null } };
  }
  if (text.includes('olimpica')) {
    return { test: 'olimpica', meta: { distanceM: metros ? Number(metros[1]) : null, circuit: null } };
  }
  if (text.includes('remate') || text.includes('200')) {
    return { test: 'remates200', meta: { distanceM: 200, circuit: null } };
  }
  return { test: null, meta: {} };
}

function pick(item, keys) {
  for (const key of keys) {
    if (item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== '') {
      return item[key];
    }
  }
  return null;
}

function toNumber(value) {
  const digits = String(value ?? '').replace(/[^\d-]/g, '');
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Lee el JSON de una planilla. Acepta el objeto completo
 * `{ categoria, clasificacion, resultados: [...] }` o directamente el array.
 * Devuelve filas con el mismo formato que usa el resto de la app, y no lanza:
 * los problemas vuelven en `error` para poder mostrarlos en pantalla.
 */
export function parseSheetJson(input) {
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch (error) {
      return { ok: false, error: `El texto no es JSON válido: ${error.message}`, rows: [] };
    }
  }

  if (data === null || typeof data !== 'object') {
    return { ok: false, error: 'Se esperaba un objeto o un array JSON', rows: [] };
  }

  const list = Array.isArray(data)
    ? data
    : (data.resultados ?? data.results ?? data.rows ?? null);
  if (!Array.isArray(list)) {
    return { ok: false, error: 'No encontré la lista de resultados (clave "resultados")', rows: [] };
  }
  if (list.length === 0) {
    return { ok: false, error: 'La lista de resultados está vacía', rows: [] };
  }

  const categoria = data.categoria ?? data.category ?? null;
  const clasificacion = data.clasificacion ?? data.subtitle ?? data.prueba ?? null;
  const detected = detectTest(clasificacion);

  const rows = [];
  list.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;

    const name = String(pick(item, ['patinador', 'nombre', 'name', 'athlete']) ?? '').trim();
    if (!name) return;

    const raw = String(pick(item, ['t_final', 'time', 'tiempo', 'tfin', 'marca']) ?? '').trim();
    const statusToken = STATUS_TOKENS.has(raw.toUpperCase()) ? raw.toUpperCase() : null;
    const ms = statusToken ? null : parseTime(raw);
    const penalties = toNumber(pick(item, ['penalizacion', 'penalties', 'penalty'])) ?? 0;

    rows.push({
      index,
      name,
      club: pick(item, ['club', 'clubes']) ?? null,
      bib: toNumber(pick(item, ['numero', 'bib', 'dorsal'])),
      pos: pick(item, ['pos', 'puesto', 'position']) ?? null,
      raw,
      ms,
      penalties,
      status: statusToken ? statusToken.toLowerCase() : ms === null ? 'dns' : 'ok',
      unreadable: !statusToken && ms === null,
    });
  });

  if (rows.length === 0) {
    return { ok: false, error: 'Ninguna entrada tenía un nombre de patinadora', rows: [] };
  }

  return {
    ok: true,
    error: null,
    categoria,
    clasificacion,
    test: detected.test,
    meta: detected.meta,
    rows,
  };
}