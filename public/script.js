// ---- CONFIG ----
const SOCKET_CONNECT_ORIGIN = window.location.origin;
const MQTT_TIMEOUT_MS = 20000;      // si no hay MQTT en 20s usamos Mongo
const LIVE_BUFFER_MAX = 30;         // cuantos puntos vivos guardamos
const TABLE_REFRESH_MS = 30000;     // actualizar tabla desde Mongo cada 30s

// ---- VARIABLES Y CHARTS ----
const socket = io.connect(SOCKET_CONNECT_ORIGIN, { transports: ["websocket", "polling"] });
const variables = [
  "humedad","temperatura","conductividad","ph","nitrogeno","fosforo","potasio","bateria","corriente"
];

const colorMap = {
  humedad:"#00bcd4", temperatura:"#ff7043", conductividad:"#7e57c2", ph:"#81c784",
  nitrogeno:"#ffca28", fosforo:"#ec407a", potasio:"#29b6f6", bateria:"#8d6e63", corriente:"#c2185b"
};

const charts = {};
let liveBuffer = [];
let lastMqttTimestamp = 0;
let allData = [];
let currentPage = 1;
const recordsPerPage = 20;

// ---- CREAR GRÁFICOS ----
function createCharts() {
  variables.forEach(v => {
    const el = document.getElementById(v);
    if(!el) return;
    const ctx = el.getContext('2d');

    charts[v] = new Chart(ctx, {
      type:'line',
      data:{
        labels:[],
        datasets:[{
          label:v,
          data:[],
          borderColor:colorMap[v],
          backgroundColor:colorMap[v]+'33',
          fill:true,
          tension:0.25,
          pointRadius:2
        }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        interaction:{mode:'nearest',intersect:false},
        plugins:{
          legend:{labels:{color:'#fff'}},
          zoom:{
            pan:{enabled:true,mode:'x',modifierKey:'ctrl'},
            zoom:{
              drag:{enabled:true,backgroundColor:'rgba(0,229,255,0.25)',borderColor:'#00e5ff',borderWidth:1},
              mode:'x'
            }
          }
        },
        scales:{
          x:{
            ticks:{
              color:'#ccc',
              callback:function(val,index,values){
                // Mostrar etiquetas solo si hay 15 o menos puntos
                return charts[v].data.labels.length<=15 ? this.getLabelForValue(val) : '';
              }
            },
            grid:{color:'#1e3a4c'}
          },
          y:{ticks:{color:'#ccc'},grid:{color:'#1e3a4c'}}
        }
      }
    });

    // Botón Reset Zoom
    const btn = document.querySelector(`button[data-reset="${v}"]`);
    if(btn) btn.onclick=()=>charts[v].resetZoom();
  });
}

// ---- RENDERIZAR GRAFICOS ----
function renderChartsFromArray(dataArray){
  if(!Array.isArray(dataArray)||!dataArray.length) return;
  const labels = dataArray.map(d=>new Date(d.fecha).toLocaleString());

  variables.forEach(v=>{
    if(!charts[v]) return;
    charts[v].data.datasets[0].data = dataArray.map(d=>d[v]??null);
    charts[v].data.labels = dataArray.length<=15 ? labels : dataArray.map((_,i)=>i); 
    charts[v].update();
  });
}

// ---- MAPA ----
let map, marker;
function initMap() {
  const mapDiv = document.getElementById("map");
  if (!mapDiv) return;
  map = L.map("map").setView([0, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  marker = L.marker([0, 0]).addTo(map).bindPopup("Esperando datos GPS...");
}

function updateMap(lat, lon) {
  if (!map || !marker || lat === undefined || lon === undefined) return;
  marker.setLatLng([lat, lon]);
  map.setView([lat, lon], 14);
  marker.setPopupContent(`📍 Lat: ${lat.toFixed(5)}<br>Lon: ${lon.toFixed(5)}`).openPopup();
}

// ---- SOCKET.IO ----
socket.on("connect", () => console.log("🔌 Socket conectado"));
socket.on("disconnect", () => console.log("🔌 Socket desconectado"));

socket.on("nuevoDato", (data) => {
  const record = { ...data, fecha: data.fecha ? new Date(data.fecha) : new Date() };
  liveBuffer.push(record);
  if(liveBuffer.length > LIVE_BUFFER_MAX) liveBuffer.shift();
  lastMqttTimestamp = Date.now();

  renderChartsFromArray(liveBuffer);

  if (data.latitud !== undefined && data.longitud !== undefined) {
    updateMap(data.latitud, data.longitud);
  }
});

// ---- FUNCIONES MONGO ----
async function loadLatestFromMongo(){
  try {
    const res = await fetch("/api/data/latest");
    if(!res.ok) throw new Error("Respuesta no ok " + res.status);
    const data = await res.json();
    return data.map(d => ({ ...d, fecha: new Date(d.fecha) }));
  } catch (err) {
    console.error("❌ Error obteniendo últimos:", err);
    return [];
  }
}

async function loadAllFromMongo(){
  try {
    const res = await fetch("/api/data/all");
    if(!res.ok) throw new Error("Respuesta no ok " + res.status);
    allData = await res.json();
    allData = allData.map(d => ({ ...d, fecha: new Date(d.fecha) }));
    renderChartsFromArray(allData);
  } catch (err) {
    console.error("❌ Error cargando todos:", err);
  }
}

// ---- REFRESH DISPLAY ----
async function refreshDisplay() {
  const now = Date.now();
  const diff = now - lastMqttTimestamp;

  if (lastMqttTimestamp !== 0 && diff <= MQTT_TIMEOUT_MS && liveBuffer.length > 0) {
    renderChartsFromArray(liveBuffer);
  } else {
    const mongoLatest = await loadLatestFromMongo();
    if(mongoLatest.length > 0){
      renderChartsFromArray(mongoLatest);
      allData = mongoLatest;
    } else if(allData.length>0){
      renderChartsFromArray(allData);
    } else {
      console.warn("⚠️ No hay datos disponibles para mostrar.");
    }
  }
}

// ---- INICIO ----
(async function init(){
  createCharts();
  initMap();
  await loadAllFromMongo();
  const latest = await loadLatestFromMongo();
  if(latest.length) renderChartsFromArray(latest);

  setInterval(refreshDisplay, 5000);
  setInterval(loadAllFromMongo, TABLE_REFRESH_MS);
})();
