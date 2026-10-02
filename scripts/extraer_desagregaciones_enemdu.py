#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extraer_desagregaciones_enemdu.py
=================================
Toma las desagregaciones que YA existen en el panel ENEMDU del portal
(datos/enemdu/anual/*.csv, ENEMDU anual acumulada) y las copia a
datos/pnd/trabajo/desagregaciones.csv para las páginas del PND · Trabajo:

  - 4.4.3 Tasa de empleo adecuado (15 años y más): sexo, área y provincia
          (con IC 95 % y CV para área y provincia).
  - 4.4.2 Tasa de desempleo juvenil (18 a 29 años): sexo
          (el panel no tiene 18–29 por área ni provincia: eso sale de
          scripts/calcular_indicadores_trabajo.py con microdatos).

Antes de escribir verifica que el valor NACIONAL del panel coincida con la serie
oficial de la ficha metodológica (serie_indicadores.csv); si algún año no
coincide, no escribe nada y lo reporta.

Uso:  python scripts/extraer_desagregaciones_enemdu.py
"""
import csv
import json
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(REPO, "datos", "pnd", "trabajo")
FUENTE = "INEC · ENEMDU Anual Acumulada (cálculo MTDH)"
CAMPOS = ["indicador_id", "periodo", "tipo_periodo", "dimension", "categoria", "valor", "cv_pct", "li", "ls",
          "n_muestral", "ingreso_hombres", "ingreso_mujeres", "fuente", "nota"]
PROVINCIAS = ["Azuay", "Bolívar", "Cañar", "Carchi", "Cotopaxi", "Chimborazo", "El Oro", "Esmeraldas", "Guayas",
              "Imbabura", "Loja", "Los Ríos", "Manabí", "Morona Santiago", "Napo", "Pastaza", "Pichincha",
              "Tungurahua", "Zamora Chinchipe", "Galápagos", "Sucumbíos", "Orellana", "Santo Domingo", "Santa Elena"]


def cargar_panel(nombre):
    """Lee los datos del panel ENEMDU anual desde datos/enemdu/anual/<indicador>.csv
    (formato largo: seccion, anio, desagregacion, categoria, valor) y arma el mismo
    objeto anidado que usa la página ENEMDU/<indicador>_anual.html."""
    ind = nombre.replace("_anual.html", "").replace(".html", "")
    ruta = os.path.join(REPO, "datos", "enemdu", "anual", ind + ".csv")
    out = {}
    with open(ruta, encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            claves = [r[c] for c in ("seccion", "anio", "desagregacion", "categoria") if r[c] != ""]
            nodo = out
            for k in claves[:-1]:
                nodo = nodo.setdefault(k, {})
            nodo[claves[-1]] = float(r["valor"]) if r["valor"] != "" else None
    return out


def fila(ind, anio, dim, cat, valor, est=None):
    r = {"indicador_id": ind, "periodo": str(anio), "tipo_periodo": "anual", "dimension": dim, "categoria": cat,
         "valor": round(valor * 100, 4), "fuente": FUENTE, "nota": ""}
    if est:
        r.update({"cv_pct": round(est["cv"], 2), "li": round(est["li"] * 100, 4), "ls": round(est["ls"] * 100, 4)})
        if est["cv"] > 15:
            r["nota"] = "CV > 15 %: estimación referencial"
    return r


def main():
    serie = {}
    with open(os.path.join(DATOS, "serie_indicadores.csv"), encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            serie[(r["indicador_id"], r["periodo"])] = float(r["valor"])

    filas, problemas = [], []
    # ---- 4.4.3 empleo adecuado
    ea = cargar_panel("empleo_adecuado_anual.html")
    for y in sorted(ea["territorio"]):
        t, e = ea["territorio"][y], ea["estimadores"].get(y, {})
        oficial = serie.get(("empleo-adecuado", y))
        if oficial is not None and abs(t["Total"] * 100 - oficial) >= 0.005:
            problemas.append(f"empleo-adecuado {y}: panel {t['Total']*100:.2f} vs ficha {oficial:.2f}")
        filas.append(fila("empleo-adecuado", y, "sexo", "Hombre", ea["territorio_hombre"][y]["Total"]))
        filas.append(fila("empleo-adecuado", y, "sexo", "Mujer", ea["territorio_mujer"][y]["Total"]))
        for a in ("Urbano", "Rural"):
            filas.append(fila("empleo-adecuado", y, "area", a, t[a], e.get(a)))
        for p in PROVINCIAS:
            if p in t:
                filas.append(fila("empleo-adecuado", y, "provincia", p, t[p], e.get(p)))
    # ---- 4.4.2 desempleo juvenil (18 a 29): solo sexo en el panel
    de = cargar_panel("desempleo_anual.html")
    g = "18 a 29 años"
    for y in sorted(de["caracteristicas"]):
        nac = de["caracteristicas"][y]["Grupos de edad"][g]
        oficial = serie.get(("desempleo-juvenil", y))
        if oficial is not None and abs(nac * 100 - oficial) >= 0.005:
            problemas.append(f"desempleo-juvenil {y}: panel {nac*100:.2f} vs ficha {oficial:.2f}")
        filas.append(fila("desempleo-juvenil", y, "sexo", "Hombre", de["caracteristicas_hombre"][y]["Grupos de edad"][g]))
        filas.append(fila("desempleo-juvenil", y, "sexo", "Mujer", de["caracteristicas_mujer"][y]["Grupos de edad"][g]))

    if problemas:
        print("El nacional del panel NO coincide con la ficha; no se escribió nada:\n  " + "\n  ".join(problemas))
        sys.exit(1)

    ruta = os.path.join(DATOS, "desagregaciones.csv")
    previas = []
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as fh:
            previas = [r for r in csv.DictReader(fh) if r.get("fuente") != FUENTE]
    with open(ruta, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=CAMPOS, extrasaction="ignore")
        w.writeheader()
        w.writerows(previas + filas)
    print(f"Nacional del panel = serie de la ficha en todos los años. {len(filas)} filas escritas en {ruta}.")


if __name__ == "__main__":
    main()
