// ---- CONFIG ----
const SOCKET_CONNECT_ORIGIN = window.location.origin;
const MQTT_TIMEOUT_MS = 20000;      // si no hay MQTT en 20s usamos Mongo
const LIVE_BUFFER_MAX = 30;         // cuantos puntos vivos guardamos
const TABLE_REFRESH_MS = 30000;     // actualizar tabla desde Mongo cada 30s

// ---- VARIABLES Y CHARTS ----
const socket = io.connect(SOCKET_CONNECT_ORIGIN, { transports: ["websocket", "polling"] });

const variables = ["humedad","temperatura","conductividad","pH","nitrogeno","fosforo","potasio","bateria"];

const charts = {};
function createChart(id, label){
  const el = document.getElementById(id);
  if(!el) return;
  const ctx = el.getContext("2d");
  charts[id] = new Chart(ctx, {
    type: "line",
    data: { labels: [], datasets: [{ label, data: [], borderColor: "#00ffff", backgroundColor: "rgba(0,255,255,0.15)", fill:true }] },
    options: { responsive:true, plugins:{ legend:{ display:true } }, scales:{ x:{ display:true }, y:{ display:true } } }
  });
}
variables.forEach(v => createChart(v, v.charAt(0).toUpperCase() + v.slice(1)));

let liveBuffer = [];
let lastMqttTimestamp = 0;

let allData = [];
let currentPage = 1;
const recordsPerPage = 20;

// ---- FUNCIONES DE GRAFICOS ----
function renderChartsFromArray(dataArray){
  const labels = dataArray.map(d => new Date(d.fecha).toLocaleTimeString());
  variables.forEach(v => {
    if(!charts[v]) return;
    charts[v].data.labels = labels;
    charts[v].data.datasets[0].data = dataArray.map(d => {
      if(v === "pH"){
        return d.pH !== undefined ? d.pH : (d.ph !== undefined ? d.ph : null);
      }
      return d[v] !== undefined ? d[v] : null;
    });
    charts[v].update();
  });
}

// ---- SOCKET ----
socket.on("connect", () => console.log("🔌 Socket conectado"));
socket.on("disconnect", () => console.log("🔌 Socket desconectado"));

socket.on("nuevoDato", (data) => {
  console.log("📡 Dato MQTT:", data);
  const record = { ...data, fecha: data.fecha ? new Date(data.fecha) : new Date() };
  liveBuffer.push(record);
  if(liveBuffer.length > LIVE_BUFFER_MAX) liveBuffer.shift();
  lastMqttTimestamp = Date.now();
  renderChartsFromArray(liveBuffer);
});

// Recibir histórico inicial
socket.on("historico", (data) => {
  console.log("📜 Histórico recibido:", data);
  renderChartsFromArray(data);
  allData = data;
  renderTable();
});

// ---- FUNCIONES DE MONGO ----
async function loadLatestFromMongo(){
  try {
    const res = await fetch("/api/data/latest");
    if(!res.ok) throw new Error("Respuesta no ok " + res.status);
    const data = await res.json();
    return data.map(d => ({ ...d, fecha: new Date(d.fecha) }));
  } catch (err) {
    console.error("❌ Error obteniendo últimos:", err);
    return [];
  }
}

async function loadAllFromMongo(){
  try {
    const res = await fetch("/api/data/all");
    if(!res.ok) throw new Error("Respuesta no ok " + res.status);
    allData = await res.json();
    allData = allData.map(d => ({ ...d, fecha: new Date(d.fecha) }));
    renderTable();
  } catch (err) {
    console.error("❌ Error cargando todos:", err);
    allData = [];
    renderTable();
  }
}

// ---- TABLA ----
function renderTable() {
  const tablaSelect = document.getElementById("tablaSelect")?.value || variables[0];
  const tableBody = document.querySelector("#dataTable tbody");
  if(!tableBody) return;
  const totalRecords = allData.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / recordsPerPage));
  if(currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * recordsPerPage;
  const end = start + recordsPerPage;
  const dataSlice = allData.slice(start, end);

  tableBody.innerHTML = dataSlice.map(d => `
    <tr>
      <td>${new Date(d.fecha).toLocaleString()}</td>
      <td>${d[tablaSelect] !== undefined ? d[tablaSelect] : (d[tablaSelect.toLowerCase()] ?? "")}</td>
    </tr>
  `).join("");
}

// ---- CICLOS ----
async function refreshDisplay(){
  const now = Date.now();
  const diff = now - lastMqttTimestamp;
  if(lastMqttTimestamp !== 0 && diff <= MQTT_TIMEOUT_MS && liveBuffer.length > 0){
    renderChartsFromArray(liveBuffer);
  } else {
    const mongoLatest = await loadLatestFromMongo();
    if(mongoLatest.length) renderChartsFromArray(mongoLatest);
  }
}

(async function init(){
  await loadAllFromMongo();
  const latest = await loadLatestFromMongo();
  if(latest.length) renderChartsFromArray(latest);

  setInterval(refreshDisplay, 5000);
  setInterval(loadAllFromMongo, TABLE_REFRESH_MS);
})();
