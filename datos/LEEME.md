# datos/ — dónde va cada carga

Las cifras de tablas, gráficos y mapas del portal salen de esta carpeta. Cada página declara al inicio
de su código qué archivos lee (`cargarDatos({...})` o `fetchCSV(...)`). Para actualizar el portal se
**reemplazan o amplían estos archivos**; el HTML solo se toca para textos de análisis.

## Mapa rápido

| Carpeta | Qué contiene | Página(s) | Cómo se actualiza | Frecuencia |
|---|---|---|---|---|
| `transferencias/` | Bonos y pensiones: beneficiarios y montos por programa, provincia y mes | `MDTDH/transferencias.html` | A mano (agregar filas del nuevo mes) | Mensual |
| `transferencias/informacion_programas.csv` | Descripción, monto / modalidad, criterios e información adicional de cada programa (ventana «i» de las tarjetas), tomados de las fichas metodológicas. Listas separadas por «\|» | `MDTDH/transferencias.html` | A mano, cuando cambie la ficha o la normativa | Eventual |
| `kpis/` | Tarjetas del «Panorama destacado» de cada área (`kpi_*.csv`) | `MDTDH/kpis.html` | A mano o por script (ver `kpis/LEEME.md`) | Mensual |
| `kpis/proteccion_social/` | Usuarios, caracterización, presupuesto y serie histórica de los servicios (DII, PAM, PCD, PE) | `MDTDH/kpis.html#/kpis-proteccion-social` | `scripts/actualizar_proteccion_social.py` (presupuesto, a mano) | Mensual |
| `kpis/movilidad_social/` | Crédito de Desarrollo Humano: cobertura y caracterización | `MDTDH/kpis.html#/cobertura-movilidad-social` | `scripts/actualizar_cdh.py` | Mensual |
| `kpis/pueblos/` | KPIs de Pueblos y Nacionalidades (catálogo + seguimiento) | `MDTDH/kpis.html#/kpis-pueblos`, `MDTDH/kpi.html` | `scripts/actualizar_kpis.py` | Mensual |
| `kpis/jubilados/` | Compensación jubilar | `MDTDH/kpi_jubilados.html` | `scripts/actualizar_jubilados.py` | Mensual |
| `pnd/proteccion_social/` | PND · Protección Social: catálogo de indicadores, acciones y seguimiento (`<año>/`) | Páginas `PND/*.html` (sección «Acciones») | `scripts/actualizar_pnd_ps.py` (ver su LEEME) | Mensual |
| `pnd/proteccion_social/<indicador>/` | Series de cada indicador PND (ver tabla abajo) | `PND/<indicador>.html` | A mano | Al publicarse un dato nuevo |
| `pnd/trabajo/` | PND · Trabajo y Oportunidades: 5 indicadores, series, desagregaciones y acciones | `PND/indicador.html?id=…`, `MDTDH/pnd.html` | Scripts (ver `pnd/trabajo/LEEME.md`) | Mensual / anual |
| `enemdu/anual/` | ENEMDU anual: 1 archivo por indicador | `ENEMDU/<indicador>_anual.html` | A mano o desde el pipeline ENEMDU | Anual |
| `enemdu/trimestral/` | ENEMDU trimestral: poblaciones, tasas, caracterización y sectorización | `ENEMDU/<tema>_trimestral.html` | A mano o desde el pipeline ENEMDU | Trimestral |
| `_archivo/` | Archivos antiguos que ninguna página usa. Se guardan solo como respaldo | — | No se tocan | — |

Secciones que **aún no tienen archivo** (Presupuesto general,
Incentivos Temporales) muestran solo «En construcción».

## Reglas para todos los CSV

- UTF-8, separador **coma**, decimales con **punto** (`0.0779`, no `0,0779`).
- **No cambiar** los nombres ni el orden de las columnas, ni el nombre del archivo.
- Celda vacía = sin dato (el gráfico deja el hueco).
- El orden de las filas es el orden en que se muestran (periodos, categorías).
- Para revisar en local: desde la raíz del repositorio `python -m http.server 8000` y abrir
  `http://localhost:8000`. Si se abre el HTML con doble clic, el navegador bloquea la lectura de
  los CSV y la página muestra un aviso.

## ENEMDU

### `enemdu/anual/<indicador>.csv`
Un archivo por indicador: `desempleo`, `empleo_adecuado`, `empleo_bruto`, `empleo_global`,
`empleo_no_remunerado`, `otro_empleo_no_pleno`, `participacion_bruta`, `participacion_global`,
`sector_informal`, `subempleo`. Formato largo, una fila por valor:

| columna | ejemplo | nota |
|---|---|---|
| `seccion` | `territorio` | `territorio`, `territorio_hombre`, `territorio_mujer`, `caracteristicas`, `caracteristicas_hombre`, `caracteristicas_mujer`, `ci`, `estimadores` |
| `anio` | `2025` | |
| `desagregacion` | `Sexo` | Vacío en las secciones `territorio*`. En `ci`: `Límite inferior` / `Límite superior`. En `estimadores`: el territorio |
| `categoria` | `Mujer` | En `territorio*`: Total, Urbano, Rural, ciudades y provincias. En `estimadores`: `valor`, `error`, `li`, `ls`, `cv` |
| `valor` | `0.0361` | Proporción (0–1), no porcentaje |

**Nuevo año:** agregar al final las filas del año con las mismas secciones y categorías de los años
anteriores. Las tarjetas «Lo que va bien / Lo que requiere atención» son texto de análisis
y se actualizan a mano en la página `ENEMDU/<indicador>_anual.html` (constantes `BUENO`, `MALO`, …).

### `enemdu/trimestral/`
- `tasas.csv` y `poblaciones.csv`: una fila por **trimestre × indicador**, columnas
  `nac_total`, `area_*`, `dom_*`, `sexo_*`, `edad_*`, `etnia_*`. La columna `cv_alto` lista, separadas
  por `|`, las columnas con coeficiente de variación > 15 % (se pintan en magenta). **Nuevo trimestre:** agregar
  sus filas al final; el trimestre se escribe igual que en las filas anteriores.
- `caracterizacion_*.csv` y `sectorizacion_empleo.csv`: formato ancho, columnas `familia`,
  `categoria` y una columna por trimestre (`IV - 2020`, `I - 2021`, …). **Nuevo trimestre:** agregar una
  columna a la derecha.

## PND · Protección Social — series por indicador (`pnd/proteccion_social/<indicador>/`)

Proporciones en 0–1 salvo en `tpm/` (porcentajes). `est` = estimación puntual, `li`/`ls` = límites del
IC 95 %, `cv` = coeficiente de variación, `num`/`den` = numerador y denominador, `per` = periodo.

| Carpeta | Archivos | Página |
|---|---|---|
| `pobreza_extrema/` | `anual_territorio`, `anual_sexo`, `anual_provincias` (`p` = provincia), `trimestral_territorio` (`nac`, `urb`, `rur`), `trimestral_sexo` (`h`, `m`) | `PND/pobreza_extrema.html` |
| `tpm/` | `serie_anual`, `serie_proyeccion` (observado, IC y proyección ARIMA), `privaciones` (`v23`, `v24`, `v25` = años), `contribuciones`, `contribucion_urbano_rural`, `contrafactual`, `decisividad`, `prevalencia`, `tpm_provincias`, `privaciones_provincias`, `contrafactual_provincias` (`p`, `v`), `contrafactual_cantones` (`c` = cantón, `v`, `pob` = población en miles), `trimestral_territorio`, `trimestral_sexo`, `trimestral_tabla`, `cronograma_historico.json` (cortes de acciones anteriores a julio 2026) | `PND/tpm.html` |
| `usuarios_proteccion_social/` | `territorio`, `sexo`, `servicios` (`srv`), `etnia` | `PND/proteccion_social.html` |
| `primera_infancia/` | `observado`, `meta_proyectada` | `PND/primera_infancia.html` |
| `dci/` | `territorio`, `sexo`, `etnia`, `provincias`, `meta_proyectada` | `PND/dci.html` |
| `gerontologicos/` | `observado`, `meta_proyectada` | `PND/gerontologicos.html` |

La **meta 2029** de pobreza extrema y de usuarios de protección social se lee de
`pnd/proteccion_social/pnd_ps_indicadores.csv` (columna `meta_2029`). En DCI, primera infancia y
gerontológicos es el último punto de `meta_proyectada.csv`.

**Nuevo periodo:** agregar las filas al final de cada archivo. Los textos de las tarjetas de resumen
(«Línea base», variaciones en pp, notas metodológicas) son redacción y se revisan a mano en la página;
en DCI y TPM las etiquetas del eje del gráfico de serie también están en la página.
