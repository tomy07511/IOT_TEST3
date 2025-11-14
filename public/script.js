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

variables.forEach(v => {
  dataBuffers[v] = {x: [], y: []};
  zoomStates[v] = {
    baseRange: null,
    zoomX: 1.0,
    zoomY: 1.0,
    centerX: null,
    centerY: null
  };
});

// ---- INIT MAP ----
let map, marker;
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
}

// ---- ACTUALIZAR MAPA EN TIEMPO REAL ----
function updateMap(latitud, longitud, fecha) {
  if (!map) return;
  if (latitud && longitud) {
    const newLatLng = [latitud, longitud];
    marker.setLatLng(newLatLng);
    map.setView(newLatLng, 14);
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

  const zoomXDiv = document.createElement('div');
  zoomXDiv.style.cssText = `display: flex; align-items: center; gap: 8px; min-width: 200px;`;
  const zoomXLabel = document.createElement('span'); zoomXLabel.textContent = 'Zoom X:'; zoomXLabel.style.cssText = `color: #a0d2e0; font-size: 12px;`;
  const zoomXSlider = document.createElement('input'); zoomXSlider.type = 'range'; zoomXSlider.min = '10'; zoomXSlider.max = '200'; zoomXSlider.value = '50'; zoomXSlider.style.cssText = `flex:1;height:8px;border-radius:4px;background:#2a4a5a;outline:none;-webkit-appearance:none;`;
  const zoomXValue = document.createElement('span'); zoomXValue.textContent = '50%'; zoomXValue.style.cssText = `color:#00e5ff;font-size:12px;min-width:40px;font-weight:600;`;

  const zoomYDiv = document.createElement('div');
  zoomYDiv.style.cssText = `display: flex; align-items: center; gap: 8px; min-width: 200px;`;
  const zoomYLabel = document.createElement('span'); zoomYLabel.textContent = 'Zoom Y:'; zoomYLabel.style.cssText = `color: #a0d2e0; font-size: 12px;`;
  const zoomYSlider = document.createElement('input'); zoomYSlider.type = 'range'; zoomYSlider.min = '10'; zoomYSlider.max = '200'; zoomYSlider.value = '50'; zoomYSlider.style.cssText = `flex:1;height:8px;border-radius:4px;background:#2a4a5a;outline:none;-webkit-appearance:none;`;
  const zoomYValue = document.createElement('span'); zoomYValue.textContent = '50%'; zoomYValue.style.cssText = `color:#00e5ff;font-size:12px;min-width:40px;font-weight:600;`;

  // Botones
  const buttonsDiv = document.createElement('div'); buttonsDiv.style.cssText = `display:flex;gap:10px;`;
  const btnActuales = document.createElement('button'); btnActuales.textContent = 'Últimos'; btnActuales.title = 'Zoom a los últimos datos'; btnActuales.style.cssText = `padding:8px 16px;background:transparent;color:white;border:2px solid #00e5ff;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;min-width:80px;transition: all 0.3s ease;`;
  const btnReset = document.createElement('button'); btnReset.textContent = 'Reset'; btnReset.title = 'Resetear zoom'; btnReset.style.cssText = `padding:8px 16px;background:transparent;color:white;border:2px solid #00e5ff;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;min-width:80px;transition: all 0.3s ease;`;

  [btnActuales, btnReset].forEach(btn => {
    btn.addEventListener('mouseenter', () => { btn.style.background = '#00e5ff'; btn.style.color = '#002'; btn.style.transform = 'translateY(-2px)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; btn.style.color = 'white'; btn.style.transform = 'translateY(0)'; });
  });

  // ---- CORRECCIÓN BOTÓN ÚLTIMOS 15 ----
  btnActuales.addEventListener('click', () => {
    zoomToLatest(varName);
    updateChart(varName); // fuerza ver los puntos inmediatamente
  });
  btnReset.addEventListener('click', () => resetZoom(varName));

  function updateSliderBackground(slider, value){
    const min = parseInt(slider.min), max = parseInt(slider.max);
    const percent = ((value - min)/(max-min))*100;
    slider.style.background = `linear-gradient(to right, #00e5ff 0%, #00e5ff ${percent}%, #2a4a5a ${percent}%, #2a4a5a 100%)`;
  }

  zoomXSlider.addEventListener('input', e => { const val=parseInt(e.target.value); zoomXValue.textContent=val+'%'; updateSliderBackground(zoomXSlider,val); applyMultiplierZoom(varName,'x',val/50); });
  zoomYSlider.addEventListener('input', e => { const val=parseInt(e.target.value); zoomYValue.textContent=val+'%'; updateSliderBackground(zoomYSlider,val); applyMultiplierZoom(varName,'y',val/50); });

  updateSliderBackground(zoomXSlider,50);
  updateSliderBackground(zoomYSlider,50);

  zoomXDiv.appendChild(zoomXLabel); zoomXDiv.appendChild(zoomXSlider); zoomXDiv.appendChild(zoomXValue);
  zoomYDiv.appendChild(zoomYLabel); zoomYDiv.appendChild(zoomYSlider); zoomYDiv.appendChild(zoomYValue);
  buttonsDiv.appendChild(btnActuales); buttonsDiv.appendChild(btnReset);

  controlsDiv.appendChild(title); controlsDiv.appendChild(zoomXDiv); controlsDiv.appendChild(zoomYDiv); controlsDiv.appendChild(buttonsDiv);
  container.parentNode.insertBefore(controlsDiv, container);

  return { zoomXSlider, zoomXValue, zoomYSlider, zoomYValue };
}

// ---- CREAR GRÁFICAS ----
function createCharts(){
  variables.forEach(v=>{
    const divId = 'grafica_' + v;
    let container = document.getElementById(divId);
    if(!container){
      container = document.createElement('div');
      container.id = divId;
      container.style.width='100%';
      container.style.height='380px';
      container.style.marginBottom='25px';
      container.style.padding='15px';
      container.style.background='#071923';
      container.style.borderRadius='8px';
      container.style.border='1px solid #0f3a45';
      document.querySelector('#graficaPlotly').appendChild(container);
    }

    createChartControls(v, container);

    charts[v] = {
      div: container,
      layout: {
        title:{ text:'', font:{ color:'#00e5ff', size:14 } },
        plot_bgcolor:'#071923',
        paper_bgcolor:'#071923',
        font:{ color:'#eaf6f8' },
        xaxis:{ type:'date', gridcolor:'#0f3a45', tickcolor:'#0f3a45' },
        yaxis:{ gridcolor:'#0f3a45', autorange:true },
        margin:{ l:60,r:30,t:10,b:80 },
        showlegend:false
      },
      config:{ responsive:true, displayModeBar:true, displaylogo:false }
    };

    Plotly.newPlot(container,[],charts[v].layout,charts[v].config);
    setupPlotlyZoomListener(v);
  });
}

// ---- ACTUALIZAR GRÁFICA ----
function updateChart(varName){
  const buf = dataBuffers[varName];
  if(buf.x.length===0) return;

  const combined = buf.x.map((x,i)=>({ x:new Date(x), y:buf.y[i] })).sort((a,b)=>a.x-b.x);
  const dataCount = combined.length;

  const mode = dataCount <= 15 ? 'lines+markers' : 'lines';
  const markerSize = dataCount <= 15 ? 6 : 0;

  const trace = {
    x: combined.map(d=>d.x),
    y: combined.map(d=>d.y),
    type:'scatter',
    mode:mode,
    line:{ color: colorMap[varName], width:2 },
    marker:{ size:markerSize, color:colorMap[varName], opacity:0.8 },
    name: varName,
    hovertemplate:'%{x|%d/%m %H:%M}<br>'+varName+': %{y:.2f}<extra></extra>',
    connectgaps:false
  };

  Plotly.react(charts[varName].div,[trace],charts[varName].layout,charts[varName].config);
}

// ---- PUSH PUNTO NUEVO ----
function pushPoint(varName, fecha, value){
  const buf = dataBuffers[varName];
  buf.x.push(fecha);
  buf.y.push(value);
  if(buf.x.length>MAX_POINTS){ buf.x.shift(); buf.y.shift(); }
  updateChart(varName);
}

// ---- SOCKET.IO ----
socket.on('connect',()=>console.log('🔌 Socket conectado'));
socket.on('disconnect',()=>console.log('🔌 Socket desconectado'));
socket.on('nuevoDato', data=>{
  const fecha = data.fecha?new Date(data.fecha):new Date();

  if(data.latitud && data.longitud) updateMap(data.latitud,data.longitud,data.fecha);

  variables.forEach(v=>{
    if(data[v]!==undefined && data[v]!==null) pushPoint(v,fecha,data[v]);
  });
});

// ---- CARGAR HISTÓRICO ----
async function loadAllFromMongo(){
  try{
    const res = await fetch('/api/data/all');
    if(!res.ok) throw new Error('Error '+res.status);
    const all = await res.json();
    if(!all || !Array.isArray(all)) return;

    variables.forEach(v=>{ dataBuffers[v].x=[]; dataBuffers[v].y=[]; });

    all.forEach(rec=>{
      const fecha=new Date(rec.fecha);
      variables.forEach(v=>{ if(rec[v]!==undefined && rec[v]!==null){ dataBuffers[v].x.push(fecha); dataBuffers[v].y.push(rec[v]); } });
      if(rec.latitud && rec.longitud) updateMap(rec.latitud, rec.longitud, rec.fecha);
    });

    variables.forEach(v=>updateChart(v));

  }catch(e){ console.error('❌ Error cargando histórico:', e); }
}

// ---- INICIO ----
(async function init(){
  initMap();
  createCharts();
  await loadAllFromMongo();
})();
