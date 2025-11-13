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
      trace: {
        x: [],
        y: [],
        type: 'scattergl',
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

    Plotly.newPlot(container, [charts[v].trace], charts[v].layout, charts[v].config);
    
    // EVENT LISTENER MEJORADO PARA ZOOM
    container.on('plotly_relayout', function(eventdata) {
      console.log('🔍 Evento relayout:', eventdata);
      
      // Detectar cuando se hace zoom (rango específico)
      if (eventdata['xaxis.range[0]'] && eventdata['xaxis.range[1]']) {
        isZoomActive = true;
        currentXRange = [eventdata['xaxis.range[0]'], eventdata['xaxis.range[1]']];
        console.log('🔍 Zoom activado:', currentXRange);
        
        // Auto-ajustar eje Y para los datos visibles
        autoAdjustYAxis(v, currentXRange);
      }
      // Detectar cuando se hace clic en botones del rangeselector
      else if (eventdata['xaxis.range'] && eventdata['xaxis.range[0]'] && eventdata['xaxis.range[1]']) {
        isZoomActive = true;
        currentXRange = [eventdata['xaxis.range[0]'], eventdata['xaxis.range[1]']];
        console.log('🔍 Range selector activado:', currentXRange);
        autoAdjustYAxis(v, currentXRange);
      }
      // Detectar cuando se vuelve al rango completo (botón "Todo" o doble clic)
      else if (eventdata['xaxis.autorange'] === true || 
               eventdata['xaxis.range[0]'] === undefined ||
               Object.keys(eventdata).length === 0) {
        isZoomActive = false;
        currentXRange = null;
        console.log('🔍 Zoom desactivado - Volviendo a autorange');
        
        // Reactivar autorange completo
        Plotly.relayout(container, {
          'yaxis.autorange': true,
          'yaxis.range': null
        });
      }
      // Detectar autosize (redimensionamiento)
      else if (eventdata['autosize']) {
        console.log('🔍 Autosize detectado');
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
  
  // Filtrar datos dentro del rango de zoom
  const visibleData = [];
  for (let i = 0; i < buf.x.length; i++) {
    const time = new Date(buf.x[i]).getTime();
    if (time >= startTime && time <= endTime) {
      visibleData.push(buf.y[i]);
    }
  }
  
  if (visibleData.length > 0) {
    const minY = Math.min(...visibleData);
    const maxY = Math.max(...visibleData);
    const padding = (maxY - minY) * 0.1; // 10% de padding
    
    console.log(`📊 Ajustando Y para ${varName}: ${minY.toFixed(2)} - ${maxY.toFixed(2)}`);
    
    // Aplicar nuevo rango al eje Y
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
  
  // Mantener límite de puntos
  if(buf.x.length > MAX_POINTS){
    buf.x.shift();
    buf.y.shift();
  }
  
  // Actualizar gráfica
  Plotly.react(charts[varName].div, [{
    x: buf.x,
    y: buf.y,
    type: 'scattergl',
    mode: 'lines',
    line: {color: colorMap[varName], width: 2},
    name: varName,
    connectgaps: false
  }], charts[varName].layout, charts[v].config);
  
  // Si hay zoom activo, re-ajustar el eje Y
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
    
    // Ordenar por fecha
    all.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));

    // Limpiar buffers antes de cargar
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
      Plotly.react(charts[v].div, [{
        x: dataBuffers[v].x,
        y: dataBuffers[v].y,
        type: 'scattergl',
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

  // Actualizar mapa
  if(data.latitud!==undefined && data.longitud!==undefined){
    marker.setLatLng([data.latitud,data.longitud]);
    map.setView([data.latitud,data.longitud],14);
    marker.setPopupContent(`📍 Lat:${data.latitud.toFixed(5)}<br>Lon:${data.longitud.toFixed(5)}`).openPopup();
  }

  // Actualizar gráficas
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