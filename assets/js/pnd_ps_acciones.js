/* ═══════════════════════════════════════════════════════════════════════
   pnd_ps_acciones.js — Sección "Acciones y seguimiento" del PND ·
   Protección Social e Inclusión Económica, leída desde datos/pnd/proteccion_social/.

   NO contiene datos: todo sale de los CSV que genera
   scripts/actualizar_pnd_ps.py (una vez al año el catálogo, cada mes el
   seguimiento). Para usarlo en una página del PND:

     <div id="acciones-ps"></div>
     <script src="../assets/js/pnd_ps_acciones.js"></script>
     <script>
       PndPsAcciones.montar('#acciones-ps', { indicador: 'gerontologicos' });
     </script>

   Opciones: indicador (obligatorio), anio (por defecto el año actual del
   último corte disponible), raiz ('../datos/pnd/proteccion_social/'), periodo (AAAA-MM; por
   defecto el último), mostrarValidacion (false: solo para revisión interna),
   indicadoresCsv ('pnd_ps_indicadores.csv'; en la rama Trabajo:
   { raiz: '../datos/pnd/trabajo/', indicadoresCsv: 'indicadores.csv' }).
   Requiere servir el sitio por HTTP (fetch), igual que el resto del portal.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const CODIGOS = {
    E1: 'Acción no catalogada', E1b: 'Acción reenumerada', E2: 'Datos distintos entre fichas', E3: 'Avance reportado no reproducible',
    E4: 'Codificado vacío con devengado', E5: 'Resultado no numérico', A1: 'Corte distinto al periodo', A2: 'Avance > 100 %',
    A3: 'Fecha fin vencida sin cierre', A4: 'Devengado > vigente', A5: 'Reprogramado sin codificado', A6: 'Sin enlace verificable',
    A7: 'El acumulado bajó', I3: '% reportado = cumplimiento a la fecha'
  };
  const COMP_TXT = { inversion: 'Inversión', corriente: 'Corriente' };
  const TIPO_META_TXT = {
    flujo: 'Meta acumulada mes a mes', cobertura: 'Meta de cobertura mensual', trimestral: 'Meta trimestral acumulada',
    semestral: 'Meta semestral', hito: 'Producto / hito', anual: 'Meta anual sin programación mensual'
  };

  // ---------------------------------------------------------------- utilidades
  function parseCSV(text) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (q) { if (c === '"' && n === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else if (c !== '\r') f += c;
    }
    if (f.length || row.length) { row.push(f); rows.push(row); }
    if (!rows.length) return [];
    const h = rows[0].map(x => x.replace(/^﻿/, ''));
    return rows.slice(1).filter(r => r.length > 1 || r[0] !== '').map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
  }
  const cache = {};
  function csv(url) {
    if (!cache[url]) cache[url] = fetch(url).then(r => { if (!r.ok) throw new Error(url + ' (HTTP ' + r.status + ')'); return r.text(); }).then(parseCSV);
    return cache[url];
  }
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => (v === '' || v == null || isNaN(+v)) ? null : +v;
  const fInt = v => v == null ? '—' : Math.round(v).toLocaleString('es-EC');
  const fPct = (v, d = 1) => v == null ? '—' : v.toLocaleString('es-EC', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
  const fUSD = v => v == null ? '—' : (Math.abs(v) >= 1e6 ? 'USD ' + (v / 1e6).toLocaleString('es-EC', { maximumFractionDigits: 2 }) + ' M'
                                                          : 'USD ' + Math.round(v).toLocaleString('es-EC'));
  const periodoTxt = p => p ? MESES[+p.slice(5, 7) - 1] + ' ' + p.slice(0, 4) : '';

  function estadoCumpl(v) {
    if (v == null) return { cls: 'na', txt: 'Sin programación' };
    if (v > 150) return { cls: 'rev', txt: 'Supera meta · revisar' };
    if (v >= 95) return { cls: 'ok', txt: 'Al día' };
    if (v >= 80) return { cls: 'med', txt: 'Rezago leve' };
    return { cls: 'bajo', txt: 'Atrasada' };
  }

  // ---------------------------------------------------------------- estilos (una sola vez)
  function estilos() {
    if (document.getElementById('pps-estilos')) return;
    const s = document.createElement('style'); s.id = 'pps-estilos';
    s.textContent = `
    .pps{--pps-azul:var(--azul,#4F449A);--pps-bd:var(--gris-bd,#DDE2EE);--pps-sub:var(--subtexto,#446381);--pps-ok:#2E7D4F;--pps-ok-l:#E3F2E8;
      --pps-med:#A36A00;--pps-med-l:#FEF3D6;--pps-bajo:#C4262E;--pps-bajo-l:#FDECEA;--pps-na:#6B7280;--pps-na-l:#F1F3F6;font-size:13px;color:var(--texto,#1A1E2E)}
    .pps-top{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between;margin-bottom:14px}
    .pps-top h3{font-size:15px;color:var(--pps-azul);margin:0 0 2px}
    .pps-top .pps-fuente{font-size:11.5px;color:var(--pps-sub)}
    .pps-sel label{display:block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--pps-sub);margin-bottom:3px}
    .pps-sel select{font:inherit;padding:7px 10px;border:1px solid var(--pps-bd);border-radius:8px;background:#fff;min-width:170px}
    .pps-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px}
    .pps-kpi{background:#fff;border:1px solid var(--pps-bd);border-radius:10px;padding:12px 14px;border-top:3px solid var(--pps-azul)}
    .pps-kpi .l{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--pps-sub)}
    .pps-kpi .v{font-size:24px;font-weight:700;color:var(--pps-azul);line-height:1.15;margin:4px 0 2px}
    .pps-kpi .s{font-size:11.5px;color:var(--pps-sub)}
    .pps-semaf{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
    .pps-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap}
    .pps-chip.ok{background:var(--pps-ok-l);color:var(--pps-ok)}.pps-chip.med{background:var(--pps-med-l);color:var(--pps-med)}
    .pps-chip.bajo{background:var(--pps-bajo-l);color:var(--pps-bajo)}.pps-chip.na{background:var(--pps-na-l);color:var(--pps-na)}.pps-chip.rev{background:#EEF0FF;color:#3B3486;border:1px dashed #8C84D6}
    .pps-chip.val{background:#FFF4E5;color:#8A4B00;border:1px solid #F5C77E;cursor:help}
    .pps-chip.valE{background:var(--pps-bajo-l);color:var(--pps-bajo);border:1px solid #F3A8AC;cursor:help}
    .pps-card{background:#fff;border:1px solid var(--pps-bd);border-radius:10px;overflow:hidden;margin-bottom:14px}
    .pps-card-h{padding:12px 16px;border-bottom:1px solid var(--pps-bd)}
    .pps-card-h b{color:var(--pps-azul);font-size:13px}.pps-card-h div{font-size:11.5px;color:var(--pps-sub)}
    .pps-scroll{overflow-x:auto}
    .pps table{width:100%;border-collapse:collapse;font-size:12px}
    .pps th{background:var(--pps-azul);color:#fff;font-weight:700;padding:9px 10px;text-align:left;white-space:nowrap}
    .pps td{padding:10px;border-bottom:1px solid var(--pps-bd);vertical-align:top}
    .pps tr.pps-fila:nth-child(4n+1) td{background:#fff}.pps tr.pps-fila:nth-child(4n+3) td{background:#F8F9FC}
    .pps th,.pps td{white-space:normal;cursor:auto;user-select:auto}
    .pps thead th::after{content:none!important}
    .pps td.num,.pps th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
    .pps .pps-n{font-weight:700;color:var(--pps-azul);text-align:center;width:34px}
    .pps .pps-tit{font-weight:600;color:var(--pps-azul);margin-bottom:3px;line-height:1.35}
    .pps .pps-meta{font-size:11px;color:var(--pps-sub)}
    .pps .pps-tag{display:inline-block;font-size:10.5px;background:var(--azul-light,#E8EEF8);color:var(--pps-azul);border-radius:4px;padding:1px 6px;margin:3px 4px 0 0}
    .pps .pps-bar{position:relative;height:7px;background:#EDF0F5;border-radius:4px;margin-top:5px;min-width:90px}
    .pps .pps-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:4px}
    .pps .pps-bar i.ok{background:var(--pps-ok)}.pps .pps-bar i.med{background:#D39A1C}.pps .pps-bar i.bajo{background:var(--pps-bajo)}.pps .pps-bar i.az,.pps .pps-bar i.rev{background:var(--pps-azul)}
    .pps .pps-bar b{position:absolute;top:-3px;bottom:-3px;width:2px;background:#1A1E2E;opacity:.55}
    .pps .pps-btn{font:inherit;font-size:11.5px;font-weight:700;color:var(--pps-azul);background:none;border:1px solid var(--pps-bd);border-radius:6px;padding:3px 8px;cursor:pointer;margin-top:6px}
    .pps .pps-btn:hover{background:var(--azul-pale,#F2F5FB)}
    .pps tr.pps-det td{background:var(--azul-pale,#F2F5FB)!important;padding:14px 16px}
    .pps .pps-det-grid{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:18px}
    .pps .pps-det h5{font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--pps-sub);margin:0 0 5px}
    .pps .pps-det p{white-space:pre-line;line-height:1.5;margin:0 0 10px}
    .pps .pps-det a{color:var(--pps-azul);word-break:break-all}
    .pps .pps-det table th{background:#E6E9F2;color:var(--texto,#1A1E2E)}
    .pps-aviso{border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;line-height:1.45}
    .pps-aviso.err{background:var(--pps-bajo-l);border:1px solid #F3A8AC;color:var(--pps-bajo)}
    .pps-leyenda{font-size:11px;color:var(--pps-sub);padding:10px 16px;border-top:1px solid var(--pps-bd);line-height:1.5}
    @media (max-width:760px){.pps .pps-det-grid{grid-template-columns:1fr}.pps-kpi .v{font-size:20px}}`;
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------- carga
  async function cargar(raiz, anio, indCsv) {
    const b = raiz + anio + '/';
    const [ind, acc, pte, seg, act] = await Promise.all([
      csv(raiz + (indCsv || 'pnd_ps_indicadores.csv')), csv(b + 'acciones.csv'), csv(b + 'indicador_accion.csv'),
      csv(b + 'seguimiento.csv'), csv(b + 'actores.csv')
    ]);
    return { ind, acc: Object.fromEntries(acc.map(a => [a.accion_id, a])), pte, seg, act, base: b };
  }

  // ---------------------------------------------------------------- render
  async function montar(destino, opts) {
    estilos();
    const el = typeof destino === 'string' ? document.querySelector(destino) : destino;
    const o = Object.assign({ raiz: '../datos/pnd/proteccion_social/', anio: new Date().getFullYear(), periodo: null, mostrarValidacion: false, indicadoresCsv: 'pnd_ps_indicadores.csv' }, opts || {});
    el.classList.add('pps');
    el.innerHTML = '<div class="pps-meta">Cargando acciones…</div>';
    let D;
    try {
      D = await cargar(o.raiz, o.anio, o.indicadoresCsv);
    } catch (e) {
      // si aún no hay carpeta del año en curso, usar el año anterior
      try { o.anio = o.anio - 1; D = await cargar(o.raiz, o.anio, o.indicadoresCsv); }
      catch (e2) { el.innerHTML = `<div class="pps-aviso err">No se pudieron cargar los datos de acciones (${esc(e.message)}). Verifica que el sitio se sirva por HTTP.</div>`; return; }
    }
    const ind = D.ind.find(i => i.indicador_id === o.indicador);
    const vinculos = D.pte.filter(p => p.indicador_id === o.indicador).sort((a, b) => +a.num_en_ficha - +b.num_en_ficha);
    const ids = new Set(vinculos.map(v => v.accion_id));
    const periodos = [...new Set(D.seg.filter(r => ids.has(r.accion_id)).map(r => r.periodo))].sort();
    if (!ind || !vinculos.length || !periodos.length) {
      el.innerHTML = `<div class="pps-aviso err">Aún no hay seguimiento cargado para «${esc(o.indicador)}» en ${o.anio}.</div>`; return;
    }
    const st = { periodo: (o.periodo && periodos.includes(o.periodo)) ? o.periodo : periodos[periodos.length - 1] };
    const nombreInd = Object.fromEntries(D.ind.map(i => [i.indicador_id, i.nombre_corto]));

    function pintar() {
      const filas = D.seg.filter(r => r.periodo === st.periodo && ids.has(r.accion_id));
      const porAcc = {};
      filas.forEach(r => (porAcc[r.accion_id] = porAcc[r.accion_id] || []).push(r));
      // componentes en el orden del catálogo (el primero es el principal y lleva el presupuesto)
      Object.entries(porAcc).forEach(([aid, rs]) => {
        const orden = (D.acc[aid].componentes || '').split('|');
        rs.sort((a, b) => orden.indexOf(a.componente) - orden.indexOf(b.componente));
      });
      const mes = +st.periodo.slice(5, 7);

      // KPIs
      let cnt = { ok: 0, med: 0, bajo: 0, na: 0, rev: 0 }, vig = 0, dev = 0;
      vinculos.forEach(v => {
        const rs = porAcc[v.accion_id] || [];
        if (rs.length) cnt[estadoCumpl(num(rs[0].cumplimiento_fecha_pct)).cls]++;   // 1 conteo por acción (componente principal)
        rs.forEach(r => { vig += num(r.presupuesto_vigente) || 0; dev += num(r.presupuesto_devengado) || 0; });
      });
      const nAcc = vinculos.length;
      const conError = filas.filter(r => /E\d/.test(r.validacion)).length;
      const avisoVal = (o.mostrarValidacion && conError) ? `<div class="pps-aviso err"><b>${conError} fila(s) con error de validación</b> en este corte. Ver el reporte de validación del periodo antes de publicar.</div>` : '';

      const opciones = periodos.map(p => `<option value="${p}" ${p === st.periodo ? 'selected' : ''}>${periodoTxt(p)}</option>`).join('');
      let html = `${avisoVal}
        <div class="pps-top">
          <div><h3>Acciones ${o.anio} · seguimiento mensual</h3>
            <div class="pps-fuente">${esc(ind.nombre)} · Fuente: fichas de seguimiento SGAPPG · Corte ${periodoTxt(st.periodo)}</div></div>
          <div class="pps-sel"><label for="pps-per-${o.indicador}">Corte</label><select id="pps-per-${o.indicador}">${opciones}</select></div>
        </div>
        <div class="pps-kpis">
          <div class="pps-kpi"><div class="l">Acciones</div><div class="v">${nAcc}</div><div class="s">MTDH · planificadas para ${o.anio}</div></div>
          <div class="pps-kpi" style="border-top-color:var(--pps-ok)"><div class="l">Cumplimiento a la fecha</div>
            <div class="pps-semaf">
              <span class="pps-chip ok">● ${cnt.ok} al día</span><span class="pps-chip med">● ${cnt.med} rezago leve</span>
              <span class="pps-chip bajo">● ${cnt.bajo} atrasadas</span><span class="pps-chip na">○ ${cnt.na} sin programación</span>${cnt.rev ? `<span class="pps-chip rev">▲ ${cnt.rev} supera meta · revisar</span>` : ''}</div>
            <div class="s" style="margin-top:6px">Resultado frente a la meta programada hasta el corte</div></div>
          <div class="pps-kpi" style="border-top-color:var(--amarillo,#F1B620)"><div class="l">Presupuesto devengado</div>
            ${vig ? `<div class="v">${fPct(dev / vig * 100)}</div><div class="s">${fUSD(dev)} de ${fUSD(vig)} vigente · esperado a ${MESES[mes - 1]}: ${fPct(mes / 12 * 100, 0)}</div>`
                  : `<div class="v" style="font-size:16px;margin-top:8px">Sin presupuesto asignado</div><div class="s">Las acciones de este indicador no registran presupuesto en la ficha</div>`}</div>
        </div>
        <div class="pps-card"><div class="pps-card-h"><b>Avance de las acciones</b><div>Ministerio de Trabajo y Desarrollo Humano · resultados acumulados a ${periodoTxt(st.periodo)}</div></div>
        <div class="pps-scroll"><table>
          <thead><tr><th>#</th><th style="min-width:260px">Acción</th><th class="num">Resultado</th><th class="num">Meta a la fecha</th>
            <th style="min-width:150px">Cumplimiento a la fecha</th><th style="min-width:130px">Avance anual</th><th style="min-width:140px">Presupuesto</th><th>Estado</th></tr></thead><tbody>`;

      vinculos.forEach(v => {
        const a = D.acc[v.accion_id]; const rs = porAcc[v.accion_id] || [];
        const otros = D.pte.filter(p => p.accion_id === v.accion_id && p.indicador_id !== o.indicador).map(p => nombreInd[p.indicador_id]);
        const tagOtros = otros.length ? `<span class="pps-tag" title="La misma acción se reporta también en otros indicadores">También en: ${esc(otros.join(', '))}</span>` : '';
        if (!rs.length) {
          html += `<tr class="pps-fila"><td class="pps-n">${v.num_en_ficha}</td><td><div class="pps-tit">${esc(a.titulo)}</div>${tagOtros}</td>
            <td colspan="6" class="pps-meta">Sin reporte en este corte.</td></tr><tr class="pps-det" hidden><td colspan="8"></td></tr>`;
          return;
        }
        const multi = rs.length > 1;
        const celda = (r) => {
          const res = num(r.resultado), mf = num(r.meta_a_la_fecha), cf = num(r.cumplimiento_fecha_pct), aa = num(r.avance_anual_pct);
          const e = estadoCumpl(cf);
          const comp = r.componente ? `<div class="pps-meta" style="font-weight:700">${esc(COMP_TXT[r.componente] || r.componente)}</div>` : '';
          const unidad = r.unidad_resultado === '%' ? ' %' : '';
          const esperado = (r.tipo_meta === 'flujo' || r.tipo_meta === 'trimestral' || r.tipo_meta === 'semestral') ? mes / 12 * 100 : null;
          const barA = aa == null ? '' : `<div class="pps-bar" title="Avance anual ${fPct(aa)}${esperado ? ' · esperado a la fecha ' + fPct(esperado, 0) : ''}"><i class="az" style="width:${Math.min(aa, 100)}%"></i>${esperado ? `<b style="left:${esperado}%"></b>` : ''}</div>`;
          const barC = cf == null ? '' : `<div class="pps-bar"><i class="${e.cls}" style="width:${Math.min(cf, 100)}%"></i></div>`;
          const vg = num(r.presupuesto_vigente), dv = num(r.presupuesto_devengado), ep = num(r.ejecucion_presupuestaria_pct);
          const pres = vg ? `<div class="num" style="text-align:left">${fUSD(dv)} <span class="pps-meta">de ${fUSD(vg)}</span></div><div class="pps-bar"><i class="az" style="width:${Math.min(ep || 0, 100)}%"></i><b style="left:${mes / 12 * 100}%"></b></div><div class="pps-meta">${fPct(ep)} devengado</div>`
            : '<span class="pps-meta">Sin presupuesto asignado</span>';
          return { comp, res: (res == null ? '—' : (unidad ? fPct(res, 0) : fInt(res))), mf: mf == null ? '—' : (r.tipo_meta === 'hito' ? fPct(mf, 0) : fInt(mf)),
            cumpl: cf == null ? `<span class="pps-chip na">Sin programación</span>` : `<b>${fPct(cf)}</b> <span class="pps-chip ${e.cls}">${e.txt}</span>${barC}`,
            anual: aa == null ? '—' : `<b>${fPct(aa)}</b>${barA}`, pres, est: esc(r.estado || '—'),
            corte: (r.corte_reportado && r.corte_reportado !== st.periodo) ? `<div class="pps-meta">Dato a ${periodoTxt(r.corte_reportado)}</div>` : '' };
        };
        const cs = rs.map(celda);
        const r0 = rs[0];
        const val = o.mostrarValidacion ? [...new Set(rs.flatMap(r => r.validacion ? r.validacion.split(';') : []))].filter(Boolean)
          .map(c => `<span class="pps-chip ${c[0] === 'E' ? 'valE' : 'val'}" title="${esc(CODIGOS[c] || c)}">${esc(c)}</span>`).join(' ') : '';
        const j = (k) => cs.map(c => `${c.comp}${c[k]}`).join(multi ? '<div style="height:8px"></div>' : '');
        html += `<tr class="pps-fila"><td class="pps-n">${v.num_en_ficha}</td>
          <td><div class="pps-tit">${esc(a.titulo)}</div>
            <div class="pps-meta">${esc(TIPO_META_TXT[r0.tipo_meta] || '')}${a.meta_anual && !a.meta_anual.includes('|') ? ' · meta anual ' + fInt(num(a.meta_anual)) : ''}</div>
            <span class="pps-tag">${esc(a.tipo)}</span>${tagOtros}${val ? '<div style="margin-top:5px">' + val + '</div>' : ''}
            <div><button class="pps-btn" type="button" data-acc="${esc(v.accion_id)}" aria-expanded="false">Ver detalle ▾</button></div></td>
          <td class="num">${j('res')}${cs[0].corte}</td><td class="num">${j('mf')}</td><td>${j('cumpl')}</td><td>${j('anual')}</td>
          <td>${(cs.find((c, i) => num(rs[i].presupuesto_vigente)) || cs[0]).pres}</td><td>${cs[0].est}</td></tr>
          <tr class="pps-det" hidden><td colspan="8"></td></tr>`;
      });
      html += `</tbody></table></div>
        <div class="pps-leyenda"><b>Cumplimiento a la fecha</b>: resultado ÷ meta programada hasta el corte (al día ≥ 95 %, rezago leve 80–95 %, atrasada &lt; 80 %; por encima de 150 % se marca para revisar la meta).
        <b>Avance anual</b>: resultado ÷ meta del año; la marca vertical indica lo esperado a la fecha. En presupuesto, la marca indica la proporción del año transcurrida.
        Las acciones de cobertura (usuarios atendidos) comparan contra la meta mensual vigente.</div></div>`;

      // actores
      const numDe = Object.fromEntries(vinculos.map(v => [v.accion_id, +v.num_en_ficha]));
      const acts = D.act.filter(x => ids.has(x.accion_id)).sort((a, b) => numDe[a.accion_id] - numDe[b.accion_id]);
      if (acts.length) {
        html += `<div class="pps-card"><div class="pps-card-h"><b>Actores clave</b><div>Instituciones con rol en la ejecución de las acciones</div></div>
          <div class="pps-scroll"><table><thead><tr><th>Acción</th><th>Institución</th><th>Rol</th><th>Incidencia</th></tr></thead><tbody>
          ${acts.map(x => `<tr><td class="pps-n">${numDe[x.accion_id]}</td><td><b>${esc(x.actor)}</b><div class="pps-meta">${esc(x.descripcion_rol)}</div></td><td>${esc(x.rol)}</td><td>${esc(x.incidencia)}</td></tr>`).join('')}
          </tbody></table></div></div>`;
      }
      el.innerHTML = html;
      el.querySelector('select').addEventListener('change', e => { st.periodo = e.target.value; pintar(); });
      el.querySelectorAll('.pps-btn').forEach(b => b.addEventListener('click', () => detalle(b)));
    }

    async function detalle(btn) {
      const tr = btn.closest('tr').nextElementSibling; const td = tr.firstElementChild;
      const abierto = !tr.hidden; tr.hidden = abierto; btn.setAttribute('aria-expanded', String(!abierto));
      btn.textContent = abierto ? 'Ver detalle ▾' : 'Ocultar detalle ▴';
      if (abierto || td.dataset.cargado === st.periodo) return;
      td.innerHTML = '<span class="pps-meta">Cargando…</span>';
      const aid = btn.dataset.acc;
      let js = [];
      try { js = await csv(D.base + 'justificaciones.csv'); } catch (e) { /* sin textos */ }
      const j = js.filter(r => r.accion_id === aid && r.periodo === st.periodo);
      const hist = D.seg.filter(r => r.accion_id === aid).sort((a, b) => a.periodo.localeCompare(b.periodo) || a.componente.localeCompare(b.componente));
      const links = [...new Set(j.flatMap(r => (r.enlaces || '').split(' | ')).filter(u => /^https?:\/\//.test(u)))];
      const texto = j.map(r => (r.componente ? (COMP_TXT[r.componente] || r.componente).toUpperCase() + ': ' : '') + r.justificacion).join('\n\n');
      const difs = [...new Set(j.map(r => r.dificultades).filter(Boolean))];
      td.innerHTML = `<div class="pps-det"><div class="pps-det-grid">
        <div><h5>Justificación reportada (${periodoTxt(st.periodo)})</h5><p>${esc(texto || 'Sin texto de justificación.')}</p>
          ${difs.length ? `<h5>Dificultades / restricciones</h5><p>${esc(difs.join('\n\n'))}</p>` : ''}
          ${links.length ? `<h5>Medios de verificación</h5><p>${links.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.length > 70 ? u.slice(0, 70) + '…' : u)}</a>`).join('<br>')}</p>` : ''}
          <h5>Descripción de la acción</h5><p class="pps-meta">${esc(D.acc[aid].descripcion)}</p></div>
        <div><h5>Evolución mensual ${o.anio}</h5><table><thead><tr><th>Corte</th>${hist.some(h => h.componente) ? '<th>Comp.</th>' : ''}<th class="num">Resultado</th><th class="num">Cumpl. fecha</th><th class="num">Avance anual</th></tr></thead><tbody>
          ${hist.map(h => `<tr><td>${periodoTxt(h.periodo)}</td>${hist.some(x => x.componente) ? `<td>${esc(COMP_TXT[h.componente] || h.componente)}</td>` : ''}<td class="num">${h.unidad_resultado === '%' ? fPct(num(h.resultado), 0) : fInt(num(h.resultado))}</td><td class="num">${fPct(num(h.cumplimiento_fecha_pct))}</td><td class="num">${fPct(num(h.avance_anual_pct))}</td></tr>`).join('')}
          </tbody></table></div></div></div>`;
      td.dataset.cargado = st.periodo;
    }

    pintar();
  }

  // Resumen para las tarjetas del menú: <span data-pps-resumen="gerontologicos"></span>
  async function resumenes(raiz) {
    const els = document.querySelectorAll('[data-pps-resumen]');
    if (!els.length) return;
    raiz = raiz || '../datos/pnd/proteccion_social/';
    let anio = new Date().getFullYear(), D;
    try { D = await cargar(raiz, anio); } catch (e) { try { D = await cargar(raiz, --anio); } catch (e2) { return; } }
    els.forEach(el => {
      const ind = el.getAttribute('data-pps-resumen');
      const ids = new Set(D.pte.filter(p => p.indicador_id === ind).map(p => p.accion_id));
      const pers = [...new Set(D.seg.filter(r => ids.has(r.accion_id)).map(r => r.periodo))].sort();
      if (ids.size) el.textContent = `${ids.size} acciones · seguimiento a ${periodoTxt(pers[pers.length - 1]) || 'sin corte'}`;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => resumenes());
  else resumenes();

  window.PndPsAcciones = { montar, resumenes };
})();
