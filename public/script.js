const variables = ["humedad","temperatura","conductividad","ph","nitrogeno","fosforo","potasio","bateria","corriente"];
const charts = {};
let allData = [];
let liveBuffer = [];
let lastMqttTimestamp = 0;

// Colores llamativos para cada gráfica
const colors = ['#ff6384','#36a2eb','#ffcd56','#4bc0c0','#9966ff','#ff9f40','#c9cbcf','#00ff99','#ff00ff'];

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

// ================= TIMELINE =================
function createTimeline(v){
  const container = document.createElement('div');
  container.style.display='flex';
  container.style.alignItems='center';
  container.style.marginTop='4px';
  container.style.gap='6px';
  container.style.background='#222';
  container.style.padding='4px';
  container.style.borderRadius='4px';

  const labelStart = document.createElement('label'); labelStart.textContent='Desde:'; 
  const inputStart = document.createElement('input'); inputStart.type='date';
  const labelEnd = document.createElement('label'); labelEnd.textContent='Hasta:'; 
  const inputEnd = document.createElement('input'); inputEnd.type='date';

  container.append(labelStart,inputStart,labelEnd,inputEnd);

  function updateChartRange(){
    const chart = charts[v];
    if(!chart._allLabels) return;

    let startDate = inputStart.value ? new Date(inputStart.value) : null;
    let endDate = inputEnd.value ? new Date(inputEnd.value) : null;

    let filteredLabels=[], filteredData=[];
    for(let i=0;i<chart._allLabels.length;i++){
      const lblDate = new Date(chart._allLabels[i]);
      if((!startDate || lblDate>=startDate)&&(!endDate || lblDate<=endDate)){
        filteredLabels.push(chart._allLabels[i]);
        filteredData.push(chart._allData[i]);
      }
    }

    chart.setOption({ series:[{data:filteredData}] });
    chart.setOption({ xAxis:[{data:filteredLabels}] });
  }

  inputStart.onchange = updateChartRange;
  inputEnd.onchange = updateChartRange;

  return container;
}

// ================= ECHARTS =================
function createCharts() {
  const container = document.getElementById('chartsContainer');
  variables.forEach((v,i)=>{
    const chartDiv = document.createElement('div');
    chartDiv.className='chartBox';
    chartDiv.id='chart_'+v;
    container.appendChild(chartDiv);

    const chart = echarts.init(chartDiv);
    const option = {
      useUTC:true,
      title:{ text:v.toUpperCase(), left:'center', textStyle:{color:'#fff'} },
      tooltip:{ trigger:'axis' },
      xAxis:{ type:'time', axisLabel:{color:'#fff'} },
      yAxis:{ type:'value', min:'dataMin', axisLabel:{color:'#fff'} },
      series:[{
        type:'line',
        symbolSize:0,
        areaStyle:{color:colors[i]},
        lineStyle:{color:colors[i]},
        data:[]
      }],
      grid:{bottom:60}
    };
    chart.setOption(option);
    charts[v]=chart;

    // Timeline debajo de la gráfica
    const timeline = createTimeline(v);
    container.appendChild(timeline);
  });
}

// ================= RENDER DATOS =================
function renderChart(v){
  const chart = charts[v];
  if(!chart) return;

  const dataArray = allData.concat(liveBuffer); // históricos + live
  if(!dataArray.length) return;

  dataArray.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));
  chart._allLabels = dataArray.map(d=>new Date(d.fecha).toLocaleString());
  chart._allData = dataArray.map(d=>d[v]??null);

  chart.setOption({
    xAxis:[{type:'time', data:chart._allLabels}],
    series:[{data:chart._allData}]
  });
}

// ================= SOCKET.IO =================
const socket = io();
socket.on("historico", data=>{
  allData = data.map(d=>({...d, fecha:new Date(d.fecha)}));
  variables.forEach(v=>renderChart(v));
});
socket.on("nuevoDato", data=>{
  const record={...data, fecha:new Date(data.fecha)};
  liveBuffer.push(record);
  if(liveBuffer.length>30) liveBuffer.shift();
  lastMqttTimestamp = Date.now();
  variables.forEach(v=>renderChart(v));
  if(data.latitud!==undefined && data.longitud!==undefined) updateMap(data.latitud,data.longitud);
});

// ================= INIT =================
function init(){
  initMap();
  createCharts();

  fetch('/api/data/all')
    .then(r=>r.json())
    .then(d=>{
      allData = d.map(d=>({...d, fecha:new Date(d.fecha)}));
      variables.forEach(v=>renderChart(v));
    });

  setInterval(()=>{
    fetch('/api/data/latest')
      .then(r=>r.json())
      .then(latest=>{
        allData = latest.map(d=>({...d, fecha:new Date(d.fecha)}));
        variables.forEach(v=>renderChart(v));
      });
  },30000);
}

init();
