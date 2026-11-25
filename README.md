# Skate Tracker · Salomé Rendón Erazo

App PWA para seguir los tiempos de **Salomé Rendón Erazo** (club **PAEN**, categoría *Preinfantil 10 Damas*) en las tres pruebas de su edad: **Velocidad olímpica**, **Remates 200 m + distancia** y **Habilidad circuito**.

Responde tres preguntas concretas:

1. ¿Está mejorando? — evolución por prueba entre válidas.
2. ¿Cómo está frente a sus compañeras del PAEN? — puesto en el club y brecha porcentual contra la mejor marca.
3. ¿Para dónde va? — proyección lineal, **solo cuando hay al menos tres válidas con tiempo**.

Diseño: `design/skate-tracker/`. Especificación y bitácora: `odd/tasks/skate-tracker.md`.

## Correr

```bash
npm start          # imprime todas las URLs por las que se puede abrir
npm test           # 62 pruebas: núcleo, estado, importación y capa de render
npm run icons      # regenera icons/*.png
```

No hay build, ni dependencias instaladas, ni servidor de datos: son archivos estáticos.

### Si corrés esto dentro de WSL

El servidor queda en Linux y el navegador suele estar en Windows. Usá **`localhost`** o la IP que imprime `npm start`; `127.0.0.1` desde Windows suele fallar porque WSL2 reenvía `localhost` pero no IPv4.

## Instalar en el celular

Servir por HTTPS (o `localhost`), abrir la URL y elegir *Instalar aplicación* / *Agregar a pantalla de inicio*. Después abre sin conexión.

## Cargar una válida

**Cargar → pegás el JSON de la planilla (o elegís el archivo) → confirmás las filas del PAEN.**

No hay lectura de fotos: el JSON lo generás vos a partir de la planilla. El formato es el que ya usás:

```json
{
  "categoria": "PREINFANTIL 10 DAMAS",
  "clasificacion": "CLASIFICACIÓN GENERAL Habilidad Circuito #19",
  "resultados": [
    { "numero": 14, "patinador": "SALOME RENDON ERAZO", "club": "Paen", "t_final": "0'18\"447", "penalizacion": 0 }
  ]
}
```

Qué hace la app con eso:

- **Deduce la prueba y la base del campo `clasificacion`**: `Habilidad Circuito #19` → habilidad, circuito 19; `VELOCIDAD OLIMPICA 600 metros` → olímpica, 600 m; `REMATES 200 metros` → 200 m. No hay que elegirlas a mano, y se pueden corregir antes de guardar.
- **Se queda solo con las filas del club PAEN.** Las demás se descartan y el conteo se informa. Si a una fila le falta el club, se muestra aparte con una casilla **PAEN** y no se guarda salvo que la marques.
- **Reconoce el nombre contra el plantel** aunque la planilla tenga una letra distinta (`RUJE` por `RUIE`) o dos palabras pegadas.
- **La revisión es obligatoria**: sin tocar *Guardar* no se escribe nada. Cada fila amarilla dice en palabras qué corregir, y el formato del tiempo es `0'18"222`.
- **Un tiempo ilegible no se guarda** salvo que lo corrijas: una planilla mal transcrita no borra tiempos buenos ya cargados.
- **Avisa si los tiempos no son de la prueba elegida**: compara la mediana de lo que leíste contra la de las válidas anteriores con la misma base.

Guardar una prueba **reemplaza** las filas que ya existían de esa prueba en esa válida, y la revisión dice cuántas va a reemplazar.

## Modelo de datos

| Campo | Uso |
| --- | --- |
| `ms` | Tiempo en milisegundos. `null` cuando no hay tiempo válido. |
| `status` | `ok`, `elim`, `dnf`, `dns`. Nunca se pinta como cero. |
| `penalties` | Faltas de la planilla. No cambian el tiempo impreso pero sí el puesto: quien tiene faltas va detrás. |
| `distanceM` | Distancia impresa en la planilla. `null` si no está impresa. |
| `circuit` | Número de circuito de habilidad (`14`, `19`, …). |
| `bib` | Dorsal, que cambia de válida en válida (20 → 14). |

### Por qué se compara en porcentaje y no en segundos

Las planillas muestran dos cortes de base entre válidas:

- La **velocidad olímpica** pasó de `1'05"989` a `2'14"779` en **toda** la categoría (la mejor del club pasó de `0'58"752` a `2'00"554`). Se duplicó el tiempo porque cambió la prueba, no la patinadora.
- El **circuito de habilidad** pasó de `#14` a `#19`.

Por eso la app bloquea el delta en segundos cuando `distanceM` o `circuit` difieren, y compara **brecha porcentual contra la mejor marca del club**, que sí es comparable.

### El `Pos.` de la planilla no se usa

La columna viene cortada en los escaneos y los empates se imprimen en bloques con el mismo tiempo. El puesto se recalcula desde los tiempos con ranking de competencia (`1, 1, 1, 4`), y quien no tiene tiempo válido (DNF, ELIM) no se rankea.

## Estructura

```
index.html              shell de la app
app.css                 sistema visual
src/core.js             lógica pura: tiempos, ranking, brecha, proyección
src/json-import.js      lectura y validación del JSON de la planilla
src/data.js             semilla real transcrita de las 6 planillas (solo PAEN)
src/store.js            estado, selectores derivados, persistencia, importación
src/app.js              render de las cuatro vistas y eventos
sw.js                   service worker (shell precacheado)
tests/                  core, store, json-import y app (DOM mínimo, sin navegador)
tools/make-icons.mjs    iconos PNG generados sin dependencias
tools/serve.mjs         servidor estático para probar la PWA
```

Datos semilla: 14 patinadoras del PAEN, 2 válidas (`202608`, `202611`), 76 filas.

## Límites conocidos

- La semilla trae **solo las filas del PAEN**, que es lo que la app compara.
- La fila `21 JERONIMO ANDRES FLOREZ GOMEZ — Paen — ELIM` aparece en la planilla de 202611 dentro de una categoría *Damas*. Se conserva para que los conteos coincidan con el papel; si fue un error del club, se borra en `src/data.js` y en la app.
- No hay lectura de imágenes: si querés cargar una válida, el JSON tiene que existir.