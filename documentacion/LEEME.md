# documentacion/ — documentos de la sección «Documentación»

Página: `MDTDH/documentacion.html` (menú principal → Documentación).

| Código | Documento | Archivo | Alterno |
|---|---|---|---|
| E-03 | Manual de usuario | `E-03_Manual_de_usuario.pdf` | `E-03_Manual_de_usuario.docx` |
| E-04 | Diccionario de datos e indicadores | `E-04_Diccionario_de_datos_e_indicadores.xlsx` | — |
| E-05 | Fichas metodológicas (archivo único, con índice y marcadores) | `E-05_Fichas_metodologicas.pdf` | — |

## Publicar o actualizar un documento
1. Copiar el archivo en esta carpeta **con el nombre exacto** de la tabla (reemplaza la versión anterior).
2. Opcional: anotar `version` y `fecha` (AAAA-MM-DD) en `documentos.csv`; se muestran en la tarjeta.
3. Listo: la página detecta el archivo y habilita «Descargar». Si el archivo no está, la tarjeta
   muestra «Pendiente de carga». Si existe `archivo_alterno`, aparece un segundo botón de descarga
   (p. ej. «Descargar Word»).

## Fichas por indicador
- `fichas/` contiene una ficha por indicador (`F01_….pdf` a `F25_….pdf`).
- `fichas.csv` las lista: `numero, grupo, titulo, archivo, paginas`. La página las agrupa por `grupo`
  y permite buscarlas por nombre o número.
- Para agregar o reemplazar una ficha: copiar el PDF en `fichas/`, agregar o editar su fila en
  `fichas.csv` y regenerar `E-05_Fichas_metodologicas.pdf` para que el archivo único siga completo.
