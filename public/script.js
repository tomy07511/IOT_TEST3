// ==== CONFIG ====
const SOCKET_CONNECT_ORIGIN = window.location.origin;
const MQTT_TIMEOUT_MS = 20000;
const LIVE_BUFFER_MAX = 60;
const TABLE_REFRESH_MS = 30000;

// === SOCKET.IO ===
const socket = io.connect(SOCKET_CONNECT_ORIGIN, { transports: ["websocket","polling"] });

// === VARIABLES ===
const variables = ["humedad","temperatura","conductividad","ph","nitrogeno","fosforo","potasio","bateria","corriente"];
const colorMap = {
  humedad:"#00bcd4", temperatura:"#ff7043", conductividad:"#7e57c2", ph:"#81c784",
  nitrogeno:"#ffca28", fosforo:"#ec407a", potasio:"#29b6f6", bateria:"#8d6e63", corriente:"#c2185b"
};

let charts = {};       // gráfico grande
let chartsSmall = {};  // gráfico histórico pequeño
let liveBuffer = [];
let allData = [];
let lastMqttTimestamp = 0;

// === CREAR GRÁFICAS ===
function createCharts(){
  const container = document.getElementById("chartsGrid");
  variables.forEach(v=>{
    const card = document.createElement("div");
    card.className="card";
    card.innerHTML=`<h4>${v.charAt(0).toUpperCase()+v.slice(1)}</h4>
                    <canvas id="main_${v}"></canvas>
                    <div class="card-small"><canvas id="small_${v}"></canvas></div>`;
    container.appendChild(card);

    // principal
    const ctx = document.getElementById(`main_${v}`).getContext('2d');
    charts[v] = new Chart(ctx,{
      type:'line',
      data:{labels:[],datasets:[{label:v,data:[],borderColor:colorMap[v],backgroundColor:colorMap[v]+'33',fill:true,tension:0.25,pointRadius:2}]},
      options:{
        responsive:true, maintainAspectRatio:false,
        interaction:{mode:'nearest',intersect:false},
        plugins:{
          legend:{labels:{color:'#fff'}},
          zoom:{
            pan:{enabled:true,mode:'x',modifierKey:'ctrl'},
            zoom:{wheel:{enabled:true},pinch:{enabled:true},mode:'x'}
          }
        },
        scales:{
          x:{ticks:{color:'#ccc'},grid:{color:'#1e3a4c'}},
          y:{ticks:{color:'#ccc'},grid:{color:'#1e3a4c'}}
        }
      }
    });

    // histórico pequeño
    const ctx2 = document.getElementById(`small_${v}`).getContext('2d');
    chartsSmall[v] = new Chart(ctx2,{
      type:'line',
      data:{labels:[],datasets:[{label:v,data:[],borderColor:colorMap[v],backgroundColor:colorMap[v]+'33',fill:true,tension:0.25,pointRadius:0}]},
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{
          x:{ticks:{display:false},grid:{display:false}},
          y:{display:false}
        },
        onClick:(e,active)=>{
          const xScale = charts[v].scales.x;
          if(!active.length) return;
          const idx = active[0].index;
          const point = chartsSmall[v].data.labels[idx];
          const range = 20; // cantidad de puntos a mostrar en grande
          const start = Math.max(0, idx-range);
          const end = Math.min(chartsSmall[v].data.labels.length, idx+range);
          charts[v].options.scales.x.min = chartsSmall[v].data.labels[start];
          charts[v].options.scales.x.max = chartsSmall[v].data.labels[end];
          charts[v].update();
        }
      }
    });
  });
}

// === RENDERIZAR DATOS ===
function renderChartsFromArray(dataArray){
  if(!Array.isArray(dataArray)||!dataArray.length) return;
  const labels = dataArray.map(d=>new Date(d.fecha));
  variables.forEach(v=>{
    const main = charts[v];
    const small = chartsSmall[v];
    if(!main || !small) return;
    main.data.labels = labels;
    main.data.datasets[0].data = dataArray.map(d=>d[v]??d[v.toLowerCase()]??null);
    main.update('none');

    small.data.labels = labels;
    small.data.datasets[0].data = dataArray.map(d=>d[v]??d[v.toLowerCase()]??null);
    small.update('none');
  });
}

// === SOCKET.IO ===
socket.on('connect',()=>console.log('Socket conectado'));
socket.on('disconnect',()=>console.log('Socket desconectado'));
socket.on('nuevoDato',(data)=>{
  const rec={...data,fecha:data.fecha?new Date(data.fecha):new Date()};
  liveBuffer.push(rec);
  if(liveBuffer.length>LIVE_BUFFER_MAX) liveBuffer.shift();
  lastMqttTimestamp=Date.now();
  renderChartsFromArray(liveBuffer);
});
socket.on('historico',(arr)=>{
  allData=(arr||[]).map(d=>({...d,fecha:d.fecha?new Date(d.fecha):new Date()}));
  liveBuffer = allData.slice(-LIVE_BUFFER_MAX);
  renderChartsFromArray(liveBuffer);
});

// === INIT MAP & CHARTS ===
createCharts();

// MAP
const map = L.map('map', {fullscreenControl:false}).setView([0,0],2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
L.control.fullscreen({position:'topright',title:'Pantalla completa',titleCancel:'Salir'}).addTo(map);
let marker=null;
function safeSetView(lat,lon,zoom=14){
  if(typeof lat!=='number'||typeof lon!=='number'||Number.isNaN(lat)||Number.isNaN(lon)) return;
  if(!marker) marker=L.marker([lat,lon]).addTo(map);
  else marker.setLatLng([lat,lon]);
  marker.bindPopup(`📍 Lat: ${lat.toFixed(6)}<br>Lon: ${lon.toFixed(6)}`).openPopup();
  map.setView([lat,lon],zoom);
}

// === REFRESH LOGIC ===
async function loadLatestFromMongo(){
  try{
    const res = await fetch('/api/data/latest');
    const json = await res.json();
    return json.map(d=>({...d,fecha:new Date(d.fecha)}));
  }catch(e){console.error(e); return [];}
}

async function refreshDisplay(){
  const now = Date.now();
  if(lastMqttTimestamp!==0 && (now-lastMqttTimestamp)<=MQTT_TIMEOUT_MS && liveBuffer.length>0){
    renderChartsFromArray(liveBuffer);
  }else{
    const latest = await loadLatestFromMongo();
    if(latest.length) renderChartsFromArray(latest);
  }
}

setInterval(refreshDisplay,5000);
setInterval(async()=>{
  const latest = await loadLatestFromMongo();
  allData = latest;
},TABLE_REFRESH_MS);
