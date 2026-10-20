# datos/kpis — KPIs del portal

| Archivo / carpeta | Qué es | Página |
|---|---|---|
| `kpi_proteccion_social.csv`, `kpi_trabajo.csv`, `kpi_pueblos_nacionalidades.csv`, `kpi_incentivos_temporales.csv` | Tarjetas del «Panorama destacado» de cada área | `MDTDH/kpis.html` |
| `proteccion_social/` | Usuarios por servicio (caracterización), presupuesto y serie histórica mensual de DII, PAM, PCD y PE | `MDTDH/kpis.html#/kpis-proteccion-social` |
| `movilidad_social/` | Crédito de Desarrollo Humano: cobertura y caracterización por mes y tipo de crédito | `MDTDH/kpis.html#/cobertura-movilidad-social` |
| `pueblos/`, `jubilados/` | KPIs con formato de seguimiento mensual (ver abajo) | `MDTDH/kpi.html`, `MDTDH/kpi_jubilados.html` |

## Protección Social e Inclusión Económica (DII, PAM, PCD, PE)

Fuente: `resumen_usuarios_por_servicio_<MES>.xlsx` (hojas Resumen, Sexo, Rango edad, Etnia, Pobreza 2018,
Pobreza 2025). Cada mes:

    python scripts/actualizar_proteccion_social.py --archivo "C:/ps/resumen_usuarios_por_servicio_SEPTIEMBRE.xlsx" --corte 2026-09

- `proteccion_social/caracterizacion_proteccion_social.csv` se reemplaza por el corte cargado (la página
  muestra «Corte: <mes> <año>» según las columnas `anio_corte` y `mes_corte`).
- `proteccion_social/series_historicas_servicios.csv`: el mes del corte queda como dato real (se agrega o se corrige).
- `kpi_proteccion_social.csv`: cifra destacada y textos «corte <mes> <año>» de las tarjetas.
- Si llega un mes anterior revisado: el mismo comando con `--solo-serie` corrige solo ese mes de la serie.
- Si los totales por sexo, edad, etnia o pobreza no cuadran con el total del servicio, el script no escribe nada.
- `presupuesto_proteccion_social.csv` no viene en ese Excel: se actualiza a mano.

## Movilidad Social (Crédito de Desarrollo Humano, registro 12)

Fuente: `resumen_CDH_<mes>_<año>.xlsx` (hojas Tipo credito, Genero, Rango edad, Etnia, Pobreza). Cada mes:

    python scripts/actualizar_cdh.py --archivo "C:/cdh/resumen_CDH_octubre_2026.xlsx"

- Agrega (o reemplaza, si ya existe) el mes en `movilidad_social/cobertura_cdh_movilidad.csv` y
  `movilidad_social/caracterizacion_cdh_movilidad.csv`; los meses anteriores se conservan.
- Actualiza la cifra destacada de la tarjeta del registro 12 en `kpi_proteccion_social.csv`.
- La página muestra siempre el **último mes cargado** (cobertura, presupuesto y caracterización).
- Si alguna desagregación no suma el total de su tipo de crédito, no escribe nada.

**Serie histórica del carrusel** (créditos otorgados por año, 2007 en adelante): `movilidad_social/serie_anual_cdh.csv`.
Se actualiza con el Excel anual `resumen_CDH_por_anio.xlsx` (hoja Creditos por anio) y el mismo script:

    python scripts/actualizar_cdh.py --archivo "C:/cdh/resumen_CDH_por_anio.xlsx"

El año en curso se marca como parcial (`meses` = enero–último mes cargado) y en el carrusel aparece con asterisco.

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
- El script conserva los KPI del catálogo publicado que no vengan en el archivo (cada KPI puede llegar en su propio Excel).

### Pueblos y Nacionalidades: qué KPI llega en qué archivo
| ID | Indicador | Archivo mensual | Comando |
|---|---|---|---|
| KPI-2026-01 | Porcentaje de resoluciones de personería jurídica y registros de directiva emitidos oportunamente (PRPJRD) | `KPI_<Mes>_<Año>_PRPJRD.xlsx` (hoja de cálculo con periodo, numerador y denominador) | `python scripts/actualizar_kpis.py --archivo "KPI_Octubre_2026_PRPJRD.xlsx" --area pueblos --kpi KPI-2026-01` |
| KPI-2026-02 | Número de convenios de financiamiento no reembolsable suscritos | `Seguimiento_KPI_Pueblos_Nacionalidades_<Mes>.xlsx` (formato de seguimiento; en el archivo debe ir con el ID KPI-2026-02) | `python scripts/actualizar_kpis.py --archivo "Seguimiento_KPI_Pueblos_Nacionalidades_Octubre.xlsx" --area pueblos` |

KPI en **porcentaje** (unidad «Porcentaje» en `catalogo.csv`): en `seguimiento.csv` la meta programada es el
denominador y la meta alcanzada el numerador del mes. Resultado del mes = numerador ÷ denominador × 100; acumulado
del año = Σ numeradores ÷ Σ denominadores × 100; no tiene meta anual. Las columnas `definicion`, `formula`, `fuente`,
`desagregacion`, `disponibilidad`, `etiqueta_numerador` y `etiqueta_denominador` del catálogo alimentan la ficha y
las etiquetas de la página. El KPI-2026-01 reemplazó en octubre de 2026 al indicador «Fortalecimiento de la Economía
Comunitaria y Productiva» (subproyectos), que dejó de publicarse.

## Trabajo · Compensación jubilar (jubilados)

| Archivo | Contenido |
|---|---|
| `jubilados/gestion.csv` | Tabla larga: año × dimensión (total, sexo, régimen, provincia) con expedientes y monto |
| `jubilados/mensual.csv` | Serie mensual (solo con el formato de entrega nuevo, opciones A o B) |
| `jubilados/corte.csv` | Corte cargado (AAAA-MM o fecha exacta AAAA-MM-DD), archivo de origen y fecha de carga |

Cada mes (el archivo trae el histórico completo; la carga reemplaza la anterior). El corte puede ser
el mes (`2026-09`) o la fecha exacta de la información (`2026-09-18`); con fecha exacta la página
muestra «Corte: 18 de septiembre de 2026» y el año en curso como «1 de enero – 18 de septiembre»:

    python scripts/actualizar_jubilados.py --archivo "C:/jubilados/GESTION_POR_GENERO_PROVINCIA_REGIMEN.xlsx" --corte 2026-09-18

Variables y catálogos según el «Diccionario de datos · Gestión de Compensación Jubilar 2023-2026»:
género (Femenino → Mujeres, Masculino → Hombres), régimen laboral (Código del Trabajo; LOEI, Ley
Orgánica de Educación Intercultural; LOSEP, Ley Orgánica del Servicio Público; LOSE, Ley Orgánica
de Servicio Exterior) y 24 provincias. Cada expediente corresponde a una persona.

Lee el formato actual (hojas POR PROVINCIA / POR REGIMEN / GENERO con bloques por año) y el formato
de entrega nuevo (`Formato_entrega_jubilados_MTDH.xlsx`, hojas Expedientes o Agregado). Si los totales
de género, régimen y provincia no cuadran en algún año, no escribe nada. Revisar
`reportes/kpis/validacion_jubilados_<corte>.md`. Página: `MDTDH/kpi_jubilados.html`.

## Trabajo · Contratos registrados (SUT)

Ficha metodológica 18. Fuente: `datalake.public.mdt02_contratos`, que es una **foto diaria** del SUT
(no guarda histórico). El portal muestra solo la foto vigente: cada actualización reemplaza la anterior.

| Archivo | Contenido |
|---|---|
| `contratos/dashboard_data.json` | Foto del día: registrados por estado × provincia × sexo × grupo etario × discapacidad, y con esas mismas variables: cantón, actividad padre, tipo de contrato, etnia y nacionalidad; actividad detallada por estado y provincia; empresas por estado y provincia |

Se genera fuera del portal, en la carpeta de extracción (`actualizar_dashboard.py` + `sql/kpi_contratos_foto.sql`
+ `.env`). La consulta está organizada según la sección 5 de la ficha y se puede correr tal cual en DBeaver.

    python actualizar_dashboard.py

y luego se copia `data/dashboard_data.json` a `datos/kpis/contratos/`.

- Registrados = vigentes + finalizados, sin anulados. Las regiones (Sierra, Costa, Oriente) se asignan a la provincia de su cantón.
- Si alguna desagregación no suma el total de registrados, no reemplaza el JSON.

## Incentivos Temporales · Jóvenes en Acción

| Archivo | Contenido |
|---|---|
| `jovenes_accion/periodos.csv` | Una fila por período (primero, segundo, tercero y ampliación): estado (`ejecutado`, `en_ejecucion`, `programado`), fechas (AAAA-MM), registros o postulaciones, beneficiarios (`beneficiarios_es_maximo` = TRUE cuando es un «hasta»), número y monto de transferencias, presupuesto, ejecución y su fecha de corte |

Lo leen `MDTDH/jovenes_accion.html` y la diapositiva del carrusel de Incentivos Temporales (`MDTDH/kpis.html`).
Para actualizar la ejecución o agregar un período, se edita solo este archivo.

## Incentivos Temporales · Compensación de combustible

| Archivo | Contenido |
|---|---|
| `combustibles/pagos_anuales.csv` | Una fila por componente (`gasolina`, `diesel`) y año: pagos (transferencias acreditadas), beneficiarios del año y monto en USD. La fila `anio = total` de cada componente lleva los beneficiarios **únicos** del período (no es la suma de los años) y el monto total |
| `combustibles/plazos_diesel.csv` | Plazo del mecanismo de diésel por modalidad de transporte: fecha de inicio, meses de aplicación y prórroga máxima en meses |

Lo leen `MDTDH/combustibles.html` y la diapositiva del carrusel. Para agregar un año se añade su fila y se actualiza la fila `total`.

## Incentivos Temporales · Migrantes retornados

| Archivo | Contenido |
|---|---|
| `migrantes_retornados/bono_migrantes.csv` | Una fila por año: pagos, beneficiarios, monto en USD, valor mensual de la transferencia y número de meses |

Lo leen `MDTDH/migrantes_retornados.html` y la diapositiva del carrusel.
