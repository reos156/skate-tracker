// Semilla real: transcripción de las planillas en tiempos/
// Fuente: 202608_copa_antioquia_{olimpica,200+distancia,habilidad#14}.jpg
//         202611_copa_antioquia_{olimpica,200+distancia,habilidad#19}.jpg
// Solo el club PAEN: es lo que la app compara. Otras filas del club se
// agregan cargando la planilla completa.

import { parseTime } from './core.js';

export const CLUB = 'Paen';

export const ME = 'salome-rendon';

/**
 * Clubes que aparecen en las planillas de la categoría (leídos de las 6 hojas
 * de tiempos/). Sirven para identificar la columna del club aunque el OCR
 * parta el nombre en varias celdas, y para descartar filas de otros clubes.
 */
export const KNOWN_CLUBS = [
  'Paen',
  'Talentos De Antioquia',
  'Botero Sport',
  'Grandes Paisas',
  'Orgullo Paisa',
  'Runners',
  'Patin Bello',
  'Codersa',
  'Gente Nueva',
  'Jose Maria Cordoba',
  'Jaguar',
  'Sin Fronteras',
  'Copatin',
  'Pacal',
  'Empatin',
  'Aslan La Ceja',
  'Condor',
  'Urakanes Bello',
  'Team Fenix',
  'Orion',
  'Patinemos',
  'Giraskate',
  'Golden Skate',
];

export const ATHLETES = [
  { id: 'salome-rendon', name: 'Salomé Rendón Erazo', club: CLUB },
  { id: 'salome-munoz', name: 'Salomé Muñoz Hernández', club: CLUB },
  { id: 'mariangel-ospina', name: 'Mariangel Ospina Trejos', club: CLUB },
  { id: 'mariangel-gonzalez', name: 'Mariangel González Casas', club: CLUB },
  { id: 'sara-ocampo', name: 'Sara Ocampo Becerra', club: CLUB },
  { id: 'luciana-perafan', name: 'Luciana Perafán Cárdenas', club: CLUB },
  { id: 'maria-jose-amaya', name: 'María José Amaya Restrepo', club: CLUB },
  { id: 'gabriela-gutierrez', name: 'Gabriela Gutiérrez Ruie', club: CLUB },
  { id: 'luciana-villa', name: 'Luciana Villa Castillo', club: CLUB },
  { id: 'susana-agudelo', name: 'Susana Agudelo Hernández', club: CLUB },
  { id: 'samai-berthi', name: 'Samai Valeria Berthi Jacanamijoy', club: CLUB },
  { id: 'ines-jaramillo', name: 'Inés Jaramillo Sanín', club: CLUB },
  { id: 'antonia-ramirez', name: 'María Antonia Ramírez Giraldo', club: CLUB },
  // Fila tal como viene impresa en la planilla de 202611 (categoría Damas).
  // Se conserva para que los conteos coincidan con el papel; si fue un error
  // del club, se borra en el archivo y en la app.
  { id: 'jeronimo-florez', name: 'Jeronimo Andrés Flórez Gómez', club: CLUB, flag: 'nombre fuera de la categoría en la planilla original' },
];

export const EVENTS = [
  {
    id: '202608',
    code: '202608',
    label: 'Válida 1 · 202608',
    competition: 'Copa Antioquia',
    category: 'Preinfantil 10 Damas',
    source: 'tiempos/202608_copa_antioquia_',
  },
  {
    id: '202611',
    code: '202611',
    label: 'Válida 2 · 202611',
    competition: 'Copa Antioquia',
    category: 'Preinfantil 10 Damas',
    source: 'tiempos/202611_copa_antioquia_',
  },
];

// Metadatos por prueba y válida. La base cambió entre válidas: la olímpica
// pasó a 600 m y el circuito de habilidad de #14 a #19.
export const TEST_META = {
  '202608:olimpica': { distanceM: null, note: 'la planilla no imprime la distancia' },
  '202611:olimpica': { distanceM: 600, note: 'VELOCIDAD OLIMPICA 600 metros' },
  '202608:remates200': { distanceM: 200, note: 'REMATE 200 metros + distancia' },
  '202611:remates200': { distanceM: 200, note: 'REMATE 200 metros + distancia' },
  '202608:habilidad': { circuit: '14', note: 'Habilidad Circuito #14' },
  '202611:habilidad': { circuit: '19', note: 'Habilidad Circuito #19' },
};

const raw = [];
function row(eventId, test, athleteId, bib, value) {
  raw.push({ eventId, test, athleteId, bib, value });
}

// ---- Válida 1 · 202608 -------------------------------------------------
row('202608', 'olimpica', 'mariangel-ospina', 19, `1'01"587`);
row('202608', 'olimpica', 'salome-munoz', 9, `1'01"587`);
row('202608', 'olimpica', 'mariangel-gonzalez', 14, `1'01"587`);
row('202608', 'olimpica', 'sara-ocampo', 11, `1'02"966`);
row('202608', 'olimpica', 'luciana-villa', 12, `1'02"966`);
row('202608', 'olimpica', 'maria-jose-amaya', 21, `1'02"966`);
row('202608', 'olimpica', 'susana-agudelo', 10, `1'04"090`);
row('202608', 'olimpica', 'luciana-perafan', 17, `1'04"090`);
row('202608', 'olimpica', 'samai-berthi', 16, `1'04"090`);
row('202608', 'olimpica', 'salome-rendon', 20, `1'05"989`);
row('202608', 'olimpica', 'antonia-ramirez', 13, `1'07"499`);
row('202608', 'olimpica', 'ines-jaramillo', 18, `1'07"499`);
row('202608', 'olimpica', 'gabriela-gutierrez', 15, `1'07"499`);

row('202608', 'remates200', 'salome-munoz', 9, `0'23"964`);
row('202608', 'remates200', 'mariangel-ospina', 19, `0'24"287`);
row('202608', 'remates200', 'mariangel-gonzalez', 14, `0'24"597`);
row('202608', 'remates200', 'sara-ocampo', 11, `0'24"755`);
row('202608', 'remates200', 'luciana-perafan', 17, `0'24"866`);
row('202608', 'remates200', 'maria-jose-amaya', 21, `0'24"979`);
row('202608', 'remates200', 'gabriela-gutierrez', 15, `0'25"100`);
row('202608', 'remates200', 'luciana-villa', 12, `0'25"131`);
row('202608', 'remates200', 'susana-agudelo', 10, `0'25"236`);
row('202608', 'remates200', 'samai-berthi', 16, `0'25"341`);
row('202608', 'remates200', 'ines-jaramillo', 18, `0'25"723`);
row('202608', 'remates200', 'salome-rendon', 20, `0'25"923`);
row('202608', 'remates200', 'antonia-ramirez', 13, `0'26"511`);

row('202608', 'habilidad', 'ines-jaramillo', 18, `0'14"546`);
row('202608', 'habilidad', 'luciana-villa', 12, `0'14"857`);
row('202608', 'habilidad', 'mariangel-gonzalez', 14, `0'14"909`);
row('202608', 'habilidad', 'mariangel-ospina', 19, `0'15"127`);
row('202608', 'habilidad', 'samai-berthi', 16, `0'15"553`);
row('202608', 'habilidad', 'antonia-ramirez', 13, `0'15"556`);
row('202608', 'habilidad', 'luciana-perafan', 17, `0'15"658`);
row('202608', 'habilidad', 'sara-ocampo', 11, `0'15"933`);
row('202608', 'habilidad', 'salome-munoz', 9, `0'15"948`);
row('202608', 'habilidad', 'gabriela-gutierrez', 15, `0'16"013`);
row('202608', 'habilidad', 'susana-agudelo', 10, `0'16"065`);
row('202608', 'habilidad', 'maria-jose-amaya', 21, `0'16"194`);
row('202608', 'habilidad', 'salome-rendon', 20, `0'16"322`);

// ---- Válida 2 · 202611 -------------------------------------------------
row('202611', 'olimpica', 'mariangel-ospina', 16, `2'03"568`);
row('202611', 'olimpica', 'luciana-perafan', 20, `2'03"568`);
row('202611', 'olimpica', 'salome-munoz', 13, `2'03"568`);
row('202611', 'olimpica', 'gabriela-gutierrez', 23, `2'07"114`);
row('202611', 'olimpica', 'maria-jose-amaya', 17, `2'07"114`);
row('202611', 'olimpica', 'samai-berthi', 12, `2'07"114`);
row('202611', 'olimpica', 'antonia-ramirez', 18, `2'10"126`);
row('202611', 'olimpica', 'ines-jaramillo', 22, `2'10"126`);
row('202611', 'olimpica', 'susana-agudelo', 10, `2'10"126`);
row('202611', 'olimpica', 'salome-rendon', 14, `2'14"779`);
row('202611', 'olimpica', 'luciana-villa', 19, 'ELIM');
row('202611', 'olimpica', 'jeronimo-florez', 21, 'ELIM');

row('202611', 'remates200', 'salome-munoz', 13, `0'23"946`);
row('202611', 'remates200', 'luciana-perafan', 20, `0'24"660`);
row('202611', 'remates200', 'mariangel-gonzalez', 15, `0'24"661`);
row('202611', 'remates200', 'luciana-villa', 19, `0'24"813`);
row('202611', 'remates200', 'gabriela-gutierrez', 23, `0'25"214`);
row('202611', 'remates200', 'maria-jose-amaya', 17, `0'25"423`);
row('202611', 'remates200', 'samai-berthi', 12, `0'25"640`);
row('202611', 'remates200', 'salome-rendon', 14, `0'25"828`);
row('202611', 'remates200', 'susana-agudelo', 10, `0'25"913`);
row('202611', 'remates200', 'sara-ocampo', 11, `0'25"948`);
row('202611', 'remates200', 'ines-jaramillo', 22, `0'26"089`);
row('202611', 'remates200', 'antonia-ramirez', 18, `0'26"239`);
row('202611', 'remates200', 'mariangel-ospina', 16, 'DNF');

row('202611', 'habilidad', 'mariangel-ospina', 16, `0'17"546`);
row('202611', 'habilidad', 'luciana-perafan', 20, `0'17"677`);
row('202611', 'habilidad', 'luciana-villa', 19, `0'18"034`);
row('202611', 'habilidad', 'mariangel-gonzalez', 15, `0'18"059`);
row('202611', 'habilidad', 'ines-jaramillo', 22, `0'18"354`);
row('202611', 'habilidad', 'sara-ocampo', 11, `0'18"439`);
row('202611', 'habilidad', 'salome-rendon', 14, `0'18"447`);
row('202611', 'habilidad', 'susana-agudelo', 10, `0'18"541`);
row('202611', 'habilidad', 'samai-berthi', 12, `0'18"838`);
row('202611', 'habilidad', 'maria-jose-amaya', 17, `0'18"977`);
row('202611', 'habilidad', 'gabriela-gutierrez', 23, `0'19"089`);
row('202611', 'habilidad', 'antonia-ramirez', 18, `0'20"454`);

const STATUS = new Set(['ELIM', 'DNF', 'DNS']);

/** Resultados expandidos: `status: 'ok'` con `ms`, o el estado sin tiempo. */
export const RESULTS = raw.map(({ eventId, test, athleteId, bib, value }, index) => {
  const meta = TEST_META[`${eventId}:${test}`] ?? {};
  const isStatus = STATUS.has(String(value).toUpperCase());
  return {
    id: `${eventId}:${test}:${athleteId}:${index}`,
    eventId,
    test,
    athleteId,
    bib,
    ms: isStatus ? null : parseTime(value),
    status: isStatus ? String(value).toLowerCase() : 'ok',
    raw: value,
    distanceM: meta.distanceM ?? null,
    circuit: meta.circuit ?? null,
  };
});

export const SEED_META = {
  club: CLUB,
  me: ME,
  events: ['202608', '202611'],
  tests: ['remates200', 'olimpica', 'habilidad'],
  note: 'Transcripción manual de las 6 planillas en tiempos/. Solo filas del PAEN.',
};