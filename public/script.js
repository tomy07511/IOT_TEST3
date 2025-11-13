// -----------------------------------------------------
// script.js (REEMPLAZA tu script actual con este)
// Lazy-load por bloques + WebGL (scattergl) + gaps + autorange Y
// Mantiene mapa, socket, timelines, reset zoom etc.
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

const MAX_POINTS = 5000; // para buffers por variable
const CHUNK_SIZE = 1000; // registros por petición al servidor (ajusta si quieres)
const GAP_MS = 24*60*60*1000; // más de 24h => dibujar linea punteada

// Buffers y estructuras
const dataBuffers = {};   // { var: { x:[], y:[] } }
const charts = {};        // { var: { div, layout, config } }
let skipChunks = 0;       // para /api/data/chunk?skip=...
let loadingChunks = false;

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
    Plotly.newPlot(container, [{ x:[], y:[], type:'scattergl', mode:'lines', line:{color:colorMap[v], width:2} }], charts[v].layout, charts[v].config);

    // autorange Y al relayout (zoom/pan)
    container.on('plotly_relayout', (ev) => {
      // si cambia rango X forzar autorange Y
      if(ev['xaxis.range[0]'] || ev['xaxis.range'] || ev['xaxis.range[1]']){
        setTimeout(()=> Plotly.relayout(container, {'yaxis.autorange': true}).catch(()=>{}), 40);
      }
    });
  });
}

// ---- UTIL: construir trazos con gaps => segmentación y trazo punteado ----
function buildTracesWithGaps(xs, ys, color){
  const traces = [];
  if(!xs || xs.length === 0) return traces;

  let segX = [xs[0]], segY = [ys[0]];

  for(let i=1;i<xs.length;i++){
    const prevT = (new Date(xs[i-1])).getTime();
    const currT = (new Date(xs[i])).getTime();
    if(currT - prevT > GAP_MS){
      // push solid segment
      traces.push({ x: segX.slice(), y: segY.slice(), type:'scattergl', mode:'lines', line:{color, width:2, dash:'solid'} });
      // dotted connector (from prev point to next) — visual only
      traces.push({ x: [xs[i-1], xs[i]], y: [segY[segY.length-1], ys[i]], type:'scattergl', mode:'lines', line:{color, width:2, dash:'dot'}, hoverinfo:'skip' });

      segX = [xs[i]]; segY = [ys[i]];
    } else {
      segX.push(xs[i]); segY.push(ys[i]);
    }
  }

  if(segX.length) traces.push({ x: segX.slice(), y: segY.slice(), type:'scattergl', mode:'lines', line:{color, width:2, dash:'solid'} });

  return traces;
}

// ---- Push chunked data to buffers (append) and render incremental ----
function appendBlockToBuffers(block){
  // block is array of docs, assumed ordered asc by fecha
  block.forEach(doc => {
    const fecha = new Date(doc.fecha);
    variables.forEach(v=>{
      const val = doc[v];
      if(val !== undefined && val !== null){
        dataBuffers[v].x.push(fecha);
        dataBuffers[v].y.push(val);

        // limit buffers to MAX_POINTS to avoid unbounded growth in memory (you can increase)
        if(dataBuffers[v].x.length > MAX_POINTS){
          dataBuffers[v].x.shift(); dataBuffers[v].y.shift();
        }
      }
    });
  });

  // after appending whole block, re-render each chart (react)
  variables.forEach(v=>{
    const xs = dataBuffers[v].x.map(d => d); // Date objects or ISO strings ok
    const ys = dataBuffers[v].y.slice();
    const traces = buildTracesWithGaps(xs, ys, colorMap[v]);
    // if no traces (no data) create empty trace to avoid errors
    const finalTraces = traces.length ? traces : [{ x:[], y:[], type:'scattergl', mode:'lines', line:{color:colorMap[v], width:2} }];
    Plotly.react(charts[v].div, finalTraces, charts[v].layout, charts[v].config);
  });
}

// ---- load chunk from server (/api/data/chunk?skip=&limit=) ----
async function loadChunk(skip = 0, limit = CHUNK_SIZE){
  try{
    const res = await fetch(`/api/data/chunk?skip=${skip}&limit=${limit}`);
    if(!res.ok){ console.error('Error fetching chunk', res.status); return []; }
    const data = await res.json();
    return data;
  }catch(e){
    console.error('Exception loadChunk', e);
    return [];
  }
}

// ---- Load all in chunks (non-blocking, breathing loop) ----
async function loadAllInChunks(){
  loadingChunks = true;
  skipChunks = 0;
  while(true){
    const block = await loadChunk(skipChunks, CHUNK_SIZE);
    if(!block || block.length === 0) break;
    // server might return a full doc array OR an object {data:...}, accept both
    const docs = Array.isArray(block) ? block : (block.data || []);
    if(docs.length === 0) break;
    appendBlockToBuffers(docs);
    skipChunks += docs.length;
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
  // server may send a small historico via socket; use it to seed if buffers empty
  if(!data || !Array.isArray(data)) return;
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

    // append only values present and update trace using extendTraces if they fall in visible date range
    variables.forEach(v=>{
      const val = doc[v];
      if(val === undefined || val === null) return;
      // append to buffer end (keeps chronological)
      dataBuffers[v].x.push(fecha);
      dataBuffers[v].y.push(val);
      if(dataBuffers[v].x.length > MAX_POINTS){ dataBuffers[v].x.shift(); dataBuffers[v].y.shift(); }

      // try fast extendTraces on the plot
      try{
        Plotly.extendTraces(charts[v].div, { x:[[fecha]], y:[[val]] }, [charts[v].div.data ? charts[v].div.data.length - 1 : 0]);
      }catch(e){
        // fallback full re-render of visible buffer
        const xs = dataBuffers[v].x.slice(-MAX_POINTS);
        const ys = dataBuffers[v].y.slice(-MAX_POINTS);
        const traces = buildTracesWithGaps(xs, ys, colorMap[v]);
        Plotly.react(charts[v].div, traces, charts[v].layout, charts[v].config);
      }
    });
  }catch(e){
    console.error('Error processing nuevoDato', e);
  }
});

// ---- RENDER RANGE ON ZOOM (optional): if user zooms into a range beyond current buffers we can request specific range
// For simplicity, here we keep chunk-loading historical full dataset; if you'd like we can implement range-specific server endpoint (/api/data/range) and fetch only that range on zoom.
// For now, autorange on Y is handled in createCharts via relayout listener.

// ---- INIT ----
(async function init(){
  initMap();
  createCharts();
  // Start chunked load (non-blocking)
  await loadAllInChunks();
})();
