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
    
    // EVENT LISTENER SIMPLIFICADO
    container.on('plotly_relayout', function(eventdata) {
      // Si hay rango específico = zoom activo, ajustar Y
      if (eventdata['xaxis.range[0]'] && eventdata['xaxis.range[1]']) {
        const xRange = [eventdata['xaxis.range[0]'], eventdata['xaxis.range[1]']];
        autoAdjustYAxis(v, xRange);
      }
      // Si no hay rango = zoom quitado, volver a autorange
      else {
        Plotly.relayout(container, {'yaxis.autorange': true});
      }
    });
  });
}

// ---- FUNCIÓN OPTIMIZADA PARA AUTO-AJUSTAR EJE Y ----
function autoAdjustYAxis(varName, xRange) {
  const buf = dataBuffers[varName];
  const startTime = new Date(xRange[0]).getTime();
  const endTime = new Date(xRange[1]).getTime();
  
  let minY = Infinity;
  let maxY = -Infinity;
  let foundData = false;
  
  // Búsqueda optimizada sin crear arrays intermedios
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
    type: 'scattergl',
    mode: 'lines',
    line: {color: colorMap[varName], width: 2},
    name: varName,
    connectgaps: false
  }], charts[varName].layout, charts[varName].config);
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