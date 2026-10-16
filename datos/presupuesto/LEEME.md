# datos/presupuesto/ — Ejecución presupuestaria (Año fiscal)

Página: `MDTDH/presupuesto.html` (menú Presupuesto → Año fiscal).

## Archivo
`ejecucion_presupuestaria.json` — un solo archivo por corte; cada carga **reemplaza** la anterior.
Contiene solo lo que usa la página, nada más:

| Campo | Contenido |
|---|---|
| `ejercicio`, `fecha_corte` | Año fiscal y fecha de corte (celda K3 de la hoja DASHBOARD o el nombre del archivo) |
| `medidas` | `codificado`, `certificado` (PRECOMPROMISO), `comprometido` (COMPROMISO), `devengado`, `saldo_disponible` (SALDO_DISPONIBLE) |
| `dimensiones` | `programa`, `tipo_gasto`, `grupo_gasto`, `fuente` |
| `catalogos` | Nombre de cada valor de las dimensiones (los registros guardan solo su posición) |
| `registros` | Una fila por combinación de dimensiones: 4 posiciones de catálogo + 5 medidas |

Nivel de detalle: hasta **grupo de gasto** (no se publica actividad, ítem, unidad ejecutora ni subsecretaría).
El programa 57 va en un solo programa, **Protección Social** (no se separa en SANCCO y Emprendimiento).
`SALDO_DISPONIBLE` ya viene con el reservado descontado; RESERVADO_NEGATIVO se lee solo para el control y no se publica.

## Actualizar
```
python scripts/actualizar_presupuesto.py --archivo "C:/ruta/DASHBOARD CON CORTE AL dd-mm-aaaa - Datos.xlsm"
```
- Lee solo la hoja **BASE** (no las tablas dinámicas de la hoja DASHBOARD, que pueden estar sin actualizar).
- Columnas que necesita en BASE: EJERCICIO, PROGRAMA, TIPO DE GASTO, GRUPO DE GASTO, FUENTE, NOMBRE FUENTE,
  CODIFICADO, PRECOMPROMISO, COMPROMISO, DEVENGADO, SALDO_DISPONIBLE y RESERVADO_NEGATIVO (control).
- Si los totales del JSON no cuadran con la hoja BASE, no escribe nada.
- Avisa si Codificado ≠ Certificado + Comprometido + Saldo disponible + Reservado.
- Requiere `openpyxl`.
