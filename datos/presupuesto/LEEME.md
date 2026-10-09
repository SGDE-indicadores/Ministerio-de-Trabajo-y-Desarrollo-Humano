# datos/presupuesto/ — Ejecución presupuestaria (Año fiscal)

Página: `MDTDH/presupuesto.html` (menú Presupuesto → Año fiscal).

## Archivo
`ejecucion_presupuestaria.json` — un solo archivo por corte; cada carga **reemplaza** la anterior.

| Campo | Contenido |
|---|---|
| `ejercicio`, `fecha_corte` | Año fiscal y fecha de corte (celda K3 de la hoja DASHBOARD o el nombre del archivo) |
| `medidas` | `codificado`, `certificado` (PRECOMPROMISO), `comprometido` (COMPROMISO), `devengado`, `saldo_disponible`, `reservado` (RESERVADO_NEGATIVO en positivo) |
| `dimensiones` | `programa`, `subsecretaria`, `tipo_gasto`, `grupo_gasto`, `fuente`, `unidad` |
| `catalogos` | Nombre de cada valor de las dimensiones (los registros guardan solo su posición) |
| `registros` | Una fila por combinación de dimensiones: 6 posiciones de catálogo + 6 medidas |
| `totales` | Totales de la hoja BASE, para control |

Nivel de detalle: hasta **grupo de gasto** (no se publica actividad ni ítem).
El programa 57 se separa en «SANCCO» y «Emprendimiento» según la columna DESCRIPCIÓN.

## Actualizar
```
python scripts/actualizar_presupuesto.py --archivo "C:/ruta/DASHBOARD CON CORTE AL dd-mm-aaaa - Datos.xlsm"
```
- Lee solo la hoja **BASE** (no las tablas dinámicas de la hoja DASHBOARD, que pueden estar sin actualizar).
- Si los totales del JSON no cuadran con la hoja BASE, no escribe nada.
- Avisa si Codificado ≠ Certificado + Comprometido + Saldo disponible + Reservado.
- Requiere `openpyxl`.
