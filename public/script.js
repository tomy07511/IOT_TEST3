// ---- CONFIG ----
const socket = io();
const variables = [
  "humedad","temperatura","conductividad","ph","nitrogeno","fosforo","potasio","bateria","corriente"
];

const colorMap = {
  humedad:"#00bcd4", temperatura:"#ff7043", conductividad:"#7e57c2", ph:"#81c784",
  nitrogeno:"#ffca28", fosforo:"#ec407a", potasio:"#29b6f6", bateria:"#8d6e63", corriente:"#c2185b"
};

const MAX_POINTS = 5000; // para WebGL, mantener límite
const dataBuffers = {};   // buffers de datos históricos + en tiempo real
const charts = {};        // referencia a cada gráfica
variables.forEach(v=>dataBuffers[v] = {x:[],y:[]});

// ---- INIT MAP ----
let map, marker;
function initMap(){
  map = L.map('map').setView([4.65,-74.1],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  marker = L.marker([4.65,-74.1]).addTo(map).bindPopup('Esperando datos GPS...');
  
  // Agregar control de pantalla completa
  map.addControl(new L.Control.Fullscreen());
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
        type: 'scattergl', // WebGL
        mode: 'lines',
        name: v,
        line: {color: colorMap[v], width:2},
        hovertemplate: '%{x}<br>'+v+': %{y}<extra></extra>'
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
          autorange: true,  // AUTO-AJUSTE DEL EJE Y
          fixedrange: false // Permitir zoom manual en Y también
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
    
    // EVENT LISTENER PARA AUTO-AJUSTE DE Y AL HACER ZOOM
    container.on('plotly_relayout', function(eventdata) {
      // Cuando hay cambio de zoom/rango en X, forzar auto-range en Y
      if (eventdata['xaxis.range[0]'] || eventdata['xaxis.range'] || eventdata['autosize']) {
        setTimeout(() => {
          Plotly.relayout(container, {'yaxis.autorange': true});
        }, 100);
      }
    });
  });
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
  
  Plotly.react(charts[varName].div,{
    x: buf.x,
    y: buf.y,
    type:'scattergl',
    mode:'lines',
    line:{color:colorMap[varName],width:2},
    name: varName
  }, charts[varName].layout, charts[varName].config);
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

    all.forEach(rec=>{
      const fecha = new Date(rec.fecha);
      variables.forEach(v=>{
        if(rec[v] !== undefined && rec[v] !== null){
          dataBuffers[v].x.push(fecha);
          dataBuffers[v].y.push(rec[v]);
        }
      });
    });

    // render inicial
    variables.forEach(v=>{
      Plotly.react(charts[v].div,[{
        x: dataBuffers[v].x,
        y: dataBuffers[v].y,
        type:'scattergl',
        mode:'lines',
        line:{color:colorMap[v],width:2},
        name:v
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

  // actualizar mapa
  if(data.latitud!==undefined && data.longitud!==undefined){
    marker.setLatLng([data.latitud,data.longitud]);
    map.setView([data.latitud,data.longitud],14);
    marker.setPopupContent(`📍 Lat:${data.latitud.toFixed(5)}<br>Lon:${data.longitud.toFixed(5)}`).openPopup();
  }

  // actualizar graficas
  variables.forEach(v=>{
    if(data[v] !== undefined && data[v] !== null) pushPoint(v, fecha, data[v]);
  });
});

// Manejo de histórico inicial via Socket.IO
socket.on('historico', (ultimos) => {
  console.log('📊 Histórico inicial recibido:', ultimos.length);
  ultimos.reverse().forEach(rec => {
    const fecha = new Date(rec.fecha);
    variables.forEach(v => {
      if(rec[v] !== undefined && rec[v] !== null) {
        pushPoint(v, fecha, rec[v]);
      }
    });
  });
});

// ---- INICIO ----
(async function init(){
  initMap();
  createCharts();
  await loadAllFromMongo();
})();

// ---- MANEJO DE ERRORES GLOBALES ----
window.addEventListener('error', function(e) {
  console.error('❌ Error global:', e.error);
});