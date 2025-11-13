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
variables.forEach(v=>dataBuffers[v] = {x:[],y:[]});

// ---- INIT MAP ----
let map, marker;
function initMap(){
  map = L.map('map').setView([4.65,-74.1],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  marker = L.marker([4.65,-74.1]).addTo(map).bindPopup('Esperando datos GPS...');
}

// ---- CONTROLES SIMPLES ----
function createChartControls(varName, container) {
  const controlsDiv = document.createElement('div');
  controlsDiv.style.cssText = `
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
    justify-content: flex-end;
  `;
  
  // Botón "Actuales"
  const btnActuales = document.createElement('button');
  btnActuales.innerHTML = '🕒 Últimos';
  btnActuales.style.cssText = `
    padding: 6px 12px;
    background: #7e57c2;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  `;
  
  // Botón "Reset"
  const btnReset = document.createElement('button');
  btnReset.innerHTML = '🔁 Reset';
  btnReset.style.cssText = `
    padding: 6px 12px;
    background: #00e5ff;
    color: #002;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  `;
  
  btnActuales.addEventListener('click', () => zoomToLatest(varName));
  btnReset.addEventListener('click', () => resetZoom(varName));
  
  controlsDiv.appendChild(btnActuales);
  controlsDiv.appendChild(btnReset);
  
  container.parentNode.insertBefore(controlsDiv, container);
}

// ---- SEGMENTOS SIMPLES ----
function createSegments(xArray, yArray) {
  if (xArray.length === 0) return [];
  
  const combined = xArray.map((x, i) => ({ 
    x: new Date(x), 
    y: yArray[i]
  })).sort((a, b) => a.x - b.x);
  
  const segments = [];
  let currentSegment = { x: [], y: [] };
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
  
  for (let i = 0; i < combined.length; i++) {
    const point = combined[i];
    
    if (currentSegment.x.length === 0) {
      currentSegment.x.push(point.x);
      currentSegment.y.push(point.y);
    } else {
      const lastTime = currentSegment.x[currentSegment.x.length - 1].getTime();
      const timeDiff = point.x.getTime() - lastTime;
      
      if (timeDiff <= TWO_DAYS_MS) {
        currentSegment.x.push(point.x);
        currentSegment.y.push(point.y);
      } else {
        segments.push({...currentSegment});
        currentSegment = { x: [point.x], y: [point.y] };
      }
    }
  }
  
  if (currentSegment.x.length > 0) {
    segments.push(currentSegment);
  }
  
  return segments;
}

// ---- ACTUALIZAR GRÁFICA ----
function updateChart(varName) {
  const buf = dataBuffers[varName];
  const segments = createSegments(buf.x, buf.y);
  
  const traces = segments.map(segment => ({
    x: segment.x,
    y: segment.y,
    type: 'scatter',
    mode: 'lines',
    line: { color: colorMap[varName], width: 2 },
    name: varName,
    hovertemplate: '%{x|%d/%m %H:%M}<br>' + varName + ': %{y:.2f}<extra></extra>',
    showlegend: false
  }));
  
  Plotly.react(charts[varName].div, traces, charts[varName].layout, charts[varName].config);
}

// ---- ZOOM A ÚLTIMOS DATOS ----
function zoomToLatest(varName) {
  const buf = dataBuffers[varName];
  if (buf.x.length === 0) return;
  
  const last15 = buf.x.slice(-15).map(x => new Date(x));
  const lastValues = buf.y.slice(-15);
  
  if (last15.length > 0) {
    const minX = new Date(Math.min(...last15.map(x => x.getTime())));
    const maxX = new Date(Math.max(...last15.map(x => x.getTime())));
    const minY = Math.min(...lastValues);
    const maxY = Math.max(...lastValues);
    const padding = (maxY - minY) * 0.1 || 1;
    
    Plotly.relayout(charts[varName].div, {
      'xaxis.range': [minX, maxX],
      'yaxis.range': [minY - padding, maxY + padding],
      'xaxis.autorange': false,
      'yaxis.autorange': false
    });
  }
}

// ---- RESET ZOOM ----
function resetZoom(varName) {
  Plotly.relayout(charts[varName].div, {
    'xaxis.autorange': true,
    'yaxis.autorange': true
  });
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
      container.style.height = '350px';
      container.style.marginBottom = '20px';
      document.querySelector('#graficaPlotly').appendChild(container);
    }

    createChartControls(v, container);

    charts[v] = {
      div: container,
      layout: {
        title: { text: v, font: { color: '#00e5ff', size: 14 } },
        plot_bgcolor: '#071923',
        paper_bgcolor: '#071923',
        font: { color: '#eaf6f8' },
        xaxis: {
          type: 'date',
          gridcolor: '#0f3a45',
          tickcolor: '#0f3a45'
        },
        yaxis: {
          gridcolor: '#0f3a45',
          autorange: true
        },
        margin: { l: 60, r: 30, t: 40, b: 60 },
        showlegend: false
      },
      config: {
        responsive: true,
        displayModeBar: true,
        displaylogo: false
      }
    };

    Plotly.newPlot(container, [], charts[v].layout, charts[v].config);
  });
}

// ---- ACTUALIZAR DATOS ----
function pushPoint(varName, fecha, value){
  const buf = dataBuffers[varName];
  buf.x.push(fecha);
  buf.y.push(value);
  
  if(buf.x.length > MAX_POINTS){
    buf.x.shift();
    buf.y.shift();
  }
  
  updateChart(varName);
}

// ---- CARGAR HISTORICO ----
async function loadAllFromMongo(){
  try{
    const res = await fetch('/api/data/all');
    if(!res.ok) throw new Error('Error '+res.status);
    const all = await res.json();
    
    if (!all || !Array.isArray(all)) return;
    
    // Limpiar buffers
    variables.forEach(v => {
      dataBuffers[v].x = [];
      dataBuffers[v].y = [];
    });

    // Cargar datos
    all.forEach(rec=>{
      const fecha = new Date(rec.fecha);
      variables.forEach(v=>{
        if(rec[v] !== undefined && rec[v] !== null){
          dataBuffers[v].x.push(fecha);
          dataBuffers[v].y.push(rec[v]);
        }
      });
    });

    // Render inicial
    variables.forEach(v=>{
      updateChart(v);
    });

  }catch(e){
    console.error('Error cargando histórico',e);
  }
}

// ---- SOCKET.IO ----
socket.on('connect', ()=>console.log('Socket conectado'));
socket.on('disconnect', ()=>console.log('Socket desconectado'));

socket.on('nuevoDato', data=>{
  const fecha = data.fecha ? new Date(data.fecha) : new Date();

  if(data.latitud && data.longitud){
    marker.setLatLng([data.latitud,data.longitud]);
    map.setView([data.latitud,data.longitud],14);
    marker.bindPopup(`📍 ${data.latitud.toFixed(5)}, ${data.longitud.toFixed(5)}`).openPopup();
  }

  variables.forEach(v=>{
    if(data[v] !== undefined && data[v] !== null) {
      pushPoint(v, fecha, data[v]);
    }
  });
});

// ---- INICIO ----
(async function init(){
  initMap();
  createCharts();
  await loadAllFromMongo();
})();