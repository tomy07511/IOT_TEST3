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

// ---- CREAR GRÁFICOS ECHARTS ----
function createCharts() {
  variables.forEach(v => {
    const el = document.getElementById(v);
    if(!el) return;

    const chart = echarts.init(el, null, {renderer:'canvas', useDirtyRect:true});
    charts[v] = chart;

    const option = {
      title: { text: v, left: 'center', textStyle:{color:'#00e5ff'} },
      tooltip: { trigger: 'axis' },
      xAxis: { type:'time', axisLabel:{color:'#ccc'}, splitLine:{lineStyle:{color:'#1e3a4c'}} },
      yAxis: { type:'value', min:'dataMin', axisLabel:{color:'#ccc'}, splitLine:{lineStyle:{color:'#1e3a4c'}} },
      series: [{
        type:'line',
        showSymbol:false,
        areaStyle:{opacity:0.2},
        data: [],
        lineStyle:{color: colorMap[v]},
      }],
      dataZoom:[
        { type:'inside', xAxisIndex:0 },
        { type:'slider', xAxisIndex:0, bottom: '5%' }
      ]
    };

    chart.setOption(option);

    // BOTON RESET ZOOM
    const btnReset = document.querySelector(`button[data-reset="${v}"]`);
    if(btnReset) btnReset.onclick = () => chart.dispatchAction({ type:'dataZoom', start: 0, end: 100 });
  });
}

// ---- FUNCION RENDER ----
function renderChart(v){
  const chart = charts[v];
  if(!chart) return;
  let dataArray = allData.concat(liveBuffer);
  if(!dataArray.length) return;

  // ordenar por fecha ascendente
  dataArray.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));

  const labels = dataArray.map(d => new Date(d.fecha));
  const values = dataArray.map(d => d[v] ?? null);

  // Mostrar últimos 15 por defecto
  const total = labels.length;
  const startIndex = Math.max(0, total - 15);

  chart.setOption({
    series:[{ data: labels.map((time,i)=>[time, values[i]]) }],
    dataZoom: [{ startValue: labels[startIndex], endValue: labels[total-1] }]
  });
}

// ---- SOCKET ----
socket.on("connect", () => console.log("🔌 Socket conectado"));
socket.on("disconnect", () => console.log("🔌 Socket desconectado"));

socket.on("nuevoDato", (data) => {
  const record = {...data, fecha: data.fecha ? new Date(data.fecha) : new Date()};
  liveBuffer.push(record);
  if(liveBuffer.length > LIVE_BUFFER_MAX) liveBuffer.shift();
  lastMqttTimestamp = Date.now();

  variables.forEach(v => renderChart(v));

  if(data.latitud !== undefined && data.longitud !== undefined) updateMap(data.latitud,data.longitud);
});

socket.on("historico", (data) => {
  allData = data.map(d => ({...d, fecha:new Date(d.fecha)}));
  variables.forEach(v => renderChart(v));
});

// ---- MONGO ----
async function loadLatestFromMongo(){
  try{
    const res = await fetch('/api/data/latest');
    if(!res.ok) throw new Error('Error '+res.status);
    const data = await res.json();
    return data.map(d => ({...d,fecha:new Date(d.fecha)}));
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
