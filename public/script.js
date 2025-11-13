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
const zoomControls = {};
variables.forEach(v=>dataBuffers[v] = {x:[],y:[]});

// ---- INIT MAP ----
let map, marker;
function initMap(){
  map = L.map('map').setView([4.65,-74.1],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  marker = L.marker([4.65,-74.1]).addTo(map).bindPopup('Esperando datos GPS...');
}

// ---- CONTROLES DE ZOOM CON SLIDERS ----
function createZoomControls(varName, container) {
  const controlsDiv = document.createElement('div');
  controlsDiv.style.cssText = `
    display: flex;
    gap: 15px;
    margin-bottom: 10px;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
    background: #102a3c;
    border-radius: 6px;
    flex-wrap: wrap;
  `;
  
  // Título
  const title = document.createElement('span');
  title.textContent = varName;
  title.style.cssText = `
    color: #00e5ff;
    font-weight: 600;
    min-width: 100px;
    text-transform: capitalize;
  `;
  
  // Controles de Zoom X
  const zoomXDiv = document.createElement('div');
  zoomXDiv.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 200px;
  `;
  
  const zoomXLabel = document.createElement('span');
  zoomXLabel.textContent = 'Zoom X:';
  zoomXLabel.style.cssText = `color: #a0d2e0; font-size: 12px;`;
  
  const zoomXSlider = document.createElement('input');
  zoomXSlider.type = 'range';
  zoomXSlider.min = '1';
  zoomXSlider.max = '100';
  zoomXSlider.value = '100';
  zoomXSlider.style.cssText = `
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: #0f3a45;
    outline: none;
  `;
  
  const zoomXValue = document.createElement('span');
  zoomXValue.textContent = '100%';
  zoomXValue.style.cssText = `color: #00e5ff; font-size: 12px; min-width: 40px;`;
  
  // Controles de Zoom Y
  const zoomYDiv = document.createElement('div');
  zoomYDiv.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 200px;
  `;
  
  const zoomYLabel = document.createElement('span');
  zoomYLabel.textContent = 'Zoom Y:';
  zoomYLabel.style.cssText = `color: #a0d2e0; font-size: 12px;`;
  
  const zoomYSlider = document.createElement('input');
  zoomYSlider.type = 'range';
  zoomYSlider.min = '1';
  zoomYSlider.max = '100';
  zoomYSlider.value = '100';
  zoomYSlider.style.cssText = `
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: #0f3a45;
    outline: none;
  `;
  
  const zoomYValue = document.createElement('span');
  zoomYValue.textContent = '100%';
  zoomYValue.style.cssText = `color: #00e5ff; font-size: 12px; min-width: 40px;`;
  
  // Botones de acción
  const buttonsDiv = document.createElement('div');
  buttonsDiv.style.cssText = `display: flex; gap: 5px;`;
  
  const btnActuales = document.createElement('button');
  btnActuales.innerHTML = '🕒';
  btnActuales.title = 'Últimos datos';
  btnActuales.style.cssText = `
    padding: 4px 8px;
    background: #7e57c2;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  `;
  
  const btnReset = document.createElement('button');
  btnReset.innerHTML = '🔁';
  btnReset.title = 'Resetear zoom';
  btnReset.style.cssText = `
    padding: 4px 8px;
    background: #00e5ff;
    color: #002;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  `;
  
  // Guardar referencias
  zoomControls[varName] = {
    zoomXSlider,
    zoomYSlider,
    zoomXValue,
    zoomYValue
  };
  
  // Event listeners para sliders
  zoomXSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    zoomXValue.textContent = value + '%';
    applyZoom(varName, 'x', parseInt(value));
  });
  
  zoomYSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    zoomYValue.textContent = value + '%';
    applyZoom(varName, 'y', parseInt(value));
  });
  
  // Event listeners para botones
  btnActuales.addEventListener('click', () => zoomToLatest(varName));
  btnReset.addEventListener('click', () => resetZoom(varName));
  
  // Ensamblar controles
  zoomXDiv.appendChild(zoomXLabel);
  zoomXDiv.appendChild(zoomXSlider);
  zoomXDiv.appendChild(zoomXValue);
  
  zoomYDiv.appendChild(zoomYLabel);
  zoomYDiv.appendChild(zoomYSlider);
  zoomYDiv.appendChild(zoomYValue);
  
  buttonsDiv.appendChild(btnActuales);
  buttonsDiv.appendChild(btnReset);
  
  controlsDiv.appendChild(title);
  controlsDiv.appendChild(zoomXDiv);
  controlsDiv.appendChild(zoomYDiv);
  controlsDiv.appendChild(buttonsDiv);
  
  container.parentNode.insertBefore(controlsDiv, container);
}

// ---- APLICAR ZOOM CON SLIDERS ----
function applyZoom(varName, axis, zoomPercent) {
  const buf = dataBuffers[varName];
  if (buf.x.length === 0) return;
  
  // Obtener el rango completo de datos
  const allDates = buf.x.map(x => new Date(x).getTime());
  const allValues = buf.y;
  
  const minTime = Math.min(...allDates);
  const maxTime = Math.max(...allDates);
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  
  const timeRange = maxTime - minTime;
  const valueRange = maxValue - minValue;
  
  if (axis === 'x') {
    // Zoom en X: reducir el rango temporal visible
    const visibleTimeRange = timeRange * (zoomPercent / 100);
    const centerTime = (minTime + maxTime) / 2;
    
    const newMinTime = centerTime - visibleTimeRange / 2;
    const newMaxTime = centerTime + visibleTimeRange / 2;
    
    Plotly.relayout(charts[varName].div, {
      'xaxis.range': [new Date(newMinTime), new Date(newMaxTime)],
      'xaxis.autorange': false
    });
    
  } else if (axis === 'y') {
    // Zoom en Y: reducir el rango de valores visible
    const visibleValueRange = valueRange * (zoomPercent / 100);
    const centerValue = (minValue + maxValue) / 2;
    
    const newMinValue = centerValue - visibleValueRange / 2;
    const newMaxValue = centerValue + visibleValueRange / 2;
    
    Plotly.relayout(charts[varName].div, {
      'yaxis.range': [newMinValue, newMaxValue],
      'yaxis.autorange': false
    });
  }
}

// ---- ZOOM A ÚLTIMOS DATOS ----
function zoomToLatest(varName) {
  const buf = dataBuffers[varName];
  if (buf.x.length === 0) return;
  
  // Resetear sliders
  zoomControls[varName].zoomXSlider.value = '30'; // Zoom más cercano para últimos datos
  zoomControls[varName].zoomYSlider.value = '100';
  zoomControls[varName].zoomXValue.textContent = '30%';
  zoomControls[varName].zoomYValue.textContent = '100%';
  
  const last20 = buf.x.slice(-20).map(x => new Date(x));
  const lastValues = buf.y.slice(-20);
  
  if (last20.length > 0) {
    const minX = new Date(Math.min(...last20.map(x => x.getTime())));
    const maxX = new Date(Math.max(...last20.map(x => x.getTime())));
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
  // Resetear sliders a 100%
  zoomControls[varName].zoomXSlider.value = '100';
  zoomControls[varName].zoomYSlider.value = '100';
  zoomControls[varName].zoomXValue.textContent = '100%';
  zoomControls[varName].zoomYValue.textContent = '100%';
  
  Plotly.relayout(charts[varName].div, {
    'xaxis.autorange': true,
    'yaxis.autorange': true
  });
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
      container.style.marginBottom = '10px';
      document.querySelector('#graficaPlotly').appendChild(container);
    }

    createZoomControls(v, container);

    charts[v] = {
      div: container,
      layout: {
        title: { text: '', font: { color: '#00e5ff', size: 14 } }, // Sin título (ya está en controles)
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
        margin: { l: 60, r: 30, t: 10, b: 60 },
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
    
    variables.forEach(v => {
      dataBuffers[v].x = [];
      dataBuffers[v].y = [];
    });

    all.forEach(rec=>{
      const fecha = new Date(rec.fecha);
      variables.forEach(v=>{
        if(rec[v] !== undefined && rec[v] !== null){
          dataBuffers[v].x.push(fecha);
          dataBuffers[v].y.push(rec[v]);
        }
      });
    });

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