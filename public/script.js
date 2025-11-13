const variables = ["humedad","temperatura","conductividad","ph","nitrogeno","fosforo","potasio","bateria","corriente"];
const charts = {};
let allData = [];
let liveBuffer = [];
let lastMqttTimestamp = 0;

// ================= MAPA =================
let map, marker;
function initMap() {
  map = L.map('map').setView([0,0],2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  marker = L.marker([0,0]).addTo(map).bindPopup('Esperando datos GPS...');
}
function updateMap(lat, lon) {
  if(!map || !marker || lat === undefined || lon === undefined) return;
  marker.setLatLng([lat, lon]);
  map.setView([lat, lon], 14);
  marker.setPopupContent(`📍 Lat:${lat.toFixed(5)}<br>Lon:${lon.toFixed(5)}`).openPopup();
}

// ================= ECHARTS =================
function createCharts() {
  const container = document.getElementById('chartsContainer');
  variables.forEach(v => {
    const chartDiv = document.createElement('div');
    chartDiv.className = 'chartBox';
    chartDiv.id = 'chart_'+v;
    container.appendChild(chartDiv);

    const chart = echarts.init(chartDiv);
    const option = {
      useUTC:true,
      title: { text:v.toUpperCase(), left:'center', textStyle:{color:'#fff'} },
      tooltip: { trigger:'axis' },
      xAxis: { type:'time', axisLabel:{color:'#fff'} },
      yAxis: { type:'value', min:'dataMin', axisLabel:{color:'#fff'} },
      dataZoom:[{type:'inside'},{type:'slider', top:'85%'}],
      series:[{ type:'line', symbolSize:0, areaStyle:{}, data: [] }]
    };
    chart.setOption(option);
    charts[v] = chart;
  });
}

// ================= RENDER DATOS =================
function renderChart(v) {
  const chart = charts[v];
  if(!chart) return;
  const dataArray = allData.concat(liveBuffer);
  if(!dataArray.length) return;

  dataArray.sort((a,b) => new Date(a.fecha) - new Date(b.fecha));

  const seriesData = dataArray.map(d => [new Date(d.fecha).getTime(), d[v] ?? null]);
  chart.setOption({ series:[{ data: seriesData }] });
}

// ================= SOCKET.IO =================
const socket = io();
socket.on("connect",()=>console.log("🔌 Socket conectado"));
socket.on("disconnect",()=>console.log("🔌 Socket desconectado"));

socket.on("historico", (data) => {
  allData = data.map(d => ({...d, fecha:new Date(d.fecha)}));
  variables.forEach(v => renderChart(v));
});

socket.on("nuevoDato", (data) => {
  const record = {...data, fecha: new Date(data.fecha)};
  liveBuffer.push(record);
  if(liveBuffer.length>30) liveBuffer.shift();
  lastMqttTimestamp = Date.now();
  variables.forEach(v => renderChart(v));
  if(data.latitud!==undefined && data.longitud!==undefined) updateMap(data.latitud, data.longitud);
});

// ================= INIT =================
function init() {
  initMap();
  createCharts();

  // Cargar datos históricos desde tu API
  fetch('/api/data/all').then(r=>r.json()).then(d=>{
    allData = d.map(d => ({...d, fecha:new Date(d.fecha)}));
    variables.forEach(v => renderChart(v));
  });

  // Actualizar cada 30 seg
  setInterval(()=>{
    fetch('/api/data/latest').then(r=>r.json()).then(latest=>{
      allData = latest.map(d => ({...d, fecha:new Date(d.fecha)}));
      variables.forEach(v => renderChart(v));
    });
  }, 30000);
}
init();
