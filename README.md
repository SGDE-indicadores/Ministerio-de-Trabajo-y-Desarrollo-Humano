# Portal de Indicadores · MTDH

Dirección de Estudios y Análisis · Subsecretaría de Gestión de Datos y Estudios.
Sitio estático (HTML + JS) que lee sus cifras de archivos CSV en `datos/`.

## Estructura

```
index.html            Portal (punto de entrada)
index_PND.html        PND · Protección Social: menú de indicadores
index_ENEMDU.html     ENEMDU: periodicidad anual y trimestral

MDTDH/                Páginas del portal: PND (Trabajo), transferencias, KPIs, presupuesto, documentación
PND/                  Páginas de cada indicador PND (pobreza extrema, TPM, DCI, …) e indicador.html (Trabajo)
ENEMDU/               anual.html y trimestral.html + una página por indicador o tema

assets/css/shared.css Estilos comunes
assets/js/            Código común: shared.js (menú, rutas, lectores CSV), cargar-datos.js,
                      pnd_ps_acciones.js, export-utils.js, ecuador-map.js, geojson_js.js
imagenes/             Logos e ilustraciones

datos/                TODAS las cifras — ver datos/LEEME.md (dónde va cada carga)
documentacion/        Manual (E-03), diccionario (E-04) y fichas metodológicas (E-05) — ver su LEEME.md
scripts/              Scripts de actualización (Excel/fichas → CSV de datos/)
reportes/             Reportes de validación que generan los scripts
```

## Actualizar datos
1. Ubicar la carpeta en `datos/LEEME.md`.
2. Reemplazar o ampliar el CSV (o correr el script indicado).
3. Revisar en local: `python -m http.server 8000` desde esta carpeta y abrir `http://localhost:8000`.

Las páginas necesitan un servidor web (local o publicado). Si se abren con doble clic, el navegador
no deja leer los CSV y la página muestra un aviso.

## Regla de publicación
Ver `DATOS_REALES.md`: solo se muestran cifras respaldadas por archivos de `datos/`. Las secciones
sin archivo muestran únicamente «En construcción».
