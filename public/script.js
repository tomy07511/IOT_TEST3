// ---- CONFIG ----
const SOCKET_CONNECT_ORIGIN = window.location.origin;
const MQTT_TIMEOUT_MS = 20000;      // si no hay MQTT en 20s usamos Mongo
const LIVE_BUFFER_MAX = 30;         // cuantos puntos vivos guardamos
const TABLE_REFRESH_MS = 30000;     // actualizar tabla desde Mongo cada 30s

// ---- VARIABLES Y CHARTS ----
const socket = io.connect(SOCKET_CONNECT_ORIGIN, { transports: ["websocket", "polling"] });

// Nombres exactamente iguales a los del backend / Mongo
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

let displayMode = 'live'; // 'live' o 'historical'

// ---- CREAR GRÁFICOS ----
function createCharts() {
  variables.forEach(v => {
    const el = document.getElementById(v);
    if(!el) return;
    const ctx = el.getContext('2d');

    charts[v] = new Chart(ctx, {
      type:'line',
      data:{
        labels:[],
        datasets:[{
          label:v,
          data:[],
          borderColor:colorMap[v],
          backgroundColor:colorMap[v]+'33',
          fill:true,
          tension:0.25,
          pointRadius:2
        }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        interaction:{mode:'nearest',intersect:false},
        plugins:{
          legend:{labels:{color:'#fff'}},
          zoom:{
            pan:{enabled:true,mode:'x',modifierKey:'ctrl'},
            zoom:{
              drag:{
                enabled:true,
                backgroundColor:'rgba(0,229,255,0.25)',
                borderColor:'#00e5ff',
                borderWidth:1
              },
              mode:'x'
            }
          }
        },
        scales:{
          x:{
            ticks:{
              color:'#ccc',
              callback:function(val,index,values){
                // solo mostrar fechas si hay 15 o menos
                return charts[v].data.labels.length<=15 ? this.getLabelForValue(val) : '';
              }
            },
            grid:{color:'#1e3a4c'}
          },
          y:{ticks:{color:'#ccc'},grid:{color:'#1e3a4c'}}
        }
      }
    });

    // Botón Reset Zoom
    const btnReset = document.querySelector(`button[data-reset="${v}"]`);
    if(btnReset) btnReset.onclick=()=>charts[v].resetZoom();

    // Botones Datos actuales / Histórico
    const container = btnReset.parentElement;
    const btnLive = document.createElement('button');
    btnLive.textContent = 'Datos actuales';
    btnLive.className='btn';
    btnLive.style.marginLeft='6px';
    btnLive.disabled = true; // activo por defecto
    btnLive.onclick = () => {
      displayMode = 'live';
      btnLive.disabled = true;
      btnHist.disabled = false;
      renderChartsFromArray(liveBuffer);
    };

    const btnHist = document.createElement('button');
    btnHist.textContent = 'Histórico';
    btnHist.className='btn';
    btnHist.style.marginLeft='6px';
    btnHist.disabled = false;
    btnHist.onclick = () => {
      displayMode = 'historical';
      btnHist.disabled = true;
      btnLive.disabled = false;
      renderChartsFromArray(allData);
    };

    container.appendChild(btnLive);
    container.appendChild(btnHist);
  });
}

// ---- FUNCIONES DE GRAFICOS ----
function renderChartsFromArray(dataArray){
  if(!Array.isArray(dataArray)||!dataArray.length) return;
  const labels = dataArray.map(d => new Date(d.fecha).toLocaleString());
  variables.forEach(v => {
    if(!charts[v]) return;
    charts[v].data.labels = labels;
    charts[v].data.datasets[0].data = dataArray.map(d => d[v] ?? null);
    charts[v].update('none');
  });
}

// ---- SOCKET ----
socket.on("connect", () => console.log("🔌 Socket conectado"));
socket.on("disconnect", () => console.log("🔌 Socket desconectado"));

socket.on("nuevoDato", (data) => {
  const record = { ...data, fecha: data.fecha ? new Date(data.fecha) : new Date() };
  liveBuffer.push(record);
  if(liveBuffer.length > LIVE_BUFFER_MAX) liveBuffer.shift();
  lastMqttTimestamp = Date.now();

  if(displayMode==='live'){
    renderChartsFromArray(liveBuffer);
  }

  // Actualizar mapa si vienen coordenadas
  if(data.latitud!==undefined && data.longitud!==undefined){
    updateMap(data.latitud, data.longitud);
  }
});

socket.on("historico", (data) => {
  allData = data.map(d => ({ ...d, fecha: new Date(d.fecha) }));
  if(displayMode==='historical'){
    renderChartsFromArray(allData);
  }
});

// ---- FUNCIONES DE MONGO ----
async function loadLatestFromMongo(){
  try{
    const res = await fetch('/api/data/latest');
    if(!res.ok) throw new Error('Error '+res.status);
    const data = await res.json();
    return data.map(d => ({ ...d, fecha:new Date(d.fecha) }));
  }catch(e){console.error(e); return [];}
}

async function loadAllFromMongo(){
  try{
    const res = await fetch('/api/data/all');
    if(!res.ok) throw new Error('Error '+res.status);
    allData = await res.json();
    allData = allData.map(d => ({ ...d, fecha:new Date(d.fecha) }));
  }catch(e){console.error(e);}
}

// ---- MAPA ----
let map, marker;
function initMap() {
  map = L.map('map').setView([0,0],2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© OpenStreetMap'
  }).addTo(map);
  marker = L.marker([0,0]).addTo(map).bindPopup('Esperando datos GPS...');
}

function updateMap(lat,lon){
  if(!map||!marker||lat===undefined||lon===undefined) return;
  marker.setLatLng([lat,lon]);
  map.setView([lat,lon],14);
  marker.setPopupContent(`📍 Lat: ${lat.toFixed(5)}<br>Lon: ${lon.toFixed(5)}`).openPopup();
}

// ---- CICLOS ----
async function refreshDisplay(){
  const now = Date.now();
  const diff = now - lastMqttTimestamp;

  if(displayMode==='live'){
    if(lastMqttTimestamp!==0 && diff<=MQTT_TIMEOUT_MS && liveBuffer.length>0){
      renderChartsFromArray(liveBuffer);
    }else{
      const mongoLatest = await loadLatestFromMongo();
      if(mongoLatest.length>0){
        renderChartsFromArray(mongoLatest);
        allData = mongoLatest;
      }
    }
  }else if(displayMode==='historical'){
    renderChartsFromArray(allData);
  }
}

// ---- INICIO ----
(async function init(){
  initMap();
  createCharts();
  await loadAllFromMongo();
  const latest = await loadLatestFromMongo();
  if(latest.length) renderChartsFromArray(latest);

  setInterval(refreshDisplay,5000);
  setInterval(loadAllFromMongo,TABLE_REFRESH_MS);
})();
