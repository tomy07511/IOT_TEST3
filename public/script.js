import * as echarts from 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.esm.min.js';
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  DataZoomComponent
} from 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.esm.min.js';
import { LineChart } from 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.esm.min.js';
import { UniversalTransition, AxisBreak } from 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.esm.min.js';
import { CanvasRenderer } from 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.esm.min.js';

echarts.use([
  TitleComponent, TooltipComponent, GridComponent, DataZoomComponent,
  LineChart, CanvasRenderer, UniversalTransition, AxisBreak
]);

const variables = ["humedad","temperatura","conductividad","ph","nitrogeno","fosforo","potasio","bateria","corriente"];
const charts = {};
let liveBuffer = [];
let allData = [];
let lastMqttTimestamp = 0;

// ================= MAPA =================
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

// ================= ECHARTS =================
function createChart(id){
  const dom = document.getElementById(id);
  const chart = echarts.init(dom);
  const option = {
    useUTC:true,
    title:{text:id, left:'center'},
    tooltip:{trigger:'axis'},
    xAxis:[{type:'time', breaks:[], axisLabel:{formatter:(t,_,opt)=>opt.break?echarts.time.format(t,'{HH}:{mm}\n{dd}d',true):echarts.time.format(t,'{HH}:{mm}',true)}}],
    yAxis:{type:'value', min:'dataMin'},
    dataZoom:[{type:'inside'},{type:'slider',top:'75%'}],
    series:[{type:'line', symbolSize:0, areaStyle:{}, data:[]}]
  };
  chart.setOption(option);
  charts[id] = chart;
}

// Render con datos reales
function renderChart(id){
  const chart = charts[id];
  if(!chart) return;
  const dataArray = allData.concat(liveBuffer);
  if(!dataArray.length) return;

  // Ordenar y crear breaks
  dataArray.sort((a,b)=>new Date(a.fecha)-new Date(b.fecha));
  const seriesData = [];
  const breaks = [];
  let prevDay = null;

  dataArray.forEach(d=>{
    const time = new Date(d.fecha).getTime();
    const val = d[id] ?? NaN;
    seriesData.push([time,val]);
    const day = new Date(d.fecha).getUTCDate();
    if(prevDay!==null && day!==prevDay) breaks.push({start:time-1, end:time, gap:'1%'});
    prevDay = day;
  });

  chart.setOption({
    xAxis:[{breaks}],
    series:[{data:seriesData}]
  });
}

// ================= SOCKET.IO =================
const socket = io();
socket.on("connect",()=>console.log("🔌 Socket conectado"));
socket.on("disconnect",()=>console.log("🔌 Socket desconectado"));
socket.on("nuevoDato",(data)=>{
  const record = {...data, fecha: new Date(data.fecha)};
  liveBuffer.push(record);
  if(liveBuffer.length>30) liveBuffer.shift();
  lastMqttTimestamp = Date.now();
  variables.forEach(v=>renderChart(v));
  if(data.latitud!==undefined && data.longitud!==undefined) updateMap(data.latitud,data.longitud);
});
socket.on("historico",(data)=>{
  allData = data.map(d=>({...d, fecha:new Date(d.fecha)}));
  variables.forEach(v=>renderChart(v));
});

// ================= INIT =================
function init(){
  initMap();
  variables.forEach(createChart);

  fetch('/api/data/all').then(r=>r.json()).then(d=>{
    allData = d.map(d=>({...d, fecha:new Date(d.fecha)}));
    variables.forEach(v=>renderChart(v));
  });

  setInterval(()=>{
    fetch('/api/data/latest').then(r=>r.json()).then(latest=>{
      allData = latest.map(d=>({...d, fecha:new Date(d.fecha)}));
      variables.forEach(v=>renderChart(v));
    });
  },30000);
}
init();
