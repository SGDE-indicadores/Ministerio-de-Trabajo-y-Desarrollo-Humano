// ============================================================
// shared.js — datos y funciones comunes al Portal de Indicadores
// (usado por todas las páginas del portal: menú, rutas y lectores de datos/)
// ============================================================

// ============================================================
// PARSER CSV COMPARTIDO — usado por transferencias, presupuesto y kpis
// para leer los archivos de datos/. Soporta campos entre comillas
// (con comas o comillas escapadas adentro), como los textos de impacto.
// ============================================================
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* ignorar */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).filter(r => r.length > 1 || r[0] !== '').map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i] !== undefined ? r[i] : '');
    return obj;
  });
}

function fetchCSV(path) {
  return fetch(path).then(r => {
    if (!r.ok) throw new Error('No se pudo cargar ' + path + ' (HTTP ' + r.status + ')');
    return r.text();
  }).then(parseCSV);
}

// ============================================================
// PROTECCIÓN SOCIAL — 4 componentes (DII, PAM, PCD, Protección Especial)
// Datos reales:
// - caracterizacion_proteccion_social.csv: último corte (columnas anio_corte/mes_corte).
// - presupuesto_proteccion_social.csv: acumulado 2023-2025 + julio 2026.
// - series_historicas_servicios.csv: usuarios atendidos en diciembre de 2018 a 2025.
// La serie histórica anual usa el corte de diciembre; el último corte mensual se
// muestra por separado para no mezclarlo con los diciembres.
// ============================================================
let PS_CARACTERIZACION = {};      // registro -> { total, sexo:[...], rango_edad:[...], etnia:[...], pobreza_2018:[...], pobreza_2025:[...] }
let PS_PRESUPUESTO = {};          // registro -> { gobierno: musd, fiscal: musd }
let PS_COBERTURA_HISTORICA = {};  // registro -> [{anio, mes, usuarios, esReal}]
let psDataPromise = null;

function fetchProteccionSocialData(){
  if (psDataPromise) return psDataPromise;
  psDataPromise = Promise.all([
    fetchCSV('../datos/kpis/proteccion_social/caracterizacion_proteccion_social.csv'),
    fetchCSV('../datos/kpis/proteccion_social/presupuesto_proteccion_social.csv'),
    fetchCSV('../datos/kpis/proteccion_social/series_historicas_servicios.csv')
  ]).then(([car, pres, hist]) => {
    car.forEach(r => {
      const reg = r.registro_id;
      if (!PS_CARACTERIZACION[reg]) PS_CARACTERIZACION[reg] = { total: 0 };
      // Etiqueta del corte (p. ej. "agosto 2026"), tomada del propio archivo
      if (r.anio_corte && r.mes_corte) PS_CARACTERIZACION[reg].corte = (TRANSFER_MONTHS[String(r.mes_corte).padStart(2, '0')] || r.mes_corte) + ' ' + r.anio_corte;
      if (r.grupo === 'total') {
        PS_CARACTERIZACION[reg].total = Number(r.usuarios) || 0;
      } else {
        if (!PS_CARACTERIZACION[reg][r.grupo]) PS_CARACTERIZACION[reg][r.grupo] = [];
        PS_CARACTERIZACION[reg][r.grupo].push({ categoria: r.categoria, usuarios: Number(r.usuarios) || 0 });
      }
    });
    pres.forEach(r => {
      const reg = r.registro_id;
      if (!PS_PRESUPUESTO[reg]) PS_PRESUPUESTO[reg] = { gobierno: 0, fiscal: 0 };
      const musd = Number(r.presupuesto_musd) || 0;
      // "gobierno" = todo lo que hay (acumulado 2023-2025 + julio 2026); "fiscal" = solo julio 2026
      PS_PRESUPUESTO[reg].gobierno += musd;
      if (r.anio === '2026' && r.mes === '07') PS_PRESUPUESTO[reg].fiscal += musd;
    });
    hist.forEach(r => {
      const reg = r.registro_id;
      if (!PS_COBERTURA_HISTORICA[reg]) PS_COBERTURA_HISTORICA[reg] = [];
      PS_COBERTURA_HISTORICA[reg].push({
        anio: Number(r.anio) || 0,
        mes: String(r.mes || '').padStart(2, '0'),
        usuarios: Number(r.usuarios) || 0,
        esReal: String(r.es_dato_real).trim().toUpperCase() === 'TRUE'
      });
    });
    Object.values(PS_COBERTURA_HISTORICA).forEach(rows => rows.sort((a,b) => a.anio - b.anio || a.mes.localeCompare(b.mes)));
    return { PS_CARACTERIZACION, PS_PRESUPUESTO, PS_COBERTURA_HISTORICA };
  });
  return psDataPromise;
}

// ============================================================
// CRÉDITO DE DESARROLLO HUMANO (registro 12) — serie mensual real
// ene-jul 2026 (cobertura_cdh_movilidad.csv) y su caracterización
// (caracterizacion_cdh_movilidad.csv, cruzada por mes y tipo de crédito).
// Presupuesto de este indicador sigue pendiente (no hay archivo aún).
// Esta es la tarjeta "Movilidad Social" DENTRO de Protección Social e
// Inclusión Económica (cobertura/presupuesto/caracterización/ficha) — único
// lugar donde vive Movilidad Social; ya no existe como área propia de KPIs.
// ============================================================
let CDH_COBERTURA = [];       // [{anio, mes, tipoCredito, registros, montoTotal, montoPromedio}]
let CDH_CARACTERIZACION = []; // [{anio, mes, tipoCredito, grupo, categoria, registros, montoTotal}]
let cdhDataPromise = null;

function fetchCdhData(){
  if (cdhDataPromise) return cdhDataPromise;
  cdhDataPromise = Promise.all([
    fetchCSV('../datos/kpis/movilidad_social/cobertura_cdh_movilidad.csv'),
    fetchCSV('../datos/kpis/movilidad_social/caracterizacion_cdh_movilidad.csv')
  ]).then(([cob, car]) => {
    CDH_COBERTURA = cob.map(r => ({
      anio: r.anio, mes: r.mes, periodo: r.anio + '-' + r.mes, tipoCredito: r.tipo_credito,
      registros: Number(r.registros) || 0, montoTotal: Number(r.monto_total_usd) || 0,
      montoPromedio: Number(r.monto_promedio_usd) || 0
    }));
    CDH_CARACTERIZACION = car.map(r => ({
      anio: r.anio, mes: r.mes, periodo: r.anio + '-' + r.mes, tipoCredito: r.tipo_credito,
      grupo: r.grupo, categoria: r.categoria, registros: Number(r.registros) || 0,
      montoTotal: Number(r.monto_total_usd) || 0
    }));
    return { CDH_COBERTURA, CDH_CARACTERIZACION };
  });
  return cdhDataPromise;
}

function cdhAvailablePeriods(){
  return [...new Set(CDH_COBERTURA.map(r => r.periodo))].sort();
}

// Suma los 2 tipos de crédito (12 y 24 meses) de un mes puntual.
function cdhCoverageForPeriod(periodo){
  const filas = CDH_COBERTURA.filter(r => r.periodo === periodo);
  const registros = filas.reduce((s, r) => s + r.registros, 0);
  const montoTotal = filas.reduce((s, r) => s + r.montoTotal, 0);
  return { periodo, registros, montoTotal, porTipo: filas };
}

// Agrupa la caracterización de un mes puntual (sumando 12+24 meses) por grupo.
function cdhCaracterizacionForPeriod(periodo){
  const filas = CDH_CARACTERIZACION.filter(r => r.periodo === periodo);
  const porGrupo = {};
  filas.forEach(r => {
    if (!porGrupo[r.grupo]) porGrupo[r.grupo] = {};
    if (!porGrupo[r.grupo][r.categoria]) porGrupo[r.grupo][r.categoria] = { registros: 0, montoTotal: 0 };
    porGrupo[r.grupo][r.categoria].registros += r.registros;
    porGrupo[r.grupo][r.categoria].montoTotal += r.montoTotal;
  });
  return porGrupo;
}

// ============================================================
// TRANSFERENCIAS MONETARIAS — datos reales desde datos/transferencias/transferencias_mensual.csv
// (programa, zona, provincia, año, mes, beneficiarios, monto ejecutado).
// TRANSFER_ROWS se llena una sola vez con fetchTransferData(); todos los
// filtros de año/mes/programa se resuelven después en memoria.
// ============================================================
let TRANSFER_ROWS = [];
let transferDataPromise = null;

function fmtMoneyM(value){
  return `${Number(value).toLocaleString('es-EC',{minimumFractionDigits:1,maximumFractionDigits:1})} millones`;
}

function fetchTransferData() {
  if (transferDataPromise) return transferDataPromise;
  // Dos archivos separados (no se mezclan en el CSV): transferencias_mensual.csv trae
  // desagregación provincial (6 programas), transferencias_nacional.csv trae solo el
  // total nacional por mes (3 programas: Femicidio, Contingencias, BCENA). Se combinan
  // aquí, en memoria, en la misma forma que el resto del código ya sabe leer.
  transferDataPromise = Promise.all([
    fetchCSV('../datos/transferencias/transferencias_mensual.csv'),
    fetchCSV('../datos/transferencias/transferencias_nacional.csv')
  ]).then(([provincial, nacional]) => {
    // La fila con nota "Acumulado real nov 2023-dic 2025" no es un dato de
    // diciembre-2025: es 26 meses (nov-2023 a dic-2025) comprimidos en un solo
    // registro porque el Excel VIS-VIE no permite desagregarlo por mes. Si se
    // deja con anio/mes = 2025-12, el filtro por año la cuenta como si fuera
    // solo diciembre, inflando "Año 2025" y dejando 2023/2024 en cero.
    // Se marca aparte (periodo no coincide con /^\d{4}-\d{2}$/) para que quede
    // FUERA de los filtros por año/mes y solo aparezca en la vista histórica.
    const filasProvinciales = provincial.map(r => {
      const esAcumuladoLump = /Acumulado real/i.test(r.nota || '');
      return {
        slug: r.programa_slug,
        nombre: r.programa_nombre,
        zona: r.zona,
        provincia: r.provincia,
        anio: esAcumuladoLump ? 'historico' : r.anio,
        mes: esAcumuladoLump ? null : r.mes,
        periodo: esAcumuladoLump ? 'historico-nov2023-dic2025' : (r.anio + '-' + r.mes),
        fechaDesembolso: r.fecha_desembolso,
        beneficiarios: Number(r.beneficiarios) || 0,
        montoM: Number(r.monto_ejecutado_musd) || 0,
      };
    });
    const filasNacionales = nacional.map(r => ({
      slug: r.programa_slug,
      nombre: r.programa_nombre,
      zona: 'Nacional',
      provincia: 'Nacional',
      anio: r.anio,
      mes: r.mes,
      periodo: r.anio + '-' + r.mes,
      fechaDesembolso: r.fecha_corte,
      beneficiarios: Number(r.beneficiarios) || 0,
      montoM: Number(r.monto_devengado_musd) || 0,
    }));
    TRANSFER_ROWS = filasProvinciales.concat(filasNacionales);
    return TRANSFER_ROWS;
  });
  return transferDataPromise;
}

function transferYearTotalsFromData() {
  const totals = {};
  TRANSFER_ROWS.forEach(r => { totals[r.anio] = (totals[r.anio] || 0) + r.montoM; });
  return totals;
}

function transferAvailablePeriods() {
  // Excluye pseudo-periodos como 'historico-nov2023-dic2025' (ver fetchTransferData):
  // solo cuentan como "periodo" real los que tienen forma AAAA-MM.
  return [...new Set(TRANSFER_ROWS.map(r => r.periodo))]
    .filter(p => /^\d{4}-\d{2}$/.test(String(p)))
    .sort();
}

function transferPeriodMax() {
  const periods = transferAvailablePeriods();
  return periods.length ? periods[periods.length - 1] : '2026-07';
}

// Agrupa filas (ya filtradas por periodo) en la misma forma de "programas"
// que el resto del código ya sabe dibujar: {name, users, budget, budgetM, icon}.
// budgetM se SUMA (el dinero se acumula); users toma el mes MÁS RECIENTE del
// rango filtrado (una caja monetaria no "acumula" beneficiarios entre meses).
function aggregateTransferRows(rows) {
  const bySlug = {};
  rows.forEach(r => {
    if (!bySlug[r.slug]) bySlug[r.slug] = { slug: r.slug, name: r.nombre, montoM: 0, porMes: {} };
    const g = bySlug[r.slug];
    g.montoM += r.montoM;
    g.porMes[r.periodo] = (g.porMes[r.periodo] || 0) + r.beneficiarios;
  });
  // conserva el orden de TRANSFER_PROGRAM_META para que las tarjetas salgan siempre igual
  return TRANSFER_PROGRAM_META.map(meta => {
    const g = bySlug[meta.slug];
    if (!g) return { name: meta.name, users: 0, budgetM: 0, budget: fmtMoneyM(0), icon: meta.icon };
    // Solo periodos AAAA-MM reales cuentan para "mes más reciente"; el pseudo-periodo
    // 'historico-nov2023-dic2025' (sin beneficiarios propios) ordena después
    // alfabéticamente y no debe pisar el dato real más reciente.
    const meses = Object.keys(g.porMes).filter(p => /^\d{4}-\d{2}$/.test(p)).sort();
    const users = meses.length ? (g.porMes[meses[meses.length - 1]] || 0) : 0;
    return { name: g.name, users, budgetM: g.montoM, budget: fmtMoneyM(g.montoM), icon: meta.icon };
  });
}

function buildYearDataset(year) {
  year = String(year);
  const rows = TRANSFER_ROWS.filter(r => r.anio === year);
  if (!rows.length) return null;
  const programas = aggregateTransferRows(rows);
  const totalM = programas.reduce((s, p) => s + p.budgetM, 0);
  // rangeLabel ya refleja los meses reales presentes ese año (p.ej. "enero 2026 –
  // julio 2026" si solo hay 7 meses de dato); antes se sobreescribía a mano con
  // "julio 2026" para el año en curso, lo cual mentía sobre qué meses cubre el total.
  const rangeLabel = transferYearRangeLabel(year);
  return {
    key: `year:${year}`, mode: 'year', year, isMock: false, rangeLabel,
    label: `Total ejecutado en ${rangeLabel}.`,
    totalLabel: `Presupuesto ejecutado total (${rangeLabel})`,
    total: `USD ${fmtMoneyM(totalM)}`, totalM, programas
  };
}
function buildMonthDataset(period) {
  const [year, month] = String(period).split('-');
  const rows = TRANSFER_ROWS.filter(r => r.periodo === String(period));
  if (!rows.length) return null;
  const programas = aggregateTransferRows(rows);
  const totalM = programas.reduce((s, p) => s + p.budgetM, 0);
  const rangeLabel = formatTransferPeriodLong(period);
  return {
    key: `month:${period}`, mode: 'month', year, month, isMock: false, rangeLabel,
    label: `Total ejecutado en ${rangeLabel}.`,
    totalLabel: `Presupuesto ejecutado (${rangeLabel})`,
    total: `USD ${fmtMoneyM(totalM)}`, totalM, programas
  };
}
function buildHistoricalDataset() {
  const programas = aggregateTransferRows(TRANSFER_ROWS);
  const totalM = programas.reduce((s, p) => s + p.budgetM, 0);
  const periods = transferAvailablePeriods();
  const rangeLabel = periods.length ? `${formatTransferPeriodLong(periods[0])} – ${formatTransferPeriodLong(periods[periods.length - 1])}` : '';
  return {
    key: TRANSFER_HISTORICAL_KEY, mode: 'historical', isMock: false, rangeLabel,
    label: `Acumulado histórico ejecutado, ${rangeLabel}.`,
    totalLabel: `Presupuesto período de gobierno`,
    total: `USD ${fmtMoneyM(totalM)}`, totalM, programas
  };
}
function transferYearRangeLabel(year) {
  const months = validMonthsForYear(year);
  if (!months.length) return String(year);
  // El año en curso empieza con un bloque acumulado desde enero (p. ej. julio 2026 = enero–julio),
  // por eso su rango se rotula desde enero.
  const enCurso = String(year) === PERIOD_MAX.slice(0, 4);
  const desde = enCurso ? '01' : months[0];
  if (months.length < 12) return `${TRANSFER_MONTHS[desde]} ${year} – ${TRANSFER_MONTHS[months[months.length - 1]]} ${year}`;
  return `ene ${year} – dic ${year}`;
}
function validMonthsForYear(year) {
  return transferAvailablePeriods().filter(p => p.startsWith(String(year) + '-')).map(p => p.slice(5));
}


// ---------- Fichas técnicas de indicadores (matriz institucional) ----------
const kpiMetadata = {
  "1": {
    "nombre": "Número de exservidores y extrabajadores jubilados compensados económicamente",
    "queMide": "El volumen total de personas exservidores  y extrabajadores de la Función Ejecutiva y otras funciones del Estado creadas por la Constitución o la Ley  del (PGE) que efectivamente recibieron el pago o la transferencia de su compensación por jubilación.",
    "decision": "Cumplir con la compensación jubilar",
    "formula": "Sumatoria de ex servidores y ex trabajadores jubilados compensados económicamente.",
    "unidad": "Número",
    "tipo": "RESULTADO",
    "periodicidad": "TRIMESTRAL",
    "desagregacion": "NACIONAL",
    "sistema": "Base de Datos",
    "recurso": "BASE DE DATOS",
    "acceso": "RESTRINGIDO",
    "calidad": "REQUIERE VALIDACIÓN",
    "prioridad": "MEDIA",
    "estado": "DISPONIBLE",
    "responsable": "Gerente Proyecto Gestión del Subsistema de Empleo en el Servicio Público",
    "validacion": "Subsecretario de Fortalecimiento del Servicio Público",
    "observacion": "Su ejecución está sujeta a la disponibilidad presupuestaria y al cronograma de pagos emitidos por el Ministerio de Economía y Finanzas (MEF), así como a la gestión de las instituciones ejecutoras de la Función Ejecutiva y otras funciones del Estado creadas por la Constitución o la Ley.",
    "fuente": "",
    "lugar": "KPIS-TRABAJO-JUBILADOS"
  },
  "2": {
    "nombre": "Número de contratos de trabajo registrados a nivel nacional",
    "queMide": "Validar  el incremento y decremento mes por mes del registro de los trabajadores en el Sistema Único de Trabajo (SUT) según lo establecido en el Acuerdo Ministerial Nro. MDT-2023-140, para garantizar el soporte documental y técnico para el proceso de inspecciones del trabajo",
    "decision": "Permite identificar variaciones, tendencias e inconsistencias en el registro de contratos de trabajo para fortalecer la toma de decisiones, el control de obligaciones laborales y la planificación de las inspecciones del trabajo.",
    "formula": "Sumatoria de contratos nuevos registrados en el año.",
    "unidad": "Número",
    "tipo": "RESULTADO",
    "periodicidad": "MENSUAL",
    "desagregacion": "NACIONAL",
    "sistema": "SUT - Sistema Único de Trabajo",
    "recurso": "SISTEMA",
    "acceso": "RESTRINGIDO",
    "calidad": "REQUIERE VALIDACIÓN",
    "prioridad": "MEDIA",
    "estado": "DISPONIBLE",
    "responsable": "Directora de Control, Inspecciones y Coactivas",
    "validacion": "Subsecretaria de Trabajo",
    "observacion": "La información de los contratos de trabajo registrada en el Sistema Único de Trabajo (SUT) es de naturaleza transaccional y se actualiza continuamente conforme a las acciones realizadas por los empleadores (registro, modificación, legalización, terminación u otras operaciones). En virtud de esta característica, los datos reportados pueden presentar diferencias entre distintos cortes de información o respecto de cifras acumuladas, por cuanto corresponden al estado de la base de datos al momento de su consulta y extracción.",
    "fuente": "",
    "lugar": "KPIS-TRABAJO-Contratos"
  },
  "5": {
    "nombre": "Número de beneficiarios del servicio de desarrollo infantil",
    "queMide": "Las personas que acceden al servicio de desarrollo infantil",
    "decision": "Fortalecer los servicios que brinda el Ministerio",
    "formula": "Sumatoria de las personas beneficiarias",
    "unidad": "Número",
    "tipo": "RESULTADO",
    "periodicidad": "MENSUAL",
    "desagregacion": "PROVINCIAL",
    "sistema": "SISTEMA INTEGRADO DE INFORMACIÒN DEL MINISTERIO DE TRABAJO Y DESARROLLO HUMANO (SIIMTDH)",
    "recurso": "SISTEMA",
    "acceso": "RESTRINGIDO",
    "calidad": "ALTA",
    "prioridad": "ALTA",
    "estado": "DISPONIBLE",
    "responsable": "Subsecretarías del Viceministerio de Desarrollo Social",
    "validacion": "Subsecretarías del Viceministerio de Desarrollo Social, Subsecretaría de Gestión de Datos y Estudios",
    "observacion": "",
    "fuente": "Sistema Integral de Información del Ministerio de Trabajo y Desarrollo Humano (SIIMTDH)",
    "lugar": "KPIS-PROTECCION SOCIALE INCLUSION ECONOMICA-COBERTURA DE DESARROLLOINFANTIL INTEGRAL"
  },
  "6": {
    "nombre": "Número de beneficiarios del servicio de protección especial",
    "queMide": "Las personas que acceden al servicio de protección especial",
    "decision": "Fortalecer los servicios que brinda el Ministerio",
    "formula": "Sumatoria de las personas beneficiarias",
    "unidad": "Número",
    "tipo": "RESULTADO",
    "periodicidad": "MENSUAL",
    "desagregacion": "PROVINCIAL",
    "sistema": "SISTEMA INTEGRADO DE INFORMACIÒN DEL MINISTERIO DE TRABAJO Y DESARROLLO HUMANO (SIIMTDH)",
    "recurso": "SISTEMA",
    "acceso": "RESTRINGIDO",
    "calidad": "ALTA",
    "prioridad": "ALTA",
    "estado": "DISPONIBLE",
    "responsable": "Subsecretarías del Viceministerio de Desarrollo Social",
    "validacion": "Subsecretarías del Viceministerio de Desarrollo Social, Subsecretaría de Gestión de Datos y Estudios",
    "observacion": "",
    "fuente": "Sistema Integral de Información del Ministerio de Trabajo y Desarrollo Humano (SIIMTDH)",
    "lugar": "KPIS-PROTECCION SOCIAL E INCLUSION ECONOMICA"
  },
  "7": {
    "nombre": "Número de beneficiarios del servicio a personas con discapacidad",
    "queMide": "Las personas que acceden al servicio a personas con discapacidad",
    "decision": "Fortalecer los servicios que brinda el Ministerio",
    "formula": "Sumatoria de las personas beneficiarias",
    "unidad": "Número",
    "tipo": "RESULTADO",
    "periodicidad": "MENSUAL",
    "desagregacion": "PARROQUIAL",
    "sistema": "SISTEMA INTEGRADO DE INFORMACIÒN DEL MINISTERIO DE TRABAJO Y DESARROLLO HUMANO (SIIMTDH)",
    "recurso": "SISTEMA",
    "acceso": "RESTRINGIDO",
    "calidad": "ALTA",
    "prioridad": "ALTA",
    "estado": "DISPONIBLE",
    "responsable": "Subsecretarías del Viceministerio de Desarrollo Social",
    "validacion": "Subsecretarías del Viceministerio de Desarrollo Social, Subsecretaría de Gestión de Datos y Estudios",
    "observacion": "",
    "fuente": "Sistema Integral de Información del Ministerio de Trabajo y Desarrollo Humano (SIIMTDH)",
    "lugar": "KPIS-PROTECCION SOCIAL E INCLUSION ECONOMICA"
  },
  "8": {
    "nombre": "Número de beneficiarios del servicio a personas adultas mayores",
    "queMide": "Las personas que acceden al servicio de personas adultas mayores",
    "decision": "Fortalecer los servicios que brinda el Ministerio",
    "formula": "Sumatoria de las personas beneficiarias",
    "unidad": "Número",
    "tipo": "RESULTADO",
    "periodicidad": "MENSUAL",
    "desagregacion": "PARROQUIAL",
    "sistema": "SISTEMA INTEGRADO DE INFORMACIÒN DEL MINISTERIO DE TRABAJO Y DESARROLLO HUMANO (SIIMTDH)",
    "recurso": "SISTEMA",
    "acceso": "RESTRINGIDO",
    "calidad": "ALTA",
    "prioridad": "ALTA",
    "estado": "DISPONIBLE",
    "responsable": "Subsecretarías del Viceministerio de Desarrollo Social",
    "validacion": "Subsecretarías del Viceministerio de Desarrollo Social, Subsecretaría de Gestión de Datos y Estudios",
    "observacion": "",
    "fuente": "Sistema Integral de Información del Ministerio de Trabajo y Desarrollo Humano (SIIMTDH)",
    "lugar": "KPIS-PROTECCION SOCIAL E INCLUSION ECONOMICA"
  },
  "12": {
    "nombre": "Movilidad Social",
    "queMide": "Las personas que acceden al servicio de Movilidad Social",
    "decision": "Fortalecer los servicios que brinda el Ministerio",
    "formula": "Sumatoria de las personas beneficiarias",
    "unidad": "Número",
    "tipo": "RESULTADO",
    "periodicidad": "MENSUAL",
    "desagregacion": "PARROQUIAL",
    "sistema": "BASES DE DATOS DE USUARIOS HABILITADOS AL PAGO DE BONOS Y PENSIONES",
    "recurso": "ARCHIVO EXCEL/CSV",
    "acceso": "RESTRINGIDO",
    "calidad": "ALTA",
    "prioridad": "ALTA",
    "estado": "DISPONIBLE",
    "responsable": "Subsecretaría de Emprendimientos y Gestión del Conocimiento,  Subsecretaría de Gestión de Datos y Estudios",
    "validacion": "Subsecretaría de Emprendimientos y Gestión del Conocimiento,  Subsecretaría de Gestión de Datos y Estudios",
    "observacion": "",
    "fuente": "Base de datos de usuarios habilitados al pago de bonos y pensiones - Subsecretaria de Aseguramiento no Contributivo (SANC) y Subsecreatría de Emprendiemientos y Gestión del Conocimiento (SEGC)",
    "lugar": "KPIS-PROTECCION SOCIAL E INCLUSION ECONOMICA-MOVILIDAD SOCIAL"
  },
  "16": {
    "nombre": "Porcentaje de alertas gestionada en el SUUSEN",
    "queMide": "Relación porcentual entre el número total de alertas gestionadas vencidas; en relación al total de alertas generadas vencidas",
    "decision": "Identificar brechas y retrasos en la atención de alertas, priorizar territorios, tipos de alerta y entidades responsables, y fortalecer la coordinación interinstitucional.",
    "formula": "Sumatoria de las alertas con gestión vencidas / Total de alertas generadas vencidas",
    "unidad": "Porcentaje",
    "tipo": "RESULTADO",
    "periodicidad": "TRIMESTRAL",
    "desagregacion": "PARROQUIAL",
    "sistema": "SISTEMA UNIFICADO Y UNIVERSAL DE SEGUIMIENTO NOMINAL",
    "recurso": "BASE DE DATOS",
    "acceso": "INSTITUCIONAL",
    "calidad": "ALTA",
    "prioridad": "ALTA",
    "estado": "DISPONIBLE",
    "responsable": "Subsecretaría de Gestión de Datos y Estudios y Coordinación General de Tecnologías de la Información y Comunicación",
    "validacion": "Subsecretaría de Gestión de Datos y Estudios y Coordinación General de Tecnologías de la Información y Comunicación",
    "observacion": "Se realiza un reporte trimestral para presentar los hallazgos importantes",
    "fuente": "Sistema Unificado y Universal de Seguimiento Nominal (SUUSEN)",
    "lugar": "KPIS-PROTECCION SOCIAL E INCLUSION ECONOMICA"
  }
};


Object.assign(kpiMetadata, {
  "9": {
    "nombre": "Número de beneficiarios del Bono de Desarrollo Humano",
    "queMide": "Las personas que acceden al Bono de Desarrollo Humano",
    "decision": "Fortalecer los servicios que brinda el Ministerio",
    "formula": "Sumatoria de las personas beneficiarias",
    "unidad": "Número",
    "tipo": "RESULTADO",
    "periodicidad": "MENSUAL",
    "desagregacion": "PARROQUIAL",
    "sistema": "BASES DE DATOS DE USUARIOS HABILITADOS AL PAGO DE BONOS Y PENSIONES",
    "recurso": "BASE DE DATOS",
    "acceso": "RESTRINGIDO",
    "calidad": "ALTA",
    "prioridad": "ALTA",
    "estado": "DISPONIBLE",
    "responsable": "Subsecretaría de Aseguramiento No Contributivo, Contingencias y Operaciones,  Subsecretaría de Gestión de Datos y Estudios",
    "validacion": "Subsecretaría de Aseguramiento No Contributivo, Contingencias y Operaciones,  Subsecretaría de Gestión de Datos y Estudios",
    "observacion": "",
    "fuente": "Base de datos de usuarios habilitados al pago de bonos y pensiones - Subsecretaria de Aseguramiento no Contributivo (SANC)",
    "lugar": "KPIS-PROTECCION SOCIAL E INCLUSION ECONOMICA"
  },
  "10": {
    "nombre": "Número de beneficiarios del BDH con Componente Variable",
    "queMide": "Las personas que acceden al  BDH con Componente Variable",
    "decision": "Fortalecer los servicios que brinda el Ministerio",
    "formula": "Sumatoria de las personas beneficiarias",
    "unidad": "Número",
    "tipo": "RESULTADO",
    "periodicidad": "MENSUAL",
    "desagregacion": "PARROQUIAL",
    "sistema": "BASES DE DATOS DE USUARIOS HABILITADOS AL PAGO DE BONOS Y PENSIONES",
    "recurso": "BASE DE DATOS",
    "acceso": "RESTRINGIDO",
    "calidad": "ALTA",
    "prioridad": "ALTA",
    "estado": "DISPONIBLE",
    "responsable": "Subsecretaría de Aseguramiento No Contributivo, Contingencias y Operaciones,  Subsecretaría de Gestión de Datos y Estudios",
    "validacion": "Subsecretaría de Aseguramiento No Contributivo, Contingencias y Operaciones,  Subsecretaría de Gestión de Datos y Estudios",
    "observacion": "",
    "fuente": "Base de datos de usuarios habilitados al pago de bonos y pensiones - Subsecretaria de Aseguramiento no Contributivo (SANC)",
    "lugar": "KPIS-PROTECCION SOCIAL E INCLUSION ECONOMICA"
  },
  "11": {
    "nombre": "Número de beneficiarios del Bono 1000 Días",
    "queMide": "Las personas que acceden al  Bono 1000 días",
    "decision": "Fortalecer los servicios que brinda el Ministerio",
    "formula": "Sumatoria de las personas beneficiarias",
    "unidad": "Número",
    "tipo": "RESULTADO",
    "periodicidad": "MENSUAL",
    "desagregacion": "PARROQUIAL",
    "sistema": "BASES DE DATOS DE USUARIOS HABILITADOS AL PAGO DE BONOS Y PENSIONES",
    "recurso": "BASE DE DATOS",
    "acceso": "RESTRINGIDO",
    "calidad": "ALTA",
    "prioridad": "ALTA",
    "estado": "DISPONIBLE",
    "responsable": "Subsecretaría de Aseguramiento No Contributivo, Contingencias y Operaciones,  Subsecretaría de Gestión de Datos y Estudios",
    "validacion": "Subsecretaría de Aseguramiento No Contributivo, Contingencias y Operaciones,  Subsecretaría de Gestión de Datos y Estudios",
    "observacion": "",
    "fuente": "Base de datos de usuarios habilitados al pago de bonos y pensiones - Subsecretaria de Aseguramiento no Contributivo (SANC)",
    "lugar": "KPIS-PROTECCION SOCIAL E INCLUSION ECONOMICA"
  },
  "13": {
    "nombre": "Número de beneficiarios del Bono Joaquín Gallegos Lara",
    "queMide": "Las personas que acceden al Bono Joaquín Gallegos Lara",
    "decision": "Fortalecer los servicios que brinda el Ministerio",
    "formula": "Sumatoria de las personas beneficiarias",
    "unidad": "Número",
    "tipo": "RESULTADO",
    "periodicidad": "MENSUAL",
    "desagregacion": "PARROQUIAL",
    "sistema": "BASES DE DATOS DE USUARIOS HABILITADOS AL PAGO DE BONOS Y PENSIONES",
    "recurso": "BASE DE DATOS",
    "acceso": "RESTRINGIDO",
    "calidad": "ALTA",
    "prioridad": "ALTA",
    "estado": "DISPONIBLE",
    "responsable": "Subsecretaría de Aseguramiento No Contributivo, Contingencias y Operaciones,  Subsecretaría de Gestión de Datos y Estudios",
    "validacion": "Subsecretaría de Aseguramiento No Contributivo, Contingencias y Operaciones,  Subsecretaría de Gestión de Datos y Estudios",
    "observacion": "",
    "fuente": "Base de datos de usuarios habilitados al pago de bonos y pensiones - Subsecretaria de Aseguramiento no Contributivo (SANC)",
    "lugar": "KPIS-PROTECCION SOCIAL E INCLUSION ECONOMICA"
  },
  "14": {
    "nombre": "Número de beneficiarios de la Pensión Toda una vida",
    "queMide": "Las personas que acceden a la Pensión Toda una vida",
    "decision": "Fortalecer los servicios que brinda el Ministerio",
    "formula": "Sumatoria de las personas beneficiarias",
    "unidad": "Número",
    "tipo": "RESULTADO",
    "periodicidad": "MENSUAL",
    "desagregacion": "PARROQUIAL",
    "sistema": "BASES DE DATOS DE USUARIOS HABILITADOS AL PAGO DE BONOS Y PENSIONES",
    "recurso": "BASE DE DATOS",
    "acceso": "RESTRINGIDO",
    "calidad": "ALTA",
    "prioridad": "ALTA",
    "estado": "DISPONIBLE",
    "responsable": "Subsecretaría de Aseguramiento No Contributivo, Contingencias y Operaciones,  Subsecretaría de Gestión de Datos y Estudios",
    "validacion": "Subsecretaría de Aseguramiento No Contributivo, Contingencias y Operaciones,  Subsecretaría de Gestión de Datos y Estudios",
    "observacion": "",
    "fuente": "Base de datos de usuarios habilitados al pago de bonos y pensiones - Subsecretaria de Aseguramiento no Contributivo (SANC)",
    "lugar": "KPIS-PROTECCION SOCIAL E INCLUSION ECONOMICA"
  },
  "15": {
    "nombre": "Número de beneficiarios de la Pensión Mis Mejores Años",
    "queMide": "Las personas que acceden a la Pensión Mis Mejores Años",
    "decision": "Fortalecer los servicios que brinda el Ministerio",
    "formula": "Sumatoria de las personas beneficiarias",
    "unidad": "Número",
    "tipo": "RESULTADO",
    "periodicidad": "MENSUAL",
    "desagregacion": "PARROQUIAL",
    "sistema": "BASES DE DATOS DE USUARIOS HABILITADOS AL PAGO DE BONOS Y PENSIONES",
    "recurso": "BASE DE DATOS",
    "acceso": "RESTRINGIDO",
    "calidad": "ALTA",
    "prioridad": "ALTA",
    "estado": "DISPONIBLE",
    "responsable": "Subsecretaría de Aseguramiento No Contributivo, Contingencias y Operaciones,  Subsecretaría de Gestión de Datos y Estudios",
    "validacion": "Subsecretaría de Aseguramiento No Contributivo, Contingencias y Operaciones,  Subsecretaría de Gestión de Datos y Estudios",
    "observacion": "",
    "fuente": "Base de datos de usuarios habilitados al pago de bonos y pensiones - Subsecretaria de Aseguramiento no Contributivo (SANC)",
    "lugar": "KPIS-PROTECCION SOCIAL E INCLUSION ECONOMICA"
  }
});

function escHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  })[ch]);
}

function richText(value){
  return escHtml(value || 'No especificado').replace(/\n/g, '<br>');
}

function badgeClass(value){
  const v = String(value || '').toUpperCase();
  return (v === 'ALTA' || v === 'DISPONIBLE' || v === 'SÍ' || v.startsWith('HOMOLOGADO')) ? 'badge-ok' : 'badge-pend';
}

/* Ficha del indicador: estructura única para todo el portal (KPIs, transferencias, PND · Trabajo, KPIs de Pueblos).
   f = { queMide, paraQue, formula, unidad, tipo, periodicidad, desagregacion,
         fuente, sistema, recurso, acceso, calidad, prioridad, disponibilidad, genera, valida,
         filasEstado:[[etiqueta, valor, esBadge]] (opcional, reemplaza las filas por defecto de "Estado de la información"),
         observacion (texto) | notas:[[subtítulo, texto]] } */
function renderFichaIndicador(f){
  const fila = (lbl, val, size) => `<div class="ind-metric-row"><span class="ind-metric-label">${escHtml(lbl)}</span><span class="ind-metric-value" style="font-size:${size || '12px'};text-align:right;${size ? 'max-width:68%;' : ''}">${escHtml(val || 'No especificado')}</span></div>`;
  const badge = (lbl, val) => `<div class="ind-metric-row"><span class="ind-metric-label">${escHtml(lbl)}</span><span class="${badgeClass(val)}">${escHtml(val || 'No especificada')}</span></div>`;
  const texto = (tag, titulo, val) => `
      <div class="ind-card"><div class="ind-stripe"></div><div class="ind-body">
        <div class="ind-tag">${tag}</div><div class="ind-nombre">${titulo}</div>
        <div style="font-size:12.5px;color:var(--subtexto);line-height:1.55;">${richText(val)}</div>
      </div></div>`;
  const filasEstado = f.filasEstado || [
    ['Calidad del dato', f.calidad, true], ['Prioridad dashboard', f.prioridad, true], ['Disponibilidad', f.disponibilidad, true],
    ['Genera', f.genera], ['Valida', f.valida]];
  const notas = f.notas ? f.notas.filter(n => n[1]) : (f.observacion ? [['', f.observacion]] : []);
  const obs = notas.length
    ? `<div class="ind-card" style="margin-top:16px;"><div class="ind-stripe"></div><div class="ind-body">
         <div class="ind-tag">Nota metodológica / operativa</div><div class="ind-nombre">Observación</div>
         ${notas.map(([t, v]) => `${t ? `<div style="font-size:11.5px;font-weight:700;color:var(--azul);margin:10px 0 2px;">${escHtml(t)}</div>` : ''}<div style="font-size:12.5px;color:var(--subtexto);line-height:1.55;">${richText(v)}</div>`).join('')}
       </div></div>`
    : '';
  return `
    <div class="section-lbl">Ficha del indicador</div>
    <div class="ind-grid" style="margin-bottom:16px;">
      ${texto('Definición conceptual', '¿Qué mide?', f.queMide)}
      ${texto('Utilidad para la gestión', '¿Para qué sirve?', f.paraQue)}
      ${texto('Metodología', 'Definición / forma de cálculo', f.formula)}
    </div>
    <div class="ind-grid">
      <div class="ind-card"><div class="ind-stripe"></div><div class="ind-body">
        <div class="ind-tag">Características</div><div class="ind-nombre">Medición</div>
        ${fila('Unidad', f.unidad)}${fila('Tipo', f.tipo)}${fila('Periodicidad', f.periodicidad)}${fila('Desagregación', f.desagregacion)}
      </div></div>
      <div class="ind-card"><div class="ind-stripe"></div><div class="ind-body">
        <div class="ind-tag">Origen del dato</div><div class="ind-nombre">Fuente</div>
        <div style="font-size:12.5px;color:var(--subtexto);line-height:1.5;margin-bottom:8px;">${richText(f.fuente || f.sistema || 'No especificada')}</div>
        <div class="ind-metric-row"><span class="ind-metric-label">Sistema / archivo</span><span class="ind-metric-value" style="font-size:11.5px;text-align:right;max-width:62%;">${escHtml(f.sistema || 'No especificado')}</span></div>
        ${fila('Tipo de recurso', f.recurso)}${fila('Acceso', f.acceso)}
      </div></div>
      <div class="ind-card"><div class="ind-stripe"></div><div class="ind-body">
        <div class="ind-tag">Gestión y disponibilidad</div><div class="ind-nombre">Estado de la información</div>
        ${filasEstado.map(([l, v, b]) => b ? badge(l, v) : fila(l, v, '10.8px')).join('')}
      </div></div>
    </div>
    ${obs}`;
}

function renderKpiFicha(registro){
  const m = kpiMetadata[String(registro)];
  if(!m) return '';
  return renderFichaIndicador({
    queMide: m.queMide, paraQue: m.decision, formula: m.formula,
    unidad: m.unidad, tipo: m.tipo, periodicidad: m.periodicidad, desagregacion: m.desagregacion,
    fuente: m.fuente || m.sistema, sistema: m.sistema, recurso: m.recurso, acceso: m.acceso,
    calidad: m.calidad, prioridad: m.prioridad, disponibilidad: m.estado, genera: m.responsable, valida: m.validacion,
    observacion: m.observacion
  });
}

let currentKpiRegistro = null;
let currentKpiArea = null;
let currentKpiCoveragePeriod = null;

function renderKpiDetail(registro, area){
  const m = kpiMetadata[String(registro)];
  if(!m) return;
  currentKpiRegistro = registro;
  currentKpiArea = area;
  currentKpiCoveragePeriod = PERIOD_MAX;
  document.getElementById('kpiDetailEyebrow').textContent = 'KPIs · ' + area;
  document.getElementById('kpiDetailTitle').textContent = m.nombre;
  document.getElementById('kpiDetailDesc').textContent = m.queMide;
  selectKpiTab('cobertura');
}

function renderKpiCoverageByPeriod(period){
  const el = document.getElementById('kpiDetailContent');
  const m = kpiMetadata[String(currentKpiRegistro)];
  if(!el || !m) return;

  currentKpiCoveragePeriod = (/^\d{4}-\d{2}$/.test(String(period || ''))) ? String(period) : PERIOD_MAX;
  const cut = coveragePeriodLabel(currentKpiCoveragePeriod);
  el.innerHTML = renderCoveragePeriodFilter('kpiCov', currentKpiCoveragePeriod, 'renderKpiCoverageByPeriod') +
    `<div class="placeholder-box"><div class="icon">🛠</div><div class="msg">Cobertura en construcción</div><div>Corte seleccionado: <strong>acumulado a ${cut}</strong>. La ficha del indicador está disponible, pero aún no se ha cargado la serie de cobertura por mes.</div></div>`;
}

function selectKpiTab(tab){
  ['cobertura','presupuesto','caracterizacion','ficha'].forEach(t => {
    document.getElementById('btn-kpi-' + t).classList.toggle('active', t === tab);
  });
  const el = document.getElementById('kpiDetailContent');
  const m = kpiMetadata[String(currentKpiRegistro)];
  if(!m) return;

  if(tab === 'ficha'){
    el.innerHTML = renderKpiFicha(currentKpiRegistro);
    return;
  }

  if(tab === 'presupuesto'){
    el.innerHTML = `
      <div class="toggle-bar">
        <div class="toggle-group">
          <button class="toggle-btn active" id="btn-kpibudget-gobierno" onclick="selectKpiBudgetPeriod('gobierno')">Periodo de gobierno</button>
          <button class="toggle-btn" id="btn-kpibudget-fiscal" onclick="selectKpiBudgetPeriod('fiscal')">Año fiscal</button>
        </div>
      </div>
      <div id="kpiBudgetContent"></div>`;
    selectKpiBudgetPeriod('gobierno');
    return;
  }

  if(tab === 'caracterizacion'){
    el.innerHTML = `<div class="placeholder-box"><div class="icon">🛠</div><div class="msg">Caracterización en construcción</div><div>Aún no hay resultados de caracterización cargados para este indicador. La ficha técnica declara una desagregación disponible a nivel <strong>${escHtml(m.desagregacion || 'no especificado')}</strong>.</div></div>`;
    return;
  }

  renderKpiCoverageByPeriod(currentKpiCoveragePeriod);
}

function selectKpiBudgetPeriod(periodo){
  const gov = document.getElementById('btn-kpibudget-gobierno');
  const fis = document.getElementById('btn-kpibudget-fiscal');
  if(gov) gov.classList.toggle('active', periodo === 'gobierno');
  if(fis) fis.classList.toggle('active', periodo === 'fiscal');
  const el = document.getElementById('kpiBudgetContent');
  if(!el) return;
  const label = periodo === 'gobierno' ? 'periodo de gobierno' : 'año fiscal';

  el.innerHTML = `<div class="placeholder-box"><div class="icon">🛠</div><div class="msg">Presupuesto en construcción</div><div>Aún no hay información presupuestaria por ${label} cargada para este indicador.</div></div>`;
}


function fmtInt(n){ return n.toLocaleString('es-EC'); }

const TRANSFER_ICONS = {
  home: '<path d="M3 12l9-9 9 9M5 10v10h14V10"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.6.3 4.7 2.3 4.7 5.3"/>',
  baby: '<circle cx="12" cy="8" r="4"/><path d="M9 8h.01M15 8h.01M9.5 10c.6.7 1.4 1 2.5 1s1.9-.3 2.5-1"/><path d="M12 12v2M5 20c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5"/>',
  elders: '<circle cx="7" cy="6" r="2.4"/><circle cx="17" cy="6" r="2.4"/><path d="M3 20c0-3.3 2-5.6 4.5-5.6M21 20c0-3.3-2-5.6-4.5-5.6M9 14.4h6M7 14.4v-2.6l2-1.8 3 1.4 3-1.4 2 1.8v2.6"/>',
  life: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.4"/><path d="M12 3v5.6M12 15.4V21M3 12h5.6M15.4 12H21"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-9.6-9.4C1 7.8 2.6 4.7 5.9 4c2.1-.4 4 .6 6.1 2.8C14.1 4.6 16 3.6 18.1 4c3.3.7 4.9 3.8 3.5 7.1C19.5 15.9 12 20.5 12 20.5z"/>',
  careheart: '<path d="M12 19.5s-6.8-4.1-8.7-8.5C2.4 8.2 3.8 5.5 6.6 4.9c1.9-.4 3.6.6 5.4 2.5 1.8-1.9 3.5-2.9 5.4-2.5 2.8.6 4.2 3.3 3.3 6.1-1.9 4.4-8.7 8.5-8.7 8.5z"/><path d="M9 12.5l1.6 1.6L15 10"/>',
  shield: '<path d="M12 3l7 3v6c0 4.8-3 8.3-7 9-4-.7-7-4.2-7-9V6l7-3z"/><path d="M9 12l2 2 4-4.2"/>',
  doc: '<path d="M6 2.5h8l4 4V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z"/><path d="M14 2.5V7h4M9 12h6M9 15.5h6M9 8.5h2"/>',
  movilidad: '<path d="M4 20l6-6 4 3 7-9"/><path d="M17 6h4v4"/>'
};

const TRANSFER_CATEGORY_STYLES = {
  bono: { color:'#1A3A8F', light:'#E8EEF8', border:'#C9D5EE', label:'Bonos' },
  pension: { color:'#C99200', light:'#FEF7DC', border:'#EEDB9B', label:'Pensiones' },
  cobertura: { color:'#1B7A4A', light:'#E6F4EC', border:'#B9DEC9', label:'Cobertura' }
};

const TRANSFER_PROGRAM_META = [
  { slug:'bdh', name:'Bono de Desarrollo Humano (BDH)', registro:'9', category:'bono', icon:'people', image:'../imagenes/bono_desarrollo_humano.png' },
  { slug:'bdhv', name:'Bono de Desarrollo Humano con Componente Variable (BDHV)', registro:'10', category:'bono', icon:'people', image:'../imagenes/bono_componente_variable.png' },
  { slug:'bono-1000-dias', name:'Bono 1000 Días', registro:'11', category:'bono', icon:'baby', image:'../imagenes/bono_mil_dias.png' },
  { slug:'pension-mis-mejores-anos', name:'Pensión Mis Mejores Años', registro:'15', category:'pension', icon:'elders', image:'../imagenes/pension_mis_mejores_anios.png' },
  { slug:'pension-toda-una-vida', name:'Pensión Toda Una Vida', registro:'14', category:'pension', icon:'elders', image:'../imagenes/pension_toda_una_vida.png' },
  { slug:'bono-joaquin-gallegos-lara', name:'Bono Joaquín Gallegos Lara', registro:'13', category:'bono', icon:'careheart', image:'../imagenes/bono_gallegos_lara.png' },
  { slug:'bono-orfandad-femicidio', name:'Bono de Orfandad por Femicidio', registro:null, category:'bono', icon:'heart', image:'../imagenes/bono_orfandad.png' },
  { slug:'cobertura-contingencias', name:'Cobertura de Contingencias', registro:null, category:'cobertura', icon:'shield', image:'../imagenes/cobertura_contingencias.png' },
  { slug:'bcena', name:'Bono de Contingencia Eventos Origen Natural (BCENA)', registro:null, category:'bono', icon:'shield', image:'../imagenes/bono_contingencia.png' }
];

const TRANSFER_MONTHS = {
  '01':'enero','02':'febrero','03':'marzo','04':'abril','05':'mayo','06':'junio',
  '07':'julio','08':'agosto','09':'septiembre','10':'octubre','11':'noviembre','12':'diciembre'
};

function getTransferProgramMetaByName(name){
  return TRANSFER_PROGRAM_META.find(p => p.name === name) || null;
}
function getTransferProgramMetaBySlug(slug){
  return TRANSFER_PROGRAM_META.find(p => p.slug === slug) || null;
}
function getTransferCategoryStyle(category){
  return TRANSFER_CATEGORY_STYLES[category] || TRANSFER_CATEGORY_STYLES.bono;
}
function formatTransferPeriodLong(period){
  const [year, month] = String(period).split('-');
  return `${TRANSFER_MONTHS[month]} ${year}`;
}

const transferProgramInfo = {}; // Sin datos incrustados: información adicional pendiente de una fuente en datos/.


// Información breve para el botón (i). Esta fuente es independiente de la ficha técnica.
// Solo se completa cuando la presentación institucional contiene texto específico para el indicador.
const indicatorQuickInfoByRegistro = {}; // Sin datos incrustados: información adicional pendiente de una fuente en datos/.


let PERIOD_MAX = '2026-07';   // se recalcula en fetchTransferData() con el corte más reciente real
const TRANSFER_HISTORICAL_KEY = 'historical';

// ---------- Selector reutilizable para la pestaña Cobertura ----------
// La cobertura se consulta por corte mensual. Por defecto se abre el último corte
// disponible. Al cambiar de año se selecciona automáticamente el último mes
// disponible de ese año.
function latestCoveragePeriodForYear(year){
  const months = validMonthsForYear(year);
  if(!months.length) return PERIOD_MAX;
  return `${year}-${months[months.length-1]}`;
}

function coveragePeriodLabel(period){
  if(!period || !/^\d{4}-\d{2}$/.test(String(period))) period = PERIOD_MAX;
  return formatTransferPeriodLong(period);
}

function renderCoveragePeriodFilter(prefix, selectedPeriod, callbackName){
  selectedPeriod = (/^\d{4}-\d{2}$/.test(String(selectedPeriod || ''))) ? String(selectedPeriod) : PERIOD_MAX;
  const [selectedYear, selectedMonth] = selectedPeriod.split('-');
  const years = [...new Set(transferAvailablePeriods().map(p => p.slice(0,4)))];
  const months = validMonthsForYear(selectedYear);
  const yearOptions = years.map(y => `<option value="${y}" ${y===selectedYear?'selected':''}>${y}</option>`).join('');
  const monthOptions = months.map(m => `<option value="${m}" ${m===selectedMonth?'selected':''}>${TRANSFER_MONTHS[m]}</option>`).join('');
  return `
    <div class="filter-bar coverage-filter-bar">
      <div class="filter-field">
        <label for="${prefix}Year">Año</label>
        <select id="${prefix}Year" onchange="coverageYearChanged('${prefix}','${callbackName}')">${yearOptions}</select>
      </div>
      <div class="filter-field">
        <label for="${prefix}Month">Mes</label>
        <select id="${prefix}Month" onchange="coverageMonthChanged('${prefix}','${callbackName}')">${monthOptions}</select>
      </div>
      <div class="filter-actions">
        <button class="btn btn-reset" type="button" onclick="coverageResetLatest('${prefix}','${callbackName}')">Último corte</button>
      </div>
      <div class="filter-status">Mostrando: <b>acumulado a ${coveragePeriodLabel(selectedPeriod)}</b></div>
    </div>`;
}

function invokeCoverageCallback(callbackName, period){
  const fn = window[callbackName];
  if(typeof fn === 'function') fn(period);
}

function coverageYearChanged(prefix, callbackName){
  const year = document.getElementById(prefix + 'Year')?.value;
  if(!year) return;
  invokeCoverageCallback(callbackName, latestCoveragePeriodForYear(year));
}

function coverageMonthChanged(prefix, callbackName){
  const year = document.getElementById(prefix + 'Year')?.value;
  const month = document.getElementById(prefix + 'Month')?.value;
  if(!year || !month) return;
  invokeCoverageCallback(callbackName, `${year}-${month}`);
}

function coverageResetLatest(prefix, callbackName){
  invokeCoverageCallback(callbackName, PERIOD_MAX);
}

// Snapshot de cobertura de un programa a un corte puntual: beneficiarios de
// ese año-mes exacto tomados directo del CSV (ya no es una progresión inventada).
function buildCoverageSnapshot(period, slug){
  const meta = getTransferProgramMetaBySlug(slug);
  if(!meta || !/^\d{4}-\d{2}$/.test(String(period || ''))) return null;
  const rows = TRANSFER_ROWS.filter(r => r.slug === slug && r.periodo === String(period));
  if(!rows.length) return null;
  const users = rows.reduce((s,r)=>s+r.beneficiarios,0);
  const budgetM = rows.reduce((s,r)=>s+r.montoM,0);
  return { name: meta.name, icon: meta.icon, users, budgetM, budget: fmtMoneyM(budgetM) };
}

function getTransferDataset(key){
  if(!key || key === TRANSFER_HISTORICAL_KEY || key === 'anual') return buildHistoricalDataset();
  if(key === 'mensual') return buildYearDataset(PERIOD_MAX.slice(0,4));
  if(String(key).startsWith('year:'))  return buildYearDataset(String(key).slice(5));
  if(String(key).startsWith('month:')) return buildMonthDataset(String(key).slice(6));
  return null;
}

let currentTransferPeriod = TRANSFER_HISTORICAL_KEY;
let currentTransferDetailSlug = null;
let currentTransferSelectedMonth = null;
let transferFilterInitialized = false;


function initTransferPeriodSelectors(){
  const yearEl = document.getElementById('tmYear');
  const monthEl = document.getElementById('tmMonth');
  if(!yearEl || !monthEl) return;
  if(!yearEl.options.length){
    const years = [...new Set(transferAvailablePeriods().map(p => p.slice(0,4)))];
    yearEl.innerHTML = `<option value="all">Todo el período</option>` + years.map(y => `<option value="${y}">${y}</option>`).join('');
    yearEl.addEventListener('change', ()=>{
      populateTransferMonthSelect('all');
      applyTransferDateFilter();
    });
    monthEl.addEventListener('change', applyTransferDateFilter);
  }
  setTransferPeriodSelect('all');
}

function populateTransferMonthSelect(desiredMonth = 'all'){
  const yearEl = document.getElementById('tmYear');
  const monthEl = document.getElementById('tmMonth');
  if(!yearEl || !monthEl) return;
  const year = yearEl.value;
  if(year === 'all'){
    monthEl.innerHTML = `<option value="all">Todos los meses</option>`;
    monthEl.value = 'all';
    monthEl.disabled = true;
    return;
  }
  monthEl.disabled = false;
  const months = validMonthsForYear(year);
  monthEl.innerHTML = `<option value="all">Todo el año</option>` + months.map(m => `<option value="${m}">${TRANSFER_MONTHS[m]}</option>`).join('');
  monthEl.value = months.includes(desiredMonth) ? desiredMonth : 'all';
}

function setTransferPeriodSelect(period){
  const yearEl = document.getElementById('tmYear');
  if(!yearEl) return;
  if(!period || period === 'all' || period === TRANSFER_HISTORICAL_KEY){
    yearEl.value = 'all';
    populateTransferMonthSelect('all');
    return;
  }
  if(/^\d{4}$/.test(String(period))){
    yearEl.value = String(period);
    populateTransferMonthSelect('all');
    return;
  }
  const [year, month] = String(period).split('-');
  yearEl.value = year;
  populateTransferMonthSelect(month || 'all');
}

function getTransferSelectionKey(){
  const year = document.getElementById('tmYear')?.value;
  const month = document.getElementById('tmMonth')?.value;
  if(!year || year === 'all') return TRANSFER_HISTORICAL_KEY;
  if(!month || month === 'all') return `year:${year}`;
  return `month:${year}-${month}`;
}

/* CARACTERIZACIÓN DE TRANSFERENCIAS (oculta por ahora; ver también selectTransferDetailTab
   y el botón comentado en MDTDH/transferencias.html)
function getTransferProgramData(periodKey, slug){
  const meta = getTransferProgramMetaBySlug(slug);
  const dataset = getTransferDataset(periodKey);
  if(!meta || !dataset) return null;
  return dataset.programas.find(p => p.name === meta.name) || null;
}
*/

function renderTransferCategoryChips(){
  const availableSlugs = new Set(TRANSFER_ROWS.map(r => r.slug));
  const counts = TRANSFER_PROGRAM_META.filter(p => availableSlugs.has(p.slug)).reduce((acc,p)=>{ acc[p.category]=(acc[p.category]||0)+1; return acc; },{});
  return `
    <div class="tm-category-chips">
      ${Object.entries(TRANSFER_CATEGORY_STYLES).map(([key, style]) => `<span class="tm-category-chip" style="background:${style.light}; color:${style.color}; border-color:${style.border};">${style.label} (${counts[key] || 0})</span>`).join('')}
    </div>`;
}

function renderTransferencias(periodKey){
  const d = getTransferDataset(periodKey);
  if(!d) return;
  currentTransferPeriod = d.key;
  currentTransferSelectedMonth = d.mode === 'month' ? `${d.year}-${d.month}` : null;
  const grid = document.getElementById('tmCardGrid');
  const stack = document.getElementById('tmStackbar');
  const legend = document.getElementById('tmLegend');
  if(!grid || !stack || !legend) return;

  const budgetSum = d.programas.reduce((s,p)=>s+p.budgetM, 0) || 1;
  const maxBudget = Math.max(...d.programas.map(p=>p.budgetM), 1);
  const order = { bono:0, pension:1, cobertura:2 };
  const sorted = [...d.programas].sort((a,b)=>{
    const ca = getTransferProgramMetaByName(a.name)?.category || 'bono';
    const cb = getTransferProgramMetaByName(b.name)?.category || 'bono';
    return (order[ca]-order[cb]) || (b.budgetM-a.budgetM);
  });

  const realPcts = sorted.map(p => p.budgetM / budgetSum * 100);
  const visualRaw = realPcts.map(pct => Math.max(pct, 1.35));
  const visualScale = 100 / visualRaw.reduce((a,b)=>a+b,0);
  stack.innerHTML = sorted.map((p,i) => {
    const meta = getTransferProgramMetaByName(p.name);
    const style = getTransferCategoryStyle(meta?.category);
    const pct = realPcts[i];
    const visualPct = visualRaw[i] * visualScale;
    return `<div class="tm-seg" style="width:${visualPct.toFixed(3)}%; min-width:5px; flex:0 0 auto; background:${style.color}" title="${p.name} — ${pct.toFixed(2)}%"></div>`;
  }).join('');

  legend.innerHTML = sorted.map((p,i) => {
    const meta = getTransferProgramMetaByName(p.name);
    const style = getTransferCategoryStyle(meta?.category);
    const pct = realPcts[i];
    const categoryLabel = meta?.category === 'bono' ? 'Bono' : (meta?.category === 'pension' ? 'Pensión' : 'Cobertura');
    return `<div class="tm-legend-item"><span class="tm-legend-swatch" style="background:${style.color}"></span><span>${p.name}<br><small style="color:${style.color};font-weight:700;">${categoryLabel}</small></span><b>${pct.toFixed(2)}%</b></div>`;
  }).join('');

  grid.innerHTML = d.programas.map(p => {
    const meta = getTransferProgramMetaByName(p.name);
    const style = getTransferCategoryStyle(meta?.category);
    const pct = p.budgetM / budgetSum * 100;
    const categoryLabel = meta?.category ? style.label : 'Programa';
    const route = meta ? `transferencia-${meta.slug}` : 'transferencias';
    return `<div class="tm-card" onclick="nav('${route}')" style="border-top:4px solid ${style.color};">
      <div class="tm-card-top">
        <div class="tm-icon-badge" style="background:${style.light};">${meta?.image ? `<img src="${meta.image}" alt="Icono de ${escHtml(p.name)}">` : `<svg viewBox="0 0 24 24" fill="none" stroke="${style.color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${TRANSFER_ICONS[meta?.icon] || TRANSFER_ICONS.doc}</svg>`}</div>
        <div class="tm-share-tag" style="background:${style.light}; color:${style.color}; border-color:${style.border};">${pct.toFixed(2)}% del total</div>
      </div>
      <button class="tm-info-btn" type="button" onclick="event.stopPropagation(); openIndicatorInfoByTransfer('${p.name.replace(/'/g, "&#39;")}');" aria-label="Información del indicador">i</button>
      <div class="tm-card-name">${p.name}</div>
      <div class="tm-card-category" style="color:${style.color};">${categoryLabel}</div>
      <div class="tm-metric-row"><span class="tm-metric-label">Beneficiarios</span><span class="tm-metric-value">${fmtInt(p.users)}</span></div>
      <div class="tm-metric-row"><span class="tm-metric-label">Ejecutado</span><span class="tm-metric-value money">USD ${p.budget}</span></div>
      <div class="tm-card-bar-track"><div class="tm-card-bar-fill" style="width:${(p.budgetM/maxBudget*100).toFixed(1)}%; background:${style.color};"></div></div>
    </div>`;
  }).join('');

  document.getElementById('tmTotalLabel').textContent = d.totalLabel;
  document.getElementById('tmTotalValue').textContent = d.total;
  document.getElementById('tmHeroFigure').textContent = d.total;
  document.getElementById('tmHeroPeriod').textContent = d.mode === 'historical'
    ? `Acumulado de ${d.programas.filter(p => p.budgetM > 0 || p.users > 0).length} programas con registros disponibles (${d.rangeLabel}).`
    : `Total para ${d.programas.filter(p => p.budgetM > 0 || p.users > 0).length} programas con registros disponibles, ${d.rangeLabel}.`;
  const summaryNote = document.getElementById('tmSummaryNote');
  if(summaryNote){
    summaryNote.innerHTML = d.mode === 'historical'
      ? `Vista acumulada del período disponible (${d.rangeLabel}).`
      : `Vista del período seleccionado (${d.rangeLabel}).`;
  }
  const status = document.getElementById('tmFilterStatus');
  if(status) status.innerHTML = `Mostrando: <b>${d.mode === 'historical' ? 'período de gobierno' : (d.mode === 'year' ? d.rangeLabel : 'mes seleccionado (' + d.rangeLabel + ')')}</b>`;
  const warn = document.getElementById('tmFilterWarning');
  if(warn) warn.style.display = 'none';
  const distTitle = document.querySelector('.tm-dist-title');
  if(distTitle){
    const panel = distTitle.parentElement;
    const existingChips = panel ? panel.querySelector('.tm-category-chips') : null;
    if(existingChips) existingChips.remove();
    distTitle.insertAdjacentHTML('afterend', renderTransferCategoryChips());
  }
}

function applyTransferDateFilter(){
  const key = getTransferSelectionKey();
  renderTransferencias(key);
  transferFilterInitialized = true;
}

function resetTransferDateFilter(){
  setTransferPeriodSelect('all');
  renderTransferencias(TRANSFER_HISTORICAL_KEY);
  transferFilterInitialized = true;
}

function showTransferHistorical(){
  resetTransferDateFilter();
}

function showTransferYear(year){
  setTransferPeriodSelect(String(year));
  renderTransferencias(`year:${year}`);
  transferFilterInitialized = true;
}

function showTransferLatestYear(){
  const years = [...new Set(transferAvailablePeriods().map(p => p.slice(0,4)))].sort();
  if(years.length) showTransferYear(years[years.length - 1]);
}

function indicatorInfoText(value){
  const text = String(value || '').trim();
  const cls = text ? 'indicator-info-text' : 'indicator-info-text muted';
  return `<div class="${cls}">${richText(text || 'En construcción')}</div>`;
}

function indicatorInfoList(items){
  const clean = Array.isArray(items) ? items.filter(x => String(x || '').trim()) : [];
  if(!clean.length) return `<div class="indicator-info-text muted">En construcción</div>`;
  return `<ul class="tm-modal-reqs">${clean.map(item => `<li>${richText(item)}</li>`).join('')}</ul>`;
}

function buildIndicatorInfoModel({registro=null, title='', transferName=null}={}){
  const quick = transferName
    ? (transferProgramInfo[transferName] || null)
    : (registro ? (indicatorQuickInfoByRegistro[String(registro)] || null) : null);
  const transferMeta = transferName ? getTransferProgramMetaByName(transferName) : null;
  return {
    title: title || transferName || 'Indicador',
    desc: quick?.desc || '',
    amount: quick?.amount || '',
    reqs: quick?.reqs || [],
    details: quick?.details || [],
    source: quick?.source || '',
    icon: quick?.icon || (transferMeta?.category === 'pension' ? 'elders' : transferMeta?.category === 'cobertura' ? 'shield' : 'doc'),
    image: transferMeta?.image || '',
    hasInfo: !!quick,
    isTransfer: !!transferName
  };
}

function openIndicatorInfo(model){
  const backdrop = document.getElementById('tmModalBackdrop');
  if(!backdrop || !model) return;
  const iconPath = TRANSFER_ICONS[model.icon] || TRANSFER_ICONS.doc;
  document.getElementById('tmModalIcon').innerHTML = model.image
    ? `<img src="${model.image}" alt="Icono de ${escHtml(model.title)}">`
    : `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>`;
  document.getElementById('tmModalTitle').textContent = model.title;
  document.getElementById('tmModalKicker').textContent = model.isTransfer ? 'Información de la transferencia' : 'Información del indicador';

  const content = document.getElementById('tmModalContent');
  content.innerHTML = `
    <div class="indicator-info-section">
      <div class="indicator-info-label">Descripción</div>
      ${indicatorInfoText(model.desc)}
    </div>
    <div class="indicator-info-section">
      <div class="indicator-info-label">Monto / modalidad</div>
      ${indicatorInfoText(model.amount)}
    </div>
    <div class="indicator-info-section">
      <div class="indicator-info-label">Criterios de aplicación</div>
      ${indicatorInfoList(model.reqs)}
    </div>
    <div class="indicator-info-section">
      <div class="indicator-info-label">Información adicional</div>
      ${indicatorInfoList(model.details)}
    </div>`;

  document.getElementById('tmModalNote').textContent = model.hasInfo
    ? `${model.source} Esta ventana informativa es independiente de la ficha técnica del indicador.`
    : 'En construcción.';
  backdrop.classList.add('open');
}

function openIndicatorInfoByTransfer(name){
  const meta = getTransferProgramMetaByName(name);
  openIndicatorInfo(buildIndicatorInfoModel({registro:meta?.registro || null, title:name, transferName:name}));
}

function openIndicatorInfoByRegistro(registro, title=''){
  openIndicatorInfo(buildIndicatorInfoModel({registro, title}));
}

function openIndicatorInfoPlaceholder(title){
  openIndicatorInfo(buildIndicatorInfoModel({title}));
}

function closeTransferInfo(){
  const backdrop = document.getElementById('tmModalBackdrop');
  if(backdrop) backdrop.classList.remove('open');
}

function renderTransferFallbackFicha(meta, info){
  return '<div class="placeholder-box"><div class="icon">🛠</div><div class="msg">En construcción</div></div>';
}

/* CARACTERIZACIÓN DE TRANSFERENCIAS (oculta por ahora)
function renderTransferCaracterizacion(meta, data, record, info){
  const desag = record?.desagregacion || 'no especificada en la matriz institucional cargada';
  return `<div class="placeholder-box"><div class="icon">🛠</div><div class="msg">Caracterización en construcción</div><div>Aún no hay resultados de caracterización cargados para este programa. La ficha técnica disponible declara una desagregación a nivel <strong>${escHtml(desag)}</strong>.</div></div>`;
}
*/

let currentTransferCoveragePeriod = PERIOD_MAX;

function renderTransferDetail(slug){
  currentTransferDetailSlug = slug;
  currentTransferCoveragePeriod = PERIOD_MAX;
  const meta = getTransferProgramMetaBySlug(slug);
  if(!meta) return;
  const record = meta.registro ? kpiMetadata[String(meta.registro)] : null;
  const info = transferProgramInfo[meta.name] || {};
  document.getElementById('transferDetailEyebrow').textContent = 'Transferencias monetarias no contributivas';
  const detailIcon = document.getElementById('transferDetailIcon');
  if(detailIcon) detailIcon.innerHTML = meta.image
    ? `<img src="${meta.image}" alt="Icono de ${escHtml(meta.name)}">`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="${getTransferCategoryStyle(meta.category).color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${TRANSFER_ICONS[meta.icon] || TRANSFER_ICONS.doc}</svg>`;
  document.getElementById('transferDetailTitle').textContent = record?.nombre || meta.name;
  document.getElementById('transferDetailDesc').textContent = record?.queMide || info.desc || meta.name;
  selectTransferDetailTab('cobertura');
}

function selectTransferDetailTab(tab){
  // Para volver a mostrar Caracterización, agregar 'caracterizacion' a esta lista (ver bloque comentado abajo)
  ['cobertura','presupuesto','ficha'].forEach(t => {
    document.getElementById('btn-transfer-' + t).classList.toggle('active', t === tab);
  });
  const el = document.getElementById('transferDetailContent');
  const meta = getTransferProgramMetaBySlug(currentTransferDetailSlug);
  if(!el || !meta) return;
  const record = meta.registro ? kpiMetadata[String(meta.registro)] : null;
  const info = transferProgramInfo[meta.name] || {};

  if(tab === 'ficha'){
    el.innerHTML = record ? renderKpiFicha(meta.registro) : renderTransferFallbackFicha(meta, info);
    return;
  }

  /* CARACTERIZACIÓN DE TRANSFERENCIAS (oculta por ahora)
  if(tab === 'caracterizacion'){
    const data = getTransferProgramData(currentTransferPeriod, currentTransferDetailSlug);
    el.innerHTML = renderTransferCaracterizacion(meta, data, record, info);
    return;
  }
  */

  if(tab === 'presupuesto'){
    el.innerHTML = `
      <div class="toggle-bar">
        <div class="toggle-group">
          <button class="toggle-btn active" id="btn-transferbudget-seleccion" onclick="selectTransferBudgetPeriod('seleccion')">Selección actual</button>
          <button class="toggle-btn" id="btn-transferbudget-historico" onclick="selectTransferBudgetPeriod('historico')">Acumulado histórico</button>
        </div>
      </div>
      <div id="transferBudgetContent"></div>`;
    selectTransferBudgetPeriod('seleccion');
    return;
  }

  renderTransferCoverageByPeriod(currentTransferCoveragePeriod);
}

function renderTransferCoverageByPeriod(){
  // Cobertura al último corte disponible DE CADA PROGRAMA (sin selector de año y mes):
  // los programas que aún no tienen el mes más reciente muestran su último corte.
  const el = document.getElementById('transferDetailContent');
  const meta = getTransferProgramMetaBySlug(currentTransferDetailSlug);
  if(!el || !meta) return;
  const periodosPrograma = TRANSFER_ROWS.filter(r => r.slug === currentTransferDetailSlug && /^\d{4}-\d{2}$/.test(r.periodo)).map(r => r.periodo).sort();
  currentTransferCoveragePeriod = periodosPrograma.length ? periodosPrograma[periodosPrograma.length - 1] : PERIOD_MAX;
  const data = buildCoverageSnapshot(currentTransferCoveragePeriod, currentTransferDetailSlug);
  const style = getTransferCategoryStyle(meta.category);
  const periodLabel = coveragePeriodLabel(currentTransferCoveragePeriod);
  el.innerHTML = data ? `
    <div class="stat-card">
      <div class="stat-label">Beneficiarios</div>
      <div class="stat-value">${fmtInt(data.users)}</div>
      <div class="stat-note">Corte: <strong>${periodLabel}</strong>.</div>
    </div>
    <div class="source-note" style="text-align:left;margin-top:12px;">Categoría del programa: <strong style="color:${style.color};">${style.label}</strong>.</div>`
  : '<div class="placeholder-box"><div class="icon">🛠</div><div class="msg">En construcción</div></div>';
}

function selectTransferBudgetPeriod(periodo){
  const sel = document.getElementById('btn-transferbudget-seleccion');
  const hist = document.getElementById('btn-transferbudget-historico');
  if(sel) sel.classList.toggle('active', periodo === 'seleccion');
  if(hist) hist.classList.toggle('active', periodo === 'historico');
  const el = document.getElementById('transferBudgetContent');
  const meta = getTransferProgramMetaBySlug(currentTransferDetailSlug);
  if(!el || !meta) return;
  const dataset = getTransferDataset(periodo === 'historico' ? TRANSFER_HISTORICAL_KEY : currentTransferPeriod);
  if(!dataset){
    el.innerHTML = `<div class="placeholder-box"><div class="icon">🛠</div><div class="msg">Presupuesto en construcción</div><div>No hay información presupuestaria disponible para esta selección.</div></div>`;
    return;
  }
  const program = dataset.programas.find(p => p.name === meta.name);
  if(!program){
    el.innerHTML = `<div class="placeholder-box"><div class="icon">🛠</div><div class="msg">Presupuesto en construcción</div><div>No hay información presupuestaria disponible para este programa.</div></div>`;
    return;
  }
  const share = (program.budgetM / dataset.totalM) * 100;
  el.innerHTML = `
    <div class="ind-grid">
      <div class="ind-card"><div class="ind-stripe"></div><div class="ind-body"><div class="ind-tag">Presupuesto</div><div class="ind-nombre">Ejecutado</div><div class="ind-metric-row"><span class="ind-metric-label">Monto</span><span class="ind-metric-value money">USD ${program.budget}</span></div><div class="ind-metric-row"><span class="ind-metric-label">Periodo</span><span class="ind-metric-value" style="font-size:12px;">${dataset.rangeLabel}</span></div></div></div>
      <div class="ind-card"><div class="ind-stripe"></div><div class="ind-body"><div class="ind-tag">Participación</div><div class="ind-nombre">Peso dentro del total</div><div class="ind-metric-row"><span class="ind-metric-label">Participación</span><span class="ind-metric-value">${share.toFixed(2)}%</span></div><div class="ind-bar-track"><div class="ind-bar-fill" style="width:${Math.max(share,1)}%;"></div></div></div></div>
      <div class="ind-card"><div class="ind-stripe"></div><div class="ind-body"><div class="ind-tag">Contexto</div><div class="ind-nombre">Total del corte</div><div class="ind-metric-row"><span class="ind-metric-label">Total agregado</span><span class="ind-metric-value money">${dataset.total}</span></div></div></div>
    </div>`;
}

document.addEventListener('click', (e)=>{
  if(e.target && e.target.id === 'tmModalClose') closeTransferInfo();
  if(e.target && e.target.id === 'tmModalBackdrop') closeTransferInfo();
});
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeTransferInfo(); });

// ---------- Indicadores de Protección Social definidos en la matriz ----------
// disponible:true → tiene datos reales en el portal. disponible:false → la ficha técnica existe, pero aún no hay serie/cifra cargada.
const coberturas12 = [
  { n:1, slug:'dii', label:'Cobertura Desarrollo Infantil Integral (DII)', disponible:true, registro:5, icon:'baby' },
  { n:2, slug:'pam', label:'Cobertura Personas Adultas Mayores (PAM)', disponible:true, registro:8, icon:'elders' },
  { n:3, slug:'pcd', label:'Cobertura Personas con Discapacidad (PCD)', disponible:true, registro:7, icon:'careheart' },
  { n:4, slug:'pe', label:'Cobertura Protección Especial (PE)', disponible:true, registro:6, icon:'shield' },
  { n:5, slug:'alertas-suusen', label:'Alertas SUUSEN', disponible:false, registro:16, icon:'doc' },
  { n:6, slug:'movilidad-social', label:'Movilidad Social', disponible:true, registro:12, icon:'movilidad', linkOverride:'cobertura-movilidad-social' }
];

function renderCoberturas12(){
  const grid = document.getElementById('coberturas12Grid');
  if(!grid) return;
  grid.innerHTML = coberturas12.map(c => {
    const m = kpiMetadata[String(c.registro)];
    const statusBadge = c.disponible
      ? '<span class="badge-ok">● Disponible</span>'
      : '<span class="badge-pend">● En construcción</span>';
    return `<div class="tm-card" onclick="nav('${c.linkOverride || ('proteccion-' + c.slug)}')" style="border-top:4px solid var(--azul);">
      <div class="tm-card-top">
        <div class="tm-icon-badge"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">${TRANSFER_ICONS[c.icon] || TRANSFER_ICONS.doc}</svg></div>
        <div class="tm-share-tag">1 indicador</div>
      </div>
      <div class="tm-card-name">${c.n}. ${escHtml(c.label)}</div>
      <div class="tm-card-category" style="color:var(--azul);">Componente · Protección Social e Inclusión Económica</div>
      <div style="font-size:11.5px;color:var(--subtexto);line-height:1.5;margin-top:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escHtml(m ? m.queMide : '')}</div>
      <div class="tm-metric-row" style="margin-top:12px;"><span class="tm-metric-label">Estado</span>${statusBadge}</div>
    </div>`;
  }).join('');
}

// Devuelve un ícono de hombre/mujer (mismas imágenes que ya usa PND) cuando la
// categoría de una fila de caracterización es de sexo/género; si no aplica, no
// agrega nada. Coincide sin distinguir mayúsculas ni acentos (Hombre, HOMBRE,
// MASCULINO, Mujer, FEMENINO, etc.).
function generoIcon(categoria){
  const c = String(categoria || '').toLowerCase();
  if(c.includes('hombre') || c.includes('masculin')){
    return `<img src="../imagenes/hombre.png" alt="" style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin-right:6px;">`;
  }
  if(c.includes('mujer') || c.includes('femenin')){
    return `<img src="../imagenes/mujer.png" alt="" style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin-right:6px;">`;
  }
  return '';
}

function renderCaracterizacionGroup(titulo, items){
  if(!items || !items.length) return '';
  const total = items.reduce((s,i) => s + i.usuarios, 0) || 1;
  const filas = items.map(i => `<tr><td>${generoIcon(i.categoria)}${escHtml(i.categoria)}</td><td>${fmtInt(i.usuarios)}</td><td>${(i.usuarios/total*100).toFixed(1)}%</td></tr>`).join('');
  return `
    <div class="section-lbl" style="margin-top:16px;">${escHtml(titulo)}</div>
    <table class="infog-table"><thead><tr><th>Categoría</th><th>Usuarios</th><th>%</th></tr></thead><tbody>${filas}</tbody></table>`;
}

// ---------- Detalle de una cobertura: Cobertura / Presupuesto / Caracterización / Ficha ----------
let currentCovSlug = null;
let currentCovCoveragePeriod = PERIOD_MAX;

function renderCoberturaDetail(slug){
  currentCovSlug = slug;
  currentCovCoveragePeriod = PERIOD_MAX;
  const c = coberturas12.find(x => x.slug === slug);
  const m = kpiMetadata[String(c.registro)];
  document.getElementById('covTitle').textContent = m ? m.nombre : c.label;
  document.getElementById('covDesc').textContent = m ? m.queMide : '';
  renderCovInfografia(c);
  selectCovTab('cobertura');
}

// Bloque tipo infografía, propio de esta tarjeta (independiente de la infografía
// de KPIs · Movilidad Social, área principal): un vistazo destacado del indicador
// antes de entrar a las pestañas Cobertura/Presupuesto/Caracterización/Ficha.
// Por ahora solo Movilidad Social (registro 12) tiene dato real para mostrar aquí;
// para el resto de coberturas el bloque se oculta.
function renderCovInfografia(c){
  const wrap = document.getElementById('covInfografia');
  if(!wrap) return;

  if(!(String(c.registro) === '12' && CDH_COBERTURA.length)){
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }

  const periodoJulio = cdhAvailablePeriods().find(p => p === PERIOD_MAX) || cdhAvailablePeriods()[cdhAvailablePeriods().length - 1];
  const d = cdhCoverageForPeriod(periodoJulio);
  const modalidad24 = d.porTipo.find(t => /24/.test(t.tipoCredito));
  const pct24 = (modalidad24 && d.montoTotal) ? Math.round(modalidad24.montoTotal / d.montoTotal * 100) : null;
  const ringHtml = pct24 !== null ? `
    <div class="donut-ring" style="--pct:${pct24}; --accent:var(--azul);">
      <div class="donut-ring-inner">
        <div class="donut-ring-value">${pct24}%</div>
        <div class="donut-ring-label">del monto de créditos corresponde a la modalidad de 24 meses</div>
      </div>
    </div>` : '';

  wrap.style.display = '';
  wrap.innerHTML = `
    <div class="infog-card" style="--accent:var(--azul); --accent-light:var(--azul-pale);">
      <div class="infog-watermark"><img src="../imagenes/credito.png" alt=""></div>
      <div class="infog-grid">
        <div class="infog-left">
          <div class="infog-icon-badge"><img src="../imagenes/credito.png" alt=""></div>
          <div class="infog-kicker">Movilidad Social · Panorama destacado</div>
          <div class="infog-title">Créditos de Desarrollo Humano otorgados</div>
          <div class="infog-def-label">Por qué importa</div>
          <div class="infog-def">El Crédito de Desarrollo Humano transforma una transferencia periódica en capital inicial para actividades productivas: entrega un anticipo de hasta 24 cuotas del BDH para financiar emprendimientos, con un máximo de 4 créditos por persona, otorgado a través de la Banca Pública.</div>
        </div>
        <div class="infog-right">
          <div class="infog-highlight-row">
            <div>
              <div class="infog-stat-label">Cifra destacada</div>
              <div class="infog-stat-value">${fmtInt(d.registros)}</div>
              <div style="font-size:11.5px;color:var(--subtexto);margin-top:2px;">créditos otorgados en julio 2026</div>
            </div>
            ${ringHtml}
          </div>
        </div>
      </div>
    </div>`;
}

function selectCovTab(tab){
  ['cobertura','presupuesto','caracterizacion','ficha'].forEach(t => {
    document.getElementById('btn-cov-' + t).classList.toggle('active', t === tab);
  });
  const c = coberturas12.find(x => x.slug === currentCovSlug);
  const m = kpiMetadata[String(c.registro)];
  const el = document.getElementById('covContent');

  if(tab === 'ficha'){
    el.innerHTML = renderKpiFicha(c.registro);
    return;
  }

  if(tab === 'caracterizacion'){
    // Movilidad Social (registro 12, tarjeta 6 de Protección Social): caracterización
    // real por tipo de crédito (12/24 meses), sumada, con desagregación por género,
    // edad, etnia y pobreza. Propia de esta tarjeta; no depende de la infografía de
    // KPIs · Movilidad Social (área principal).
    if(String(c.registro) === '12' && CDH_CARACTERIZACION.length){
      const periodos = cdhAvailablePeriods();
      const periodo = periodos.includes(PERIOD_MAX) ? PERIOD_MAX : periodos[periodos.length - 1];
      const porGrupo = cdhCaracterizacionForPeriod(periodo);
      const aGrupoItems = (obj) => Object.entries(obj || {}).map(([categoria, v]) => ({ categoria, usuarios: v.registros }));
      el.innerHTML = `
        <div class="filter-bar coverage-filter-bar">
          <div class="filter-status">Mostrando: <b>Mes de julio 2026</b> · créditos de 12 y 24 meses</div>
        </div>` +
        renderCaracterizacionGroup('Género', aGrupoItems(porGrupo.genero)) +
        renderCaracterizacionGroup('Rango de edad', aGrupoItems(porGrupo.rango_edad)) +
        renderCaracterizacionGroup('Etnia', aGrupoItems(porGrupo.etnia)) +
        renderCaracterizacionGroup('Condición de pobreza', aGrupoItems(porGrupo.pobreza));
      return;
    }
    const ps = PS_CARACTERIZACION[String(c.registro)];
    if(ps){
      el.innerHTML = `<div class="filter-status" style="margin-bottom:6px;">Corte: <b>${escHtml(ps.corte || '')}</b></div>` +
        renderCaracterizacionGroup('Sexo', ps.sexo) +
        renderCaracterizacionGroup('Rango de edad', ps.rango_edad) +
        renderCaracterizacionGroup('Etnia', ps.etnia) +
        renderCaracterizacionGroup('Pobreza', ps.pobreza_2025);
      return;
    }
    el.innerHTML = `<div class="placeholder-box"><div class="icon">🛠</div><div class="msg">Caracterización en construcción</div><div>Aún no hay resultados de caracterización cargados para este indicador. La ficha técnica declara una desagregación disponible a nivel <strong>${escHtml(m?.desagregacion || 'no especificado')}</strong>.</div></div>`;
    return;
  }

  if(tab === 'presupuesto'){
    el.innerHTML = `
      <div class="toggle-bar">
        <div class="toggle-group">
          <button class="toggle-btn active" id="btn-covpres-gobierno" onclick="selectCovPeriodo('gobierno')">Periodo de gobierno</button>
          <button class="toggle-btn" id="btn-covpres-fiscal" onclick="selectCovPeriodo('fiscal')">Último corte fiscal</button>
        </div>
      </div>
      <div id="covPresupuestoContent"></div>`;
    selectCovPeriodo('gobierno');
    return;
  }

  renderCovCoverageByPeriod(currentCovCoveragePeriod);
}


function renderCovHistoricalSeries(registro){
  // Serie anual: solo el corte de diciembre de cada año (el archivo es mensual)
  const rows = (PS_COBERTURA_HISTORICA[String(registro)] || []).filter(r => r.mes === '12');
  if(!rows.length) return '';

  const maxUsuarios = Math.max(...rows.map(r => r.usuarios), 1);
  const primero = rows[0];
  const ultimo = rows[rows.length - 1];
  const variacion = ultimo.usuarios - primero.usuarios;
  const variacionPct = primero.usuarios ? (variacion / primero.usuarios * 100) : 0;
  const trendClass = variacion >= 0 ? 'infog-trend-up' : 'infog-trend-down';
  const trendArrow = variacion >= 0 ? '↑' : '↓';

  const filas = rows.map(r => {
    const ancho = Math.max(2, r.usuarios / maxUsuarios * 100);
    return `<tr>
      <td style="width:70px;font-weight:700;">${r.anio}</td>
      <td class="num" style="width:120px;font-weight:700;">${fmtInt(r.usuarios)}</td>
      <td>
        <div class="ind-bar-track" style="margin-top:0;height:8px;">
          <div class="ind-bar-fill" style="width:${ancho.toFixed(1)}%;background:var(--azul);"></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="section-lbl" style="margin-top:24px;">Serie histórica</div>
    <div class="ind-card">
      <div class="ind-stripe" style="background:var(--azul);"></div>
      <div class="ind-body">
        <div class="ind-tag">Corte a diciembre de cada año</div>
        <div class="ind-nombre">Usuarios atendidos · ${primero.anio}–${ultimo.anio}</div>
        <div class="ind-metric-row"><span class="ind-metric-label">${primero.anio}</span><span class="ind-metric-value">${fmtInt(primero.usuarios)}</span></div>
        <div class="ind-metric-row"><span class="ind-metric-label">${ultimo.anio}</span><span class="ind-metric-value money">${fmtInt(ultimo.usuarios)}</span></div>
        <div class="infog-trend ${trendClass}">${trendArrow} ${Math.abs(variacionPct).toFixed(1)}% entre ${primero.anio} y ${ultimo.anio}</div>
        <table class="infog-table" style="margin-top:16px;">
          <thead><tr><th>Año</th><th>Usuarios</th><th>Magnitud relativa de la serie</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
        <div class="pres-note" style="margin-top:10px;">La serie histórica muestra el número de usuarios atendidos al corte de diciembre de cada año. Cada valor corresponde únicamente a ese corte anual y no representa un acumulado entre años. El último corte mensual se presenta arriba y no se incorpora a esta comparación anual.</div>
      </div>
    </div>`;
}

function renderCovCoverageByPeriod(period){
  const c = coberturas12.find(x => x.slug === currentCovSlug);
  const m = c ? kpiMetadata[String(c.registro)] : null;
  const el = document.getElementById('covContent');
  if(!el || !c) return;

  // Movilidad Social (tarjeta 6 de Protección Social, registro 12): dato real mensual
  // propio de esta tarjeta, proveniente de cobertura_cdh_movilidad.csv, con su propia
  // estructura (por tipo de crédito). Independiente de la infografía de KPIs ·
  // Movilidad Social (área principal): no se enlazan entre sí.
  if(String(c.registro) === '12' && CDH_COBERTURA.length){
    const periodoJulio = cdhAvailablePeriods().find(p => p === PERIOD_MAX) || cdhAvailablePeriods()[cdhAvailablePeriods().length - 1];
    currentCovCoveragePeriod = periodoJulio;
    const d = cdhCoverageForPeriod(periodoJulio);
    const filasTipo = d.porTipo.map(t => `<tr><td>${escHtml(t.tipoCredito)}</td><td>${fmtInt(t.registros)}</td><td>USD ${fmtMoneyM(t.montoTotal/1e6)}</td><td>USD ${t.montoPromedio.toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>`).join('');
    el.innerHTML = `
      <div class="filter-bar coverage-filter-bar">
        <div class="filter-status">Mostrando: <b>Mes de julio 2026</b> · dato </div>
      </div>
      <div class="ind-card">
        <div class="ind-stripe" style="background:var(--azul);"></div>
        <div class="ind-body">
          <div class="ind-tag">Dato · corte mensual</div>
          <div class="ind-nombre">Créditos otorgados</div>
          <div class="ind-metric-row"><span class="ind-metric-label">Total registros</span><span class="ind-metric-value money">${fmtInt(d.registros)}</span></div>
          <div class="ind-metric-row"><span class="ind-metric-label">Monto total</span><span class="ind-metric-value money">USD ${fmtMoneyM(d.montoTotal/1e6)}</span></div>
        </div>
      </div>
      <table class="infog-table" style="margin-top:14px;"><thead><tr><th>Tipo de crédito</th><th>Registros</th><th>Monto total</th><th>Monto promedio</th></tr></thead><tbody>${filasTipo}</tbody></table>
      <div class="pres-note" style="margin-top:10px;"> </div>`;
    return;
  }

  const ps = PS_CARACTERIZACION[String(c.registro)];
  if(ps){
    const serieHistorica = renderCovHistoricalSeries(c.registro);
    el.innerHTML = `
      <div class="filter-status" style="margin-bottom:14px;">Último corte disponible: <b>${escHtml(ps.corte || '')}</b>. La serie histórica anual se muestra debajo.</div>
      <div class="ind-card">
        <div class="ind-stripe" style="background:var(--azul);"></div>
        <div class="ind-body">
          <div class="ind-tag">Corte ${escHtml(ps.corte || '')}</div>
          <div class="ind-nombre">${escHtml(m ? m.nombre : c.label)}</div>
          <div class="ind-metric-row"><span class="ind-metric-label">Usuarios atendidos</span><span class="ind-metric-value money">${fmtInt(ps.total)}</span></div>
        </div>
      </div>
      ${serieHistorica}`;
    return;
  }

  currentCovCoveragePeriod = (/^\d{4}-\d{2}$/.test(String(period || ''))) ? String(period) : PERIOD_MAX;
  const cut = coveragePeriodLabel(currentCovCoveragePeriod);
  el.innerHTML = renderCoveragePeriodFilter('covDetail', currentCovCoveragePeriod, 'renderCovCoverageByPeriod') +
    `<div class="placeholder-box"><div class="icon">🛠</div><div class="msg">Cobertura en construcción</div><div>Corte seleccionado: <strong>acumulado a ${cut}</strong>. ${m ? 'La ficha del indicador está disponible, pero' : 'Actualmente'} aún no se ha cargado la serie de cobertura por mes.</div></div>`;
}

function selectCovPeriodo(periodo){
  const el = document.getElementById('covPresupuestoContent');
  if(!el) return;
  const c = coberturas12.find(x => x.slug === currentCovSlug);
  const bg = document.getElementById('btn-covpres-gobierno');
  const bf = document.getElementById('btn-covpres-fiscal');
  if(bg) bg.classList.toggle('active', periodo === 'gobierno');
  if(bf) bf.classList.toggle('active', periodo === 'fiscal');

  // Movilidad Social (tarjeta 6 de Protección Social, registro 12): el monto ejecutado
  // real ya viene en CDH_COBERTURA (columna monto_total del Excel de cobertura,
  // enero-julio 2026), propio de esta tarjeta. Como todavía no hay datos anteriores a
  // 2026, "periodo de gobierno" y "año fiscal" muestran el mismo total por ahora.
  if(c && String(c.registro) === '12' && CDH_COBERTURA.length){
    const periodoJulio = cdhAvailablePeriods().includes(PERIOD_MAX) ? PERIOD_MAX : cdhAvailablePeriods()[cdhAvailablePeriods().length - 1];
    const montoJulio = cdhCoverageForPeriod(periodoJulio).montoTotal;
    const rango = periodo === 'fiscal' ? 'Año fiscal 2026 · mes de julio' : 'Periodo de gobierno · mes de julio';
    el.innerHTML = `
      <div class="ind-card">
        <div class="ind-stripe" style="background:var(--verde);"></div>
        <div class="ind-body">
          <div class="ind-tag">Monto ejecutado</div>
          <div class="ind-nombre">${escHtml(rango)}</div>
          <div class="ind-metric-row"><span class="ind-metric-label">Presupuesto ejecutado</span><span class="ind-metric-value money">USD ${fmtMoneyM(montoJulio/1e6)}</span></div>
        </div>
      </div>
      <div class="pres-note" style="margin-top:10px;">Créditos otorgados (12 y 24 meses) en julio 2026.</div>`;
    return;
  }

  const pres = c ? PS_PRESUPUESTO[String(c.registro)] : null;

  if(pres){
    const isFiscal = periodo === 'fiscal';
    const value = isFiscal ? pres.fiscal : pres.gobierno;
    const title = isFiscal ? 'Julio 2026' : 'Periodo disponible 2023–julio 2026';
    el.innerHTML = `
      <div class="ind-card">
        <div class="ind-stripe" style="background:var(--verde);"></div>
        <div class="ind-body">
          <div class="ind-tag">Presupuesto ejecutado</div>
          <div class="ind-nombre">${title}</div>
          <div class="ind-metric-row"><span class="ind-metric-label">Presupuesto</span><span class="ind-metric-value money">USD ${fmtMoneyM(value)}</span></div>
        </div>
      </div>`;
    return;
  }

  el.innerHTML = `<div class="placeholder-box"><div class="icon">🛠</div><div class="msg">Presupuesto en construcción</div><div>Aún no hay información presupuestaria cargada para este indicador.</div></div>`;
}

// ---------- Sub-ítems pendientes de cada área (Trabajo, Pueblos, Incentivos Temporales) ----------
const itemLists = {
  'kpis-trabajo': {
    eyebrow:'KPIs · Trabajo', title:'Trabajo',
    desc:'Selecciona el componente que quieres consultar.',
    items:[
      { name:kpiMetadata['1'].nombre, href:'kpi_jubilados.html', badge:'● Disponible', sub:'Expedientes y montos 2023 – agosto 2026 · sexo, régimen y provincia' },
      { name:'Contratos', badge:'● En construcción' }
    ]
  },
  'trabajo-contratos': {
    eyebrow:'KPIs · Trabajo · Contratos', title:'Contratos',
    desc:'Indicador asociado a este componente.',
    items:[{ name:kpiMetadata['2'].nombre, badge:'● En construcción' }]
  },
  'kpis-pueblos': {
    eyebrow:'KPIs · Pueblos y Nacionalidades', title:'Pueblos y Nacionalidades',
    desc:'Indicadores con seguimiento mensual (formato de seguimiento de KPI MTDH).',
    items:[
      { name:'Fortalecimiento de la Economía Comunitaria y Productiva de Pueblos y Nacionalidades', badge:'● Cargando…' },
      { name:'Número de convenios de financiamiento no reembolsable suscritos para el fortalecimiento de la economía de comunas, comunidades y organizaciones de pueblos y nacionalidades', badge:'● Cargando…' }
    ]
  },
  'kpis-incentivos': {
    eyebrow:'KPIs · Incentivos Temporales', title:'Incentivos Temporales',
    desc:'Componentes previstos para esta área. Aún no hay indicadores de la matriz asociados.',
    items:[
      { name:'Jóvenes en Acción' },
      { name:'Compensación de combustible' },
      { name:'Migrantes retornados' }
    ]
  }
};

// Cada cobertura de Protección Social es un componente ya establecido.
// El indicador de la matriz vive dentro de ese componente. Movilidad Social
// (linkOverride) queda fuera: su tarjeta enlaza directo a la infografía de KPIs.
coberturas12.forEach(c => {
  if(c.linkOverride) return;
  itemLists['proteccion-' + c.slug] = {
    eyebrow:'KPIs · Protección Social e Inclusión Económica · ' + c.label,
    title:c.label,
    desc:'Indicador asociado a este componente.',
    items:[{ name:kpiMetadata[String(c.registro)].nombre, registro:c.registro, route:'cobertura-' + c.slug }]
  };
});

// ---------- Presupuesto: Periodo de gobierno / Año fiscal ----------
function renderItemList(route){
  const d = itemLists[route];
  document.getElementById('itemsEyebrow').textContent = d.eyebrow;
  document.getElementById('itemsTitle').textContent = d.title;
  document.getElementById('itemsDesc').textContent = d.desc || 'Selecciona un elemento para continuar.';
  document.getElementById('itemsGrid').innerHTML = d.items.map(item => {
    const clickable = !!item.route || !!item.href;
    const click = item.href ? `onclick="location.href='${item.href}'"` : (item.route ? `onclick="nav('${item.route}')"` : '');
    let shareTag;
    if(item.badge){
      shareTag = escHtml(item.badge.replace('● ',''));
    } else if(item.registro){
      shareTag = 'Indicador';
    } else {
      shareTag = 'En construcción';
    }
    const isIndicator = !!item.registro || (!item.route && !item.badge);
    const infoButton = item.registro
      ? `<button class="tm-info-btn" type="button" onclick="event.stopPropagation(); openIndicatorInfoByRegistro('${item.registro}', '${String(item.name).replace(/'/g, "&#39;")}');" aria-label="Información del indicador">i</button>`
      : (isIndicator ? `<button class="tm-info-btn" type="button" onclick="event.stopPropagation(); openIndicatorInfoPlaceholder('${String(item.name).replace(/'/g, "&#39;")}');" aria-label="Información del indicador">i</button>` : '');
    const active = clickable || !!item.registro;
    const borderColor = active ? 'var(--azul)' : 'var(--gris-bd)';
    const iconBg = active ? 'var(--azul-pale)' : 'var(--gris)';
    return `<div class="tm-card" ${click} style="border-top:4px solid ${borderColor};${clickable ? '' : ' cursor:default;'}">
      <div class="tm-card-top">
        <div class="tm-icon-badge" style="background:${iconBg};"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">${TRANSFER_ICONS.doc}</svg></div>
        <div class="tm-share-tag">${shareTag}</div>
      </div>
      ${infoButton}
      <div class="tm-card-name">${escHtml(item.name)}</div>
      ${item.sub ? `<div style="font-size:12px;color:var(--subtexto);margin-top:6px;">${escHtml(item.sub)}</div>` : ''}
    </div>`;
  }).join('');

  const infogWrap = document.getElementById('itemsInfografiaWrap');
  const infogLbl = document.getElementById('itemsInfografiaLbl');
  const isAreaLanding = typeof AREA_INFOG_ROUTES !== 'undefined' && AREA_INFOG_ROUTES[route];
  if(infogWrap){ infogWrap.style.display = isAreaLanding ? '' : 'none'; }
  if(infogLbl){ infogLbl.style.display = isAreaLanding ? '' : 'none'; }
  if(isAreaLanding && typeof renderAreaInfografia === 'function'){ renderAreaInfografia(route); }
}

// ---------- KPIs: 5 áreas directas (sin Institucional/Estratégico) ----------
const ICONS = {
  familia: '<circle cx="8" cy="7" r="2.5"/><circle cx="16" cy="7" r="2.5"/><circle cx="12" cy="12.5" r="2"/><path d="M3.5 20c0-3.3 2-5.5 4.5-5.5 1.3 0 2.4.6 3.2 1.6"/><path d="M20.5 20c0-3.3-2-5.5-4.5-5.5-1.3 0-2.4.6-3.2 1.6"/><path d="M8.5 20c.3-2.2 1.7-3.6 3.5-3.6s3.2 1.4 3.5 3.6"/>',
  movilidadArea: '<path d="M4 20l6-6 4 3 7-9"/><path d="M17 6h4v4"/>',
  trabajo: '<path d="M4 15a8 8 0 0 1 16 0"/><rect x="2.5" y="15" width="19" height="2.6" rx="1.2"/><path d="M12 8V5"/><path d="M9 5h6"/><path d="M16.5 19l3.5 3.5M18.7 16.3a2.6 2.6 0 1 1-2.6 2.6"/>',
  pueblos: '<circle cx="12" cy="6" r="2.2"/><circle cx="6" cy="17" r="2.2"/><circle cx="18" cy="17" r="2.2"/><path d="M12 8.2V13M12 13l-4.4 2.3M12 13l4.4 2.3"/>',
  incentivos: '<circle cx="12" cy="13" r="7"/><path d="M12 9v4l3 2"/><path d="M9 3h6M12 3v2"/>'
};

const kpisAreas = [
  { key:'proteccion-social', label:'Protección Social e Inclusión Económica', icon:'familia', disponible:true, desc:'Servicios de desarrollo infantil, movilidad social, personas adultas mayores, discapacidad, protección especial y alertas SUUSEN.', route:'kpis-proteccion-social' },
  { key:'trabajo', label:'Trabajo', icon:'trabajo', disponible:true, desc:'Compensación jubilar de exservidores y extrabajadores; contratos (en construcción).', route:'kpis-trabajo' },
  { key:'pueblos', label:'Pueblos y Nacionalidades', icon:'pueblos', disponible:true, desc:'Economía comunitaria y productiva, y convenios de financiamiento no reembolsable.', route:'kpis-pueblos' },
  { key:'incentivos', label:'Incentivos Temporales', icon:'incentivos', disponible:false, desc:'Jóvenes en acción, compensación de combustible, migrantes retornados.', route:'kpis-incentivos' }
];

function renderKpisAreas(){
  const grid = document.getElementById('kpisAreaGrid');
  if(!grid) return;
  grid.innerHTML = kpisAreas.map(a => {
    const badge = a.disponible
      ? '<span class="badge-ok">● Disponible</span>'
      : (a.ficha ? '<span class="badge-pend">● Fichas disponibles</span>' : '<span class="badge-pend">● En construcción</span>');
    const image = (typeof AREA_IMAGE !== 'undefined') ? AREA_IMAGE[a.route] : null;
    const iconHtml = image
      ? `<img src="${image}" alt="${escHtml(a.label)}">`
      : `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">${ICONS[a.icon]}</svg>`;
    return `<a class="opt-card" href="#/${a.route}">
      <div class="opt-icon">${iconHtml}</div>
      <div class="opt-title">${a.label}</div>
      <div class="opt-desc">${a.desc}</div>
      <div class="opt-footer">${badge}<span class="opt-arrow">→</span></div>
    </a>`;
  }).join('');
}

// ---------- Menú global (mega-nav) ----------
function toggleMega(name){
  const dd = document.getElementById('mega-' + name);
  const isOpen = dd.classList.contains('open');
  document.querySelectorAll('.mega-dropdown').forEach(d => d.classList.remove('open'));
  if(!isOpen) dd.classList.add('open');
}
function closeMegaMenus(){
  document.querySelectorAll('.mega-dropdown').forEach(d => d.classList.remove('open'));
}
document.addEventListener('click', (e) => {
  if(!e.target.closest('.mega-item-wrap')) closeMegaMenus();
});


// ---------- Navegación entre módulos (multi-archivo, multi-carpeta) ----------
// Cada módulo (index.html, pnd.html, transferencias.html, kpis.html,
// presupuesto.html) define su propio objeto `routes` (solo con las rutas
// que existen en ese archivo) y una constante DEFAULT_ROUTE.
// index.html vive en la raíz del sitio; pnd.html, transferencias.html,
// kpis.html y presupuesto.html viven en la carpeta MDTDH/. Cada página
// define, antes de que corra este script, dos constantes con la ruta
// relativa necesaria para llegar a la otra ubicación:
//   ROOT_PREFIX  -> cómo llegar a index.html desde la página actual
//   MDTDH_PREFIX -> cómo llegar a la carpeta MDTDH/ desde la página actual
// nav() decide si la ruta pedida vive en el archivo actual (navegación
// por hash, sin recargar) o en otro módulo (navegación de página completa,
// usando el prefijo correcto según dónde esté físicamente cada archivo).
const CROSS_FILE_ROUTES = {
  'inicio': { file: 'index.html', base: 'root' },
  'pnd': { file: 'pnd.html', base: 'mdtdh' },
  'pnd-trabajo': { file: 'pnd.html', base: 'mdtdh' },
  'pnd-trabajo-brecha-salarial': { file: 'pnd.html', base: 'mdtdh' },
  'pnd-trabajo-desempleo': { file: 'pnd.html', base: 'mdtdh' },
  'pnd-trabajo-trabajo-infantil': { file: 'pnd.html', base: 'mdtdh' },
  'pnd-trabajo-empleo-adecuado': { file: 'pnd.html', base: 'mdtdh' },
  'pnd-trabajo-percepcion-calidad': { file: 'pnd.html', base: 'mdtdh' },
  'pnd-trabajo-informal': { file: 'pnd.html', base: 'mdtdh' },
  'transferencias': { file: 'transferencias.html', base: 'mdtdh' },
  'kpis': { file: 'kpis.html', base: 'mdtdh' },
  'kpis-proteccion-social': { file: 'kpis.html', base: 'mdtdh' },
  'kpis-trabajo': { file: 'kpis.html', base: 'mdtdh' },
  'kpis-pueblos': { file: 'kpis.html', base: 'mdtdh' },
  'kpis-incentivos': { file: 'kpis.html', base: 'mdtdh' },
  'presupuesto': { file: 'presupuesto.html', base: 'mdtdh' },
  'presupuesto-gobierno': { file: 'presupuesto.html', base: 'mdtdh' },
  'presupuesto-fiscal': { file: 'presupuesto.html', base: 'mdtdh' },
  'documentacion': { file: 'documentacion.html', base: 'mdtdh' }
};

function nav(route){
  if(typeof routes !== 'undefined' && routes && routes[route]){
    window.location.hash = '#/' + route;
    return;
  }
  const entry = CROSS_FILE_ROUTES[route];
  const rootPrefix = (typeof ROOT_PREFIX !== 'undefined') ? ROOT_PREFIX : '';
  const mdtdhPrefix = (typeof MDTDH_PREFIX !== 'undefined') ? MDTDH_PREFIX : '';
  if(!entry){
    window.location.href = rootPrefix + 'index.html' + '#/' + route;
    return;
  }
  const prefix = entry.base === 'root' ? rootPrefix : mdtdhPrefix;
  window.location.href = prefix + entry.file + '#/' + route;
}

function renderBreadcrumb(route){
  const r = routes[route];
  const bc = document.getElementById('breadcrumb');
  if(!bc) return;
  if(!r){ bc.innerHTML = ''; return; }
  let html = r.crumbs.map(([key,label]) => `<a onclick="nav('${key}')">${label}</a><span class="bc-sep">›</span>`).join('');
  html += `<span class="bc-current">${r.title}</span>`;
  bc.innerHTML = html;
}

function renderRoute(){
  let route = (window.location.hash || ('#/' + DEFAULT_ROUTE)).replace('#/', '');
  if(!routes[route]) route = DEFAULT_ROUTE;
  const r = routes[route];

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  let pageId = 'page-' + route;
  if(r.items){ pageId = 'page-generic-items'; }
  if(r.coberturaDetail){ pageId = 'page-cobertura-detail'; }
  if(r.transferDetail){ pageId = 'page-transferencia-detail'; }
  if(r.kpiDetail){ pageId = 'page-kpi-detail'; }
  if(r.presupuestoTab){ pageId = 'page-presupuesto'; }

  const page = document.getElementById(pageId);
  if(page) page.classList.add('active');
  const badge = document.getElementById('headerBadge');
  if(badge) badge.textContent = r.title;
  renderBreadcrumb(route);
  closeMegaMenus();
  window.scrollTo(0,0);
  if(typeof initSidebar === 'function' && document.getElementById('app-sidebar-mount')){
    initSidebar({ activeId: route, basePath: SIDEBAR_BASE_PATH });
  }

  if(r.items){ renderItemList(route); }
  if(r.coberturas12){
    renderCoberturas12();
    if(typeof renderAreaInfografia === 'function') renderAreaInfografia('kpis-proteccion-social');
  }
  if(r.coberturaDetail){ renderCoberturaDetail(r.coberturaDetail); }
  if(r.transferDetail){ renderTransferDetail(r.transferDetail); }
  if(r.kpiDetail){ renderKpiDetail(r.kpiDetail, r.area); }
  if(route === 'kpis'){ renderKpisAreas(); }
  if(r.presupuestoTab){ selectPresupuestoTab(r.presupuestoTab); }
  if(route === 'transferencias'){ if(!transferFilterInitialized) resetTransferDateFilter(); }
}

window.addEventListener('hashchange', renderRoute);

// ============================================================
// FRANJA DE NAVEGACIÓN (sidebar) — fuente única de verdad
// Usada por TODAS las páginas del ecosistema (portal, MDTDH,
// ENEMDU, PND). Cada página solo necesita:
//   1) enlazar shared.css y shared.js
//   2) tener <div id="app-sidebar-mount"></div>
//   3) llamar a initSidebar({ activeId: 'inicio', basePath: '' })
// ============================================================

const SIDEBAR_NAV = [
  { id: 'inicio', label: 'Inicio', href: 'index.html',
    icon: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>' },
  { id: 'pnd', label: 'Plan Nacional de Desarrollo', icon: '<path d="M4 19h16"/><path d="M7 19V9M12 19V5M17 19v-7"/>',
    children: [
      { id: 'pnd-proteccion', label: 'Protección Social e Inclusión Económica',
        children: [
          { id: 'pnd-proteccion', label: 'Todos los indicadores', href: 'index_PND.html' },
          { id: 'pnd-pobreza-extrema', label: 'Pobreza extrema por ingresos', href: 'PND/pobreza_extrema.html' },
          { id: 'pnd-tpm', label: 'Pobreza multidimensional (TPM)', href: 'PND/tpm.html' },
          { id: 'pnd-usuarios-proteccion', label: 'Usuarios de protección social en pobreza', href: 'PND/proteccion_social.html' },
          { id: 'pnd-primera-infancia', label: 'Primera infancia', href: 'PND/primera_infancia.html' },
          { id: 'pnd-dci', label: 'Desnutrición crónica infantil', href: 'PND/dci.html' },
          { id: 'pnd-gerontologicos', label: 'Servicios gerontológicos', href: 'PND/gerontologicos.html' }
        ] },
      { id: 'pnd-trabajo', label: 'Trabajo y Oportunidades',
        children: [
          { id: 'pnd-trabajo', label: 'Todos los indicadores', href: 'MDTDH/pnd.html#/pnd-trabajo' },
          { id: 'pnd-trabajo-brecha-salarial', label: 'Brecha salarial', href: 'PND/indicador.html?id=brecha-salarial' },
          { id: 'pnd-trabajo-desempleo-juvenil', label: 'Desempleo juvenil (18 a 29 años)', href: 'PND/indicador.html?id=desempleo-juvenil' },
          { id: 'pnd-trabajo-empleo-adecuado', label: 'Empleo adecuado (15 años y más)', href: 'PND/indicador.html?id=empleo-adecuado' },
          { id: 'pnd-trabajo-trabajo-infantil', label: 'Trabajo infantil (5 a 14 años)', href: 'PND/indicador.html?id=trabajo-infantil' },
          { id: 'pnd-trabajo-percepcion-calidad', label: 'Percepción de la calidad de los servicios públicos', href: 'PND/indicador.html?id=percepcion-calidad' },
          { id: 'pnd-enemdu', label: 'ENEMDU', href: 'index_ENEMDU.html' }
        ] }
    ] },
  { id: 'transferencias', label: 'Transferencias no contributivas', href: 'MDTDH/transferencias.html',
    icon: '<path d="M17 8l4 4-4 4"/><path d="M3 12h18"/><path d="M7 16l-4-4 4-4"/>' },
  { id: 'kpis', label: 'KPIs', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    children: [
      { id: 'kpis-proteccion-social', label: 'Protección Social e Inclusión Económica', href: 'MDTDH/kpis.html#/kpis-proteccion-social' },
      { id: 'kpis-trabajo', label: 'Trabajo', href: 'MDTDH/kpis.html#/kpis-trabajo' },
      { id: 'kpis-pueblos', label: 'Pueblos y Nacionalidades', href: 'MDTDH/kpis.html#/kpis-pueblos' },
      { id: 'kpis-incentivos', label: 'Incentivos Temporales', href: 'MDTDH/kpis.html#/kpis-incentivos' }
    ] },
  { id: 'presupuesto', label: 'Presupuesto', icon: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="8" cy="14.5" r="1.2"/>',
    children: [
      { id: 'presupuesto-gobierno', label: 'Periodo de gobierno', href: 'MDTDH/presupuesto.html#/presupuesto-gobierno' },
      { id: 'presupuesto-fiscal', label: 'Año fiscal', href: 'MDTDH/presupuesto.html#/presupuesto-fiscal' }
    ] },
  { id: 'documentacion', label: 'Documentación', href: 'MDTDH/documentacion.html',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>' }
];

// Prefijo relativo hacia la raíz del sitio, recordado por si otra rutina
// (como renderRoute) necesita re-pintar el sidebar tras el primer initSidebar().
let SIDEBAR_BASE_PATH = '';

// ¿El item (o alguno de sus descendientes, a cualquier profundidad) es el activo?
function sidebarItemContainsActive(item, activeId){
  if(item.id === activeId) return true;
  if(item.children) return item.children.some(c => sidebarItemContainsActive(c, activeId));
  return false;
}

// Nivel 2+ dentro de un desplegable del menú superior: un hijo puede ser un
// enlace simple o, si tiene children propios (ej. "Protección Social e
// Inclusión Económica" con sus 6 indicadores), un grupo con encabezado propio
// dentro del mismo desplegable (todo visible de una vez, sin un segundo clic).
function renderMegaChild(child, activeId, basePath){
  if(child.children && child.children.length){
    const subHtml = child.children.map(g => renderMegaChild(g, activeId, basePath)).join('');
    return `
      <div class="mega-dropdown-group">
        <div class="mega-dropdown-heading">${child.label}</div>
        ${subHtml}
      </div>
    `;
  }
  return `<a class="${child.id === activeId ? 'active' : ''}" href="${basePath}${child.href}" onclick="closeMegaMenus()">${child.label}</a>`;
}

/**
 * Inyecta el menú de navegación horizontal (arriba, debajo del encabezado)
 * en #app-sidebar-mount. Usa la misma estructura de datos (SIDEBAR_NAV) que
 * antes alimentaba el sidebar lateral, así que el contenido/orden del menú
 * no cambia — solo su ubicación y presentación.
 * @param {Object} opts
 * @param {string} opts.activeId   id del ítem (o sub-ítem) activo en esta página
 * @param {string} opts.basePath   prefijo relativo hacia la raíz del sitio
 *                                 (ej. '' en index.html, '../' en ENEMDU/PND/*.html)
 */
function initSidebar(opts) {
  const activeId = (opts && opts.activeId) || '';
  const basePath = (opts && opts.basePath) || '';
  SIDEBAR_BASE_PATH = basePath;
  const mount = document.getElementById('app-sidebar-mount');
  if (!mount) return;

  const itemsHtml = SIDEBAR_NAV.map(item => {
    if (item.children) {
      const activeClass = sidebarItemContainsActive(item, activeId) ? ' active' : '';
      const groupHtml = item.children.map(c => renderMegaChild(c, activeId, basePath)).join('');
      // Si los hijos a su vez tienen sub-hijos (ej. PND: cada área trae sus propios
      // indicadores), el desplegable pasa a mostrarse en columnas —una por grupo—
      // en vez de una sola lista angosta donde los textos largos se amontonan.
      const hasGroups = item.children.some(c => c.children && c.children.length);
      const dropdownClass = hasGroups ? 'mega-dropdown mega-dropdown-columns' : 'mega-dropdown';
      return `
        <div class="mega-item-wrap">
          <button type="button" class="mega-item${activeClass}" onclick="toggleMega('${item.id}')">${item.label} <span class="mega-caret">▾</span></button>
          <div class="${dropdownClass}" id="mega-${item.id}">${groupHtml}</div>
        </div>
      `;
    }
    return `<a class="mega-item${item.id === activeId ? ' active' : ''}" href="${basePath}${item.href}">${item.label}</a>`;
  }).join('');

  // Si ya existe un menú de una llamada anterior (p. ej. al cambiar de ruta
  // dentro de la misma página), se quita primero para no terminar con dos.
  const previousNav = document.getElementById('appTopNav');
  if (previousNav) previousNav.remove();

  mount.innerHTML = `
    <nav class="mega-nav" id="appTopNav">
      <div class="mega-nav-inner">${itemsHtml}</div>
    </nav>
  `;

  // El menú se arma como <nav> aparte para poder insertarlo justo después del
  // encabezado de cada página (sin importar en qué parte del <body> esté el
  // mount original), y que quede "sticky" pegado debajo de él en todas las
  // páginas sin tener que tocar el HTML de cada archivo una por una.
  const navEl = mount.querySelector('#appTopNav');
  const headerEl = document.querySelector('.header, .tpm-header, .ind-header');
  if (navEl && headerEl && headerEl.parentNode) {
    headerEl.parentNode.insertBefore(navEl, headerEl.nextSibling);
  }

  document.body.classList.add('has-sidebar');

  // Reglas de layout inyectadas al final del <head>: siempre ganan,
  // sin importar qué !important traiga el CSS propio de la página, y
  // anulan el margin-left que algunas páginas todavía traen localmente
  // para el sidebar (ya no aplica: el menú ahora va arriba, no al lado).
  if (!document.getElementById('app-sidebar-layout-style')) {
    const style = document.createElement('style');
    style.id = 'app-sidebar-layout-style';
    style.textContent = `
      body.has-sidebar { margin-left: 0 !important; }
      body.has-sidebar .dashboard-footer { left: 0 !important; width: 100% !important; }
    `;
    document.head.appendChild(style);
  }
}
