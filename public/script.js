// ---- CONFIG ----
const SOCKET_CONNECT_ORIGIN = window.location.origin;
const MQTT_TIMEOUT_MS = 20000;      // si no hay MQTT en 20s usamos Mongo
const LIVE_BUFFER_MAX = 30;         // cuantos puntos vivimos guardamos
const TABLE_REFRESH_MS = 30000;     // actualizar tabla desde Mongo cada 30s

// ---- VARIABLES Y CHARTS ----
const socket = io.connect(SOCKET_CONNECT_ORIGIN, { transports: ["websocket", "polling"] });

// Variables que usas (debe coincidir con tus canvases ids)
const variables = ["humedad","temperatura","conductividad","pH","nitrogeno","fosforo","potasio","bateria"];

// crear charts (si ya tienes función createChart, puedes usarla; aquí es autónoma)
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

// ---- BUFFERS Y ESTADO ----
let liveBuffer = [];           // array de objetos {fecha: Date, ...datos...}
let lastMqttTimestamp = 0;     // ms desde epoch

let allData = [];              // datos desde Mongo (tabla)
let currentPage = 1;
const recordsPerPage = 20;

// ---- FUNCIONES DE RENDERIZADO GRAFICAS ----
function renderChartsFromArray(dataArray){
  // dataArray: array ordenado viejo->nuevo
  const labels = dataArray.map(d => new Date(d.fecha).toLocaleTimeString());
  variables.forEach(v => {
    if(!charts[v]) return;
    charts[v].data.labels = labels;
    charts[v].data.datasets[0].data = dataArray.map(d => {
      // cuidado con nombres pH vs ph
      if(v === "pH"){
        return d.pH !== undefined ? d.pH : (d.ph !== undefined ? d.ph : null);
      }
      return d[v] !== undefined ? d[v] : null;
    });
    charts[v].update();
  });
}

// ---- MQTT / SOCKET HANDLERS ----
socket.on("connect", () => console.log("🔌 Socket.IO conectado"));
socket.on("disconnect", () => console.log("🔌 Socket.IO desconectado"));

socket.on("nuevoDato", (data) => {
  try {
    console.log("📡 MQTT en vivo (socket):", data);
    // guardar en buffer (mantener orden viejo->nuevo)
    const record = { ...data, fecha: data.fecha ? new Date(data.fecha) : new Date() };
    liveBuffer.push(record);
    if(liveBuffer.length > LIVE_BUFFER_MAX) liveBuffer.shift();
    lastMqttTimestamp = Date.now();

    // Mostrar el buffer en graficas (usamos orden viejo->nuevo)
    renderChartsFromArray(liveBuffer.map(d => ({ ...d, fecha: d.fecha })));

    // opcional: también actualizar tabla visual si quieres (agregar al tope)
    // allData.unshift(record); renderTable();  // si prefieres que tabla muestre lo ultimo también sin esperar Mongo
  } catch (e) {
    console.error("Error manejando nuevoDato", e);
  }
});

// ---- FUNCIONES PARA OBTENER DATOS DE MONGO ----
async function loadLatestFromMongo(){
  try {
    const res = await fetch("/api/data/latest");
    if(!res.ok) throw new Error("Respuesta no ok " + res.status);
    const data = await res.json(); // espera array ordenado viejo->nuevo por tu server
    // asegurar que fecha sea Date
    const normalized = data.map(d => ({ ...d, fecha: new Date(d.fecha) }));
    console.log("📥 Últimos 10 desde Mongo:", normalized);
    return normalized;
  } catch (err) {
    console.error("❌ Error cargando últimos de Mongo:", err);
    return [];
  }
}

async function loadAllFromMongo(){
  try {
    const res = await fetch("/api/data/all");
    if(!res.ok) throw new Error("Respuesta no ok " + res.status);
    allData = await res.json();
    // normalizar fechas
    allData = allData.map(d => ({ ...d, fecha: new Date(d.fecha) }));
    renderTable();
    console.log("📋 Tabla cargada desde Mongo:", allData.length, "registros");
  } catch (err) {
    console.error("❌ Error cargando todos los datos:", err);
    allData = [];
    renderTable();
  }
}

// ---- RENDER TABLA (mismo estilo que tenías) ----
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

  const pagination = document.getElementById("pagination");
  if(pagination){
    pagination.innerHTML = "";
    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement("button");
      btn.textContent = i;
      btn.disabled = i === currentPage;
      btn.onclick = () => { currentPage = i; renderTable(); };
      pagination.appendChild(btn);
    }
  }

  const recordInfo = document.getElementById("recordInfo");
  if(recordInfo) recordInfo.textContent = `Mostrando ${start+1}-${Math.min(end, totalRecords)} de ${totalRecords} registros`;
}

// ---- LÓGICA PRINCIPAL: escoger mostrar LIVE o MONGO cada intervalo ----
async function refreshDisplay(){
  const now = Date.now();
  const diff = now - lastMqttTimestamp;

  if(lastMqttTimestamp !== 0 && diff <= MQTT_TIMEOUT_MS && liveBuffer.length > 0){
    // mostrar en vivo (ya lo hace el handler), pero por si se llama el primer ciclo:
    renderChartsFromArray(liveBuffer.map(d => ({ ...d, fecha: d.fecha })));
  } else {
    // no hay datos MQTT recientes --> usar Mongo (últimos 10)
    const mongoLatest = await loadLatestFromMongo(); // devuelve viejo->nuevo
    if(mongoLatest.length) {
      // rellenar charts con mongoLatest
      renderChartsFromArray(mongoLatest);
    }
  }
}

// ---- inicialización ----
(async function init(){
  // cargar tabla completa
  await loadAllFromMongo();
  // cargar últimos (fallback si no hay mqtt)
  const latest = await loadLatestFromMongo();
  if(latest.length) renderChartsFromArray(latest);

  // refrescar cada N segundos: decide usar liveBuffer o mongo
  setInterval(refreshDisplay, 5000);

  // refrescar tabla periódicamente (y al inicio)
  setInterval(loadAllFromMongo, TABLE_REFRESH_MS);

  // si quieres limpiar el buffer si no llega mqtt:
  setInterval(() => {
    if(Date.now() - lastMqttTimestamp > MQTT_TIMEOUT_MS) {
      // opcional: vaciar buffer para evitar mezclar datos viejos
      // liveBuffer = [];
    }
  }, 10000);

})();

// ---- helper: si tu HTML tiene botones para cambiar variable en tabla ----
document.getElementById("tablaSelect")?.addEventListener("change", () => { currentPage = 1; renderTable(); });
