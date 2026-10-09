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
- Agrega hasta GRUPO DE GASTO (no publica actividad ni ítem).
- Dimensiones: programa (el 57 separado en SANCCO y Emprendimiento), subsecretaría,
  tipo de gasto, grupo de gasto, fuente de financiamiento y unidad ejecutora.
- Medidas con los nombres del archivo: Codificado, Certificado (PRECOMPROMISO),
  Comprometido (COMPROMISO), Devengado, Saldo disponible y Reservado (RESERVADO_NEGATIVO,
  en positivo).
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
    ("reservado", "RESERVADO_NEGATIVO"),  # se publica en positivo
]
# Identidad que se controla en cada corte:
#   Codificado = Certificado + Comprometido + Saldo disponible + Reservado

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
    "57-SANCCO": "Protección Social - SANCCO",
    "57-EMPRENDIMIENTO": "Protección Social - Emprendimiento",
    "58": "Servicios de atención gerontológica",
    "59": "Atención integral a personas con discapacidades",
    "61": "Articulación territorial y participación",
    "62": "Sistema de protección especial en el ciclo de vida",
    "63": "Fomento y desarrollo de los pueblos y nacionalidades",
    "71": "Coordinación en la formulación, ejecución, seguimiento y evaluación de las políticas públicas",
}

TILDES = {
    "DIRECCION": "Dirección", "PUBLICO": "Público", "GALAPAGOS": "Galápagos", "AMAZONIA": "Amazonía",
    "BOLIVAR": "Bolívar", "CANAR": "Cañar", "MANABI": "Manabí", "SUCUMBIOS": "Sucumbíos", "RIOS": "Ríos",
    "PINAS": "Piñas", "CRISTOBAL": "Cristóbal", "NO": "N.º",
}
AJUSTES_UNIDAD = [  # retoques de redacción de los nombres de unidades ejecutoras
    (r"^Regional (\d)", r"Dirección Regional \1"),
    (r"Dirección Regional del N\.º 7 Loja el Oro y Zamora", "Dirección Regional de Trabajo 7 Loja, El Oro y Zamora"),
    (r"Servicio Público - Dirección Regional Manta", "Servicio Público de Manta"),
    (r"de Cuenca Regional 6", "de Cuenca (Regional 6)"),
    (r" de los Ríos$", " de Los Ríos"), (r" de el Oro$", " de El Oro"),
]
MINUSCULAS = {"DE", "DEL", "LA", "LAS", "LOS", "Y", "EL", "EN"}


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


def nombre_unidad(cod, desc):
    """Limpia el nombre de la unidad ejecutora y la clasifica."""
    d = re.sub(r"\s*-?\s*MINISTERIO DE TRABAJO Y DESARROLLO HUMANO\s*", " ", desc.upper()).strip(" -")
    d = re.sub(r"^MTDH\s+", "", d)
    if cod == "9999" or "PLANTA CENTRAL" in desc.upper():
        return "Planta Central", "Planta Central"
    palabras = []
    for i, p in enumerate(re.split(r"(\s+|-)", d)):
        if not p.strip() or p == "-":
            palabras.append(p)
            continue
        if p in TILDES:
            palabras.append(TILDES[p])
        elif p in MINUSCULAS and i > 0:
            palabras.append(p.lower())
        elif re.fullmatch(r"\d+", p):
            palabras.append(p)
        else:
            palabras.append(p.capitalize())
    n = re.sub(r"\s+", " ", "".join(palabras)).strip(" -")
    n = n.replace("Ministerio del Trabajo ", "").replace("Ministerio del Trabajo", "").strip()
    for a, b in AJUSTES_UNIDAD:
        n = re.sub(a, b, n)
    u = desc.upper()
    if "TRANSFERENCIAS" in u:
        tipo = "Planta Central"
    elif "PROVINCIAL" in u:
        tipo = "Dirección provincial"
    elif "DISTRITAL" in u:
        tipo = "Dirección distrital"
    else:
        tipo = "Dirección regional"
    return n[0].upper() + n[1:], tipo


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
    faltan = [c for c in ["EJERCICIO", "PROGRAMA", "DESCRIPCIÓN", "SUBSECRETARÍA", "TIPO DE GASTO", "GRUPO DE GASTO",
                          "FUENTE", "NOMBRE FUENTE", "COD.UNIDAD_EJECUTORA", "DESCRIPCIÓN REGIONAL"] + [m[1] for m in MEDIDAS]
              if c not in idx]
    if faltan:
        sys.exit("Faltan columnas en BASE: " + ", ".join(faltan))

    cat = {k: {} for k in ["programa", "subsecretaria", "tipo_gasto", "grupo_gasto", "fuente", "unidad"]}

    def ref(dim, clave, valor):
        d = cat[dim]
        if clave not in d:
            d[clave] = dict(valor, id=len(d))
        return d[clave]["id"]

    agg = defaultdict(lambda: [0.0] * len(MEDIDAS))
    control = [0.0] * len(MEDIDAS)
    ejercicios, n = set(), 0
    for r in filas:
        if r is None or all(v is None for v in r):
            continue
        g = lambda c: r[idx[c]] if idx[c] < len(r) else None
        if texto(g("EJERCICIO")) == "":
            continue
        n += 1
        ejercicios.add(codigo(g("EJERCICIO")))
        valores = [abs(numero(g(col))) if col == "RESERVADO_NEGATIVO" else numero(g(col)) for _, col in MEDIDAS]
        for i, v in enumerate(valores):
            control[i] += v

        prog = codigo(g("PROGRAMA"))
        desc = texto(g("DESCRIPCIÓN")).upper()
        clave_p = prog
        if prog == "57":
            clave_p = "57-SANCCO" if "SANCCO" in desc else "57-EMPRENDIMIENTO"
        ip = ref("programa", clave_p, {"codigo": prog, "nombre": PROGRAMAS.get(clave_p, texto(g("DESCRIPCIÓN")).capitalize())})

        sub = texto(g("SUBSECRETARÍA"))
        sub = "Sin subsecretaría asignada" if sub in ("", "#N/A") else sub
        isub = ref("subsecretaria", sub, {"nombre": sub})

        tipo = texto(g("TIPO DE GASTO")).capitalize().replace("Inversión", "Inversión")
        it = ref("tipo_gasto", tipo, {"nombre": tipo})

        gr = codigo(g("GRUPO DE GASTO"))
        ig = ref("grupo_gasto", gr, {"codigo": gr, "nombre": GRUPOS.get(gr, "Grupo " + gr)})

        fu = codigo(g("FUENTE"))
        nf = texto(g("NOMBRE FUENTE"))
        nf = nf[:1].upper() + nf[1:].lower() if nf.isupper() else nf
        ifu = ref("fuente", fu, {"codigo": fu, "nombre": nf.replace("Prestamos", "Préstamos").replace("Tecnica", "Técnica")})

        cu = codigo(g("COD.UNIDAD_EJECUTORA"))
        nu, tu = nombre_unidad(cu, texto(g("DESCRIPCIÓN REGIONAL")))
        iu = ref("unidad", cu, {"codigo": cu, "nombre": nu, "tipo": tu})

        acc = agg[(ip, isub, it, ig, ifu, iu)]
        for i, v in enumerate(valores):
            acc[i] += v

    if len(ejercicios) != 1:
        sys.exit(f"Se esperaba un solo ejercicio en BASE y hay: {sorted(ejercicios)}")

    # Se descartan las combinaciones con todas las medidas en cero (p. ej. programa 26)
    registros = [list(k) + [round(v, 2) for v in vals] for k, vals in agg.items() if any(abs(v) > 0.004 for v in vals)]
    registros.sort()

    # Control: los totales del JSON deben cuadrar con la hoja BASE
    for i, (clave, col) in enumerate(MEDIDAS):
        tj = sum(r[6 + i] for r in registros)
        if abs(tj - control[i]) > 0.05:
            sys.exit(f"Los totales no cuadran en {col}: JSON {tj:,.2f} vs BASE {control[i]:,.2f}. No se escribe el archivo.")

    t = dict(zip([m[0] for m in MEDIDAS], control))
    dif = t["codificado"] - t["certificado"] - t["comprometido"] - t["saldo_disponible"] - t["reservado"]
    if abs(dif) > 1:
        print(f"AVISO: Codificado ≠ Certificado + Comprometido + Saldo + Reservado (diferencia {dif:,.2f}). Revisar la hoja BASE.")

    usados = {d: set() for d in cat}
    for r in registros:
        for j, d in enumerate(["programa", "subsecretaria", "tipo_gasto", "grupo_gasto", "fuente", "unidad"]):
            usados[d].add(r[j])

    salida = {
        "ejercicio": int(ejercicios.pop()),
        "fecha_corte": corte,
        "generado": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "nivel": "grupo de gasto",
        "medidas": [m[0] for m in MEDIDAS],
        "dimensiones": ["programa", "subsecretaria", "tipo_gasto", "grupo_gasto", "fuente", "unidad"],
        "catalogos": {d: sorted(v.values(), key=lambda x: x["id"]) for d, v in cat.items()},
        "registros": registros,
        "totales": {clave: round(control[i], 2) for i, (clave, _) in enumerate(MEDIDAS)},
    }

    os.makedirs(os.path.dirname(os.path.abspath(a.salida)), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(a.salida)), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(salida, fh, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, a.salida)  # reemplaza el anterior sin dejar un archivo a medias

    t = salida["totales"]
    print(f"Corte {corte} · {n:,} filas de BASE → {len(registros):,} registros ({os.path.getsize(a.salida)/1024:,.0f} KB)")
    print(f"Codificado {t['codificado']:,.2f} · Devengado {t['devengado']:,.2f} · Ejecución {100*t['devengado']/t['codificado']:.2f} %")
    print(f"Archivo: {a.salida}")


if __name__ == "__main__":
    main()
