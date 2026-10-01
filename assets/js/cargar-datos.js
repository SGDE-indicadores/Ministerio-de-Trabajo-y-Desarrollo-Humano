/* ═══════════════════════════════════════════════════════════════════════
   cargar-datos.js — lee los archivos de la carpeta datos/ que declara cada
   página y, cuando están listos, ejecuta el código de la página.

   Uso en una página:

     <script src="../assets/js/cargar-datos.js"></script>
     <script>
     cargarDatos({
       DATA: { archivo: '../datos/enemdu/anual/desempleo.csv', forma: 'arbol' }
     });
     </script>
     <script type="text/plain" data-tras-datos> ...código que usa DATA... </script>

   Cada clave (DATA, GEO, …) queda disponible como variable global con el
   contenido del archivo ya convertido a la forma que espera la página.
   Los <script type="text/plain" data-tras-datos> se ejecutan en orden, después
   de cargar los datos (también los que llevan data-src="archivo.js").

   Formas disponibles (opción `forma`):
     filas     CSV → lista de objetos (una fila = un objeto).
     grupos    CSV → { valor_de_clave: [filas…] }  (opción `clave`, puede ser lista).
     arbol     CSV con columnas de ruta + `valor` → objeto anidado
               (las celdas de ruta vacías se omiten).
     familias  CSV ancho familia,categoria,<periodo1>,<periodo2>… →
               { trimestres:[…], families:[{family, items:[{label, values}]}] }
     tabla     CSV → { order:[periodos únicos], rows:[filas] }  (opción `periodo`).
     columnas  CSV → { columna: [valores…] }
     matriz    CSV → lista de listas (se ignora la fila de encabezado).
     json      archivo .json tal cual.
   Opciones comunes: `texto` (columnas que se leen siempre como texto),
   `banderas` ({columna_csv: 'nombre'}: lista separada por | → {campo:true}),
   `omitirVacios` (no crea la propiedad si la celda está vacía) y, para json,
   `campo` (toma solo esa clave del archivo).
   `partes: {a: spec, b: spec}` arma un objeto con varios archivos.
   Celdas vacías → null.  true/false → booleanos.  Números → número.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const rows = []; let row = []; let cell = ''; let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => !(r.length === 1 && r[0] === ''));
  }

  const NUM = /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
  function convertir(v, comoTexto) {
    if (v === '') return null;
    if (comoTexto) return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (NUM.test(v)) return Number(v);
    return v;
  }

  function filas(rows, op) {
    const head = rows[0], texto = new Set(op.texto || []), band = op.banderas || {};
    return rows.slice(1).map(r => {
      const o = {};
      head.forEach((h, i) => {
        const v = r[i] === undefined ? '' : r[i];
        if (band[h]) {
          const f = {};
          if (v) v.split('|').forEach(k => { f[k] = true; });
          o[band[h]] = f;
        } else if (!(op.omitirVacios && v === '')) o[h] = convertir(v, texto.has(h));
      });
      return o;
    });
  }

  const FORMAS = {
    filas: (rows, op) => filas(rows, op),
    grupos(rows, op) {
      const claves = [].concat(op.clave), out = {};
      filas(rows, Object.assign({}, op, { texto: (op.texto || []).concat(claves) })).forEach(f => {
        let nodo = out;
        claves.forEach((k, i) => {
          const v = f[k]; delete f[k];
          if (i === claves.length - 1) (nodo[v] = nodo[v] || []).push(f);
          else nodo = (nodo[v] = nodo[v] || {});
        });
      });
      return out;
    },
    arbol(rows) {
      const head = rows[0], iv = head.indexOf('valor'), out = {};
      rows.slice(1).forEach(r => {
        const ruta = head.map((h, i) => i === iv ? '' : r[i]).filter(x => x !== '' && x !== undefined);
        let nodo = out;
        ruta.forEach((k, i) => {
          if (i === ruta.length - 1) nodo[k] = convertir(r[iv]);
          else nodo = (nodo[k] = nodo[k] || {});
        });
      });
      return out;
    },
    familias(rows) {
      const head = rows[0], out = { trimestres: head.slice(2), families: [] };
      let fam = null;
      rows.slice(1).forEach(r => {
        if (!fam || fam.family !== r[0]) { fam = { family: r[0], items: [] }; out.families.push(fam); }
        fam.items.push({ label: r[1], values: r.slice(2).map(v => convertir(v)) });
      });
      return out;
    },
    tabla(rows, op) {
      const per = op.periodo || 'trimestre';
      const data = filas(rows, Object.assign({}, op, { texto: (op.texto || []).concat([per]) }));
      return { order: [...new Set(data.map(r => r[per]))], rows: data };
    },
    columnas(rows, op) {
      const out = {}, texto = new Set(op.texto || []);
      rows[0].forEach((h, i) => { out[h] = rows.slice(1).map(r => r[i]).filter(v => v !== undefined && v !== '').map(v => convertir(v, texto.has(h))); });
      return out;
    },
    matriz: (rows, op) => rows.slice(1).map(r => r.map(v => convertir(v)))
  };

  function interpretar(texto, spec) {
    if (spec.forma === 'json') { const j = JSON.parse(texto); return spec.campo ? j[spec.campo] : j; }
    const f = FORMAS[spec.forma || 'filas'];
    if (!f) throw new Error('forma desconocida: ' + spec.forma);
    return f(parseCSV(texto), spec);
  }

  function leer(spec) {
    if (spec.partes) {
      const claves = Object.keys(spec.partes);
      return Promise.all(claves.map(k => leer(spec.partes[k]))).then(vals => {
        const o = {}; claves.forEach((k, i) => { o[k] = vals[i]; }); return o;
      });
    }
    return fetch(spec.archivo, { cache: 'no-cache' }).then(r => {
      if (!r.ok) throw new Error(spec.archivo + ' (HTTP ' + r.status + ')');
      return r.text();
    }).then(t => interpretar(t, spec)).catch(e => { e.archivo = e.archivo || spec.archivo; throw e; });
  }

  function listoDOM() {
    return document.readyState === 'loading'
      ? new Promise(res => document.addEventListener('DOMContentLoaded', res, { once: true }))
      : Promise.resolve();
  }

  // Los scripts diferidos se ejecutan cuando el documento ya cargó; los
  // manejadores de DOMContentLoaded / load que registren se guardan y se
  // llaman al final, en el mismo orden en que lo haría el navegador.
  function ejecutarDiferidos() {
    const pend = Array.from(document.querySelectorAll('script[type="text/plain"][data-tras-datos]'));
    const enDCL = [], enLoad = [];
    const docAdd = document.addEventListener, winAdd = global.addEventListener;
    const onloadAntes = global.onload;
    document.addEventListener = function (t, fn, o) { if (t === 'DOMContentLoaded') enDCL.push(fn); else docAdd.call(this, t, fn, o); };
    global.addEventListener = function (t, fn, o) {
      if (t === 'DOMContentLoaded') enDCL.push(fn);
      else if (t === 'load' && document.readyState === 'complete') enLoad.push(fn);
      else winAdd.call(this, t, fn, o);
    };
    const restaurar = () => { document.addEventListener = docAdd; global.addEventListener = winAdd; };
    return pend.reduce((p, el) => p.then(() => new Promise((res, rej) => {
      el.removeAttribute('data-tras-datos');
      const s = document.createElement('script');
      if (el.dataset.src) { s.src = el.dataset.src; s.onload = res; s.onerror = () => rej(new Error(el.dataset.src)); }
      else s.textContent = el.textContent;
      el.parentNode.insertBefore(s, el.nextSibling);
      if (!el.dataset.src) res();
    })), Promise.resolve()).then(() => {
      restaurar();
      const ev = new Event('DOMContentLoaded');
      enDCL.forEach(fn => fn.call(document, ev));
      if (global.onload !== onloadAntes && typeof global.onload === 'function') enLoad.push(global.onload);
      enLoad.forEach(fn => fn.call(global, new Event('load')));
    }, e => { restaurar(); throw e; });
  }

  function avisoError(e) {
    console.error('cargarDatos:', e);
    const div = document.createElement('div');
    div.setAttribute('role', 'alert');
    div.style.cssText = 'margin:16px auto;max-width:900px;padding:14px 18px;border-radius:10px;background:#FDECEA;color:#8A1C14;font:14px/1.5 Arial,sans-serif;border:1px solid #F5C2BD';
    div.textContent = 'No se pudieron cargar los datos de esta página' + (e && e.archivo ? ' (' + e.archivo + ')' : '') +
      '. Si abrió el archivo directamente desde la carpeta, use un servidor web (por ejemplo: python -m http.server).';
    (document.querySelector('main') || document.body).prepend(div);
  }

  global.cargarDatos = function (specs) {
    const claves = Object.keys(specs);
    return Promise.all(claves.map(k => leer(specs[k])))
      .then(vals => { claves.forEach((k, i) => { global[k] = vals[i]; }); })
      .then(listoDOM)
      .then(ejecutarDiferidos)
      .catch(e => listoDOM().then(() => avisoError(e)));
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = { parseCSV, interpretar };
})(typeof window !== 'undefined' ? window : globalThis);
