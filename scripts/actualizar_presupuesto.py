#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
actualizar_presupuesto.py
-------------------------
Genera el JSON de ejecución presupuestaria del portal MTDH a partir del archivo
«DASHBOARD CON CORTE AL dd-mm-aaaa - Datos.xlsm» (hoja BASE).

    python scripts/actualizar_presupuesto.py --archivo "C:/presupuesto/DASHBOARD CON CORTE AL 08-10-2026 - Datos.xlsm"

Escribe datos/presupuesto/ejecucion_presupuestaria.json dentro del portal (se puede cambiar con --salida).

- Lee SOLO la hoja BASE (los datos crudos). No usa las tablas dinámicas de la hoja
  DASHBOARD, porque pueden no estar actualizadas.
- El JSON lleva solo lo que usa la página MDTDH/presupuesto.html:
    dimensiones: programa (el 57 en un solo programa, Protección Social), tipo de gasto,
                 grupo de gasto y fuente de financiamiento;
    medidas:     Codificado, Certificado (PRECOMPROMISO), Comprometido (COMPROMISO),
                 Devengado y Saldo disponible (SALDO_DISPONIBLE).
- RESERVADO_NEGATIVO se lee solo para el control de cuadre; no se publica
  (SALDO_DISPONIBLE ya viene con el reservado descontado).
- Controla que los totales del JSON cuadren al centavo con la hoja BASE; si no cuadran,
  no escribe nada. Reemplaza el JSON anterior (no guarda historial).

Requiere: openpyxl  (pip install openpyxl)
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import tempfile
from collections import defaultdict

import openpyxl

MEDIDAS = [  # (clave en el JSON, columna en BASE)
    ("codificado", "CODIFICADO"),
    ("certificado", "PRECOMPROMISO"),
    ("comprometido", "COMPROMISO"),
    ("devengado", "DEVENGADO"),
    ("saldo_disponible", "SALDO_DISPONIBLE"),
]
COL_RESERVADO = "RESERVADO_NEGATIVO"  # solo para el control:
#   Codificado = Certificado + Comprometido + Saldo disponible + |Reservado|
DIMENSIONES = ["programa", "tipo_gasto", "grupo_gasto", "fuente"]

# Clasificador presupuestario: nombre de cada grupo de gasto
GRUPOS = {
    "51": "Gastos en personal", "53": "Bienes y servicios de consumo", "56": "Gastos financieros",
    "57": "Otros gastos corrientes", "58": "Transferencias o donaciones corrientes",
    "71": "Gastos en personal para inversión", "73": "Bienes y servicios para inversión",
    "75": "Obras públicas", "77": "Otros gastos de inversión",
    "78": "Transferencias o donaciones para inversión", "84": "Bienes de larga duración",
    "87": "Inversiones financieras", "96": "Amortización de la deuda pública", "97": "Pasivo circulante",
    "99": "Otros pasivos",
}

# Nombres de programa legibles (el archivo los trae en mayúsculas y sin tildes)
PROGRAMAS = {
    "1": "Administración Central",
    "26": "Protección de la Niñez",
    "55": "Promoción de empleo, verificación y control de derechos y obligaciones laborales",
    "56": "Desarrollo Infantil",
    "57": "Protección Social",
    "58": "Servicios de atención gerontológica",
    "59": "Atención integral a personas con discapacidades",
    "61": "Articulación territorial y participación",
    "62": "Sistema de protección especial en el ciclo de vida",
    "63": "Fomento y desarrollo de los pueblos y nacionalidades",
    "71": "Coordinación en la formulación, ejecución, seguimiento y evaluación de las políticas públicas",
}


def texto(v):
    return "" if v is None else str(v).strip()


def numero(v):
    if v is None or v == "":
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", "")
    try:
        return float(s)
    except ValueError:
        return 0.0


def codigo(v):
    s = texto(v)
    return s[:-2] if s.endswith(".0") else s


def fecha_corte(wb, ruta):
    try:
        v = wb["DASHBOARD"]["K3"].value
        if isinstance(v, (dt.datetime, dt.date)):
            return v.strftime("%Y-%m-%d")
    except Exception:
        pass
    m = re.search(r"(\d{2})[-_.](\d{2})[-_.](\d{4})", os.path.basename(ruta))
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    sys.exit("No se encontró la fecha de corte (celda K3 de DASHBOARD ni en el nombre del archivo).")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument("--archivo", required=True, help="Archivo .xlsm/.xlsx con la hoja BASE")
    ap.add_argument("--salida", default=os.path.join(raiz, "datos", "presupuesto", "ejecucion_presupuestaria.json"))
    a = ap.parse_args()

    wb = openpyxl.load_workbook(a.archivo, read_only=True, data_only=True)
    if "BASE" not in wb.sheetnames:
        sys.exit("El archivo no tiene la hoja BASE.")
    corte = fecha_corte(wb, a.archivo)

    filas = wb["BASE"].iter_rows(values_only=True)
    enc = [texto(c) for c in next(filas)]
    idx = {c: i for i, c in enumerate(enc) if c}
    faltan = [c for c in ["EJERCICIO", "PROGRAMA", "TIPO DE GASTO", "GRUPO DE GASTO", "FUENTE", "NOMBRE FUENTE",
                          COL_RESERVADO] + [m[1] for m in MEDIDAS]
              if c not in idx]
    if faltan:
        sys.exit("Faltan columnas en BASE: " + ", ".join(faltan))

    cat = {k: {} for k in DIMENSIONES}

    def ref(dim, clave, valor):
        d = cat[dim]
        if clave not in d:
            d[clave] = dict(valor, id=len(d))
        return d[clave]["id"]

    agg = defaultdict(lambda: [0.0] * len(MEDIDAS))
    control = [0.0] * len(MEDIDAS)
    reservado = 0.0
    ejercicios, n = set(), 0
    for r in filas:
        if r is None or all(v is None for v in r):
            continue
        g = lambda c: r[idx[c]] if idx[c] < len(r) else None
        if texto(g("EJERCICIO")) == "":
            continue
        n += 1
        ejercicios.add(codigo(g("EJERCICIO")))
        valores = [numero(g(col)) for _, col in MEDIDAS]
        for i, v in enumerate(valores):
            control[i] += v
        reservado += abs(numero(g(COL_RESERVADO)))

        prog = codigo(g("PROGRAMA"))
        ip = ref("programa", prog, {"codigo": prog, "nombre": PROGRAMAS.get(prog, "Programa " + prog)})

        tipo = texto(g("TIPO DE GASTO")).capitalize()
        it = ref("tipo_gasto", tipo, {"nombre": tipo})

        gr = codigo(g("GRUPO DE GASTO"))
        ig = ref("grupo_gasto", gr, {"codigo": gr, "nombre": GRUPOS.get(gr, "Grupo " + gr)})

        fu = codigo(g("FUENTE"))
        nf = texto(g("NOMBRE FUENTE"))
        nf = nf[:1].upper() + nf[1:].lower() if nf.isupper() else nf
        ifu = ref("fuente", fu, {"nombre": nf.replace("Prestamos", "Préstamos").replace("Tecnica", "Técnica")})

        acc = agg[(ip, it, ig, ifu)]
        for i, v in enumerate(valores):
            acc[i] += v

    if len(ejercicios) != 1:
        sys.exit(f"Se esperaba un solo ejercicio en BASE y hay: {sorted(ejercicios)}")

    # Se descartan las combinaciones con todas las medidas en cero (p. ej. programa 26);
    # el programa sigue en el catálogo para que la página lo muestre en cero, como el reporte.
    nd = len(DIMENSIONES)
    registros = [list(k) + [round(v, 2) for v in vals] for k, vals in agg.items() if any(abs(v) > 0.004 for v in vals)]
    registros.sort()

    # Control: los totales del JSON deben cuadrar con la hoja BASE
    for i, (clave, col) in enumerate(MEDIDAS):
        tj = sum(r[nd + i] for r in registros)
        if abs(tj - control[i]) > 0.05:
            sys.exit(f"Los totales no cuadran en {col}: JSON {tj:,.2f} vs BASE {control[i]:,.2f}. No se escribe el archivo.")

    t = dict(zip([m[0] for m in MEDIDAS], control))
    dif = t["codificado"] - t["certificado"] - t["comprometido"] - t["saldo_disponible"] - reservado
    if abs(dif) > 1:
        print(f"AVISO: Codificado ≠ Certificado + Comprometido + Saldo + Reservado (diferencia {dif:,.2f}). Revisar la hoja BASE.")

    salida = {
        "ejercicio": int(ejercicios.pop()),
        "fecha_corte": corte,
        "medidas": [m[0] for m in MEDIDAS],
        "dimensiones": DIMENSIONES,
        "catalogos": {d: sorted(v.values(), key=lambda x: x["id"]) for d, v in cat.items()},
        "registros": registros,
    }

    os.makedirs(os.path.dirname(os.path.abspath(a.salida)), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(a.salida)), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(salida, fh, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, a.salida)  # reemplaza el anterior sin dejar un archivo a medias

    print(f"Corte {corte} · {n:,} filas de BASE → {len(registros):,} registros ({os.path.getsize(a.salida)/1024:,.0f} KB)")
    print(f"Codificado {t['codificado']:,.2f} · Devengado {t['devengado']:,.2f} · Ejecución {100*t['devengado']/t['codificado']:.2f} %")
    print(f"Archivo: {a.salida}")


if __name__ == "__main__":
    main()
