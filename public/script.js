// ---- CONFIG ----
const SOCKET_CONNECT_ORIGIN = window.location.origin;
const MQTT_TIMEOUT_MS = 20000;      // si no hay MQTT en 20s usamos Mongo
const LIVE_BUFFER_MAX = 60;         // puntos en tiempo real
const TABLE_REFRESH_MS = 30000;     // refrescar tabla desde Mongo
const HISTORICO_RANGE = 20;         // rango de puntos al hacer click en mini-chart

// ---- VARIABLES Y CHARTS ----
const socket = io.connect(SOCKET_CONNECT_ORIGIN, { transports: ["websocket", "polling"] });

const variables = [
  "humedad","temperatura","conductividad","ph","nitrogeno","fosforo","potasio","bateria","corriente"
];

const colorMap = {
  humedad:"#00bcd4", temperatura:"#ff7043", conductividad:"#7e57c2", ph:"#81c784",
  nitrogeno:"#ffca28", fosforo:"#ec407a", potasio:"#29b6f6", bateria:"#8d6e63", corriente:"#c2185b"
};

let charts = {};       // gráfico principal
let chartsSmall = {};  // mini-chart histórico
let liveBuffer = [];
let allData = [];
let lastMqttTimestamp = 0;
let currentPage = 1;
const recordsPerPage = 20;

// ---- MAPA ----
let map, marker;
function initMap() {
  const mapDiv = document.getElementById("map");
  if(!mapDiv) return;
  map = L.map("map").setView([0,0],2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:'&copy; OpenStreetMap'}).addTo(map);
  marker = L.marker([0,0]).addTo(map).bindPopup("Esperando datos GPS...");
}

function updateMap(lat, lon) {
  if(!map || !marker || lat===undefined || lon===undefined) return;
  marker.setLatLng([lat, lon]);
  map.setView([lat, lon],14);
  marker.bindPopup(`📍 Lat: ${lat.toFixed(6)}<br>Lon: ${lon.toFixed(6)}`).openPopup();
}

// ---- CREAR GRAFICOS ----
function createCharts() {
  const container = document.getElementById("chartsGrid");
  variables.forEach(v => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <h4>${v.charAt(0).toUpperCase()+v.slice(1)}</h4>
      <canvas id="main_${v}"></canvas>
      <div class="card-small"><canvas id="small_${v}"></canvas></div>
      <div class="chart-actions">
        <button class="btn" data-reset="${v}">Reset Zoom</button>
      </div>`;
    container.appendChild(card);

    // principal
    const ctx = document.getElementById(`main_${v}`).getContext('2d');
    charts[v] = new Chart(ctx,{
      type:'line',
      data:{labels:[],datasets:[{label:v,data:[],borderColor:colorMap[v],backgroundColor:colorMap[v]+'33',fill:true,tension:0.25,pointRadius:2}]},
      options:{
        responsive:true, maintainAspectRatio:false,
        interaction:{mode:'nearest',intersect:false},
        plugins:{
          legend:{labels:{color:'#fff'}},
          zoom:{
            pan:{enabled:true,mode:'x',modifierKey:'ctrl'},
            zoom:{wheel:{enabled:true},pinch:{enabled:true},mode:'x'}
          }
        },
        scales:{
          x:{ticks:{color:'#ccc'},grid:{color:'#1e3a4c'}},
          y:{ticks:{color:'#ccc'},grid:{color:'#1e3a4c'}}
        }
      }
    });

    // mini-chart
    const ctx2 = document.getElementById(`small_${v}`).getContext('2d');
    chartsSmall[v] = new Chart(ctx2,{
      type:'line',
      data:{labels:[],datasets:[{label:v,data:[],borderColor:colorMap[v],backgroundColor:colorMap[v]+'33',fill:true,tension:0.25,pointRadius:0}]},
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{x:{ticks:{display:false},grid:{display:false}},y:{display:false}},
        onClick:(e,active)=>{
          if(!active.length) return;
          const idx = active[0].index;
          const labels = chartsSmall[v].data.labels;
          const start = Math.max(0, idx-HISTORICO_RANGE);
          const end = Math.min(labels.length, idx+HISTORICO_RANGE);
          charts[v].options.scales.x.min = labels[start];
          charts[v].options.scales.x.max = labels[end];
          charts[v].update();
        }
      }
    });

    // reset zoom
    card.querySelector('button[data-reset]').onclick = () => {
      charts[v].resetZoom();
    };
  });
}

// ---- RENDERIZAR DATOS EN GRAFICOS ----
function renderChartsFromArray(dataArray) {
  if(!Array.isArray(dataArray) || !dataArray.length) return;
  const labels = dataArray.map(d=>new Date(d.fecha));
  variables.forEach(v=>{
    if(!charts[v] || !chartsSmall[v]) return;
    const vals = dataArray.map(d=>d[v]??null);
    charts[v].data.labels = labels;
    charts[v].data.datasets[0].data = vals;
    charts[v].update('none');

    chartsSmall[v].data.labels = labels;
    chartsSmall[v].data.datasets[0].data = vals;
    chartsSmall[v].update('none');
  });
}

// ---- SOCKET.IO ----
socket.on('connect',()=>console.log('Socket conectado'));
socket.on('disconnect',()=>console.log('Socket desconectado'));

socket.on('nuevoDato',(data)=>{
  const rec = {...data,fecha:data.fecha?new Date(data.fecha):new Date()};
  liveBuffer.push(rec);
  if(liveBuffer.length>LIVE_BUFFER_MAX) liveBuffer.shift();
  lastMqttTimestamp = Date.now();
  renderChartsFromArray(liveBuffer);
  if(data.latitud!==undefined && data.longitud!==undefined) updateMap(data.latitud,data.longitud);
});

socket.on('historico',(arr)=>{
  allData=(arr||[]).map(d=>({...d,fecha:d.fecha?new Date(d.fecha):new Date()}));
  liveBuffer = allData.slice(-LIVE_BUFFER_MAX);
  renderChartsFromArray(liveBuffer);
  renderTable();
});

// ---- MONGO ----
async function loadLatestFromMongo(){
  try{
    const res = await fetch('/api/data/latest');
    if(!res.ok) throw new Error(res.status);
    const json = await res.json();
    return json.map(d=>({...d,fecha:new Date(d.fecha)}));
  }catch(e){console.error(e); return [];}
}

async function loadAllFromMongo(){
  try{
    const res = await fetch('/api/data/all');
    if(!res.ok) throw new Error(res.status);
    allData = (await res.json()).map(d=>({...d,fecha:new Date(d.fecha)}));
    renderTable();
  }catch(e){console.error(e); allData=[]; renderTable();}
}

// ---- TABLA HISTORICOS ----
function renderTable(){
  const tablaSelect = document.getElementById("tablaSelect")?.value || variables[0];
  const tableBody = document.querySelector("#dataTable tbody");
  if(!tableBody) return;
  const totalRecords = allData.length;
  const totalPages = Math.max(1,Math.ceil(totalRecords/recordsPerPage));
  if(currentPage>totalPages) currentPage=totalPages;

  const start = (currentPage-1)*recordsPerPage;
  const end = start+recordsPerPage;
  const dataSlice = allData.slice(start,end);

  tableBody.innerHTML = dataSlice.map(d=>`<tr><td>${new Date(d.fecha).toLocaleString()}</td><td>${d[tablaSelect]??''}</td></tr>`).join('');

  // paginación
  const pag = document.getElementById('pagination');
  if(!pag) return;
  pag.innerHTML = '';
  for(let i=1;i<=totalPages;i++){
    const b = document.createElement('button');
    b.textContent = i;
    b.disabled = i===currentPage;
    b.onclick = ()=>{currentPage=i; renderTable();};
    pag.appendChild(b);
  }
}

// ---- REFRESCO AUTOMATICO ----
async function refreshDisplay(){
  const now = Date.now();
  const diff = now - lastMqttTimestamp;
  if(lastMqttTimestamp!==0 && diff<=MQTT_TIMEOUT_MS && liveBuffer.length>0){
    renderChartsFromArray(liveBuffer);
  }else{
    const mongoLatest = await loadLatestFromMongo();
    if(mongoLatest.length>0){ renderChartsFromArray(mongoLatest); allData=mongoLatest; }
    else if(allData.length>0){ renderChartsFromArray(allData); }
  }
}

// ---- INICIO ----
(async function init(){
  createCharts();
  initMap();
  await loadAllFromMongo();
  const latest = await loadLatestFromMongo();
  if(latest.length) renderChartsFromArray(latest);

  setInterval(refreshDisplay,5000);
  setInterval(loadAllFromMongo,TABLE_REFRESH_MS);

  // actualizar tabla al cambiar variable
  const tablaSelect = document.getElementById('tablaSelect');
  if(tablaSelect) tablaSelect.onchange=()=>{currentPage=1; renderTable();};
})();
