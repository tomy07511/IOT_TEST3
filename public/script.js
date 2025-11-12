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

// ---- CREAR GRÁFICOS ----
function createCharts() {
  variables.forEach(v => {
    const el = document.getElementById(v);
    if(!el) return;
    const ctx = el.getContext('2d');

    // Contenedor con scroll
    const container = el.parentElement;
    container.style.overflowX = "auto";
    container.style.overflowY = "hidden";

    charts[v] = new Chart(ctx, {
      type:'line',
      data:{labels:[],datasets:[{
        label:v,
        data:[],
        borderColor:colorMap[v],
        backgroundColor:colorMap[v]+'33',
        fill:true,
        tension:0.25,
        pointRadius:4
      }]},
      options:{
        responsive:true,
        maintainAspectRatio:false,
        interaction:{mode:'nearest',intersect:false},
        animation:{duration:400,easing:'linear'},
        plugins:{
          legend:{labels:{color:'#fff'}},
          zoom:{
            pan:{enabled:true,mode:'x',modifierKey:'ctrl'},
            zoom:{drag:{enabled:true,backgroundColor:'rgba(0,229,255,0.25)',borderColor:'#00e5ff',borderWidth:1},mode:'x'}
          }
        },
        scales:{
          x:{
            ticks:{
              color:'#ccc',
              callback:function(val,index){ 
                return this.chart.data.labels.length <= 15 ? this.chart.data.labels[index] : '';
              }
            },
            grid:{color:'#1e3a4c'}
          },
          y:{ticks:{color:'#ccc'},grid:{color:'#1e3a4c'}}
        }
      }
    });

    // Modo individual por gráfico
    charts[v].displayMode = 'live';

    const btnReset = document.querySelector(`button[data-reset="${v}"]`);
    if(btnReset) btnReset.onclick=()=>charts[v].resetZoom();

    // Botones individualizados
    const btnLive = document.createElement('button');
    btnLive.textContent = 'Datos actuales';
    btnLive.className='btn';
    btnLive.style.marginLeft='6px';
    btnLive.disabled = true;
    btnLive.onclick = () => {
      charts[v].displayMode = 'live';
      btnLive.disabled = true;
      btnHist.disabled = false;
      charts[v].resetZoom(); // resetea zoom
      renderChart(v);
      container.scrollLeft = container.scrollWidth; // ir al final
    };

    const btnHist = document.createElement('button');
    btnHist.textContent = 'Histórico';
    btnHist.className='btn';
    btnHist.style.marginLeft='6px';
    btnHist.disabled=false;
    btnHist.onclick = () => {
      charts[v].displayMode = 'historical';
      btnHist.disabled = true;
      btnLive.disabled = false;
      charts[v].resetZoom(); // resetea zoom
      renderChart(v);
      container.scrollLeft = 0; // ir al inicio
    };

    const actionsDiv = btnReset.parentElement;
    actionsDiv.appendChild(btnLive);
    actionsDiv.appendChild(btnHist);
  });
}

// ---- FUNCIONES DE GRAFICOS ----
function renderChart(v){
  const chart = charts[v];
  if(!chart) return;
  let dataArray = chart.displayMode==='live' ? liveBuffer : allData;
  if(!Array.isArray(dataArray)||!dataArray.length) return;

  const labels = dataArray.map(d => new Date(d.fecha).toLocaleString());

  if(chart.displayMode==='live' && dataArray===liveBuffer){
    const lastRecord = dataArray[dataArray.length-1];
    if(lastRecord){
      chart.data.labels.push(new Date(lastRecord.fecha).toLocaleString());
      chart.data.datasets[0].data.push(lastRecord[v] ?? null);
      if(chart.data.labels.length>LIVE_BUFFER_MAX){
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
      }
    }
  } else {
    chart.data.labels = labels;
    chart.data.datasets[0].data = dataArray.map(d => d[v] ?? null);
  }

  chart.update();

  // Ajustar scroll horizontal según modo
  const container = chart.canvas.parentElement;
  if(chart.displayMode==='live') container.scrollLeft = container.scrollWidth;
  else container.scrollLeft = 0;
}

// ---- SOCKET ----
socket.on("connect", () => console.log("🔌 Socket conectado"));
socket.on("disconnect", () => console.log("🔌 Socket desconectado"));

socket.on("nuevoDato", (data) => {
  const record = {...data, fecha: data.fecha? new Date(data.fecha): new Date()};
  liveBuffer.push(record);
  if(liveBuffer.length>LIVE_BUFFER_MAX) liveBuffer.shift();
  lastMqttTimestamp = Date.now();

  variables.forEach(v=>{
    if(charts[v].displayMode==='live') renderChart(v);
  });

  if(data.latitud!==undefined && data.longitud!==undefined) updateMap(data.latitud,data.longitud);
});

socket.on("historico", (data) => {
  allData = data.map(d => ({...d, fecha:new Date(d.fecha)}));
  variables.forEach(v=>{
    if(charts[v].displayMode==='historical') renderChart(v);
  });
});

// ---- MONGO ----
async function loadLatestFromMongo(){
  try{
    const res = await fetch('/api/data/latest');
    if(!res.ok) throw new Error('Error '+res.status);
    const data = await res.json();
    return data.map(d=>({...d,fecha:new Date(d.fecha)}));
  }catch(e){console.error(e);return [];}
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
    if(charts[v].displayMode==='live'){
      if(lastMqttTimestamp!==0 && diff<=MQTT_TIMEOUT_MS && liveBuffer.length>0){
        renderChart(v);
      } else {
        const mongoLatest = await loadLatestFromMongo();
        if(mongoLatest.length>0){
          allData = mongoLatest;
          renderChart(v);
        }
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
  if(latest.length) variables.forEach(v=>{if(charts[v].displayMode==='live') renderChart(v);});

  setInterval(refreshDisplay,5000);
  setInterval(loadAllFromMongo,TABLE_REFRESH_MS);
})();
