// ---- CONFIG ----
const socket = io();
const variables = [
  "humedad","temperatura","conductividad","ph","nitrogeno","fosforo","potasio","bateria","corriente"
];

const colorMap = {
  humedad:"#00bcd4", temperatura:"#ff7043", conductividad:"#7e57c2", ph:"#81c784",
  nitrogeno:"#ffca28", fosforo:"#ec407a", potasio:"#29b6f6", bateria:"#8d6e63", corriente:"#c2185b"
};

const MAX_POINTS = 5000;
const dataBuffers = {};
const charts = {};
const zoomStates = {};
const userZooming = {}; // Detecta si el usuario está usando zoom manual

variables.forEach(v => {
  dataBuffers[v] = {x: [], y: []};
  zoomStates[v] = {
    baseRange: null,
    zoomX: 1.0,
    zoomY: 1.0,
    centerX: null,
    centerY: null
  };
  userZooming[v] = false;
});

// ---- INIT MAP ----
let map, marker;
let autoCenterMap = true; // Auto centrar solo si el usuario no interactúa

function initMap(){
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;
  
  mapContainer.innerHTML = '';
  
  const mapInner = document.createElement('div');
  mapInner.id = 'map-inner';
  mapInner.style.width = '100%';
  mapInner.style.height = '400px';
  mapInner.style.borderRadius = '8px';
  mapContainer.appendChild(mapInner);
  
  map = L.map('map-inner').setView([4.65, -74.1], 12);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 18
  }).addTo(map);
  
  marker = L.marker([4.65, -74.1]).addTo(map)
    .bindPopup('Esperando datos GPS...')
    .openPopup();
  
  map.on('dragstart zoomstart', () => { autoCenterMap = false; });
  
  console.log('🗺️ Mapa inicializado correctamente');
}

function updateMap(latitud, longitud, fecha) {
  if (!map) return;
  if (latitud && longitud) {
    const newLatLng = [latitud, longitud];
    marker.setLatLng(newLatLng);
    if(autoCenterMap) map.setView(newLatLng, 14);
    
    const fechaStr = fecha ? new Date(fecha).toLocaleString() : new Date().toLocaleString();
    marker.bindPopup(`
      <div style="text-align: center;">
        <strong>📍 Ubicación Actual</strong><br>
        Lat: ${latitud.toFixed(5)}<br>
        Lon: ${longitud.toFixed(5)}<br>
        <small>${fechaStr}</small>
      </div>
    `).openPopup();
  }
}

// ---- CONTROLES CON SLIDERS ----
function createChartControls(varName, container) {
  const controlsDiv = document.createElement('div');
  controlsDiv.style.cssText = `
    display: flex;
    gap: 15px;
    margin-bottom: 15px;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: #102a3c;
    border-radius: 8px;
    border: 1px solid #0f3a45;
    flex-wrap: wrap;
  `;
  
  const title = document.createElement('span');
  title.textContent = varName;
  title.style.cssText = `
    color: #00e5ff;
    font-weight: 600;
    min-width: 100px;
    text-transform: capitalize;
    font-size: 14px;
  `;
  
  controlsDiv.appendChild(title);
  container.parentNode.insertBefore(controlsDiv, container);
  
  return {}; // Sliders no usados
}

// ---- ZOOM ----
function applyMultiplierZoom(varName, axis, multiplier) { }
function applyCombinedZoom(varName) { }
function updateBaseRange(varName) { }
function setupPlotlyZoomListener(varName) {
  const container = charts[varName].div;
  container.on('plotly_relayout', function(eventdata) {
    if (eventdata['xaxis.range[0]'] || eventdata['yaxis.range[0]']) {
      userZooming[varName] = true;
      setTimeout(() => updateBaseRange(varName), 100);
    }
  });
}
function updateSliderDisplay(varName, xValue = 50, yValue = 50) { }
function updateSliderBackground(slider, value) { }
function zoomToLatest(varName) { }
function resetZoom(varName) { }

// ---- ACTUALIZAR GRÁFICA ----
function updateChart(varName) {
  const buf = dataBuffers[varName];
  if (buf.x.length === 0) return;
  
  const mode = buf.x.length <= 30 ? 'lines+markers' : 'lines';
  const markerSize = buf.x.length <= 30 ? 6 : 0;
  
  const trace = {
    x: buf.x.map(d => new Date(d)),
    y: buf.y,
    type: 'scatter',
    mode: mode,
    line: { color: colorMap[varName], width: 2 },
    marker: { size: markerSize, color: colorMap[varName], opacity: 0.8 },
    name: varName,
    hovertemplate: '%{x|%d/%m %H:%M}<br>' + varName + ': %{y:.2f}<extra></extra>',
    connectgaps: false
  };
  
  Plotly.react(charts[varName].div, [trace], charts[varName].layout, charts[varName].config);
}

// ---- CREAR GRAFICAS ----
function createCharts(){
  variables.forEach(v => {
    const divId = 'grafica_' + v;
    let container = document.getElementById(divId);
    if (!container) {
      container = document.createElement('div');
      container.id = divId;
      container.style.width = '100%';
      container.style.height = '380px';
      container.style.marginBottom = '25px';
      container.style.padding = '15px';
      container.style.background = '#071923';
      container.style.borderRadius = '8px';
      container.style.border = '1px solid #0f3a45';
      document.querySelector('#graficaPlotly').appendChild(container);
    }

    createChartControls(v, container);

    charts[v] = {
      div: container,
      layout: {
        title: { text: '', font: { color: '#00e5ff', size: 14 } },
        plot_bgcolor: '#071923',
        paper_bgcolor: '#071923',
        font: { color: '#eaf6f8' },
        xaxis: { type: 'date', gridcolor: '#0f3a45', tickcolor: '#0f3a45' },
        yaxis: { gridcolor: '#0f3a45', autorange: true },
        margin: { l: 60, r: 30, t: 10, b: 80 },
        showlegend: false
      },
      config: { responsive: true, displayModeBar: true, displaylogo: false }
    };

    Plotly.newPlot(container, [], charts[v].layout, charts[v].config);
    setupPlotlyZoomListener(v);
  });
}

// ---- ACTUALIZAR DATOS EN TIEMPO REAL ----
function pushPoint(varName, fecha, value){
  const buf = dataBuffers[varName];
  buf.x.push(fecha);
  buf.y.push(value);
  if(buf.x.length > MAX_POINTS){
    buf.x.shift();
    buf.y.shift();
  }
  if(!userZooming[varName]) updateChart(varName);
}

// ---- CARGAR HISTORICO ----
async function loadAllFromMongo(){
  try{
    const res = await fetch('/api/data/all');
    if(!res.ok) throw new Error('Error '+res.status);
    const all = await res.json();
    if (!all || !Array.isArray(all)) return;
    
    variables.forEach(v => { dataBuffers[v].x = []; dataBuffers[v].y = []; });
    
    all.forEach(rec => {
      const fecha = new Date(rec.fecha);
      variables.forEach(v => {
        if(rec[v] !== undefined && rec[v] !== null){
          dataBuffers[v].x.push(fecha);
          dataBuffers[v].y.push(rec[v]);
        }
      });
      if (rec.latitud && rec.longitud) updateMap(rec.latitud, rec.longitud, rec.fecha);
    });
    
    variables.forEach(v => updateChart(v));
  } catch(e) {
    console.error('❌ Error cargando histórico:', e);
  }
}

// ---- SOCKET.IO ----
socket.on('connect', () => console.log('🔌 Socket conectado'));
socket.on('disconnect', () => console.log('🔌 Socket desconectado'));
socket.on('nuevoDato', data => {
  const fecha = data.fecha ? new Date(data.fecha) : new Date();
  if(data.latitud && data.longitud) updateMap(data.latitud, data.longitud, data.fecha);
  variables.forEach(v => {
    if(data[v] !== undefined && data[v] !== null) pushPoint(v, fecha, data[v]);
  });
});

// ---- INICIO ----
(async function init(){
  console.log('🚀 Iniciando aplicación...');
  initMap();
  createCharts();
  await loadAllFromMongo();
  console.log('✅ Aplicación lista, esperando datos MQTT...');
})();
