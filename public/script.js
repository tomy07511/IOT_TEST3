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

// Variables para controlar el auto-ajuste
let isZoomActive = false;
let currentXRange = null;

// ---- INIT MAP ----
let map, marker;
function initMap(){
  map = L.map('map').setView([4.65,-74.1],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  marker = L.marker([4.65,-74.1]).addTo(map).bindPopup('Esperando datos GPS...');
}

// ---- CREAR BOTONES INDIVIDUALES PARA CADA GRÁFICA ----
function createChartControls(varName, container) {
  const controlsDiv = document.createElement('div');
  controlsDiv.style.cssText = `
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
    justify-content: flex-end;
  `;
  
  // Botón "Actuales" (últimos 15 datos)
  const btnActuales = document.createElement('button');
  btnActuales.innerHTML = '🕒 Actuales';
  btnActuales.title = 'Zoom a los últimos 15 datos';
  btnActuales.style.cssText = `
    padding: 6px 12px;
    background: #7e57c2;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.3s ease;
  `;
  
  // Botón "Reset Zoom"
  const btnReset = document.createElement('button');
  btnReset.innerHTML = '🔁 Reset';
  btnReset.title = 'Resetear zoom';
  btnReset.style.cssText = `
    padding: 6px 12px;
    background: #00e5ff;
    color: #002;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.3s ease;
  `;
  
  // Efectos hover
  [btnActuales, btnReset].forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-2px)';
      btn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    });
    
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = 'none';
    });
  });
  
  // Event listeners
  btnActuales.addEventListener('click', () => zoomToLatest(varName));
  btnReset.addEventListener('click', () => resetZoom(varName));
  
  controlsDiv.appendChild(btnActuales);
  controlsDiv.appendChild(btnReset);
  
  // Insertar antes del contenedor de la gráfica
  container.parentNode.insertBefore(controlsDiv, container);
}

// ---- ZOOM A ÚLTIMOS 15 DATOS ----
function zoomToLatest(varName) {
  const buf = dataBuffers[varName];
  if (buf.x.length === 0) return;
  
  // Ordenar por fecha (por si acaso)
  const combined = buf.x.map((x, i) => ({x, y: buf.y[i]}))
    .sort((a, b) => new Date(a.x) - new Date(b.x));
  
  // Tomar los últimos 15 puntos
  const latestData = combined.slice(-15);
  
  if (latestData.length > 0) {
    const xValues = latestData.map(d => d.x);
    const yValues = latestData.map(d => d.y);
    
    const minX = new Date(Math.min(...xValues.map(x => new Date(x).getTime())));
    const maxX = new Date(Math.max(...xValues.map(x => new Date(x).getTime())));
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const paddingY = (maxY - minY) * 0.1;
    
    // Aplicar zoom
    Plotly.relayout(charts[varName].div, {
      'xaxis.range': [minX, maxX],
      'yaxis.range': [minY - paddingY, maxY + paddingY],
      'xaxis.autorange': false,
      'yaxis.autorange': false
    });
    
    isZoomActive = true;
    currentXRange = [minX, maxX];
    
    console.log(`🔍 Zoom a últimos 15 datos de ${varName}`);
  }
}

// ---- RESET ZOOM INDIVIDUAL ----
function resetZoom(varName) {
  Plotly.relayout(charts[varName].div, {
    'xaxis.autorange': true,
    'yaxis.autorange': true
  });
  
  isZoomActive = false;
  currentXRange = null;
  console.log(`🔄 Zoom resetado en ${varName}`);
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

    // Crear controles para esta gráfica
    createChartControls(v, container);

    charts[v] = {
      div: container,
      trace: {
        x: [],
        y: [],
        type: 'scatter', // ← scatter normal para mayor estabilidad
        mode: 'lines',
        name: v,
        line: {color: colorMap[v], width: 2},
        hovertemplate: '%{x}<br>'+v+': %{y}<extra></extra>',
        connectgaps: false
      },
      layout: {
        title: {text:v, font:{color:'#00e5ff'}},
        plot_bgcolor:'#071923',
        paper_bgcolor:'#071923',
        font:{color:'#eaf6f8'},
        xaxis: {
          rangeslider:{visible:true,bgcolor:'#021014'},
          rangeselector:{
            buttons:[
              {step:'hour',stepmode:'backward',count:1,label:'1h'},
              {step:'hour',stepmode:'backward',count:6,label:'6h'},
              {step:'day',stepmode:'backward',count:1,label:'1d'},
              {step:'all',label:'Todo'}
            ],
            bgcolor:'#04161a',
            activecolor:'#00e5ff'
          },
          type:'date',
          gridcolor:'#0f3a45',
          tickcolor:'#0f3a45'
        },
        yaxis:{
          gridcolor:'#0f3a45',
          autorange: true,
          fixedrange: false
        },
        legend:{orientation:'h',y:-0.25},
        margin: {l:60, r:30, t:50, b:80}
      },
      config:{
        responsive:true,
        displayModeBar: true,
        modeBarButtonsToRemove: ['pan2d','select2d','lasso2d'],
        displaylogo: false
      }
    };

    // Crear gráfica con manejo de errores
    try {
      Plotly.newPlot(container, [charts[v].trace], charts[v].layout, charts[v].config);
    } catch (error) {
      console.error(`❌ Error creando gráfica ${v}:`, error);
    }
    
    // EVENT LISTENER PARA ZOOM
    container.on('plotly_relayout', function(eventdata) {
      // Detectar cuando se hace zoom
      if (eventdata['xaxis.range[0]'] && eventdata['xaxis.range[1]']) {
        isZoomActive = true;
        currentXRange = [eventdata['xaxis.range[0]'], eventdata['xaxis.range[1]']];
        autoAdjustYAxis(v, currentXRange);
      }
      // Detectar cuando se vuelve al rango completo
      else if (eventdata['xaxis.autorange'] || eventdata['autosize']) {
        isZoomActive = false;
        currentXRange = null;
        Plotly.relayout(container, {'yaxis.autorange': true});
      }
    });
  });
}

// ---- FUNCIÓN PARA AUTO-AJUSTAR EJE Y ----
function autoAdjustYAxis(varName, xRange) {
  const buf = dataBuffers[varName];
  const startTime = new Date(xRange[0]).getTime();
  const endTime = new Date(xRange[1]).getTime();
  
  let minY = Infinity;
  let maxY = -Infinity;
  let foundData = false;
  
  for (let i = 0; i < buf.x.length; i++) {
    const time = new Date(buf.x[i]).getTime();
    if (time >= startTime && time <= endTime) {
      const value = buf.y[i];
      if (value < minY) minY = value;
      if (value > maxY) maxY = value;
      foundData = true;
    }
  }
  
  if (foundData) {
    const padding = (maxY - minY) * 0.1;
    Plotly.relayout(charts[varName].div, {
      'yaxis.range': [minY - padding, maxY + padding],
      'yaxis.autorange': false
    });
  }
}

// ---- ACTUALIZAR BUFFER Y PLOT ----
function pushPoint(varName, fecha, value){
  const buf = dataBuffers[varName];
  buf.x.push(fecha);
  buf.y.push(value);
  
  if(buf.x.length > MAX_POINTS){
    buf.x.shift();
    buf.y.shift();
  }
  
  Plotly.react(charts[varName].div, [{
    x: buf.x,
    y: buf.y,
    type: 'scatter',
    mode: 'lines',
    line: {color: colorMap[varName], width: 2},
    name: varName,
    connectgaps: false
  }], charts[varName].layout, charts[varName].config);
  
  if (isZoomActive && currentXRange) {
    autoAdjustYAxis(varName, currentXRange);
  }
}

// ---- CARGAR HISTORICO ----
async function loadAllFromMongo(){
  try{
    const res = await fetch('/api/data/all');
    if(!res.ok) throw new Error('Error '+res.status);
    const all = await res.json();
    
    if (!all || !Array.isArray(all)) {
      console.warn('⚠️ No se recibieron datos históricos');
      return;
    }
    
    all.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));

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
      Plotly.react(charts[v].div, [{
        x: dataBuffers[v].x,
        y: dataBuffers[v].y,
        type: 'scatter',
        mode: 'lines',
        line: {color: colorMap[v], width: 2},
        name: v,
        connectgaps: false
      }], charts[v].layout, charts[v].config);
    });

    console.log('✅ Históricos cargados:', all.length);
  }catch(e){
    console.error('❌ Error cargando histórico',e);
  }
}

// ---- SOCKET.IO REALTIME ----
socket.on('connect', ()=>console.log('🔌 Socket conectado'));
socket.on('disconnect', ()=>console.log('🔌 Socket desconectado'));

socket.on('nuevoDato', data=>{
  const fecha = data.fecha ? new Date(data.fecha) : new Date();

  if(data.latitud!==undefined && data.longitud!==undefined){
    marker.setLatLng([data.latitud,data.longitud]);
    map.setView([data.latitud,data.longitud],14);
    marker.setPopupContent(`📍 Lat:${data.latitud.toFixed(5)}<br>Lon:${data.longitud.toFixed(5)}`).openPopup();
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