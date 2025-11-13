// =====================
// script.js (completo)
// =====================

// ---- CONFIG ----
const socket = io(); // Socket.IO
const LAZY_POINTS = 2000;      // puntos a renderizar por variable (ajusta si quieres)
const MAX_BUFFER = 100000;     // tamaño max del buffer histórico en memoria (por variable)
const GAP_MS = 24*60*60*1000;  // umbral para considerar "gap" = 1 día

const variables = [
  "humedad","temperatura","conductividad","ph","nitrogeno","fosforo","potasio","bateria","corriente"
];

const colorMap = {
  humedad:"#00bcd4", temperatura:"#ff7043", conductividad:"#7e57c2", ph:"#81c784",
  nitrogeno:"#ffca28", fosforo:"#ec407a", potasio:"#29b6f6", bateria:"#8d6e63", corriente:"#c2185b"
};

// ---- Detectar contenedor (soporta dos posibilidades) ----
const containerId = document.getElementById('graficaPlotlyContainer') ? 'graficaPlotlyContainer' : 'graficaPlotly';
const container = document.getElementById(containerId);
if(!container){
  console.error('No se encontró contenedor para gráficas. Crea <div id="graficaPlotlyContainer"></div> o <div id="graficaPlotly"></div> en tu HTML');
}

// ---- MAPA (Leaflet) ----
let map, marker;
function initMap(){
  try {
    map = L.map('map').setView([4.65, -74.1], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'© OpenStreetMap' }).addTo(map);
    marker = L.marker([4.65, -74.1]).addTo(map).bindPopup('Esperando datos GPS...');
  } catch(e){
    console.warn('Leaflet no cargó (quizá no está disponible en esta página).', e);
  }
}

// ---- Buffers y estructuras ----
const buffers = {}; // buffers[var] = { x:[], y:[] }
const charts = {};  // charts[var] = { divId, layout, config }

// inicializar buffers
variables.forEach(v => buffers[v] = { x: [], y: [] });

// ---- Layout base con rangeselector y estilo oscuro ----
function makeLayout(title){
  return {
    title: { text: title, font: { color: '#00e5ff' } },
    plot_bgcolor: '#071923',
    paper_bgcolor: '#071923',
    font: { color: '#eaf6f8' },
    margin: { t: 40, r: 20, b: 40, l: 60 },
    xaxis: {
      type: 'date',
      rangeselector: {
        buttons: [
          {step: 'hour', stepmode: 'backward', count: 1, label: '1h'},
          {step: 'hour', stepmode: 'backward', count: 6, label: '6h'},
          {step: 'day', stepmode: 'backward', count: 1, label: '1d'},
          {step: 'all', label: 'Todo'}
        ],
        bgcolor: '#04161a',
        activecolor: '#00e5ff'
      },
      rangeslider: { visible: true, bgcolor: '#021014' },
      gridcolor: '#0f3a45',
      tickcolor: '#0f3a45'
    },
    yaxis: { autorange: true, gridcolor: '#0f3a45' },
    showlegend: false
  };
}

const baseConfig = { responsive: true, displaylogo: false };

// ---- Crear DIVs y gráficas vacías para cada variable ----
function createCharts() {
  // limpiar contenedor
  if(!container) return;
  container.innerHTML = '';

  variables.forEach(v => {
    const div = document.createElement('div');
    div.id = `chart_${v}`;
    div.style.width = '100%';
    div.style.height = '360px';
    div.style.marginBottom = '18px';
    container.appendChild(div);

    charts[v] = {
      divId: div.id,
      layout: makeLayout(v),
      config: baseConfig
    };

    // trazado inicial vacío (un solo trace, resto los generamos al render)
    const emptyTrace = { x: [], y: [], type: 'scattergl', mode: 'lines', line: { color: colorMap[v], width: 2 } };
    Plotly.newPlot(div.id, [emptyTrace], charts[v].layout, charts[v].config);

    // autorange en Y tras relayout (cuando el usuario hace zoom/pan en X)
    div.on('plotly_relayout', function(eventdata){
      // cuando se detecta cambio de rango X, forzar autorange en Y
      // nota: enviamos relayout para yaxis.autorange true
      Plotly.relayout(div.id, { 'yaxis.autorange': true }).catch(()=>{});
    });
  });
}

// ---- Función que dado el buffer crea trazos respetando gaps (>1 día)
// Devuelve un array de traces: segmentos sólidos y tramos punteados entre brechas
function makeTracesWithGaps(xs, ys, color){
  const traces = [];
  if(!xs.length) return traces;

  let segX = [xs[0]];
  let segY = [ys[0]];

  for(let i=1;i<xs.length;i++){
    const a = xs[i-1].getTime ? xs[i-1].getTime() : new Date(xs[i-1]).getTime();
    const b = xs[i].getTime ? xs[i].getTime() : new Date(xs[i]).getTime();
    const diff = b - a;

    if(diff > GAP_MS){
      // cerrar segmento sólido actual
      traces.push({
        x: segX.slice(),
        y: segY.slice(),
        type: 'scattergl',
        mode: 'lines',
        line: { color, width: 2, dash: 'solid' },
        hoverinfo: 'x+y'
      });

      // trazo punteado entre los dos puntos (visual gap)
      traces.push({
        x: [xs[i-1], xs[i]],
        y: [ys[i-1], ys[i]],
        type: 'scattergl',
        mode: 'lines',
        line: { color, width: 2, dash: 'dot' },
        hoverinfo: 'skip' // no mostrar hover en línea punteada extra
      });

      // iniciar nuevo segmento
      segX = [xs[i]];
      segY = [ys[i]];
    } else {
      segX.push(xs[i]);
      segY.push(ys[i]);
    }
  }

  // último segmento sólido
  traces.push({
    x: segX.slice(),
    y: segY.slice(),
    type: 'scattergl',
    mode: 'lines',
    line: { color, width: 2, dash: 'solid' },
    hoverinfo: 'x+y'
  });

  return traces;
}

// ---- Render (lazy): renderiza solo últimos LAZY_POINTS del buffer para mejorar performance
function renderVariable(varName){
  const buf = buffers[varName];
  if(!buf || !buf.x.length) {
    // limpiar plot si no hay datos
    Plotly.react(charts[varName].divId, [], charts[varName].layout, charts[varName].config).catch(()=>{});
    return;
  }

  // tomar últimos LAZY_POINTS
  const start = Math.max(0, buf.x.length - LAZY_POINTS);
  const xs = buf.x.slice(start).map(d => new Date(d)); // asegurar Date
  const ys = buf.y.slice(start);

  const traces = makeTracesWithGaps(xs, ys, colorMap[varName]);

  // Si hay muchísimos trazos, Plotly.react todavía será rápido por usar WebGL
  Plotly.react(charts[varName].divId, traces, charts[varName].layout, charts[varName].config).catch(e=>{
    console.error('Plotly.react error:', e);
  });
}

// ---- Append point into buffer safely and limit buffer length
function appendToBuffer(varName, fecha, val){
  const b = buffers[varName];
  b.x.push(fecha);
  b.y.push(val);
  // limitar tamaño absoluto del buffer
  if(b.x.length > MAX_BUFFER){
    b.x.shift(); b.y.shift();
  }
}

// ---- CARGAR HISTORICO desde /api/data/all (llena buffers) ----
async function loadAllFromMongo(){
  try{
    const res = await fetch('/api/data/all');
    if(!res.ok){
      console.error('Error al pedir /api/data/all', res.status);
      return;
    }
    const all = await res.json();
    // ordenar ascendente
    all.sort((a,b) => new Date(a.fecha) - new Date(b.fecha));

    // poblar buffers
    all.forEach(rec => {
      const fecha = rec.fecha ? new Date(rec.fecha) : new Date();
      variables.forEach(v => {
        const val = rec[v];
        if(val !== undefined && val !== null){
          appendToBuffer(v, fecha, val);
        }
      });
    });

    // render inicial (lazy) para cada var
    variables.forEach(v => renderVariable(v));
    console.log('✅ Histórico cargado:', all.length, 'registros (distribuidos en buffers)');
  }catch(e){
    console.error('❌ Error loadAllFromMongo', e);
  }
}

// ---- SOCKET.IO: manejar historico y nuevos datos ----
socket.on('connect', ()=> console.log('🔌 Socket conectado'));
socket.on('disconnect', ()=> console.log('🔌 Socket desconectado'));

socket.on('historico', (data) => {
  // si el server envía historico por socket
  try {
    // data puede venir en orden descendente; asegurar ascendente
    data.sort((a,b) => new Date(a.fecha) - new Date(b.fecha));
    // vaciar buffers y rellenar con historico
    variables.forEach(v => { buffers[v].x = []; buffers[v].y = []; });
    data.forEach(rec => {
      const fecha = rec.fecha ? new Date(rec.fecha) : new Date();
      variables.forEach(v => {
        const val = rec[v];
        if(val !== undefined && val !== null) appendToBuffer(v, fecha, val);
      });
    });
    variables.forEach(v => renderVariable(v));
    console.log('✅ Histórico (socket) cargado:', data.length);
  } catch(e){
    console.error('❌ Error procesando historico socket', e);
  }
});

socket.on('nuevoDato', (rec) => {
  try {
    const fecha = rec.fecha ? new Date(rec.fecha) : new Date();

    // actualizar mapa si hay GPS
    if(rec.latitud !== undefined && rec.longitud !== undefined && marker && map){
      const lat = Number(rec.latitud), lon = Number(rec.longitud);
      if(!isNaN(lat) && !isNaN(lon)){
        marker.setLatLng([lat, lon]);
        marker.bindPopup(`📍 Lat:${lat.toFixed(5)}<br>Lon:${lon.toFixed(5)}`).openPopup();
        map.setView([lat, lon], 14);
      }
    }

    // añadir a buffers y actualizar SOLO la variable(s) que vienen
    let updatedVars = [];
    variables.forEach(v => {
      const val = rec[v];
      if(val !== undefined && val !== null){
        appendToBuffer(v, fecha, val);
        updatedVars.push(v);
      }
    });

    // Debounce/raf updates para no hacer renders excesivos si llegan muchos puntos seguidos
    // agrupamos actualizaciones con requestAnimationFrame
    if(updatedVars.length){
      requestAnimationFrame(() => {
        // para cada variable actualizada, render lazy
        updatedVars.forEach(v => renderVariable(v));
      });
    }
  } catch(e){
    console.error('❌ Error procesando nuevoDato', e);
  }
});

// ---- REFRESCO PERIÓDICO de histórico (opcional) ----
setInterval(() => {
  // recargar histórico en background cada 5 minutos (ajustable)
  loadAllFromMongo();
}, 5 * 60 * 1000);

// ---- INICIALIZACIÓN ----
(async function init(){
  initMap();
  createCharts();
  await loadAllFromMongo();
})();
