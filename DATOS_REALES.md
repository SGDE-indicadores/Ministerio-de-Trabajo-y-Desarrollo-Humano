# Regla de publicación de datos

Esta versión del portal aplica una regla estricta: **solo se muestran cifras respaldadas por archivos reales ubicados en `datos/`**.

## Secciones habilitadas con datos reales
- Transferencias monetarias no contributivas (datos/transferencias/).
- KPIs de Protección Social: DII, PAM, PCD y Protección Especial (datos/kpis/proteccion_social/).
- Crédito de Desarrollo Humano (datos/kpis/movilidad_social/).
- Caracterización y presupuesto específico de Protección Social cuando existe archivo real.
- PND · Protección Social e Inclusión Económica: acciones y seguimiento mensual (datos/pnd/proteccion_social/, generados desde las
  fichas SGAPPG con `scripts/actualizar_pnd_ps.py`; ver datos/pnd/proteccion_social/LEEME.md).
- PND · Trabajo y Oportunidades: 5 indicadores (4.4.1–4.4.4 y 8.2.1) con serie oficial de las fichas metodológicas,
  desagregaciones del panel ENEMDU y acciones mensuales (datos/pnd/trabajo/; ver su LEEME.md).

- KPIs · Trabajo · Compensación jubilar: expedientes y montos 2023 – agosto 2026 por sexo, régimen y provincia
  (datos/kpis/jubilados/, `scripts/actualizar_jubilados.py`; página MDTDH/kpi_jubilados.html).
- KPIs · Pueblos y Nacionalidades: subproyectos comunitarios activados y convenios suscritos, seguimiento mensual
  desde agosto 2026 (datos/kpis/pueblos/, `scripts/actualizar_kpis.py`).
- KPIs · Trabajo · Contratos registrados (SUT): foto diaria de vigentes y finalizados por provincia, cantón,
  actividad, tipo de contrato, sexo, grupo etario, discapacidad, etnia y nacionalidad
  (datos/kpis/contratos/dashboard_data.json, generado en la carpeta de extracción; página MDTDH/kpi_contratos.html).
- PND · Protección Social: series de los 6 indicadores (datos/pnd/proteccion_social/<indicador>/).
- ENEMDU anual (10 indicadores, 2018–2025) y trimestral (IV-2020 a I-2026) (datos/enemdu/).

## Secciones en construcción
- Presupuesto general.
- Incentivos Temporales: compensación de combustible y migrantes retornados (Jóvenes en Acción ya tiene datos).

Estas secciones muestran únicamente «En construcción».

Los valores ilustrativos, de prototipo o incrustados directamente en HTML/JS fueron retirados de la visualización.
Dónde va cada archivo y cómo se actualiza: `datos/LEEME.md`.
