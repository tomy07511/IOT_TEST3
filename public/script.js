const socket = io();

// === Referencias ===
const charts = {};
const variables = ["temperatura", "humedad", "presion"];
const chartContainers = document.getElementById("charts");

// === Configuración ===
const MQTT_TIMEOUT_MS = 5000;
let lastMqttTimestamp = 0;
let liveBuffer = [];
let allData = [];

// === Crear contenedores ===
variables.forEach(v => {
  const card = document.createElement("div");
  card.className = "p-4 bg-white rounded-2xl shadow-md mb-6";

  card.innerHTML = `
    <h2 class="text-lg font-semibold mb-2 capitalize">${v}</h2>
    <div class="flex gap-2 mb-2">
      <button class="bg-blue-500 text-white px-3 py-1 rounded" id="btnLive-${v}">Datos actuales</button>
      <button class="bg-gray-500 text-white px-3 py-1 rounded" id="btnHist-${v}">Histórico</button>
      <button class="bg-red-500 text-white px-3 py-1 rounded" id="btnReset-${v}">Resetear zoom</button>
    </div>
    <div class="overflow-x-auto">
      <canvas id="chart-${v}" height="250"></canvas>
    </div>
  `;

  chartContainers.appendChild(card);
});

// === Crear gráfica ===
function createChart(ctx, label) {
  return new Chart(ctx, {
    type: "line",
    data: { labels: [], datasets: [{
      label,
      data: [],
      borderWidth: 2,
      pointRadius: 3,
      borderColor: getRandomColor(),
      tension: 0.3
    }]},
    options: {
      animation: { duration: 600, easing: "easeOutQuart" },
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        zoom: {
          pan: { enabled: true, mode: "x" },
          zoom: {
            drag: { enabled: true, backgroundColor: "rgba(0,0,0,0.1)" },
            mode: "x"
          }
        },
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: {
            autoSkip: true,
            maxTicksLimit: 15,
            callback: function (val, i, ticks) {
              const total = this.chart.data.labels.length;
              return total <= 15 ? this.getLabelForValue(val) : "";
            }
          }
        },
        y: { beginAtZero: true }
      }
    }
  });
}

// === Generar color aleatorio ===
function getRandomColor() {
  return `hsl(${Math.random() * 360}, 80%, 50%)`;
}

// === Inicializar charts ===
variables.forEach(v => {
  const ctx = document.getElementById(`chart-${v}`).getContext("2d");
  charts[v] = {
    chart: createChart(ctx, v),
    displayMode: "live"
  };

  document.getElementById(`btnReset-${v}`).onclick = () => {
    charts[v].chart.resetZoom();
  };

  document.getElementById(`btnLive-${v}`).onclick = () => {
    charts[v].displayMode = "live";
    renderLiveData(v);
  };

  document.getElementById(`btnHist-${v}`).onclick = async () => {
    charts[v].displayMode = "historic";
    const mongoData = await loadAllFromMongo(v);
    if (mongoData.length > 0) {
      allData = mongoData;
      renderChart(v);
      // Activa scroll horizontal visible
      const canvas = document.getElementById(`chart-${v}`);
      canvas.parentElement.style.overflowX = "scroll";
      canvas.parentElement.scrollLeft = canvas.parentElement.scrollWidth / 2;
    }
  };
});

// === Renderizar ===
function renderChart(v) {
  const c = charts[v].chart;
  c.data.labels = allData.map(d => d.fecha);
  c.data.datasets[0].data = allData.map(d => d.valor);
  c.update("active");
}

function renderLiveData(v) {
  const c = charts[v].chart;
  const labels = liveBuffer.map(d => d.fecha);
  const data = liveBuffer.map(d => d.valor);
  c.data.labels = labels;
  c.data.datasets[0].data = data;
  c.update("active");
}

// === Cargar de Mongo ===
async function loadAllFromMongo(variable) {
  const res = await fetch(`/api/historico/${variable}`);
  if (!res.ok) return [];
  return res.json();
}

// === Socket.io ===
socket.on("sensorData", data => {
  lastMqttTimestamp = Date.now();
  liveBuffer.push(data);
  if (liveBuffer.length > 15) liveBuffer.shift();

  const v = data.variable;
  if (charts[v] && charts[v].displayMode === "live") renderLiveData(v);
});

// === Actualización automática ===
setInterval(async () => {
  const diff = Date.now() - lastMqttTimestamp;
  for (const v of variables) {
    if (charts[v].displayMode === "live") {
      if (lastMqttTimestamp !== 0 && diff <= MQTT_TIMEOUT_MS && liveBuffer.length > 0) {
        renderLiveData(v);
      } else {
        const mongoLatest = await loadAllFromMongo(v);
        if (mongoLatest.length > 0) {
          allData = mongoLatest;
          renderChart(v);
        }
      }
    }
  }
}, 3000);

// === Iniciar ===
(async function init() {
  for (const v of variables) {
    const mongoLatest = await loadAllFromMongo(v);
    if (mongoLatest.length > 0) {
      allData = mongoLatest;
      renderChart(v);
    }
  }
})();
