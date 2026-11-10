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

## Fuentes de información (`MDTDH/fuentes.html`)

Menú **Fuentes y diccionario › Fuentes de información**. Los datos están en `fuentes.json`:

```json
{
  "titulo": "Fuentes de información",
  "actualizado": "AAAA-MM-DD",            // fecha de la última revisión del mapeo (se muestra en la página)
  "modulos": [
    { "modulo": "KPIs · Trabajo",
      "registros": [
        { "codigo": "KPI-07",                            // etiqueta de color: PND, KPI, TNC (transferencias), PRE (presupuesto)
          "nombre": "…",                                 // indicador, dato o sección que se publica
          "periodicidad": "Mensual", "actualizacion": "Hasta el día 15 de cada mes",
          "fuente": ["Usuarios: …", "Presupuesto: …"],   // una línea por elemento
          "enlace": "https://…" }                         // opcional: solo enlaces públicos
      ] }
  ]
}
```
El color de la etiqueta depende del prefijo del código (antes del guion). Un código nuevo sigue la numeración
de su grupo (p. ej. después de `KPI-13` va `KPI-14`).

No escribir en este archivo IPs de servidores, rutas de red (X:\…), nombres de archivos ni nombres de personas:
la página es pública. «Diccionario de datos» aparece en el menú sin enlace («Próximamente») hasta tener
toda la información mapeada; para activarlo, en `assets/js/shared.js` (SIDEBAR_NAV) se reemplaza
`disabled: true, nota: 'Próximamente'` por `href: 'MDTDH/<página>.html'`.
