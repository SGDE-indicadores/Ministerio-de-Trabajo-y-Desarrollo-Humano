#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
calcular_indicadores_trabajo.py
===============================
Calcula los indicadores del PND · Trabajo y Oportunidades desde los microdatos de
personas de la ENEMDU, replicando la sintaxis Stata de cada ficha metodológica
(versión 25/09/2026), con diseño muestral:

    svyset upm [iw=fexp], strata(estrato) vce(linearized) singleunit(certainty)

  brecha-salarial     4.4.1  ingrl (−1 y 999999 = perdido), condact 1–6, por p02
                             Brecha = (media_h − media_m) / media_h × 100
  desempleo-juvenil   4.4.2  condact 7–8 ÷ condact 1–8, p03 18–29
  empleo-adecuado     4.4.3  condact 1 ÷ condact 1–8, p03 ≥ 15
  trabajo-infantil    4.4.4  (p20==1 | (p20==2 & p21<12) | (p20==2 & p21==12 & p22==1)), p03 5–14
  percepcion-calidad  8.2.1  media de sp01 (0–10; 88, 99 y fuera de rango = perdido) — ENEMDU de diciembre

Desagregaciones según cada ficha: nacional, sexo (salvo brecha y percepción),
área y provincia (provincia solo con la base ANUAL y no para percepción).
Para cada estimación: error estándar por linealización, CV e IC 95 %; las filas
con CV > 15 % se marcan como referenciales (limitación técnica de las fichas).

El valor NACIONAL se compara con la serie oficial de la ficha
(datos/pnd/trabajo/serie_indicadores.csv) y se informa si coincide.
Escribe en datos/pnd/trabajo/desagregaciones.csv reemplazando las filas del mismo
indicador, periodo y fuente.

Uso
---
  python scripts/calcular_indicadores_trabajo.py --indicador brecha-salarial --base enemdu_persona_2025_anual.dta --periodo 2025
  python scripts/calcular_indicadores_trabajo.py --indicador trabajo-infantil --base enemdu_persona_2025_anual.dta --periodo 2025
  python scripts/calcular_indicadores_trabajo.py --indicador empleo-adecuado --base enemdu_persona_2025_IV.dta --periodo 2025-T4 --trimestral
  python scripts/calcular_indicadores_trabajo.py --indicador percepcion-calidad --base enemdu_persona_2025_12.dta --periodo 2025

  --indicador todos   calcula los cuatro indicadores ENEMDU anuales con la misma base
                      (percepción de calidad usa la ENEMDU de diciembre: correr aparte).

Formatos: .dta (Stata), .sav (SPSS, requiere pyreadstat) o .csv. Requiere pandas y numpy.
"""
import argparse
import csv
import os
import sys

import numpy as np
import pandas as pd

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(REPO, "datos", "pnd", "trabajo")
CAMPOS = ["indicador_id", "periodo", "tipo_periodo", "dimension", "categoria", "valor", "cv_pct", "li", "ls",
          "n_muestral", "ingreso_hombres", "ingreso_mujeres", "fuente", "nota"]
DISENO = ["fexp", "upm", "estrato", "area", "prov"]
PROVINCIAS = {1: "Azuay", 2: "Bolívar", 3: "Cañar", 4: "Carchi", 5: "Cotopaxi", 6: "Chimborazo", 7: "El Oro",
              8: "Esmeraldas", 9: "Guayas", 10: "Imbabura", 11: "Loja", 12: "Los Ríos", 13: "Manabí",
              14: "Morona Santiago", 15: "Napo", 16: "Pastaza", 17: "Pichincha", 18: "Tungurahua",
              19: "Zamora Chinchipe", 20: "Galápagos", 21: "Sucumbíos", 22: "Orellana", 23: "Santo Domingo",
              24: "Santa Elena", 90: "Zonas no delimitadas"}
AREAS = {1: "Urbano", 2: "Rural"}
SEXOS = {1: "Hombre", 2: "Mujer"}

# variables, desagregaciones y codificación de cada ficha
INDICADORES = {
    "brecha-salarial":    {"vars": ["ingrl", "condact", "p02"], "sexo": False, "provincia": True, "escala": 1},
    "desempleo-juvenil":  {"vars": ["condact", "p02", "p03"], "sexo": True, "provincia": True, "escala": 100},
    "empleo-adecuado":    {"vars": ["condact", "p02", "p03"], "sexo": True, "provincia": True, "escala": 100},
    "trabajo-infantil":   {"vars": ["p20", "p21", "p22", "p02", "p03"], "sexo": True, "provincia": True, "escala": 100},
    "percepcion-calidad": {"vars": ["sp01"], "sexo": False, "provincia": False, "escala": 1},
}


def variable_indicador(df, ind):
    """Devuelve la variable de análisis (NaN fuera del universo) replicando la sintaxis de la ficha."""
    if ind == "desempleo-juvenil":
        edad = df["p03"].between(18, 29)
        y = pd.Series(np.nan, index=df.index)
        y[edad & df["condact"].isin([7, 8])] = 1
        y[edad & df["condact"].between(1, 6)] = 0
        return y
    if ind == "empleo-adecuado":
        edad = df["p03"] >= 15
        y = pd.Series(np.nan, index=df.index)
        y[edad & (df["condact"] == 1)] = 1
        y[edad & df["condact"].between(2, 8)] = 0
        return y
    if ind == "trabajo-infantil":
        edad = df["p03"].between(5, 14)
        trabaja = (df["p20"] == 1) | ((df["p20"] == 2) & (df["p21"] < 12)) | \
                  ((df["p20"] == 2) & (df["p21"] == 12) & (df["p22"] == 1))
        return pd.Series(np.where(edad, trabaja.astype(float), np.nan), index=df.index)
    if ind == "percepcion-calidad":
        y = df["sp01"].where(~df["sp01"].isin([88, 99]))
        return y.where(y.between(0, 10))
    raise ValueError(ind)


def leer_base(ruta, necesarias):
    ext = os.path.splitext(ruta)[1].lower()
    if ext == ".dta":
        with pd.read_stata(ruta, convert_categoricals=False, iterator=True) as it:
            nombres = list(it.variable_labels().keys())
        usar = [c for c in nombres if c.lower() in necesarias]
        df = pd.read_stata(ruta, convert_categoricals=False, columns=usar)
    elif ext == ".sav":
        import pyreadstat
        df, _ = pyreadstat.read_sav(ruta, apply_value_formats=False)
    else:
        df = pd.read_csv(ruta, low_memory=False)
    df.columns = [c.lower() for c in df.columns]
    faltan = [v for v in necesarias if v not in df.columns]
    if faltan:
        sys.exit(f"Faltan variables en la base: {faltan}")
    df = df[necesarias].copy()
    for c in necesarias:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def var_linealizada(z, estrato, upm):
    """Varianza de un total linealizado: estratos × UPM con reemplazo; estratos con una UPM aportan 0
    (equivale a singleunit(certainty))."""
    t = pd.DataFrame({"z": z, "h": estrato, "u": upm}).groupby(["h", "u"], sort=False)["z"].sum().reset_index()
    v = 0.0
    for _, g in t.groupby("h"):
        n = len(g)
        if n > 1:
            v += n / (n - 1) * ((g["z"] - g["z"].mean()) ** 2).sum()
    return v


def media_dominio(y, w, dominio):
    """Media ponderada en un dominio y sus valores de influencia (fuera del dominio = 0)."""
    m = dominio & y.notna()
    W = w[m].sum()
    if W == 0:
        return None, None, 0
    media = (w[m] * y[m]).sum() / W
    u = np.where(m, w * (y.fillna(0) - media) / W, 0.0)
    return media, u, int(m.sum())


def estimar(df, ind, dominio):
    w = df["fexp"].fillna(0)
    if ind == "brecha-salarial":
        y = df["ingrl"].where(~df["ingrl"].isin([-1, 999999]))
        ocupado = df["condact"].between(1, 6)
        mh, uh, nh = media_dominio(y, w, dominio & ocupado & (df["p02"] == 1))
        mm, um, nm = media_dominio(y, w, dominio & ocupado & (df["p02"] == 2))
        if mh is None or mm is None:
            return None
        valor = (mh - mm) / mh * 100
        z = (100 * mm / mh ** 2) * uh + (-100 / mh) * um      # delta: g = (1 − mm/mh)·100
        extra = {"ingreso_hombres": round(mh, 2), "ingreso_mujeres": round(mm, 2), "n_muestral": nh + nm}
    else:
        esc = INDICADORES[ind]["escala"]
        m, u, n = media_dominio(variable_indicador(df, ind), w, dominio)
        if m is None:
            return None
        valor, z, extra = m * esc, u * esc, {"n_muestral": n}
    se = float(np.sqrt(var_linealizada(z, df["estrato"], df["upm"])))
    cv = abs(se / valor) * 100 if valor else np.nan
    return {"valor": round(valor, 4), "cv_pct": round(cv, 2), "li": round(valor - 1.96 * se, 4),
            "ls": round(valor + 1.96 * se, 4), **extra}


def calcular(df, ind, periodo, trimestral, fuente):
    cfg = INDICADORES[ind]
    filas = []

    def agregar(dim, cat, dominio):
        r = estimar(df, ind, dominio)
        if r:
            filas.append({"indicador_id": ind, "periodo": periodo, "tipo_periodo": "trimestral" if trimestral else "anual",
                          "dimension": dim, "categoria": cat, "fuente": fuente,
                          "nota": "CV > 15 %: estimación referencial" if r["cv_pct"] > 15 else "", **r})

    todos = pd.Series(True, index=df.index)
    agregar("nacional", "Nacional", todos)
    if cfg["sexo"]:
        for c, n in SEXOS.items():
            agregar("sexo", n, df["p02"] == c)
    for c, n in AREAS.items():
        agregar("area", n, df["area"] == c)
    if cfg["provincia"] and not trimestral:
        for c in sorted(df["prov"].dropna().unique()):
            agregar("provincia", PROVINCIAS.get(int(c), f"Provincia {int(c)}"), df["prov"] == c)
    return filas


def comparar_con_ficha(ind, periodo, nac, datos):
    serie = pd.read_csv(os.path.join(datos, "serie_indicadores.csv"), dtype=str)
    s = serie[serie.indicador_id == ind]
    of = s[s.periodo == periodo]
    if not len(of) and periodo.isdigit():
        of = s[s.anio == periodo]
    if not len(of):
        return "sin valor oficial para comparar"
    oficial = float(of.iloc[0]["valor"])
    dif = nac - oficial
    return f"ficha {oficial:.2f} → " + ("COINCIDE" if abs(dif) < 0.005 else f"DIFERENCIA {dif:+.2f} (revisar base/filtros)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--indicador", required=True, choices=list(INDICADORES) + ["todos"])
    ap.add_argument("--base", required=True, help="Microdatos de personas ENEMDU (.dta/.sav/.csv)")
    ap.add_argument("--periodo", required=True, help="2025 (anual) o 2025-T4 (trimestral)")
    ap.add_argument("--trimestral", action="store_true", help="Base trimestral acumulada: sin provincia")
    ap.add_argument("--datos", default=DATOS)
    args = ap.parse_args()

    inds = ["brecha-salarial", "desempleo-juvenil", "empleo-adecuado", "trabajo-infantil"] if args.indicador == "todos" else [args.indicador]
    necesarias = sorted(set(DISENO) | {v for i in inds for v in INDICADORES[i]["vars"]})
    df = leer_base(args.base, necesarias)
    base_txt = "ENEMDU diciembre" if inds == ["percepcion-calidad"] else f"ENEMDU {'Trimestral' if args.trimestral else 'Anual'} Acumulada"
    fuente = f"INEC · {base_txt} · cálculo MTDH con la sintaxis de la ficha metodológica"

    nuevas = []
    for ind in inds:
        filas = calcular(df, ind, args.periodo, args.trimestral, fuente)
        nac = next(f for f in filas if f["dimension"] == "nacional")
        ref = sum(1 for f in filas if f["nota"])
        print(f"{ind:20} {args.periodo}: nacional {nac['valor']:.2f} (CV {nac['cv_pct']:.1f} %) · "
              f"{comparar_con_ficha(ind, args.periodo, nac['valor'], args.datos)} · {len(filas)} filas, {ref} con CV > 15 %")
        nuevas += filas

    ruta = os.path.join(args.datos, "desagregaciones.csv")
    claves = {(f["indicador_id"], f["periodo"]) for f in nuevas}
    previas = []
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as fh:
            previas = [r for r in csv.DictReader(fh) if not ((r["indicador_id"], r["periodo"]) in claves and r["fuente"] == fuente)]
    with open(ruta, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=CAMPOS, extrasaction="ignore")
        w.writeheader()
        w.writerows(previas + nuevas)
    print(f"Escrito: {ruta}")


if __name__ == "__main__":
    main()
