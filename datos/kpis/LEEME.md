# datos/kpis — KPIs del portal

| Archivo / carpeta | Qué es | Página |
|---|---|---|
| `kpi_proteccion_social.csv`, `kpi_trabajo.csv`, `kpi_pueblos_nacionalidades.csv`, `kpi_incentivos_temporales.csv` | Tarjetas del «Panorama destacado» de cada área | `MDTDH/kpis.html` |
| `proteccion_social/` | Usuarios por servicio (caracterización), presupuesto y serie histórica mensual de DII, PAM, PCD y PE | `MDTDH/kpis.html#/kpis-proteccion-social` |
| `movilidad_social/` | Crédito de Desarrollo Humano: cobertura y caracterización por mes y tipo de crédito | `MDTDH/kpis.html#/cobertura-movilidad-social` |
| `pueblos/`, `jubilados/` | KPIs con formato de seguimiento mensual (ver abajo) | `MDTDH/kpi.html`, `MDTDH/kpi_jubilados.html` |

## KPIs con formato de seguimiento mensual

Fuente: "Formato de Seguimiento de KPI MTDH" (Excel con las hojas Catálogo_KPIs y Seguimiento_Mensual).

| Archivo | Qué es |
|---|---|
| `<area>/catalogo.csv` | Un registro por KPI (resultado esperado, indicador, meta anual, responsable…) |
| `<area>/seguimiento.csv` | Histórico: una fila por KPI × mes. Porcentajes y acumulados recalculados por el script |
| `kpi_pueblos_nacionalidades.csv` | Tarjetas del "Panorama destacado" de kpis.html (generado; no editar a mano) |

Páginas: `MDTDH/kpis.html#/kpis-pueblos` (tarjetas y carrusel) y `MDTDH/kpi.html?area=pueblos&id=<ID_KPI>` (detalle).

## Cada mes
    python scripts/actualizar_kpis.py --archivo "C:/kpis/Seguimiento_KPI_septiembre_2026.xlsx" --area pueblos
- Sirve si el Excel trae todo el histórico o solo el mes nuevo: los meses se agregan o reemplazan, nunca se duplican.
- El script NO usa las fórmulas del Excel (la clave `TEXT(…,"YYYYMM")` no funciona en Excel en español y el
  Resumen solo mira las filas 3–10); recalcula todo desde la meta programada y la meta alcanzada del mes.
- No se publican nombres de personas (solo el cargo) ni rutas de red (solo enlaces http/https).
- Revisar `reportes/kpis/validacion_pueblos_<AAAA-MM>.md` antes de publicar.

## Trabajo · Compensación jubilar (jubilados)

| Archivo | Contenido |
|---|---|
| `jubilados/gestion.csv` | Tabla larga: año × dimensión (total, sexo, régimen, provincia) con expedientes y monto |
| `jubilados/mensual.csv` | Serie mensual (solo con el formato de entrega nuevo, opciones A o B) |
| `jubilados/corte.csv` | Corte cargado, archivo de origen y fecha de carga |

Cada mes (el archivo trae el histórico completo; la carga reemplaza la anterior):

    python scripts/actualizar_jubilados.py --archivo "C:/jubilados/JUBILADOS_2026-09.xlsx" --corte 2026-09

Lee el formato actual (hojas POR PROVINCIA / POR REGIMEN / GENERO con bloques por año) y el formato
de entrega nuevo (`Formato_entrega_jubilados_MTDH.xlsx`, hojas Expedientes o Agregado). Si los totales
de sexo, régimen y provincia no cuadran en algún año, no escribe nada. Revisar
`reportes/kpis/validacion_jubilados_<AAAA-MM>.md`. Página: `MDTDH/kpi_jubilados.html`.
