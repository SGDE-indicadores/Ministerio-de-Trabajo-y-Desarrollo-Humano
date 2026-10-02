"""Carga mensual de KPIs · Protección Social e Inclusión Económica (DII, PAM, PCD, PE).

Entrada: el Excel «resumen_usuarios_por_servicio_<MES>.xlsx» (hojas Resumen, Sexo, Rango edad,
Etnia, Pobreza 2018, Pobreza 2025; la hoja «Edad DII meses» no se usa).

Actualiza, en datos/kpis/:
  proteccion_social/caracterizacion_proteccion_social.csv  -> se reemplaza por el corte cargado
  proteccion_social/series_historicas_servicios.csv        -> el mes del corte queda como dato real
                                                              (se agrega si no existe, se corrige si existe)
  kpi_proteccion_social.csv                                -> cifra y textos «corte <mes> <año>» de las tarjetas

Uso (desde la raíz del repositorio):
    python scripts/actualizar_proteccion_social.py --archivo "C:/ps/resumen_usuarios_por_servicio_SEPTIEMBRE.xlsx" --corte 2026-09

Para corregir un mes anterior (p. ej. julio revisado) sin cambiar la caracterización ni las tarjetas:
    python scripts/actualizar_proteccion_social.py --archivo ".../resumen_usuarios_por_servicio_JULIO.xlsx" --corte 2026-07 --solo-serie

Si los totales por sexo, edad, etnia o pobreza no cuadran con el total del servicio, no escribe nada.
Requiere: pip install openpyxl
"""
import argparse, csv, io, os, re, sys

import openpyxl

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAR = os.path.join(RAIZ, 'datos/kpis/proteccion_social/caracterizacion_proteccion_social.csv')
SERIE = os.path.join(RAIZ, 'datos/kpis/proteccion_social/series_historicas_servicios.csv')
TARJ = os.path.join(RAIZ, 'datos/kpis/kpi_proteccion_social.csv')

MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
         'septiembre', 'octubre', 'noviembre', 'diciembre']
# tipo_servicio del Excel -> registro_id del portal
REG = {'Desarrollo Infantil': '5', 'Protección Especial': '6', 'Personas con Discapacidad': '7', 'Adultos Mayores': '8'}
ORDEN = ['5', '8', '7', '6']
ETNIA = {'Afroecuatoriano': 'Afroecuatoriano/a', 'Indígena': 'Indígena', 'Mestizo': 'Mestizo/a',
         'Montuvio': 'Montuvio/a', 'Blanco': 'Blanco/a', 'Otro': 'Otro/a'}


def leer_excel(ruta):
    wb = openpyxl.load_workbook(ruta, data_only=True)
    hojas = {}
    for ws in wb.worksheets:
        filas = list(ws.iter_rows(values_only=True))
        if not filas:
            continue
        cab = [str(c).strip() if c is not None else '' for c in filas[0]]
        hojas[ws.title.strip()] = [dict(zip(cab, f)) for f in filas[1:] if f and f[0]]
    for h in ('Resumen', 'Sexo', 'Rango edad', 'Etnia', 'Pobreza 2018', 'Pobreza 2025'):
        if h not in hojas:
            sys.exit(f'Falta la hoja «{h}» en {ruta}')
    return hojas


def reg(r):
    t = str(r['tipo_servicio']).strip()
    if t not in REG:
        sys.exit(f'Servicio desconocido en el Excel: «{t}». Agregarlo al diccionario REG del script.')
    return REG[t]


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


def rango(lbl):
    m = re.match(r'\s*(\d+)\s*-\s*(\d+)', str(lbl))
    return f'{m.group(1)}-{m.group(2)} años' if m else '65 y más años'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--archivo', required=True)
    ap.add_argument('--corte', required=True, help='AAAA-MM, p. ej. 2026-09')
    ap.add_argument('--solo-serie', action='store_true', help='solo corrige ese mes en la serie histórica')
    a = ap.parse_args()
    if not re.fullmatch(r'\d{4}-\d{2}', a.corte):
        sys.exit('--corte debe ser AAAA-MM')
    anio, mes = a.corte.split('-')
    nom_mes = MESES[int(mes) - 1]
    fuente = os.path.basename(a.archivo)
    X = leer_excel(a.archivo)
    total = {reg(r): int(r['usuarios']) for r in X['Resumen']}
    faltan = [k for k in ORDEN if k not in total]
    if faltan:
        sys.exit(f'El Excel no trae los servicios {faltan}')

    # ---- 1) caracterización
    car_nueva = None
    if not a.solo_serie:
        viejas, cab, nl_car = leer_csv(CAR)
        nombre = {r['registro_id']: r['indicador'] for r in viejas}
        nota = f'Dato real, corte {nom_mes} {anio} ({fuente}).'
        f = lambda rg, g, c, n: {'registro_id': rg, 'indicador': nombre[rg], 'anio_corte': anio, 'mes_corte': mes,
                                 'grupo': g, 'categoria': c, 'usuarios': str(int(n)), 'es_dato_real': 'TRUE', 'nota': nota}
        out = [f(rg, 'total', 'Total', total[rg]) for rg in ORDEN]
        out += [f(reg(r), 'sexo', str(r['sexo']).strip(), r['usuarios']) for r in X['Sexo'] if r['usuarios']]
        for r in X['Rango edad']:
            for s in ('Hombre', 'Mujer'):
                if r.get(s):
                    out.append(f(reg(r), 'rango_edad', f'{rango(r["edad_rango"])} {s}', r[s]))
        for g, hoja in (('pobreza_2018', 'Pobreza 2018'), ('pobreza_2025', 'Pobreza 2025')):
            for rg in ORDEN:
                for r in sorted([r for r in X[hoja] if reg(r) == rg], key=lambda r: str(r[g])):
                    out.append(f(rg, g, str(r[g]).strip(), r['usuarios']))
        for rg in ORDEN:
            for r in sorted([r for r in X['Etnia'] if reg(r) == rg], key=lambda r: -int(r['usuarios'])):
                e = str(r['etnia']).strip()
                out.append(f(rg, 'etnia', ETNIA.get(e, e), r['usuarios']))
        errores = []
        for rg in ORDEN:
            for g in ('sexo', 'rango_edad', 'etnia', 'pobreza_2018', 'pobreza_2025'):
                s = sum(int(x['usuarios']) for x in out if x['registro_id'] == rg and x['grupo'] == g)
                if s != total[rg]:
                    errores.append(f'registro {rg} · {g}: suma {s} ≠ total {total[rg]}')
        if errores:
            sys.exit('No se escribió nada. Los totales no cuadran:\n  ' + '\n  '.join(errores))
        car_nueva = (out, cab, nl_car)

    # ---- 2) serie histórica mensual
    S, cab_s, nl_s = leer_csv(SERIE)
    nota_s = f'Dato real, corte {nom_mes} {anio} ({fuente}).'
    for rg in ORDEN:
        fila = next((r for r in S if r['registro_id'] == rg and r['anio'] == anio and r['mes'] == mes), None)
        if fila:
            print(f'serie {rg} {a.corte}: {fila["usuarios"]} -> {total[rg]}')
            fila.update(usuarios=str(total[rg]), es_dato_real='TRUE', nota=nota_s)
        else:
            idx = max(i for i, r in enumerate(S) if r['registro_id'] == rg)
            nueva = dict(S[idx], anio=anio, mes=mes, usuarios=str(total[rg]), es_dato_real='TRUE', nota=nota_s)
            S.insert(idx + 1, nueva)
            print(f'serie {rg} {a.corte}: agregado {total[rg]}')
        filas_rg = sorted((r for r in S if r['registro_id'] == rg), key=lambda r: (r['anio'], r['mes']))
        if filas_rg[-1]['anio'] + filas_rg[-1]['mes'] != anio + mes and not a.solo_serie:
            print(f'  ojo: registro {rg} tiene meses posteriores a {a.corte} en la serie')

    # ---- 3) tarjetas del panorama
    if not a.solo_serie:
        K, cab_k, nl_k = leer_csv(TARJ)
        fmt = lambda n: f'{n:,}'.replace(',', '.')
        patron = re.compile(r'(corte|total) (' + '|'.join(MESES) + r') \d{4}', re.I)
        n = 0
        for r in K:
            rg = r['registro_id']
            if rg not in total:
                continue
            if r['headline']:
                r['headline'] = fmt(total[rg])
            r['headline_sufijo'] = patron.sub(lambda m: f'{m.group(1)} {nom_mes} {anio}', r['headline_sufijo'])
            r['nota'] = patron.sub(lambda m: f'{m.group(1)} {nom_mes} {anio}', r['nota'])
            if r['tipo_registro'] == 'desagregacion_actual':
                r['desagregacion_categoria'] = f'{nom_mes.capitalize()} {anio}'
                r['desagregacion_valor'] = fmt(total[rg])
            n += 1

    # ---- escribir (solo si todo lo anterior salió bien)
    if car_nueva:
        escribir_csv(CAR, *car_nueva)
        print('caracterización:', len(car_nueva[0]), 'filas')
    escribir_csv(SERIE, S, cab_s, nl_s)
    if not a.solo_serie:
        escribir_csv(TARJ, K, cab_k, nl_k)
        print('tarjetas actualizadas:', n)
    print('Listo. Revisar MDTDH/kpis.html#/kpis-proteccion-social')


if __name__ == '__main__':
    main()
