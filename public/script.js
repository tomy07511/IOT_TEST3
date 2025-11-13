// ---- Config ----
const socket = io();
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

// ---- Traces iniciales para Plotly ----
let traces = variables.map(v => ({
  x: [],
  y: [],
  mode: 'lines+markers', // 🔹 con marcadores
  name: v,
  line: { color: colorMap[v], width: 2 },
  marker: { size: 6 },
  hovertemplate: '%{x}<br>' + v + ': %{y}<extra></extra>'
}));

// ---- Layout azul/cyan ----
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

// Crear la gráfica vacía
Plotly.newPlot('graficaPlotly', traces, layout, { responsive: true });

// ---- Datos buffers ----
const dataBuffers = {};
variables.forEach(v => { dataBuffers[v] = { x: [], y: [] }; });

// ---- Helper: actualizar buffers ----
function pushPoint(varName, fecha, value){
  const buf = dataBuffers[varName];
  buf.x.push(fecha);
  buf.y.push(value);
  if(buf.x.length > MAX_POINTS){ buf.x.shift(); buf.y.shift(); }
}

// ---- Cargar histórico desde Mongo ----
async function loadAllFromMongo(){
  try{
    const res = await fetch('/api/data/all');
    if(!res.ok) throw new Error('Error '+res.status);
    const all = await res.json();
    all.sort((a,b)=> new Date(a.fecha)-new Date(b.fecha));

    all.forEach(rec => {
      const fecha = new Date(rec.fecha);
      variables.forEach(v=>{
        if(rec[v] !== undefined && rec[v] !== null) pushPoint(v, fecha, rec[v]);
      });
    });

    // Actualizar gráfico completo
    const newData = variables.map(v=>({
      x: dataBuffers[v].x.slice(),
      y: dataBuffers[v].y.slice(),
      mode:'lines+markers',
      name:v,
      line:{color:colorMap[v],width:2},
      marker:{size:6}
    }));
    Plotly.react('graficaPlotly', newData, layout, {responsive:true});
    console.log('✅ Histórico cargado:', all.length,'registros');

  }catch(e){ console.error('❌ Error cargando histórico:', e); }
}

// Llamar carga inicial
loadAllFromMongo();

// ---- Evento en vivo Socket.IO ----
socket.on("nuevoDato", (data)=>{
  const fecha = data.fecha ? new Date(data.fecha) : new Date();

  // Actualizar mapa
  if(data.latitud!==undefined && data.longitud!==undefined){
    const lat = Number(data.latitud), lon = Number(data.longitud);
    if(!marker) marker = L.marker([lat, lon]).addTo(map);
    else marker.setLatLng([lat, lon]);
    marker.bindPopup(`📍 Lat:${lat.toFixed(5)}<br>Lon:${lon.toFixed(5)}`).openPopup();
    map.setView([lat, lon], 14);
  }

  const xs=[], ys=[], traceIndices=[];
  variables.forEach((v,idx)=>{
    const val = data[v];
    xs.push([fecha]);
    ys.push([ val!==undefined?val:null ]);
    traceIndices.push(idx);
    if(val!==undefined && val!==null) pushPoint(v, fecha, val);
  });

  try{
    Plotly.extendTraces('graficaPlotly',{x:xs,y:ys},traceIndices);
  }catch(e){
    // fallback
    const newData = variables.map(v=>({
      x: dataBuffers[v].x.slice(),
      y: dataBuffers[v].y.slice(),
      mode:'lines+markers',
      name:v,
      line:{color:colorMap[v],width:2},
      marker:{size:6}
    }));
    Plotly.react('graficaPlotly', newData, layout, {responsive:true});
  }
});
