# datos/pnd/proteccion_social — PND · Protección Social e Inclusión Económica

Las series de cada indicador están en una subcarpeta por indicador (`pobreza_extrema/`, `tpm/`, …);
ver `datos/LEEME.md`. Este documento cubre las **acciones** y su seguimiento mensual. Los archivos los genera
`scripts/actualizar_pnd_ps.py`; no se editan a mano salvo en la revisión anual.

| Archivo | Qué es | Cuándo cambia |
|---|---|---|
| `pnd_ps_indicadores.csv` | Indicadores, línea base y meta 2029 (las páginas leen de aquí la meta) | Casi nunca (a mano) |
| `<año>/acciones.csv` | Catálogo: 1 fila por acción única | Enero (revisión anual) |
| `<año>/indicador_accion.csv` | Qué acción aparece en qué indicador y con qué número | Enero |
| `<año>/metas_programadas.csv` | Meta de cada mes (para el cumplimiento a la fecha) | Enero |
| `<año>/actores.csv` | Actores clave por acción | Enero |
| `<año>/seguimiento.csv` | 1 fila por acción × corte | Cada mes (se agregan filas) |
| `<año>/justificaciones.csv` | Textos largos y enlaces (se cargan al abrir el detalle) | Cada mes |

## Requisitos
Python 3.9+ y `pip install openpyxl`. Se corre desde la raíz del repositorio.

## Cada mes (≈10 min)
1. Copiar las fichas del mes (.xlsx de la SGAPPG) en una carpeta, p. ej. `C:/fichas_pnd/2026-09/`. Pueden venir también las de Trabajo: se ignoran. Conviene guardarlas fuera del repositorio (traen nombres y firmas de funcionarios).
2. `python scripts/actualizar_pnd_ps.py actualizar --periodo 2026-09 --fichas fichas/2026-09`
3. Revisar `reportes/pnd_ps/validacion_2026-09.md`. Los **ERROR** se consultan con Planificación antes de publicar.
4. Commit. Si se corrige una ficha, se vuelve a correr el mismo periodo: reemplaza sus filas, no duplica.

## Cada enero
`python scripts/actualizar_pnd_ps.py inicializar --anio 2027 --fichas fichas/2027-01` genera el **borrador**
del catálogo del año desde la matriz de planificación. Revisar `acciones.csv` y `metas_programadas.csv`
(las metas se leen del texto de la descripción) y, para acciones que continúan, reutilizar el `accion_id` del año anterior.

## Cálculos
- **Avance anual** = resultado ÷ meta del año (lo que reportan las fichas).
- **Cumplimiento a la fecha** = resultado ÷ meta programada acumulada hasta el corte real del dato.
- Si una acción aparece en varias fichas, se publica la ficha marcada `es_principal=1` y el avance se recalcula; las diferencias salen en el reporte (E2).

## Revisión antes de publicar
Abrir `PND/revision_acciones_ps.html` (no está enlazada en el menú): muestra lo mismo que las páginas
públicas con las marcas de validación del mes.
