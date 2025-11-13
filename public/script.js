// ---- CONFIG ----
const socket = io();
const variables = [
  "humedad","temperatura","conductividad","ph",
  "nitrogeno","fosforo","potasio","bateria","corriente"
];

const colorMap = {
  humedad:"#00bcd4", temperatura:"#ff7043", conductividad:"#7e57c2", ph:"#81c784",
  nitrogeno:"#ffca28", fosforo:"#ec407a", potasio:"#29b6f6",
  bateria:"#8d6e63", corriente:"#c2185b"
};

const MAX_POINTS = 5000;
const CHUNK_SIZE = 1000;   // 🔥 Cargar 1000 registros por bloque
const dataBuffers = {};
const charts = {};

variables.forEach(v => dataBuffers[v] = {x:[], y:[]});

// ---- INIT MAP ----
let map, marker;
function initMap(){
  map = L.map('map').setView([4.65,-74.1], 12);
  L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution:'© OpenStreetMap' }
  ).addTo(map);

  marker = L.marker([4.65,-74.1])
    .addTo(map)
    .bindPopup("Esperando datos GPS…");
}

// ---- CREAR GRAFICAS ----
function createCharts(){
  variables.forEach(v => {
    const divId = "grafica_" + v;
    let container = document.getElementById(divId);

    if(!container){
      container = document.createElement("div");
      container.id = divId;
      container.style.width = "100%";
      container.style.height = "400px";
      container.style.marginTop = "12px";
      document.querySelector("#graficaPlotly").appendChild(container);
    }

    charts[v] = {
      div: container,
      trace: {
        x: [],
        y: [],
        type: "scattergl",
        mode: "lines",
        line: { color: colorMap[v], width: 2 },
        hovertemplate: "%{x}<br>" + v + ": %{y}<extra></extra>"
      },
      layout: {
        title: { text: v, font:{ color:"#00e5ff" }},
        plot_bgcolor:"#071923",
        paper_bgcolor:"#071923",
        font:{ color:"#eaf6f8" },
        xaxis:{
          type:"date",
          gridcolor:"#0f3a45",
          tickcolor:"#0f3a45",
          rangeslider:{ visible:true, bgcolor:"#021014" }
        },
        yaxis:{ gridcolor:"#0f3a45" }
      },
      config:{ responsive:true }
    };

    Plotly.newPlot(container, [charts[v].trace], charts[v].layout, charts[v].config);
  });
}

// ---- ACTUALIZAR UN SOLO PUNTO ----
function pushPoint(varName, fecha, value){
  const buf = dataBuffers[varName];

  buf.x.push(fecha);
  buf.y.push(value);

  if(buf.x.length > MAX_POINTS){
    buf.x.shift();
    buf.y.shift();
  }

  Plotly.react(
    charts[varName].div,
    [{
      x: buf.x,
      y: buf.y,
      type: "scattergl",
      mode: "lines",
      line:{color: colorMap[varName], width: 2}
    }],
    charts[varName].layout,
    charts[varName].config
  );
}

// ---- 🔥 CARGA POR BLOQUES (lazy load real) ----
async function loadChunk(skip){
  const url = `/api/data/chunk?skip=${skip}&limit=${CHUNK_SIZE}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error("Fallo chunk " + res.status);

  const data = await res.json();
  return data; // Array de registros
}

async function loadAllInBlocks(){
  let skip = 0;
  let totalLoaded = 0;

  while(true){
    const block = await loadChunk(skip);
    if(block.length === 0) break; // terminó

    block.forEach(rec => {
      const fecha = new Date(rec.fecha);

      variables.forEach(v => {
        if(rec[v] !== undefined && rec[v] !== null){
          dataBuffers[v].x.push(fecha);
          dataBuffers[v].y.push(rec[v]);
        }
      });
    });

    // actualizar gráficas después de cada bloque grande
    variables.forEach(v => {
      Plotly.react(
        charts[v].div,
        [{
          x: dataBuffers[v].x,
          y: dataBuffers[v].y,
          type:"scattergl",
          mode:"lines",
          line:{color:colorMap[v], width:2}
        }],
        charts[v].layout,
        charts[v].config
      );
    });

    totalLoaded += block.length;
    skip += CHUNK_SIZE;

    console.log(`📦 Cargado bloque: ${block.length} | Total: ${totalLoaded}`);

    // permitir respirar el navegador (IMPORTANTE)
    await new Promise(r => setTimeout(r));
  }

  console.log("✅ Carga por bloques completada");
}

// ---- SOCKET.IO ----
socket.on("nuevoDato", data => {
  const fecha = data.fecha ? new Date(data.fecha) : new Date();

  if(data.latitud !== undefined && data.longitud !== undefined){
    marker.setLatLng([data.latitud, data.longitud]);
    map.setView([data.latitud, data.longitud], 14);

    marker.setPopupContent(
      `📍 Lat:${data.latitud.toFixed(5)}<br>Lon:${data.longitud.toFixed(5)}`
    ).openPopup();
  }

  variables.forEach(v => {
    if(data[v] !== undefined && data[v] !== null){
      pushPoint(v, fecha, data[v]);
    }
  });
});

// ---- INICIO ----
(async function init(){
  initMap();
  createCharts();
  await loadAllInBlocks();
})();
