/* ═══════════════════════════════════════════════════════════════
   ecuador-map.js
   Módulo reutilizable: mapa coroplético de Ecuador (continente +
   recuadro de Galápagos aparte) para los dashboards del PND.
   Requiere: Leaflet ya cargado y una variable global EC_GEOJSON
   (ver geojson_js.js) con el geojson de las 24 provincias.
   ═══════════════════════════════════════════════════════════════ */

function _ecmapNormaliza(s){
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
}
function _ecmapHexToRgb(h){ h=h.replace('#',''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
function _ecmapRgbToHex(r,g,b){ return '#'+[r,g,b].map(x=>Math.round(x).toString(16).padStart(2,'0')).join(''); }
function _ecmapInterpola(c1,c2,t){
  const a=_ecmapHexToRgb(c1), b=_ecmapHexToRgb(c2);
  return _ecmapRgbToHex(a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t);
}

/**
 * Crea una instancia de mapa de Ecuador (continente + inset Galápagos).
 * cfg:
 *   mapId, galId   : ids de los <div> contenedores (continente / Galápagos)
 *   overrides      : { 'NOMBRE_GEOJSON_NORMALIZADO': 'Nombre real en tus datos' }
 *   onSelect(prov, fila) : callback al hacer clic en una provincia
 * Devuelve: { render(data, colorHex), highlight(prov), clearHighlight() }
 *   data: [{ p, value, cvAlto?, tooltip? }]
 */
function crearMapaEcuador(cfg){
  const overrides = cfg.overrides || {};
  let nameByNorm = {};
  let filaActual = {};
  let provLayers = {}, provGroupGetter = {}, provSeleccionada = null;
  let geoLayer, geoLayerGal;

  const map = L.map(cfg.mapId, { zoomControl:true, scrollWheelZoom:false, minZoom:5.5, maxZoom:9 });
  const mapGal = L.map(cfg.galId, {
    zoomControl:false, attributionControl:false, dragging:false,
    scrollWheelZoom:false, doubleClickZoom:false, boxZoom:false,
    keyboard:false, touchZoom:false, tap:false
  });

  function resolver(nombreGeo){
    const n = _ecmapNormaliza(nombreGeo);
    if (overrides[n]) return overrides[n];
    return nameByNorm[n] || null;
  }

  function estiloFeature(feature, maxV, colorHex){
    const prov = resolver(feature.properties.nombre);
    const fila = prov ? filaActual[prov] : null;
    const t = (fila && maxV>0) ? Math.max(fila.value,0)/maxV : 0;
    const opacidad = fila ? (fila.cvAlto ? 0.55 : 0.92) : 0.8;
    return {
      // Provincia sin dato para este período/indicador: gris sólido y bien visible
      // (no "casi transparente"), con borde punteado para distinguirlo de un valor real bajo.
      fillColor: fila ? _ecmapInterpola('#F5F6F8', colorHex, Math.sqrt(t)) : '#C7CDD9',
      weight: 1, color: '#FFFFFF', fillOpacity: opacidad,
      dashArray: fila ? null : '3,3'
    };
  }

  function crearCapa(mapObj, features, maxV, colorHex){
    let capa;
    capa = L.geoJSON({ type:'FeatureCollection', features }, {
      style: f => estiloFeature(f, maxV, colorHex),
      onEachFeature: (feature, layer) => {
        const prov = resolver(feature.properties.nombre);
        if (!prov) return;
        provLayers[prov] = layer;
        provGroupGetter[prov] = () => capa;
        const fila = filaActual[prov];
        const tip = fila ? `<b>${prov}</b><br>${fila.tooltip || ''}` : `<b>${prov}</b><br>Sin dato en este período`;
        layer.bindTooltip(tip, { sticky:true, className:'prov-tooltip' });
        layer.on('mouseover', () => { if (prov !== provSeleccionada) layer.setStyle({ weight:2, color:'#1A3A8F' }); });
        layer.on('mouseout',  () => { if (prov !== provSeleccionada) capa.resetStyle(layer); });
        layer.on('click', () => {
          highlight(prov);
          if (cfg.onSelect) cfg.onSelect(prov, filaActual[prov] || null);
        });
      }
    }).addTo(mapObj);
    return capa;
  }

  function highlight(prov){
    if (provSeleccionada && provLayers[provSeleccionada] && provGroupGetter[provSeleccionada]) {
      provGroupGetter[provSeleccionada]().resetStyle(provLayers[provSeleccionada]);
    }
    provSeleccionada = prov;
    const layer = provLayers[prov];
    if (layer){
      layer.setStyle({ weight:3.5, color:'#F1B620', fillOpacity:1 });
      layer.bringToFront();
    }
  }

  function clearHighlight(){
    if (provSeleccionada && provLayers[provSeleccionada] && provGroupGetter[provSeleccionada]) {
      provGroupGetter[provSeleccionada]().resetStyle(provLayers[provSeleccionada]);
    }
    provSeleccionada = null;
  }

  function render(data, colorHex){
    nameByNorm = {};
    filaActual = {};
    data.forEach(d => { nameByNorm[_ecmapNormaliza(d.p)] = d.p; filaActual[d.p] = d; });

    if (geoLayer) map.removeLayer(geoLayer);
    if (geoLayerGal) mapGal.removeLayer(geoLayerGal);
    provLayers = {}; provGroupGetter = {}; provSeleccionada = null;

    const maxV = Math.max(...data.map(d => d.value), 0.000001);
    const featuresContinente = EC_GEOJSON.features.filter(f => f.properties.nombre !== 'GALAPAGOS');
    const featuresGalapagos  = EC_GEOJSON.features.filter(f => f.properties.nombre === 'GALAPAGOS');

    geoLayer    = crearCapa(map, featuresContinente, maxV, colorHex);
    geoLayerGal = crearCapa(mapGal, featuresGalapagos, maxV, colorHex);

    map.fitBounds(geoLayer.getBounds(), { padding:[10,10] });
    mapGal.fitBounds(geoLayerGal.getBounds(), { padding:[6,6] });

    return maxV;
  }

  setTimeout(() => { map.invalidateSize(); mapGal.invalidateSize(); }, 60);

  return {
    render, highlight, clearHighlight,
    invalidateSize(){
      map.invalidateSize(); mapGal.invalidateSize();
      if (geoLayer) map.fitBounds(geoLayer.getBounds(), { padding:[10,10] });
      if (geoLayerGal) mapGal.fitBounds(geoLayerGal.getBounds(), { padding:[6,6] });
    },
    destroy(){
      map.remove(); mapGal.remove();
    }
  };
}
