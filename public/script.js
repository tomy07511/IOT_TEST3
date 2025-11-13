// ---- CONFIG ----
import * as echarts from 'echarts/core';
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  DataZoomComponent
} from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { UniversalTransition, AxisBreak } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  TitleComponent,
  TooltipComponent,
  GridComponent,
  DataZoomComponent,
  LineChart,
  CanvasRenderer,
  UniversalTransition,
  AxisBreak
]);

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

  function updateChartRange(){
    const chart = charts[v];
    if(!chart._allLabels) return;

    let startDate = inputStart.value ? new Date(inputStart.value) : null;
    let endDate = inputEnd.value ? new Date(inputEnd.value) : null;

    let filteredData = chart._allData.filter((d,i)=>{
      const lblDate = new Date(chart._allLabels[i]);
      return (!startDate || lblDate >= startDate) && (!endDate || lblDate <= endDate);
    });
    let filteredLabels = chart._allLabels.filter((d,i)=>{
      const lblDate = new Date(d);
      return (!startDate || lblDate >= startDate) && (!endDate || lblDate <= endDate);
    });

    chart.setOption({
      xAxis: [{ data: filteredLabels }],
      series: [{ data: filteredData }]
    });
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

    charts[v] = echarts.init(el);

    const option = {
      title: { text: v.charAt(0).toUpperCase() + v.slice(1), left: 'center', textStyle: { color: colorMap[v] } },
      tooltip: { trigger: 'axis' },
      xAxis: [{ type: 'time', axisLabel: { color:'#ccc' }, splitLine:{show:false}, breaks:[] }],
      yAxis: { type: 'value', min: 'dataMin', axisLabel:{color:'#ccc'}, splitLine:{color:'#1e3a4c'} },
      dataZoom: [
        { type:'inside', minValueSpan: 3600*1000 },
        { type:'slider', top:'90%', minValueSpan: 3600*1000 }
      ],
      series: [{ type:'line', smooth:true, symbolSize:0, areaStyle:{color: colorMap[v]+'33'}, lineStyle:{color: colorMap[v]}, data:[] }]
    };

    charts[v].setOption(option);
    charts[v].visiblePoints = 15;

    // BOTON RESET ZOOM
    const btnReset = document.querySelector(`button[data-reset="${v}"]`);
    if(btnReset) btnReset.onclick = () => charts[v].dispatchAction({ type: 'dataZoom', start:0, end:100 });

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

  dataArray.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));
  chart._allLabels = dataArray.map(d => new Date(d.fecha).toLocaleString());
  chart._allData = dataArray.map(d => d[v] ?? null);

  const total = chart._allLabels.length;
  const start = Math.max(0, total - chart.visiblePoints);

  chart.setOption({
    xAxis: [{ data: chart._allLabels.slice(start) }],
    series: [{ data: chart._allData.slice(start) }]
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

  variables.forEach(v=> renderChart(v));

  if(data.latitud !== undefined && data.longitud !== undefined) updateMap(data.latitud,data.longitud);
});

socket.on("historico", (data) => {
  allData = data.map(d => ({...d, fecha:new Date(d.fecha)}));
  variables.forEach(v=> renderChart(v));
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
