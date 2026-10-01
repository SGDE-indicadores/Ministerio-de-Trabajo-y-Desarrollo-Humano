/* ═══════════════════════════════════════════════════════════════
   export-utils.js
   Módulo compartido: agrega botones de descarga (PNG / CSV) a los
   gráficos Chart.js y tablas de los dashboards del PND, de forma
   automática — no requiere tocar cada gráfico uno por uno.
   Requiere: html2canvas cargado (solo se usa para exportar el mapa).
   ═══════════════════════════════════════════════════════════════ */

/* ── CSV genérico ── */
function _csvEscape(v){
  const s = String(v === null || v === undefined ? '' : v);
  return '"' + s.replace(/"/g, '""') + '"';
}
function csvDeFilas(headers, filas){
  const lineas = [headers.map(_csvEscape).join(',')];
  filas.forEach(f => lineas.push(f.map(_csvEscape).join(',')));
  return lineas.join('\r\n');
}
function descargarTexto(contenido, nombreArchivo, mime){
  // BOM UTF-8 al inicio para que Excel reconozca tildes/ñ correctamente
  const blob = new Blob(['\ufeff' + contenido], { type: (mime || 'text/plain') + ';charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombreArchivo;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function descargarCSV(nombreArchivo, headers, filas){
  const nombre = nombreArchivo.endsWith('.csv') ? nombreArchivo : nombreArchivo + '.csv';
  descargarTexto(csvDeFilas(headers, filas), nombre, 'text/csv');
}

/* ── Descargar cualquier <canvas> (incluye los de Chart.js) como PNG ── */
function descargarCanvasComoPNG(canvasId, nombreArchivo){
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  // Los canvas de Chart.js son transparentes por defecto; se compone sobre fondo blanco.
  const tmp = document.createElement('canvas');
  tmp.width = canvas.width; tmp.height = canvas.height;
  const ctx = tmp.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, tmp.width, tmp.height);
  ctx.drawImage(canvas, 0, 0);
  const a = document.createElement('a');
  a.href = tmp.toDataURL('image/png');
  a.download = (nombreArchivo || canvasId) + '.png';
  document.body.appendChild(a); a.click(); a.remove();
}

/* ── Descargar cualquier elemento del DOM (ej. el mapa) como PNG ── */
function descargarElementoComoPNG(elementId, nombreArchivo, fondoColor){
  const el = document.getElementById(elementId);
  if (!el){ return; }
  if (typeof html2canvas !== 'function'){
    alert('No se pudo cargar el generador de imágenes. Verifica tu conexión e inténtalo de nuevo.');
    return;
  }
  html2canvas(el, { backgroundColor: fondoColor || '#FFFFFF', useCORS: true, scale: 2 }).then(canvas => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = (nombreArchivo || 'imagen') + '.png';
    document.body.appendChild(a); a.click(); a.remove();
  }).catch(() => {
    alert('No se pudo generar la imagen del mapa en este navegador.');
  });
}

/* ── Descargar una <table> del DOM como CSV (genérico, no requiere conocer sus datos) ── */
function descargarTablaComoCSV(tablaId, nombreArchivo){
  const tabla = document.getElementById(tablaId);
  if (!tabla) return;
  const filas = [...tabla.querySelectorAll('tr')]
    .map(tr => [...tr.querySelectorAll('th,td')].map(td => td.textContent.trim()))
    .filter(f => f.length);
  if (!filas.length) return;
  descargarTexto(csvDeFilas(filas[0], filas.slice(1)), (nombreArchivo || tablaId) + '.csv', 'text/csv');
}

/* ═══════════════════════════════════════════════════════════════
   Inyección automática de botones "⬇ PNG" / "⬇ CSV" en cada
   gráfico y tabla que aparezca en la página — incluye los creados
   dinámicamente después de la carga inicial (ej. drill-down cantonal).
   ═══════════════════════════════════════════════════════════════ */
(function(){
  const style = document.createElement('style');
  style.textContent = `
    .export-btn{font-family:Arial, sans-serif;font-size:10.5px;font-weight:600;
      border:1px solid rgba(0,0,0,.14);background:#FFFFFF;color:#4A5568;
      border-radius:6px;padding:3px 9px;cursor:pointer;margin-left:6px;
      display:inline-flex;align-items:center;gap:4px;transition:background .15s,border-color .15s;
      white-space:nowrap;}
    .export-btn:hover{background:#F0F2F7;border-color:rgba(0,0,0,.28);}
    .export-btn-group{display:inline-flex;align-items:center;flex-wrap:wrap;}
    .export-btn-float{position:absolute;top:8px;right:8px;z-index:5;margin-left:0;
      box-shadow:0 1px 3px rgba(0,0,0,.12);}
  `;
  document.head.appendChild(style);
})();

function _crearBotonPNG(canvasId){
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'export-btn export-btn-png export-btn-png-' + canvasId;
  btn.title = 'Descargar gráfico como imagen';
  btn.innerHTML = '⬇ PNG';
  btn.onclick = (e) => { e.stopPropagation(); descargarCanvasComoPNG(canvasId); };
  return btn;
}

function _cardHeaderDe(el){
  // Los dashboards del PND/ENEMDU usan varias convenciones de nombre para tarjeta/encabezado
  // según el archivo: .chart-card/.chart-card-header, .card/.card-header,
  // .cc/.cc-header, .card/.card-head, .panel/.panel-title (dashboards ENEMDU). Se contemplan todas.
  const card = el.closest('.chart-card, .card, .cc, .panel');
  if (!card) return null;
  return card.querySelector('.chart-card-header, .card-header, .cc-header, .card-head, .panel-title');
}

function _attachCanvasButton(canvas){
  if (!canvas.id || canvas.dataset.exportAttached) return;
  // Preferir el header inmediatamente anterior al .card-body que envuelve el canvas
  // (evita enganchar el botón al header equivocado cuando una tarjeta tiene varios,
  // como el panel cantonal de TPM: lista de provincias + gráfico, cada uno con su propio header).
  let header = null;
  const body = canvas.closest('.card-body');
  if (body && body.previousElementSibling && body.previousElementSibling.classList.contains('card-header')) {
    header = body.previousElementSibling;
  }
  if (!header) header = _cardHeaderDe(canvas);
  if (header){
    if (!header.querySelector('.export-btn-png-' + canvas.id)){
      header.appendChild(_crearBotonPNG(canvas.id));
    }
    canvas.dataset.exportAttached = '1';
    return;
  }
  // Sin header reconocible (ej. tarjetas ENEMDU con solo un <h3> suelto, sin
  // envoltorio .card-header/.panel-title): se agrega un botón flotante en la
  // esquina superior derecha del propio contenedor del gráfico.
  const cont = canvas.closest('.chart-wrap, .panel, .card, .cc') || canvas.parentElement;
  if (cont && !cont.querySelector('.export-btn-png-' + canvas.id)){
    if (window.getComputedStyle(cont).position === 'static') cont.style.position = 'relative';
    const btn = _crearBotonPNG(canvas.id);
    btn.classList.add('export-btn-float');
    cont.appendChild(btn);
  }
  canvas.dataset.exportAttached = '1';
}

function _attachTableButton(tabla){
  if (!tabla.id || tabla.dataset.exportAttached) return;
  let header = _cardHeaderDe(tabla);
  if (!header){
    header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:6px;';
    tabla.parentNode.insertBefore(header, tabla);
  }
  if (!header.querySelector('.export-btn-csv-' + tabla.id)){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'export-btn export-btn-csv export-btn-csv-' + tabla.id;
    btn.title = 'Descargar tabla como CSV';
    btn.innerHTML = '⬇ CSV';
    btn.onclick = (e) => { e.stopPropagation(); descargarTablaComoCSV(tabla.id); };
    header.appendChild(btn);
  }
  tabla.dataset.exportAttached = '1';
}

function _exportAttachIfNeeded(el){
  if (!el || !el.tagName) return;
  if (el.tagName === 'CANVAS') _attachCanvasButton(el);
  if (el.tagName === 'TABLE'){
    if (!el.id) el.id = 'tabla-auto-' + Math.random().toString(36).slice(2);
    _attachTableButton(el);
  }
}

function inicializarBotonesExport(){
  document.querySelectorAll('canvas, table').forEach(_exportAttachIfNeeded);
}

document.addEventListener('DOMContentLoaded', () => {
  inicializarBotonesExport();
  const obs = new MutationObserver(muts => {
    muts.forEach(m => m.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.matches && (node.matches('canvas') || node.matches('table'))) _exportAttachIfNeeded(node);
      if (node.querySelectorAll) node.querySelectorAll('canvas, table').forEach(_exportAttachIfNeeded);
    }));
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
