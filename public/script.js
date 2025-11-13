// ---- CONFIG ----
const SOCKET_CONNECT_ORIGIN = window.location.origin;
const LIVE_BUFFER_MAX = 50;
const TABLE_REFRESH_MS = 30000;
const LAZY_POINTS = 1000; // puntos a renderizar por gráfica inicialmente

const socket = io.connect(SOCKET_CONNECT_ORIGIN, { transports: ["websocket", "polling"] });

const variables = [
  "humedad","temperatura","conductividad","ph","nitrogeno","fosforo","potasio","bateria","corriente"
];

const colorMap = {
  humedad:"#00bcd4", temperatura:"#ff7043", conductividad:"#7e57c2", ph:"#81c784",
  nitrogeno:"#ffca28", fosforo:"#ec407a", potasio:"#29b6f6", bateria:"#8d6e63", corriente:"#c2185b"
};

// ---- Datos ----
let allData = [];    // histórico completo
let liveBuffer = []; // últimos datos en vivo

// ---- MAPA ----
let map, marker;
function initMap(){
  map = L.map('map').setView([0,0],2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  marker = L.marker([0,0]).addTo(map).bindPopup('Esperando datos GPS...');
}

function updateMap(lat, lon){
  if(!map || !marker || lat===undefined || lon===undefined) return;
  marker.setLatLng([lat,lon]);
  map.setView([lat,lon],14);
  marker.setPopupContent(`📍 Lat:${lat.toFixed(5)}<br>Lon:${lon.toFixed(5)}`).openPopup();
}

// ---- Crear gráficas individuales con Plotly WebGL ----
const charts = {};

function createCharts(){
  const container = document.getElementById("graficaPlotlyContainer");
  container.innerHTML = ""; // limpiar antes

  variables.forEach(v=>{
    const div = document.createElement("div");
    div.id = `chart_${v}`;
    div.style.width = "100%";
    div.style.height = "400px";
    div.style.marginBottom = "20px";
    container.appendChild(div);

    charts[v] = {
      divId: div.id,
      variable: v,
      layout: {
        title: { text: v, font: { color: '#00e5ff' } },
        plot_bgcolor: '#071923',
        paper_bgcolor: '#071923',
        font: { color: '#eaf6f8' },
        xaxis: { type: 'date', gridcolor:'#0f3a45' },
        yaxis: { gridcolor:'#0f3a45' },
        showlegend: true
      },
      config: { responsive:true },
      data: [{ x:[], y:[], type:'scattergl', mode:'lines', line:{color: colorMap[v], width:2}, name:v }]
    };

    Plotly.newPlot(div.id, charts[v].data, charts[v].layout, charts[v].config);
  });
}

// ---- Función para renderizar lazy data ----
function renderChartLazy(v){
  const chart = charts[v];
  if(!chart) return;
  const dataArray = allData.concat(liveBuffer);
  if(!dataArray.length) return;

  // ordenar ascendente por fecha
  const sorted = dataArray.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));

  // lazy loading: mostrar solo últimos LAZY_POINTS
  const sliceData = sorted.slice(-LAZY_POINTS);

  const x = sliceData.map(d=> new Date(d.fecha));
  const y = sliceData.map(d=> d[v] ?? null);

  Plotly.react(chart.divId, [{ x, y, type:'scattergl', mode:'lines', line:{color: colorMap[v], width:2}, name:v }], chart.layout, chart.config);
}

// ---- Cargar histórico desde Mongo ----
async function loadAllFromMongo(){
  try{
    const res = await fetch('/api/data/all');
    if(!res.ok) throw new Error("Error "+res.status);
    allData = await res.json();
  }catch(e){ console.error(e); }
}

// ---- SOCKET ----
socket.on("connect", ()=> console.log("🔌 Socket conectado"));
socket.on("disconnect", ()=> console.log("🔌 Socket desconectado"));

socket.on("historico", (data)=>{
  allData = data.map(d=> ({...d, fecha:new Date(d.fecha)}));
  variables.forEach(v=> renderChartLazy(v));
});

socket.on("nuevoDato", (data)=>{
  const record = {...data, fecha: data.fecha ? new Date(data.fecha) : new Date()};
  liveBuffer.push(record);
  if(liveBuffer.length > LIVE_BUFFER_MAX) liveBuffer.shift();

  variables.forEach(v=> renderChartLazy(v));

  if(data.latitud !== undefined && data.longitud !== undefined) updateMap(data.latitud, data.longitud);
});

// ---- CICLOS ----
async function refreshDisplay(){
  variables.forEach(v=> renderChartLazy(v));
  await loadAllFromMongo(); // refresco histórico cada cierto tiempo
}

// ---- INICIO ----
(async function init(){
  initMap();
  createCharts();
  await loadAllFromMongo();
  variables.forEach(v=> renderChartLazy(v));
  setInterval(refreshDisplay, TABLE_REFRESH_MS);
})();
