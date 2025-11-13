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

let charts = {};
let liveBuffer = [];
let allData = [];

// ---- CREAR GRÁFICOS ----
function createCharts(){
  variables.forEach(v => {
    const el = document.getElementById(v);
    if(!el) return;

    charts[v] = echarts.init(el);

    const option = {
      title:{text:v,left:'center',textStyle:{color:'#00e5ff'}},
      tooltip:{trigger:'axis'},
      xAxis:{
        type:'time',
        axisLabel:{color:'#ccc'},
        splitLine:{lineStyle:{color:'#1e3a4c'}}
      },
      yAxis:{
        type:'value',
        axisLabel:{color:'#ccc'},
        splitLine:{lineStyle:{color:'#1e3a4c'}}
      },
      series:[{
        type:'line',
        data:[],
        smooth:true,
        areaStyle:{color:colorMap[v]+'33'},
        lineStyle:{color:colorMap[v]}
      }],
      dataZoom:[
        {type:'inside',xAxisIndex:0},
        {type:'slider',xAxisIndex:0,height:20,bottom:10}
      ]
    };

    charts[v].setOption(option);

    // Botón reset zoom
    const btnReset = document.querySelector(`button[data-reset="${v}"]`);
    if(btnReset) btnReset.onclick = () => charts[v].dispatchAction({type:'dataZoom',start:0,end:100});
  });
}

// ---- RENDER CHART ----
function renderChart(v){
  const chart = charts[v];
  if(!chart) return;

  let dataArray = allData.concat(liveBuffer);
  if(!dataArray.length) return;

  dataArray.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));

  const labels = dataArray.map(d=>new Date(d.fecha).toLocaleString());
  const values = dataArray.map(d=>d[v]??null);

  // Mostrar últimos 15
  const total = labels.length;
  const start = Math.max(0,total-15);
  const option = {
    xAxis:{data:labels.slice(start)},
    series:[{data:values.slice(start)}]
  };

  chart.setOption(option);
}

// ---- SOCKET.IO ----
socket.on("nuevoDato", (data) => {
  const record = {...data, fecha:data.fecha? new Date(data.fecha):new Date()};
  liveBuffer.push(record);
  if(liveBuffer.length>LIVE_BUFFER_MAX) liveBuffer.shift();

  variables.forEach(v=> renderChart(v));

  if(data.latitud!==undefined && data.longitud!==undefined) updateMap(data.latitud,data.longitud);
});

socket.on("historico", (data) => {
  allData = data.map(d => ({...d, fecha:new Date(d.fecha)}));
  variables.forEach(v=> renderChart(v));
});

// ---- MAPA ----
let map, marker;
function initMap(){
  map = L.map('map').setView([0,0],2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  marker = L.marker([0,0]).addTo(map).bindPopup('Esperando datos GPS...');
}
function updateMap(lat,lon){
  if(!map||!marker) return;
  marker.setLatLng([lat,lon]);
  map.setView([lat,lon],14);
  marker.setPopupContent(`📍 Lat:${lat.toFixed(5)}<br>Lon:${lon.toFixed(5)}`).openPopup();
}

// ---- INICIO ----
initMap();
createCharts();
