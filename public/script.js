// ---- CONFIG ----
const SOCKET_CONNECT_ORIGIN = window.location.origin;
const MQTT_TIMEOUT_MS = 20000;
const LIVE_BUFFER_MAX = 60;  // aumentar buffer si quieres más puntos en tiempo real
const TABLE_REFRESH_MS = 30000;

// ---- SOCKET.IO ----
const socket = io.connect(SOCKET_CONNECT_ORIGIN, { transports: ["websocket", "polling"] });

// ---- VARIABLES ----
const variables = [
  "humedad","temperatura","conductividad","ph","nitrogeno","fosforo","potasio","bateria","corriente"
];
const colorMap = {
  humedad:"#00bcd4", temperatura:"#ff7043", conductividad:"#7e57c2", ph:"#81c784",
  nitrogeno:"#ffca28", fosforo:"#ec407a", potasio:"#29b6f6", bateria:"#8d6e63", corriente:"#c2185b"
};

let charts = {};
let liveBuffer = [];
let lastMqttTimestamp = 0;
let allData = [];
let chartModes = {}; // true = tiempo real, false = histórico

// ---- CREAR GRÁFICAS ----
function createCharts(){
  const container = document.getElementById("chartsGrid");
  variables.forEach(v=>{
    const card = document.createElement("div");
    card.className="card";
    card.innerHTML = `
      <h4>${v.charAt(0).toUpperCase()+v.slice(1)}</h4>
      <canvas id="chart_${v}"></canvas>
      <div class="chart-actions">
        <button class="btn" data-reset="${v}">Reset Zoom</button>
        <button class="btn" data-mode="${v}" data-type="realtime">Datos actuales</button>
        <button class="btn" data-mode="${v}" data-type="historico">Histórico</button>
      </div>
    `;
    container.appendChild(card);

    const ctx = document.getElementById(`chart_${v}`).getContext('2d');
    charts[v] = new Chart(ctx,{
      type:'line',
      data:{labels:[],datasets:[{label:v,data:[],borderColor:colorMap[v],backgroundColor:colorMap[v]+'33',fill:true,tension:0.25,pointRadius:2}]},
      options:{
        responsive:true, maintainAspectRatio:false,
        interaction:{mode:'nearest',intersect:false},
        plugins:{
          legend:{labels:{color:'#fff'}},
          zoom:{
            pan:{enabled:true,mode:'x',modifierKey:'ctrl', onPan:()=>{updateLabels(v);}},
            zoom:{
              wheel:{enabled:true},
              pinch:{enabled:true}, // activar pinch en móvil
              drag:{enabled:true, borderColor:'rgba(0,255,255,0.3)', backgroundColor:'rgba(0,255,255,0.15)'},
              mode:'x',
              onZoomComplete:()=>{updateLabels(v);}
            }
          }
        },
        scales:{
          x:{ticks:{color:'#ccc'},grid:{color:'#1e3a4c'}},
          y:{ticks:{color:'#ccc'},grid:{color:'#1e3a4c'}}
        }
      }
    });

    chartModes[v] = true; // por defecto modo tiempo real
  });
}

// ---- FUNCIONES AUX ----
function updateLabels(varName){
  const chart = charts[varName];
  if(!chart) return;
  const len = chart.data.labels.length;
  if(len <= 15){
    chart.options.scales.x.ticks.display = true;
    chart.update('none');
  }
}

// ---- RENDERIZAR ----
function renderChart(varName, dataArray){
  if(!charts[varName] || !Array.isArray(dataArray)) return;
  const chart = charts[varName];
  const labels = dataArray.map(d=>new Date(d.fecha));
  chart.data.labels = labels;
  chart.data.datasets[0].data = dataArray.map(d=>d[varName]??null);

  // mostrar fechas si ≤15
  chart.options.scales.x.ticks.display = dataArray.length <= 15;
  chart.update();
}

// ---- RENDER TODOS ----
function renderChartsFromArray(dataArray){
  variables.forEach(v=>{
    if(chartModes[v]) renderChart(v, dataArray);
  });
}

// ---- SOCKET ----
socket.on("connect",()=>console.log("Socket conectado"));
socket.on("disconnect",()=>console.log("Socket desconectado"));

socket.on("nuevoDato",(data)=>{
  const rec={...data,fecha:data.fecha?new Date(data.fecha):new Date()};
  liveBuffer.push(rec);
  if(liveBuffer.length>LIVE_BUFFER_MAX) liveBuffer.shift();
  lastMqttTimestamp=Date.now();

  // actualizar solo gráficos en modo real
  variables.forEach(v=>{
    if(chartModes[v]) renderChart(v, liveBuffer);
  });

  // actualizar mapa
  if(data.latitud!==undefined && data.longitud!==undefined) updateMap(data.latitud,data.longitud);
});

socket.on("historico",(arr)=>{
  allData=arr.map(d=>({...d,fecha:new Date(d.fecha)}));
  // actualizar solo gráficos en modo histórico
  variables.forEach(v=>{
    if(!chartModes[v]) renderChart(v, allData);
  });
});

// ---- BOTONES INDIVIDUALES ----
document.addEventListener('click',e=>{
  const btn = e.target.closest('button');
  if(!btn) return;

  const reset = btn.dataset.reset;
  const mode = btn.dataset.mode;
  const type = btn.dataset.type;

  if(reset){
    const chart = charts[reset];
    if(chart){ chart.resetZoom(); updateLabels(reset); }
  }

  if(mode && type){
    chartModes[mode] = (type==='realtime');
    if(chartModes[mode]) renderChart(mode, liveBuffer);
    else renderChart(mode, allData);
  }
});

// ---- MAPA ----
let map, marker;
function initMap(){
  map=L.map('map').setView([0,0],2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  marker=L.marker([0,0]).addTo(map).bindPopup('Esperando datos GPS...');
}
function updateMap(lat,lon){
  if(!map||!marker||lat===undefined||lon===undefined) return;
  marker.setLatLng([lat,lon]);
  marker.setPopupContent(`📍 Lat: ${lat.toFixed(5)}<br>Lon: ${lon.toFixed(5)}`).openPopup();
  map.setView([lat,lon],14);
}

// ---- CARGA MONGO ----
async function loadAllFromMongo(){
  try{
    const res = await fetch('/api/data/all');
    if(!res.ok) throw new Error(res.status);
    const json = await res.json();
    allData = json.map(d=>({...d,fecha:new Date(d.fecha)}));
    variables.forEach(v=>{ if(!chartModes[v]) renderChart(v, allData); });
  }catch(e){console.error(e);}
}

// ---- REFRESH ----
async function refreshDisplay(){
  const now = Date.now();
  if(lastMqttTimestamp!==0 && (now-lastMqttTimestamp)<=MQTT_TIMEOUT_MS && liveBuffer.length>0){
    variables.forEach(v=>{ if(chartModes[v]) renderChart(v, liveBuffer); });
  }else{
    const latest = await fetch('/api/data/latest').then(r=>r.json()).then(j=>j.map(d=>({...d,fecha:new Date(d.fecha)}))).catch(()=>[]);
    liveBuffer = latest;
    variables.forEach(v=>{ if(chartModes[v]) renderChart(v, liveBuffer); });
  }
}

// ---- INIT ----
initMap();
createCharts();
setInterval(refreshDisplay,5000);
setInterval(loadAllFromMongo,TABLE_REFRESH_MS);
