// ---- CONFIG ----
const SOCKET_CONNECT_ORIGIN = window.location.origin;
const MQTT_TIMEOUT_MS = 20000;
const LIVE_BUFFER_MAX = 30;
const TABLE_REFRESH_MS = 30000;

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
let allData = [];
let lastMqttTimestamp = 0;

// ---- CREAR TIME LINE ----
function createTimeline(v){
  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.marginTop = '6px';
  container.style.gap = '6px';

  const labelStart = document.createElement('label');
  labelStart.textContent = 'Desde:';
  const inputStart = document.createElement('input');
  inputStart.type = 'date';
  
  const labelEnd = document.createElement('label');
  labelEnd.textContent = 'Hasta:';
  const inputEnd = document.createElement('input');
  inputEnd.type = 'date';

  container.appendChild(labelStart);
  container.appendChild(inputStart);
  container.appendChild(labelEnd);
  container.appendChild(inputEnd);

  // Renderizar según fechas seleccionadas
  function updateChartRange(){
    const chart = charts[v];
    if(!chart._allLabels) return;
    let startDate = inputStart.value ? new Date(inputStart.value) : null;
    let endDate = inputEnd.value ? new Date(inputEnd.value) : null;

    let filteredLabels = [];
    let filteredData = [];

    for(let i=0; i<chart._allLabels.length; i++){
      const lblDate = new Date(chart._allLabels[i]);
      if((!startDate || lblDate >= startDate) && (!endDate || lblDate <= endDate)){
        filteredLabels.push(chart._allLabels[i]);
        filteredData.push(chart._allData[i]);
      }
    }

    chart.data.labels = filteredLabels;
    chart.data.datasets[0].data = filteredData;
    chart.update();
  }

  inputStart.onchange = updateChartRange;
  inputEnd.onchange = updateChartRange;

  return container;
}

// ---- CREAR GRÁFICOS ----
function createCharts() {
  variables.forEach(v => {
    const el = document.getElementById(v);
    if(!el) return;
    const ctx = el.getContext('2d');

    charts[v] = new Chart(ctx, {
      type:'line',
      data:{labels:[],datasets:[{
        label:v,
        data:[],
        borderColor:colorMap[v],
        backgroundColor:colorMap[v]+'33',
        fill:true,
        tension:0.25,
        pointRadius:4
      }]},
      options:{
        responsive:true,
        maintainAspectRatio:false,
        interaction:{mode:'nearest',intersect:false},
        animation:{duration:400,easing:'linear'},
        plugins:{
          legend:{labels:{color:'#fff'}},
          zoom:{
            pan:{enabled:true,mode:'x',modifierKey:'ctrl'},
            zoom:{drag:{enabled:true,backgroundColor:'rgba(0,229,255,0.25)',borderColor:'#00e5ff',borderWidth:1},mode:'x'}
          }
        },
        scales:{
          x:{ticks:{color:'#ccc'}, grid:{color:'#1e3a4c'}},
          y:{ticks:{color:'#ccc'}, grid:{color:'#1e3a4c'}}
        }
      }
    });

    charts[v].visiblePoints = 15;

    // BOTON RESET ZOOM
    const btnReset = document.querySelector(`button[data-reset="${v}"]`);
    if(btnReset) btnReset.onclick = () => charts[v].resetZoom();

    // CREAR TIME LINE
    const timeline = createTimeline(v);
    btnReset.parentElement.appendChild(timeline);
  });
}

// ---- FUNCION RENDER (actualización automática y timeline) ----
function renderChart(v){
  const chart = charts[v];
  if(!chart) return;
  let dataArray = allData.concat(liveBuffer);
  if(!dataArray.length) return;

  // ordenar por fecha ascendente
  dataArray.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));

  chart._allLabels = dataArray.map(d => new Date(d.fecha).toLocaleString());
  chart._allData = dataArray.map(d => d[v] ?? null);

  // Mostrar últimos 15 por defecto
  const total = chart._allLabels.length;
  const start = Math.max(0, total - chart.visiblePoints);
  chart.data.labels = chart._allLabels.slice(start);
  chart.data.datasets[0].data = chart._allData.slice(start);
  chart.update();
}

// ---- SOCKET ----
socket.on("connect", () => console.log("🔌 Socket conectado"));
socket.on("disconnect", () => console.log("🔌 Socket desconectado"));

socket.on("nuevoDato", (data) => {
  const record = {...data, fecha: data.fecha ? new Date(data.fecha) : new Date()};
  liveBuffer.push(record);
  if(liveBuffer.length > LIVE_BUFFER_MAX) liveBuffer.shift();
  lastMqttTimestamp = Date.now();

  variables.forEach(v=>{
    renderChart(v); // actualizar siempre los últimos 15
  });

  if(data.latitud !== undefined && data.longitud !== undefined) updateMap(data.latitud,data.longitud);
});

socket.on("historico", (data) => {
  allData = data.map(d => ({...d, fecha:new Date(d.fecha)}));
  variables.forEach(v=>{
    renderChart(v);
  });
});

// ---- MONGO ----
async function loadLatestFromMongo(){
  try{
    const res = await fetch('/api/data/latest');
    if(!res.ok) throw new Error('Error '+res.status);
    const data = await res.json();
    return data.map(d=>({...d,fecha:new Date(d.fecha)}));
  }catch(e){console.error(e); return [];}
}

async function loadAllFromMongo(){
  try{
    const res = await fetch('/api/data/all');
    if(!res.ok) throw new Error('Error '+res.status);
    allData = await res.json();
    allData = allData.map(d=>({...d,fecha:new Date(d.fecha)}));
  }catch(e){console.error(e);}
}

// ---- MAPA ----
let map, marker;
function initMap(){
  map = L.map('map').setView([0,0],2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  marker = L.marker([0,0]).addTo(map).bindPopup('Esperando datos GPS...');
}

function updateMap(lat,lon){
  if(!map||!marker||lat===undefined||lon===undefined) return;
  marker.setLatLng([lat,lon]);
  map.setView([lat,lon],14);
  marker.setPopupContent(`📍 Lat:${lat.toFixed(5)}<br>Lon:${lon.toFixed(5)}`).openPopup();
}

// ---- CICLOS ----
async function refreshDisplay(){
  const now = Date.now();
  const diff = now-lastMqttTimestamp;

  for(const v of variables){
    if(lastMqttTimestamp !== 0 && diff <= MQTT_TIMEOUT_MS){
      renderChart(v);
    } else {
      const mongoLatest = await loadLatestFromMongo();
      if(mongoLatest.length > 0){
        allData = mongoLatest;
        renderChart(v);
      }
    }
  }
}

// ---- INICIO ----
(async function init(){
  initMap();
  createCharts();
  await loadAllFromMongo();
  const latest = await loadLatestFromMongo();
  if(latest.length) variables.forEach(v=> renderChart(v));

  setInterval(refreshDisplay,5000);
  setInterval(loadAllFromMongo,TABLE_REFRESH_MS);
})();
