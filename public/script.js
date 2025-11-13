// ---- Config / Variables ----
const socket = io(); // <- coincide con tu server (emite "nuevoDato")
const MAX_POINTS = 5000;

const variables = [
  "humedad","temperatura","conductividad","ph","nitrogeno","fosforo","potasio","bateria","corriente"
];

const colorMap = {
  humedad:"#00bcd4", temperatura:"#ff7043", conductividad:"#7e57c2", ph:"#81c784",
  nitrogeno:"#ffca28", fosforo:"#ec407a", potasio:"#29b6f6", bateria:"#8d6e63", corriente:"#c2185b"
};

// ---- Mapa (Leaflet) ----
let map = L.map('map').setView([4.65, -74.1], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
let marker = null;

// ---- Traces iniciales para Plotly (uno por variable) ----
let traces = variables.map(v => ({
  x: [],
  y: [],
  mode: 'lines',
  name: v,
  line: { color: colorMap[v], width: 2 },
  hovertemplate: '%{x}<br>' + v + ': %{y}<extra></extra>'
}));

// ---- Layout con tema azul/cyan oscuro ----
let layout = {
  title: { text: 'Sensores — series de tiempo', font: { color: '#00e5ff' } },
  plot_bgcolor: '#071923',
  paper_bgcolor: '#071923',
  font: { color: '#eaf6f8' },
  xaxis: {
    rangeselector: {
      buttons: [
        { step: 'hour', stepmode: 'backward', count: 1, label: '1h' },
        { step: 'hour', stepmode: 'backward', count: 6, label: '6h' },
        { step: 'day', stepmode: 'backward', count: 1, label: '1d' },
        { step: 'all', label: 'Todo' }
      ],
      bgcolor: '#04161a',
      activecolor: '#00e5ff'
    },
    rangeslider: { visible: true, bgcolor: '#021014' },
    type: 'date',
    gridcolor: '#0f3a45',
    tickcolor: '#0f3a45'
  },
  yaxis: { gridcolor: '#0f3a45' },
  legend: { orientation: "h", y: -0.25 }
};

// Crear la gráfica vacía (con todas las trazas)
Plotly.newPlot('graficaPlotly', traces, layout, { responsive: true });

// ---- Datos en memoria para control (por variable) ----
const dataBuffers = {};
variables.forEach(v => { dataBuffers[v] = { x: [], y: [] }; });

// ---- Helper: actualizar buffers y limitar tamaño ----
function pushPoint(varName, fecha, value){
  const buf = dataBuffers[varName];
  buf.x.push(fecha);
  buf.y.push(value);
  if(buf.x.length > MAX_POINTS){
    buf.x.shift(); buf.y.shift();
  }
}

// ---- Cargar histórico inicial desde /api/data/all ----
async function loadAllFromMongo(){
  try {
    const res = await fetch('/api/data/all');
    if(!res.ok) throw new Error('Error ' + res.status);
    const all = await res.json(); // viene en orden descendente en server
    // ordenar ascendente por fecha
    all.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));

    // poblar buffers
    all.forEach(rec => {
      const fecha = new Date(rec.fecha);
      variables.forEach(v=>{
        if(rec[v] !== undefined && rec[v] !== null){
          pushPoint(v, fecha, rec[v]);
        }
      });
    });

    // construir arrays para Plotly y hacer react (rendereo completo)
    const updateTraces = variables.map(v => ({
      x: dataBuffers[v].x.slice(),
      y: dataBuffers[v].y.slice()
    }));

    // Plotly.react espera data array; lo hacemos así:
    const newData = updateTraces.map((d,i)=>({
      x: d.x,
      y: d.y,
      mode: 'lines',
      name: variables[i],
      line: { color: colorMap[variables[i]], width: 2 }
    }));

    Plotly.react('graficaPlotly', newData, layout, {responsive:true});
    console.log('✅ Histórico cargado:', all.length, 'registros');

  } catch(e){
    console.error('❌ Error cargando histórico:', e);
  }
}

// Llamar carga inicial
loadAllFromMongo();

// ---- Manejo de evento en vivo desde Socket.IO ----
// Tu server emite "nuevoDato" con el documento guardado (campo fecha, latitud, longitud, etc.)
socket.on("nuevoDato", (data) => {
  // normalizar fecha
  const fecha = data.fecha ? new Date(data.fecha) : new Date();

  // === actualizar mapa (usa latitud/longitud según tu server) ===
  if(data.latitud !== undefined && data.longitud !== undefined){
    const lat = Number(data.latitud);
    const lon = Number(data.longitud);
    if(!isNaN(lat) && !isNaN(lon)){
      if(!marker) marker = L.marker([lat, lon]).addTo(map);
      else marker.setLatLng([lat, lon]);
      marker.bindPopup(`📍 Lat:${lat.toFixed(5)}<br>Lon:${lon.toFixed(5)}`).openPopup();
      map.setView([lat, lon], 14);
    }
  }

  // === preparar arrays para extendTraces (uno por traza) ===
  const xs = [];
  const ys = [];
  const traceIndices = [];

  variables.forEach((v, idx) => {
    const val = data[v];
    // si no viene el campo, añadimos null (Plotly lo manejará)
    xs.push([fecha]);
    ys.push([ val !== undefined ? val : null ]);
    traceIndices.push(idx);

    // actualizar buffer por variable
    if(val !== undefined && val !== null) pushPoint(v, fecha, val);
  });

  // === extender todas las trazas de una sola vez ===
  try {
    Plotly.extendTraces('graficaPlotly', { x: xs, y: ys }, traceIndices);
  } catch(e) {
    // En caso de error (por ejemplo cuando la gráfica fue re-reacted), hacemos un react completo:
    const newData = variables.map(v => ({
      x: dataBuffers[v].x.slice(),
      y: dataBuffers[v].y.slice(),
      mode: 'lines',
      name: v,
      line: { color: colorMap[v], width: 2 }
    }));
    Plotly.react('graficaPlotly', newData, layout, {responsive:true});
  }

  // === si superamos MAX_POINTS en alguna traza, re-render completo para mantener tamaño ===
  // (esto evita manejo complejo de shift en Plotly internamente)
  if(dataBuffers[variables[0]].x.length > MAX_POINTS){
    const newData = variables.map(v => ({
      x: dataBuffers[v].x.slice(),
      y: dataBuffers[v].y.slice(),
      mode: 'lines',
      name: v,
      line: { color: colorMap[v], width: 2 }
    }));
    Plotly.react('graficaPlotly', newData, layout, {responsive:true});
  }
});

// --- Debug: log de conexión socket ---
socket.on('connect', ()=> console.log('🔌 Socket conectado'));
socket.on('disconnect', ()=> console.log('🔌 Socket desconectado'));
