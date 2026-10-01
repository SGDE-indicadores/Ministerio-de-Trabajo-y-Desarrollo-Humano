# datos/pnd/trabajo — PND · Trabajo y Oportunidades

| Archivo | Qué es | Fuente | Cuándo cambia |
|---|---|---|---|
| `indicadores.csv` | Metadatos oficiales de los 5 indicadores (4.4.1–4.4.4 y 8.2.1): nombre, fórmula, desagregaciones, línea base, meta | Fichas metodológicas (versión 25/09/2026) | Cuando se actualiza una ficha |
| `serie_indicadores.csv` | Serie histórica oficial | Fichas metodológicas | Una vez al año |
| `desagregaciones.csv` | Sexo, área, provincia, trimestre (con CV e IC 95 %) | Panel ENEMDU del portal y/o microdatos | Cuando se calcula |
| `2026/…` | Acciones y seguimiento mensual | Fichas de seguimiento SGAPPG | Cada mes |

Página única para los 5 indicadores: `PND/indicador.html?id=<indicador_id>`
(`brecha-salarial`, `desempleo-juvenil`, `empleo-adecuado`, `trabajo-infantil`, `percepcion-calidad`).

## Cada mes (acciones)
    python scripts/actualizar_pnd_ps.py actualizar --periodo 2026-09 --fichas "C:/fichas_pnd/2026-09" \
           --datos datos/pnd/trabajo --indicadores indicadores.csv --reportes reportes/pnd_trabajo

## Desagregaciones
1. Lo que ya existe en el panel ENEMDU del portal (`datos/enemdu/anual/`; empleo adecuado: sexo, área, provincia; desempleo juvenil: sexo):
       python scripts/extraer_desagregaciones_enemdu.py
   Verifica antes que el nacional del panel coincida con la ficha en todos los años.
2. El resto, desde microdatos de personas ENEMDU con la sintaxis de cada ficha (CV e IC 95 % por linealización):
       python scripts/calcular_indicadores_trabajo.py --indicador todos --base "enemdu_persona_2025_anual.dta" --periodo 2025
       python scripts/calcular_indicadores_trabajo.py --indicador percepcion-calidad --base "enemdu_persona_2025_12.dta" --periodo 2025
       python scripts/calcular_indicadores_trabajo.py --indicador empleo-adecuado --base "enemdu_2025_IV.dta" --periodo 2025-T4 --trimestral
   El script compara el nacional con la serie oficial e indica si COINCIDE.
