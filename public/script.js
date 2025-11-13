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
            zoom:{
              drag:{enabled:true,backgroundColor:'rgba(0,229,255,0.25)',borderColor:'#00e5ff',borderWidth:1},
              mode:'x'
            }
          }
        },
        scales:{
          x:{ticks:{color:'#ccc'}, grid:{color:'#1e3a4c'}},
          y:{ticks:{color:'#ccc'}, grid:{color:'#1e3a4c'}}
        }
      }
    });

    charts[v].slider = createSlider(v);

    // === BOTON RESET ZOOM ===
    const btnReset = document.querySelector(`button[data-reset="${v}"]`);
    if(btnReset) btnReset.onclick = () => charts[v].resetZoom();

    // === FLECHAS IZQ/DER ===
    const btnLeft = document.createElement('button');
    btnLeft.textContent = '◀';
    btnLeft.className = 'btn';
    btnLeft.style.marginLeft = '6px';
    btnLeft.onclick = () => {
      const chart = charts[v];
      let val = parseInt(chart.slider.value);
      chart.slider.value = Math.max(0, val-5);
      chart.slider.oninput();
    };

    const btnRight = document.createElement('button');
    btnRight.textContent = '▶';
    btnRight.className = 'btn';
    btnRight.style.marginLeft = '6px';
    btnRight.onclick = () => {
      const chart = charts[v];
      let val = parseInt(chart.slider.value);
      chart.slider.value = Math.min(100, val+5);
      chart.slider.oninput();
    };

    const actionsDiv = btnReset.parentElement;
    actionsDiv.appendChild(btnLeft);
    actionsDiv.appendChild(btnRight);
    actionsDiv.appendChild(charts[v].slider);
  });
}

// ---- CREAR SLIDER ----
function createSlider(v) {
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = 0;
  slider.max = 100;
  slider.value = 100; // 100 = datos actuales
  slider.className = 'slider';
  slider.style.width = '100%';
  slider.style.marginTop = '6px';
  slider.oninput = () => {
    const chart = charts[v];
    if(!chart._allLabels) return;
    const total = chart._allLabels.length;
    const windowSize = Math.min(15, total);
    let end = Math.floor((slider.value/100) * (total - windowSize)) + windowSize;
    end = Math.min(end, total);
    const start = Math.max(0, end - windowSize);
    chart.data.labels = chart._allLabels.slice(start,end);
    chart.data.datasets[0].data = chart._allData.slice(start,end);
    chart.update();
  };
  return slider;
}

// ---- FUNCIONES DE GRÁFICOS ----
function renderChart(v){
  const chart = charts[v];
  if(!chart) return;
  let dataArray = liveBuffer.concat(allData); // todos los datos disponibles
  if(!dataArray.length) return;

  chart._allLabels = dataArray.map(d => new Date(d.fecha).toLocaleString());
  chart._allData = dataArray.map(d => d[v] ?? null);

  // actualizar slider para mostrar últimos datos (100%)
  chart.slider.value = 100;
  chart.slider.oninput();
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

  if(data.latitud!==undefined && data.longitud!==undefined) updateMap(data.latitud,data.longitud);
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

  if(diff <= MQTT_TIMEOUT_MS && liveBuffer.length>0){
    variables.forEach(v => renderChart(v));
  } else {
    const mongoLatest = await loadLatestFromMongo();
    if(mongoLatest.length>0){
      allData = mongoLatest;
      variables.forEach(v => renderChart(v));
    }
  }
}

// ---- INICIO ----
(async function init(){
  initMap();
  createCharts();
  await loadAllFromMongo();
  const latest = await loadLatestFromMongo();
  if(latest.length) variables.forEach(v => renderChart(v));

  setInterval(refreshDisplay,5000);
  setInterval(loadAllFromMongo,TABLE_REFRESH_MS);
})();
