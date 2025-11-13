// -------------------------
// 🔹 script.js para ECharts
// -------------------------

import * as echarts from 'echarts/core';
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  DataZoomComponent,
  LegendComponent
} from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([TitleComponent, TooltipComponent, GridComponent, DataZoomComponent, LineChart, CanvasRenderer, LegendComponent]);

// -------------------------
// 🔹 Variables y configuración
// -------------------------
const SOCKET_CONNECT_ORIGIN = window.location.origin;
const LIVE_BUFFER_MAX = 30;

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

// -------------------------
// 🔹 Crear gráfico ECharts
// -------------------------
function createCharts() {
  variables.forEach(v => {
    const el = document.getElementById(v);
    if (!el) return;

    charts[v] = echarts.init(el);

    const option = {
      title: { text: v.charAt(0).toUpperCase() + v.slice(1), left: 'center', textStyle: { color: '#00e5ff' } },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'time', axisLabel: { color: '#ccc' }, splitLine: { show: false } },
      yAxis: { type: 'value', axisLabel: { color: '#ccc' }, min: 'dataMin' },
      series: [{ type: 'line', data: [], smooth: true, areaStyle: {}, lineStyle: { color: colorMap[v] }, showSymbol: false }],
      dataZoom: [{ type: 'inside' }, { type: 'slider' }]
    };

    charts[v].setOption(option);

    // Botón Reset Zoom
    const btnReset = document.querySelector(`button[data-reset="${v}"]`);
    if(btnReset){
      btnReset.onclick = () => charts[v].dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
    }

    // Timeline: filtros por fecha
    const timelineContainer = document.createElement('div');
    timelineContainer.style.display = 'flex';
    timelineContainer.style.gap = '6px';
    timelineContainer.style.marginTop = '6px';

    const startLabel = document.createElement('label'); startLabel.textContent = 'Desde:'; 
    const startInput = document.createElement('input'); startInput.type='date';
    const endLabel = document.createElement('label'); endLabel.textContent = 'Hasta:';
    const endInput = document.createElement('input'); endInput.type='date';

    timelineContainer.appendChild(startLabel);
    timelineContainer.appendChild(startInput);
    timelineContainer.appendChild(endLabel);
    timelineContainer.appendChild(endInput);
    btnReset.parentElement.appendChild(timelineContainer);

    function updateChartRange(){
      const chart = charts[v];
      if(!chart._allLabels) return;

      let startDate = startInput.value ? new Date(startInput.value) : null;
      let endDate = endInput.value ? new Date(endInput.value) : null;

      const filteredData = chart._allLabels.map((lbl, idx) => ({ lbl, val: chart._allData[idx] }))
        .filter(d => (!startDate || new Date(d.lbl) >= startDate) && (!endDate || new Date(d.lbl) <= endDate));

      chart.setOption({
        xAxis: { data: filteredData.map(d=>d.lbl) },
        series: [{ data: filteredData.map(d=>d.val) }]
      });
    }

    startInput.onchange = updateChartRange;
    endInput.onchange = updateChartRange;
  });
}

// -------------------------
// 🔹 Renderizar / actualizar gráfico
// -------------------------
function renderChart(v){
  const chart = charts[v];
  if(!chart) return;
  let dataArray = allData.concat(liveBuffer);
  if(!dataArray.length) return;

  dataArray.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));
  chart._allLabels = dataArray.map(d => new Date(d.fecha).toLocaleString());
  chart._allData = dataArray.map(d => d[v] ?? null);

  chart.setOption({
    xAxis: { type:'category', data: chart._allLabels },
    series: [{ data: chart._allData }]
  });
}

// -------------------------
// 🔹 SOCKET.IO
// -------------------------
socket.on("connect", () => console.log("🔌 Socket conectado"));
socket.on("disconnect", () => console.log("❌ Socket desconectado"));

socket.on("nuevoDato", data => {
  const record = {...data, fecha: data.fecha ? new Date(data.fecha) : new Date()};
  liveBuffer.push(record);
  if(liveBuffer.length > LIVE_BUFFER_MAX) liveBuffer.shift();
  lastMqttTimestamp = Date.now();

  variables.forEach(v => renderChart(v));

  if(data.latitud !== undefined && data.longitud !== undefined) updateMap(data.latitud, data.longitud);
});

socket.on("historico", data => {
  allData = data.map(d => ({...d, fecha: new Date(d.fecha)}));
  variables.forEach(v => renderChart(v));
});

// -------------------------
// 🔹 MONGO
// -------------------------
async function loadLatestFromMongo(){
  try{
    const res = await fetch('/api/data/latest');
    if(!res.ok) throw new Error('Error '+res.status);
    const data = await res.json();
    return data.map(d => ({...d, fecha:new Date(d.fecha)}));
  }catch(e){console.error(e); return [];}
}

async function loadAllFromMongo(){
  try{
    const res = await fetch('/api/data/all');
    if(!res.ok) throw new Error('Error '+res.status);
    allData = (await res.json()).map(d => ({...d, fecha:new Date(d.fecha)}));
  }catch(e){console.error(e);}
}

// -------------------------
// 🔹 MAPA
// -------------------------
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

// -------------------------
// 🔹 INICIO
// -------------------------
window.onload = async function init(){
  initMap();
  createCharts();
  await loadAllFromMongo();
  const latest = await loadLatestFromMongo();
  if(latest.length) variables.forEach(v => renderChart(v));

  setInterval(() => variables.forEach(v => renderChart(v)), 5000);
  setInterval(loadAllFromMongo, 30000);
};
