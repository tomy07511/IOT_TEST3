// ================= MAPA =================
const map = L.map('map').setView([0,0],2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'© OpenStreetMap'
}).addTo(map);
const marker = L.marker([0,0]).addTo(map).bindPopup('Esperando datos GPS...');

function updateMap(lat, lon){
  marker.setLatLng([lat,lon]);
  map.setView([lat,lon],14);
  marker.setPopupContent(`📍 Lat:${lat.toFixed(5)}<br>Lon:${lon.toFixed(5)}`).openPopup();
}

// ================= ECHARTS =================
var roundTime = echarts.time.roundTime;
var formatTime = echarts.time.format;
var BREAK_GAP = '1%';
var DATA_ZOOM_MIN_VALUE_SPAN = 3600*1000;

const myChart = echarts.init(document.getElementById('main'));
let allData = [];

function renderChart(dataArray){
  if(!dataArray.length) return;
  dataArray.sort((a,b)=>new Date(a.fecha)-new Date(b.fecha));

  const seriesData = [];
  const breaks = [];
  let prevDay = null;

  dataArray.forEach(d=>{
    const time = new Date(d.fecha).getTime();
    const val = d.temperatura ?? NaN; // Cambia la variable que quieras graficar
    seriesData.push([time,val]);
    const day = new Date(d.fecha).getUTCDate();
    if(prevDay!==null && day!==prevDay) breaks.push({start:time-1,end:time,gap:BREAK_GAP});
    prevDay = day;
  });

  const option = {
    useUTC:true,
    title:{ text:'Temperatura en Tiempo Real', left:'center' },
    tooltip:{ trigger:'axis' },
    grid:{ outerBounds:{ top:'20%', bottom:'30%' } },
    xAxis:[{
      type:'time',
      interval: 1000*60*30,
      axisLabel:{ 
        showMinLabel:true, 
        showMaxLabel:true,
        formatter:(t,_,opt)=>opt.break?echarts.time.format(t,'{HH}:{mm}\n{dd}d',true):echarts.time.format(t,'{HH}:{mm}',true)
      },
      breaks: breaks,
      breakArea:{ expandOnClick:false, zigzagAmplitude:0, zigzagZ:200, itemStyle:{borderColor:'none',opacity:0} }
    }],
    yAxis:{ type:'value', min:'dataMin' },
    dataZoom:[
      { type:'inside', minValueSpan: DATA_ZOOM_MIN_VALUE_SPAN },
      { type:'slider', top:'73%', minValueSpan: DATA_ZOOM_MIN_VALUE_SPAN }
    ],
    series:[{ type:'line', symbolSize:0, areaStyle:{}, data:seriesData }]
  };

  myChart.setOption(option);
}

// ================= SOCKET.IO =================
const socket = io();
socket.on("connect", ()=>console.log("🔌 Socket conectado"));
socket.on("disconnect", ()=>console.log("🔌 Socket desconectado"));

// Datos en tiempo real
socket.on("nuevoDato", (data)=>{
  const record = {...data, fecha:new Date(data.fecha)};
  allData.push(record);
  if(allData.length>200) allData.shift(); // Limitar buffer
  renderChart(allData);

  if(data.latitud!==undefined && data.longitud!==undefined)
    updateMap(data.latitud,data.longitud);
});

// Históricos iniciales
socket.on("historico", (data)=>{
  allData = data.map(d=>({...d, fecha:new Date(d.fecha)}));
  renderChart(allData);
});
