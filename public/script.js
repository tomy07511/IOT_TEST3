// -----------------------------------------------------
// script.js (REEMPLAZA tu script actual con este)
// Lazy-load por bloques + WebGL (scattergl) + gaps + autorange Y
// Evita auto-scroll usando IGNORE_RELAYOUT + safePlot
// -----------------------------------------------------

// ---- CONFIG ----
const socket = io();
const variables = [
  "humedad","temperatura","conductividad","ph",
  "nitrogeno","fosforo","potasio","bateria","corriente"
];

const colorMap = {
  humedad:"#00bcd4", temperatura:"#ff7043", conductividad:"#7e57c2", ph:"#81c784",
  nitrogeno:"#ffca28", fosforo:"#ec407a", potasio:"#29b6f6", bateria:"#8d6e63", corriente:"#c2185b"
};

const MAX_POINTS = 5000;      // buffer limit
const CHUNK_SIZE = 1000;      // registros por petición al servidor
const GAP_MS = 24*60*60*1000; // >24h => punteado

// Buffers y estructuras
const dataBuffers = {};   // { var: { x:[], y:[] } }
const charts = {};        // { var: { div, layout, config } }
let skipChunks = 0;       // para /api/data/chunk?skip=
let loadingChunks = false;

// Evitar relayout loop (evita que los renders disparen watchers)
let IGNORE_RELAYOUT = false;

// Inicializar buffers
variables.forEach(v => dataBuffers[v] = { x: [], y: [] });

// ---- INIT MAP ----
let map, marker;
function initMap(){
  try{
    map = L.map('map').setView([4.65,-74.1],12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'© OpenStreetMap' }).addTo(map);
    marker = L.marker([4.65,-74.1]).addTo(map).bindPopup('Esperando datos GPS...');
  }catch(e){
    console.warn('Leaflet no cargó', e);
  }
}

// ---- safe wrappers to avoid relayout loops ----
async function safeNewPlot(div, traces, layout, config){
  IGNORE_RELAYOUT = true;
  try {
    await Plotly.newPlot(div, traces, layout, config);
  } catch(e){
    console.error('safeNewPlot error', e);
    try { await Plotly.react(div, traces, layout, config); } catch(e2){ /* ignore */ }
  } finally {
    // small delay, then re-enable relayout handling
    setTimeout(()=> { IGNORE_RELAYOUT = false; }, 80);
  }
}

async function safeReact(div, traces, layout, config){
  IGNORE_RELAYOUT = true;
  try {
    await Plotly.react(div, traces, layout, config);
  } catch(e){
    console.error('safeReact error', e);
    try { await Plotly.newPlot(div, traces, layout, config); } catch(e2){ /* ignore */ }
  } finally {
    setTimeout(()=> { IGNORE_RELAYOUT = false; }, 80);
  }
}

// ---- CREAR GRAFICAS ----
function createCharts(){
  variables.forEach(v=>{
    const divId = 'grafica_'+v;
    let container = document.getElementById(divId);
    if(!container){
      container = document.createElement('div');
      container.id = divId;
      container.style.width = '100%';
      container.style.height = '400px';
      container.style.marginTop = '12px';
      document.querySelector('#graficaPlotly').appendChild(container);
    }

    charts[v] = {
      div: container,
      layout: {
        title: { text: v, font:{ color: '#00e5ff' } },
        plot_bgcolor:'#071923',
        paper_bgcolor:'#071923',
        font:{ color:'#eaf6f8' },
        xaxis:{ type:'date', gridcolor:'#0f3a45', tickcolor:'#0f3a45', rangeslider:{visible:true,bgcolor:'#021014'} },
        yaxis:{ gridcolor:'#0f3a45', autorange:true },
        legend:{ orientation:'h', y:-0.25 }
      },
      config: { responsive:true }
    };

    // crear plot vacío (scattergl para WebGL)
    const emptyTrace = [{ x:[], y:[], type:'scattergl', mode:'lines', line:{color:colorMap[v], width:2} }];
    safeNewPlot(container, emptyTrace, charts[v].layout, charts[v].config);

    // autorange Y al relayout (zoom/pan), pero ignorar si IGNORE_RELAYOUT es true
    container.on('plotly_relayout', (ev) => {
      if (IGNORE_RELAYOUT) return;
      // si cambia rango X forzar autorange Y
      if(ev['xaxis.range[0]'] || ev['xaxis.range'] || ev['xaxis.range[1]']){
        // no bloqueamos; small timeout to avoid race
        setTimeout(()=> Plotly.relayout(container, {'yaxis.autorange': true}).catch(()=>{}), 40);
      }
    });
  });
}

// ---- UTIL: construir trazos con gaps => segmentación y trazo punteado ----
function buildTracesWithGaps(xs, ys, color){
  const traces = [];
  if(!xs || xs.length === 0) {
    // return a single empty trace to keep Plotly happy
    return [{ x:[], y:[], type:'scattergl', mode:'lines', line:{color, width:2} }];
  }

  let segX = [xs[0]], segY = [ys[0]];

  for(let i=1;i<xs.length;i++){
    const prevT = (new Date(xs[i-1])).getTime();
    const currT = (new Date(xs[i])).getTime();
    if(currT - prevT > GAP_MS){
      // push solid segment
      traces.push({ x: segX.slice(), y: segY.slice(), type:'scattergl', mode:'lines', line:{color, width:2, dash:'solid'} });
      // dotted connector (visual)
      traces.push({ x: [xs[i-1], xs[i]], y: [segY[segY.length-1], ys[i]], type:'scattergl', mode:'lines', line:{color, width:2, dash:'dot'}, hoverinfo:'skip' });
      segX = [xs[i]]; segY = [ys[i]];
    } else {
      segX.push(xs[i]); segY.push(ys[i]);
    }
  }

  if(segX.length) traces.push({ x: segX.slice(), y: segY.slice(), type:'scattergl', mode:'lines', line:{color, width:2, dash:'solid'} });

  return traces;
}

// ---- Append chunked data to buffers (append) and render incremental ----
function appendBlockToBuffers(block){
  // block is array of docs, assumed ordered asc by fecha
  block.forEach(doc => {
    const fecha = new Date(doc.fecha);
    variables.forEach(v=>{
      const val = doc[v];
      if(val !== undefined && val !== null){
        dataBuffers[v].x.push(fecha);
        dataBuffers[v].y.push(val);
        // limit buffers to MAX_POINTS to avoid unbounded growth (tunable)
        if(dataBuffers[v].x.length > MAX_POINTS){
          dataBuffers[v].x.shift(); dataBuffers[v].y.shift();
        }
      }
    });
  });

  // after appending whole block, re-render each chart (safeReact)
  variables.forEach(async v=>{
    const xs = dataBuffers[v].x.map(d => d);
    const ys = dataBuffers[v].y.slice();
    const traces = buildTracesWithGaps(xs, ys, colorMap[v]);
    const finalTraces = traces.length ? traces : [{ x:[], y:[], type:'scattergl', mode:'lines', line:{color:colorMap[v], width:2} }];
    await safeReact(charts[v].div, finalTraces, charts[v].layout, charts[v].config);
  });
}

// ---- load chunk from server (/api/data/chunk?skip=&limit=) ----
async function loadChunk(skip = 0, limit = CHUNK_SIZE){
  try{
    const res = await fetch(`/api/data/chunk?skip=${skip}&limit=${limit}`);
    if(!res.ok){ console.error('Error fetching chunk', res.status); return []; }
    const data = await res.json();
    // server may return array or {data: array} — normalize
    if(Array.isArray(data)) return data;
    if(data && Array.isArray(data.data)) return data.data;
    return [];
  }catch(e){
    console.error('Exception loadChunk', e);
    return [];
  }
}

// ---- Load all in chunks (non-blocking, breathing loop) ----
async function loadAllInChunks(){
  if(loadingChunks) return;
  loadingChunks = true;
  skipChunks = 0;
  while(true){
    const block = await loadChunk(skipChunks, CHUNK_SIZE);
    if(!block || block.length === 0) break;
    appendBlockToBuffers(block);
    skipChunks += block.length;
    // give browser a tick
    await new Promise(r => setTimeout(r, 10));
  }
  loadingChunks = false;
  console.log('✅ All blocks loaded. totalRecords approx:', skipChunks);
}

// ---- SOCKET.IO events (realtime) ----
socket.on('connect', ()=> console.log('🔌 Socket conectado'));
socket.on('disconnect', ()=> console.log('🔌 Socket desconectado'));

socket.on('historico', (data) => {
  // server may send a small historical seed via socket; use it only if buffers empty
  if(!data || !Array.isArray(data)) return;
  if(Object.values(dataBuffers).some(b => b.x.length > 0)) return; // already have data
  // data likely in desc order; sort asc
  data.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));
  appendBlockToBuffers(data);
});

socket.on('nuevoDato', (doc) => {
  try{
    const fecha = doc.fecha ? new Date(doc.fecha) : new Date();
    // update map
    if(doc.latitud !== undefined && doc.longitud !== undefined && marker && map){
      const lat = Number(doc.latitud), lon = Number(doc.longitud);
      if(!isNaN(lat) && !isNaN(lon)){
        marker.setLatLng([lat,lon]);
        marker.bindPopup(`📍 Lat:${lat.toFixed(5)}<br>Lon:${lon.toFixed(5)}`).openPopup();
        map.setView([lat,lon], 14);
      }
    }

    // append to buffers and try fast extendTraces on each chart
    variables.forEach(async v=>{
      const val = doc[v];
      if(val === undefined || val === null) return;

      // append to buffer end (keeps chronological)
      dataBuffers[v].x.push(fecha);
      dataBuffers[v].y.push(val);
      if(dataBuffers[v].x.length > MAX_POINTS){ dataBuffers[v].x.shift(); dataBuffers[v].y.shift(); }

      // try extendTraces on the first trace index 0 (common case)
      try{
        await Plotly.extendTraces(charts[v].div, { x:[[fecha]], y:[[val]] }, [0]);
      }catch(e){
        // fallback full re-render of visible buffer
        const xs = dataBuffers[v].x.slice(-MAX_POINTS);
        const ys = dataBuffers[v].y.slice(-MAX_POINTS);
        const traces = buildTracesWithGaps(xs, ys, colorMap[v]);
        await safeReact(charts[v].div, traces, charts[v].layout, charts[v].config);
      }
    });

  }catch(e){
    console.error('Error processing nuevoDato', e);
  }
});

// ---- INIT ----
(async function init(){
  initMap();
  createCharts();
  // Start chunked load (non-blocking)
  await loadAllInChunks();
})();
