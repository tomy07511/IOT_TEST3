/* ============================================================
   script.js - Lazy-load real por rango + WebGL + gap detection
   ============================================================ */

// ---------- CONFIG ----------
const socket = io(); // socket.io
const BLOCK_MS = 24 * 60 * 60 * 1000 * 3; // tamaño del bloque por defecto en ms (3 días)
const GAP_MS = 24 * 60 * 60 * 1000; // 1 día -> para trazo punteado
const CACHE = {};   // CACHE[varName][startISO_endISO] = array registros
const ACTIVE_RANGE = {}; // ACTIVE_RANGE[varName] = {start:Date, end:Date}
const VISIBLE_BUFFERS = {}; // VISIBLE_BUFFERS[var] = [{x:Date,y:value},...]
const VARIABLES = [
  "humedad","temperatura","conductividad","ph","nitrogeno","fosforo","potasio","bateria","corriente"
];

const colorMap = {
  humedad:"#00bcd4", temperatura:"#ff7043", conductividad:"#7e57c2", ph:"#81c784",
  nitrogeno:"#ffca28", fosforo:"#ec407a", potasio:"#29b6f6", bateria:"#8d6e63", corriente:"#c2185b"
};

// detect container (soporta graficaPlotlyContainer o graficaPlotly)
const container = document.getElementById('graficaPlotlyContainer') || document.getElementById('graficaPlotly');
if(!container) {
  console.error('No se encontró contenedor: crea <div id="graficaPlotlyContainer"></div> o <div id="graficaPlotly"></div>');
}

// ---------- HELPERS ----------
function isoKey(start, end){ return `${start.toISOString()}__${end.toISOString()}`; }
function ensureCache(varName){ if(!CACHE[varName]) CACHE[varName] = {}; }
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

// ---------- MAP (opcional) ----------
let map, marker;
function initMap(){
  try{
    map = L.map('map').setView([4.65,-74.1], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'© OpenStreetMap' }).addTo(map);
    marker = L.marker([4.65,-74.1]).addTo(map).bindPopup('Esperando datos GPS...');
  }catch(e){ console.warn('Leaflet no disponible o no cargó aún', e); }
}

// ---------- Crear DIVs y charts ----------
const charts = {}; // charts[var] = {divId, layout, config}
function createCharts(){
  container.innerHTML = ''; // limpiar
  VARIABLES.forEach(v=>{
    const div = document.createElement('div');
    div.id = `chart_${v}`;
    div.style.width = '100%';
    div.style.height = '360px';
    div.style.marginBottom = '18px';
    container.appendChild(div);

    charts[v] = {
      divId: div.id,
      layout: makeLayout(v),
      config: { responsive:true, displaylogo:false }
    };

    // plot vacío
    const emptyTrace = { x:[], y:[], type:'scattergl', mode:'lines', line:{color: colorMap[v], width:2} };
    Plotly.newPlot(div.id, [emptyTrace], charts[v].layout, charts[v].config);

    // autorange y cuando haya relayout (zoom/pan)
    div.on('plotly_relayout', (ev) => {
      // forzar autorange Y siempre que cambie el rango X
      if(ev['xaxis.range[0]'] || ev['xaxis.range'] || ev['xaxis.range[1]']){
        // small delay para evitar loop
        setTimeout(()=> Plotly.relayout(div.id, {'yaxis.autorange': true}).catch(()=>{}), 40);
      }
    });
  });
}

function makeLayout(title){
  return {
    title: { text: title, font: { color: '#00e5ff' } },
    plot_bgcolor: '#071923',
    paper_bgcolor: '#071923',
    font: { color: '#eaf6f8' },
    margin: { t: 36, r: 18, b: 36, l: 56 },
    xaxis: {
      type: 'date',
      rangeslider: { visible: true, bgcolor: '#021014' },
      rangeselector: {
        buttons: [
          { step:'hour', stepmode:'backward', count: 1, label: '1h' },
          { step:'hour', stepmode:'backward', count: 6, label: '6h' },
          { step:'day', stepmode:'backward', count: 1, label: '1d' },
          { step:'all', label: 'Todo' }
        ],
        bgcolor: '#04161a', activecolor:'#00e5ff'
      },
      gridcolor: '#0f3a45', tickcolor:'#0f3a45'
    },
    yaxis: { autorange: true, gridcolor: '#0f3a45' },
    showlegend: false
  };
}

// ---------- Obtener bloque por rango desde servidor ----------
// Requiere endpoint: /api/data/range?var=temperatura&start=ISO&end=ISO
async function fetchRange(varName, start, end){
  ensureCache(varName);
  const key = isoKey(start,end);
  if(CACHE[varName][key]) return CACHE[varName][key];

  const url = `/api/data/range?var=${encodeURIComponent(varName)}&start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
  try{
    const res = await fetch(url);
    if(!res.ok){ console.error('fetchRange error', res.status); return []; }
    const arr = await res.json();
    // asegurar orden ascendente por fecha
    arr.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));
    CACHE[varName][key] = arr;
    return arr;
  }catch(e){
    console.error('fetchRange exception', e);
    return [];
  }
}

// ---------- Reconstruir traces considerando gaps > GAP_MS ----------
function makeTracesFromRecords(records, varName){
  if(!records || records.length===0) return [{ x:[], y:[], type:'scattergl', mode:'lines', line:{color: colorMap[varName], width:2} }];
  const xs = records.map(r => new Date(r.fecha));
  const ys = records.map(r => r[varName]);

  const traces = [];
  let segX = [xs[0]];
  let segY = [ys[0]];
  for(let i=1;i<xs.length;i++){
    const a = xs[i-1].getTime(), b = xs[i].getTime();
    if(b - a > GAP_MS){
      // push current solid segment
      traces.push({ x: segX.slice(), y: segY.slice(), type:'scattergl', mode:'lines', line:{color:colorMap[varName], width:2, dash:'solid'} });
      // dotted connector
      traces.push({ x: [xs[i-1], xs[i]], y: [segY[segY.length-1], ys[i]], type:'scattergl', mode:'lines', line:{color:colorMap[varName], width:2, dash:'dot'}, hoverinfo:'skip' });
      segX = [xs[i]]; segY = [ys[i]];
    } else {
      segX.push(xs[i]); segY.push(ys[i]);
    }
  }
  // last
  if(segX.length) traces.push({ x: segX.slice(), y: segY.slice(), type:'scattergl', mode:'lines', line:{color:colorMap[varName], width:2, dash:'solid'} });
  return traces;
}

// ---------- RENDER de un rango visible (lazy load) ----------
async function renderRange(varName, start, end){
  // evitar ranges vacíos o inválidos
  if(!(start instanceof Date)) start = new Date(start);
  if(!(end instanceof Date)) end = new Date(end);
  if(end <= start) return;

  // guardar active range
  ACTIVE_RANGE[varName] = { start, end };

  // cargamos en bloques de BLOCK_MS si el rango es mayor
  const records = [];
  let blockStart = new Date(start);
  while(blockStart < end){
    const blockEnd = new Date(Math.min(blockStart.getTime() + BLOCK_MS, end.getTime()));
    const chunk = await fetchRange(varName, blockStart, blockEnd);
    // chunk ya viene ordenado asc
    chunk.forEach(r => records.push(r));
    blockStart = new Date(blockEnd.getTime() + 1); // next ms
    // pequeño sleep para evitar saturar si hay muchos bloques
    await sleep(10);
  }

  // guardar visible buffer
  VISIBLE_BUFFERS[varName] = records.map(r => ({ fecha: new Date(r.fecha), value: r[varName] }));

  // construir traces con gaps
  const traces = makeTracesFromRecords(records, varName);

  // Plotly.react para actualizar
  Plotly.react(charts[varName].divId, traces, charts[varName].layout, charts[varName].config).catch(e=>console.error('Plotly.react error', e));
}

// ---------- Manejo de interacción: cuando el usuario hace zoom/pan en una gráfica, cargar nuevo rango ----------
function attachInteractionWatch(){
  VARIABLES.forEach(v => {
    const divId = charts[v].divId;
    const el = document.getElementById(divId);
    if(!el) return;
    el.on('plotly_relayout', async (ev) => {
      // ev puede contener xaxis.range[0] / xaxis.range[1] o 'xaxis.range'
      let startStr = ev['xaxis.range[0]'] || (ev['xaxis.range'] ? ev['xaxis.range'][0] : null);
      let endStr = ev['xaxis.range[1]'] || (ev['xaxis.range'] ? ev['xaxis.range'][1] : null);

      if(!startStr || !endStr) return;
      const start = new Date(startStr);
      const end = new Date(endStr);

      // pad a ambos lados para evitar huecos
      const pad = Math.min((end - start) * 0.15, 7 * 24*3600*1000); // 15% o max 7 días
      const realStart = new Date(Math.max(0, start.getTime() - pad));
      const realEnd = new Date(end.getTime() + pad);

      await renderRange(v, realStart, realEnd);

      // force autorange y
      Plotly.relayout(divId, {'yaxis.autorange': true}).catch(()=>{});
    });
  });
}

// ---------- Inicial carga de ventanas por defecto (últimos N días) ----------
async function loadInitialWindow(daysBack = 7){
  const end = new Date();
  const start = new Date(end.getTime() - (daysBack * 24*3600*1000));
  for(const v of VARIABLES){
    await renderRange(v, start, end);
  }
  attachInteractionWatch();
}

// ---------- SOCKET: nuevo dato (stream) ----------
socket.on('connect', ()=>console.log('Socket conectado'));
socket.on('disconnect', ()=>console.log('Socket desconectado'));

socket.on('nuevoDato', (rec) => {
  try {
    const fecha = rec.fecha ? new Date(rec.fecha) : new Date();
    // update map if present
    if(rec.latitud !== undefined && rec.longitud !== undefined && marker && map){
      const lat = Number(rec.latitud), lon = Number(rec.longitud);
      if(!isNaN(lat) && !isNaN(lon)){
        marker.setLatLng([lat, lon]);
        marker.bindPopup(`📍 Lat:${lat.toFixed(5)}<br>Lon:${lon.toFixed(5)}`).openPopup();
        map.setView([lat, lon], 14);
      }
    }

    // agregar punto sólo si cae dentro del ACTIVE_RANGE del var correspondiente
    VARIABLES.forEach(v => {
      const val = rec[v];
      if(val === undefined || val === null) return;
      const ar = ACTIVE_RANGE[v];
      if(!ar) return;
      if(fecha >= ar.start && fecha <= ar.end){
        // extender trace: usar extendTraces
        // pero primero convertir fecha a ISO string para plotly
        Plotly.extendTraces(charts[v].divId, { x: [[fecha]], y: [[val]] }, Array.from({length: charts[v].layout ? charts[v].layout.data ? charts[v].layout.data.length : 1 : 1}, (k,i)=>i)).catch(()=>{ 
          // fallback: re-render entire visible range
          renderRange(v, ar.start, ar.end).catch(()=>{});
        });
      }
    });
  } catch(e){
    console.error('Error procesando nuevoDato', e);
  }
});

// ---------- UTIL: sleep ----------
function sleep(ms){ return new Promise(res=>setTimeout(res, ms)); }

// ---------- INICIALIZACIÓN ----------
(async function init(){
  initMap();
  createCharts();
  // carga ventana inicial de 7 días
  await loadInitialWindow(7);
})();
