# Sistema visual — Skate Tracker

Sincronizado desde `app.css` (`:root` y reglas de componente). Todos los valores salen del código; ninguno es inventado.

## Color

| Token | Valor | Uso | Fuente |
| --- | --- | --- | --- |
| `--pista` | `#0A3D5C` | Azul de pista: arranque del degradé del hero, tab activo | `app.css:5` |
| `--deep` | `#06283B` | Fin del degradé del hero, `theme-color` de la PWA | `app.css:6` |
| `--amarillo` | `#FFC72C` | Acento de marca: anillo de brecha, tarjeta seleccionada, medallas del podio | `app.css:7` |
| `--coral` | `#D9480F` | La patinadora propia (Salomé) y las acciones de su fila | `app.css:8` |
| `--coral-soft` | `#FDF0E9` | Fondo de la fila propia | `app.css:9` |
| `--verde` | `#157A55` | Mejora: delta negativo, acción de guardar | `app.css:10` |
| `--verde-soft` | `#E4F2EC` | Fondo de la tarjeta de lecturas seguras | `app.css:11` |
| `--rojo` | `#B3400F` | Empeoramiento: delta positivo | `app.css:12` |
| `--rojo-soft` | `#FBEDE5` | Fondo de la insignia de estado (ELIM/DNF) | `app.css:13` |
| `--ink` | `#08161F` | Texto principal, botón primario | `app.css:14` |
| `--ink2` | `#5A707D` | Texto secundario, etiquetas | `app.css:15` |
| `--ink3` | `#8AA2AE` | Metadatos, tab inactivo | `app.css:16` |
| `--line` | `#D8E4EA` | Bordes de tarjetas y controles | `app.css:17` |
| `--line2` | `#EAF1F5` | Separadores dentro de una lista | `app.css:18` |
| `--bg` | `#F4F8FA` | Fondo de la app | `app.css:19` |
| `--surface` | `#FFFFFF` | Fondo de tarjetas | `app.css:20` |

## Tipografía

| Token | Valor | Uso | Fuente |
| --- | --- | --- | --- |
| `--sans` | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | Todo el texto de interfaz | `app.css:25` |
| `--mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | Tiempos, brechas y porcentajes: cifras tabulares alineadas | `app.css:24` |

Escala observada en `app.css`: 10.5 px (etiqueta en mayúsculas), 12 px (nota), 13.5 px (cuerpo de lista), 16 px (cuerpo base), 22 px (título del hero), `clamp(42px, 15vw, 60px)` (marca principal), con `letter-spacing: -2.5px` en la marca.

## Espacio y radio

| Token | Valor | Uso | Fuente |
| --- | --- | --- | --- |
| `--radius` | `14px` | Tarjetas y contenedores | `app.css:21` |
| `--tap` | `48px` | Alto mínimo de todo control táctil | `app.css:22` |

Ritmo de espacio observado: 4, 8, 12, 16, 18, 22 px. El `padding` de `.sheet` es `16px` y el del hero `18px 18px 22px`.

## Componentes

| Componente | Regla | Fuente |
| --- | --- | --- |
| `.hero` | Degradé `160deg` de `--pista` a `--deep`, dos anillos decorativos en `--amarillo` con alfa, texto `#F2F8FB` | `app.css:79-101` |
| `.bigtime` | Marca principal en `--mono`, `clamp(42px,15vw,60px)`, `letter-spacing:-2.5px` | `app.css:118-127` |
| `.chip` | Píldora 12 px/700; variantes `.g` verde, `.b` rojo, `.y` amarillo | `app.css:136-146` |
| `.seg` | Control segmentado de 3 pruebas, alto 44 px, activo en `--ink` | `app.css:159-171` |
| `.ringcard` | Anillo de brecha: SVG de 74 px + texto; el arco usa `--amarillo` sobre `#E6EEF2` | `app.css:352-375` |
| `.podium` / `.plbar` | Barras del podio; la altura codifica la brecha con la 1.ª; `--line2` normal, `#FFF8E1` el 1.º, `--coral-soft` el propio | `app.css:377-410` |
| `.clubrow` | Fila de lista 4 columnas: puesto, nombre, tiempo, brecha; `.me` en `--coral-soft` | `app.css:412-440` |
| `.lane` | Carril de puntos sobre un eje de tiempo; punto propio en `--coral` radio 7 | `app.css:144-160` (artboard), `src/app.js` `laneSvg` |
| `.evcard` | Tarjeta de evolución: título, delta en `.dd` (`--verde`/`--rojo`), subtítulo y SVG | `app.css:459-472` |
| `.lock` | Panel oscuro de proyección bloqueada, pasos en `--amarillo` | `app.css:474-490` |
| `.btn` | Alto `--tap`, radio 11 px, primario `--ink`, `.ok` verde, `.ghost` con borde | `app.css:520-545` |
| `.warnbox` | Aviso ámbar `#FCF3DD` con borde `#EFDCAE` | `app.css:640-646` |
| `.tabbar` | Barra inferior fija, 4 destinos, activo en `--pista` | `app.css:660-682` |

## Reglas de uso

1. El **coral** está reservado para Salomé. Ningún otro dato lo usa.
2. El **verde** y el **rojo** significan mejora y empeoramiento, siempre con flecha además de color: nunca solo color.
3. Los tiempos y las brechas van en `--mono` con `font-variant-numeric: tabular-nums`.
4. `min-height: var(--tap)` en todo lo que se toca.
5. Los estados `ELIM`, `DNF`, `DNS` nunca se muestran como `0` ni como tiempo.