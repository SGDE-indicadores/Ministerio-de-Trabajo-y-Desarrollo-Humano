"""Carga de Movilidad Social (Crédito de Desarrollo Humano, registro 12)
en KPIs · Protección Social e Inclusión Económica. Acepta dos Excel:

1) Mensual «resumen_CDH_<mes>_<año>.xlsx» (hojas Tipo credito, Genero, Rango edad, Etnia, Pobreza;
   columnas Año, Mes, tipocredito, <desagregación>, registros, monto_total, monto_promedio). Actualiza:
     movilidad_social/cobertura_cdh_movilidad.csv        -> agrega (o reemplaza) las filas del mes
     movilidad_social/caracterizacion_cdh_movilidad.csv  -> agrega (o reemplaza) las filas del mes
     kpi_proteccion_social.csv                           -> cifra destacada y textos de la tarjeta
   Los meses anteriores se conservan; el portal muestra siempre el último mes cargado.
   Si alguna desagregación no suma el total de su tipo de crédito, no escribe nada.

2) Anual «resumen_CDH_por_anio.xlsx» (hoja Creditos por anio; columnas Año, creditos, monto_total).
   Reemplaza movilidad_social/serie_anual_cdh.csv (serie histórica del carrusel: créditos otorgados por año).
   El último año se marca como parcial (enero–<mes>) hasta el último mes de cobertura_cdh_movilidad.csv,
   o hasta el mes que se indique con --hasta AAAA-MM.

Uso (desde la raíz del repositorio):
    python scripts/actualizar_cdh.py --archivo "C:/cdh/resumen_CDH_octubre_2026.xlsx"
    python scripts/actualizar_cdh.py --archivo "C:/cdh/resumen_CDH_por_anio.xlsx"

Requiere: pip install openpyxl
"""
import argparse, csv, io, os, re, sys

import openpyxl

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda p: os.path.join(RAIZ, 'datos/kpis', p)
COB, CAR = D('movilidad_social/cobertura_cdh_movilidad.csv'), D('movilidad_social/caracterizacion_cdh_movilidad.csv')
ANUAL, TARJ = D('movilidad_social/serie_anual_cdh.csv'), D('kpi_proteccion_social.csv')
MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
         'septiembre', 'octubre', 'noviembre', 'diciembre']
GRUPOS = {'Genero': ('genero', 'genero'), 'Rango edad': ('rango_edad', 'rangoedad'),
          'Etnia': ('etnia', 'etnia'), 'Pobreza': ('pobreza', 'pobreza')}


def leer_csv(p):
    raw = open(p, 'rb').read()
    nl = '\r\n' if b'\r\n' in raw else '\n'
    filas = list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
    return filas, list(filas[0].keys()), nl


def escribir_csv(p, filas, cab, nl):
    b = io.StringIO()
    w = csv.DictWriter(b, fieldnames=cab, lineterminator=nl)
    w.writeheader()
    w.writerows(filas)
    open(p, 'wb').write(b.getvalue().encode('utf-8'))


def num(v):
    if v in (None, ''):
        return ''
    t = f'{float(v):.2f}'.rstrip('0').rstrip('.')
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--archivo', required=True)
    ap.add_argument('--hasta', help='solo Excel anual: último mes del año en curso (AAAA-MM)')
    a = ap.parse_args()
    wb = openpyxl.load_workbook(a.archivo, data_only=True)
    hojas = {}
    for ws in wb.worksheets:
        filas = list(ws.iter_rows(values_only=True))
        cab = [str(c).strip() for c in filas[0]]
        hojas[ws.title.strip()] = [dict(zip(cab, f)) for f in filas[1:] if f and f[0]]
    if 'Creditos por anio' in hojas:
        return cargar_anual(hojas['Creditos por anio'], os.path.basename(a.archivo), a.hasta)
    for h in ['Tipo credito', *GRUPOS]:
        if h not in hojas:
            sys.exit(f'Falta la hoja «{h}»')
    tipo = hojas['Tipo credito']
    periodos = {(int(r['Año']), str(r['Mes']).strip().lower()) for r in tipo}
    if len(periodos) != 1:
        sys.exit(f'El Excel debe traer un solo mes; trae {sorted(periodos)}')
    anio, nom_mes = periodos.pop()
    if nom_mes not in MESES:
        sys.exit(f'Mes no reconocido: {nom_mes}')
    anio, mes = str(anio), f'{MESES.index(nom_mes) + 1:02d}'
    fuente = os.path.basename(a.archivo)
    nota = f'Dato real ({fuente}).'

    # validar sumas por tipo de crédito
    tot = {str(r['tipocredito']).strip(): int(r['registros']) for r in tipo}
    errores = []
    for hoja, (g, col) in GRUPOS.items():
        for t, n in tot.items():
            s = sum(int(r['registros']) for r in hojas[hoja] if str(r['tipocredito']).strip() == t)
            if s != n:
                errores.append(f'{hoja} · {t}: suma {s} ≠ total {n}')
    if errores:
        sys.exit('No se escribió nada. Las desagregaciones no cuadran:\n  ' + '\n  '.join(errores))

    # cobertura
    C, cab_c, nl_c = leer_csv(COB)
    indicador = C[0]['indicador']
    C = [r for r in C if (r['anio'], r['mes']) != (anio, mes)]
    for r in tipo:
        C.append({'registro_id': '12', 'indicador': indicador, 'anio': anio, 'mes': mes,
                  'tipo_credito': str(r['tipocredito']).strip(), 'registros': str(int(r['registros'])),
                  'monto_total_usd': num(r['monto_total']), 'monto_promedio_usd': num(r['monto_promedio']),
                  'es_dato_real': 'TRUE', 'nota': nota})
    C.sort(key=lambda r: (r['anio'], r['mes'], r['tipo_credito']))

    # caracterización
    K, cab_k, nl_k = leer_csv(CAR)
    K = [r for r in K if (r['anio'], r['mes']) != (anio, mes)]
    for hoja, (g, col) in GRUPOS.items():
        for r in sorted(hojas[hoja], key=lambda r: str(r['tipocredito'])):
            K.append({'registro_id': '12', 'anio': anio, 'mes': mes, 'tipo_credito': str(r['tipocredito']).strip(),
                      'grupo': g, 'categoria': str(r[col]).strip(), 'registros': str(int(r['registros'])),
                      'monto_total_usd': num(r['monto_total']), 'es_dato_real': 'TRUE', 'nota': nota})
    K.sort(key=lambda r: (r['anio'], r['mes']))  # estable: conserva el orden de grupos dentro del mes

    total = sum(tot.values())

    # tarjeta del panorama (registro 12)
    T, cab_t, nl_t = leer_csv(TARJ)
    fmt = f'{total:,}'.replace(',', '.')
    patron = re.compile(r'\b(' + '|'.join(MESES) + r') \d{4}', re.I)
    for r in T:
        if r['registro_id'] != '12':
            continue
        r['headline'] = fmt
        r['headline_sufijo'] = patron.sub(f'{nom_mes} {anio}', r['headline_sufijo'])
        r['nota'] = patron.sub(f'{nom_mes} {anio}', r['nota'])
        if r['tipo_registro'] == 'desagregacion_actual':
            r['desagregacion_categoria'] = f'{nom_mes.capitalize()} {anio}'
            r['desagregacion_valor'] = fmt

    escribir_csv(COB, C, cab_c, nl_c)
    escribir_csv(CAR, K, cab_k, nl_k)
    escribir_csv(TARJ, T, cab_t, nl_t)
    print(f'CDH {nom_mes} {anio}: {total} créditos ({", ".join(f"{t}: {n}" for t, n in tot.items())})')
    print('Listo. Revisar MDTDH/kpis.html#/cobertura-movilidad-social')


def cargar_anual(filas, fuente, hasta):
    """Excel anual -> movilidad_social/serie_anual_cdh.csv (reemplaza el archivo completo)."""
    if not hasta:
        C, _, _ = leer_csv(COB)
        hasta = max(r['anio'] + '-' + r['mes'] for r in C)
    if not re.fullmatch(r'\d{4}-\d{2}', hasta):
        sys.exit('--hasta debe ser AAAA-MM')
    anio_h, mes_h = hasta.split('-')
    filas = sorted(filas, key=lambda r: int(r['Año']))
    out = []
    for r in filas:
        anio = str(int(r['Año']))
        parcial = anio == anio_h and mes_h != '12'
        meses = f'enero-{MESES[int(mes_h) - 1]}' if parcial else 'enero-diciembre'
        if int(anio) > int(anio_h):
            sys.exit(f'El Excel trae {anio}, posterior al último mes cargado ({hasta}). Usar --hasta.')
        out.append({'registro_id': '12', 'anio': anio, 'creditos': str(int(r['creditos'])),
                    'monto_total_usd': num(r['monto_total']), 'meses': meses,
                    'es_dato_real': 'TRUE', 'nota': f'Dato real ({fuente}).'})
    cab = ['registro_id', 'anio', 'creditos', 'monto_total_usd', 'meses', 'es_dato_real', 'nota']
    nl = '\n'
    if os.path.exists(ANUAL):
        _, cab, nl = leer_csv(ANUAL)
    escribir_csv(ANUAL, out, cab, nl)
    print(f'Serie anual CDH: {out[0]["anio"]}-{out[-1]["anio"]} ({len(out)} años); {out[-1]["anio"]}: {out[-1]["meses"]}')
    print('Listo. Revisar el carrusel en MDTDH/kpis.html#/kpis-proteccion-social (Movilidad Social)')


if __name__ == '__main__':
    main()
