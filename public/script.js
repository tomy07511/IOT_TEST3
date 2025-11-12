const socket = io();

const variables = ["temperatura", "humedad", "conductividad", "ph", "nitrogeno", "fosforo", "potasio", "bateria", "corriente"];
const charts = {};
let mode = {}; // modo individual por variable: 'live' o 'historico'
let allData = {};
let liveBuffer = [];
let lastMqttTimestamp = 0;
const MQTT_TIMEOUT_MS = 10000;

Chart.register(ChartZoom);

variables.forEach(v => (mode[v] = "live"));

// === Crear las gráficas ===
variables.forEach(v => {
  const container = document.getElementById(v);
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h3>${v.toUpperCase()}</h3>
      <div>
        <button class="resetZoom" data-var="${v}">Resetear Zoom</button>
        <button class="toggleMode" data-var="${v}">Histórico</button>
      </div>
    </div>
    <div class="chart-scroll" style="overflow-x:auto; width:100%; padding-bottom:10px;">
      <canvas id="chart-${v}" style="min-width:900px;"></canvas>
    </div>
  `;

  const ctx = document.getElementById(`chart-${v}`).getContext("2d");
  charts[v] = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label: v,
        data: [],
        borderColor: "#00e5ff",
        backgroundColor: "rgba(0,229,255,0.1)",
        borderWidth: 2,
        pointRadius: 4, // 🔹 Puntos un poco más grandes
        pointHoverRadius: 6,
        tension: 0.3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: {
            display: true,
            callback: function(value, index, values) {
              const total = values.length;
              // 🔹 Mostrar fechas solo si hay <= 15 o si estás muy cerca
              if (total <= 15 || this.chart._zoomLevel < 2) {
                const date = new Date(this.getLabelForValue(value));
                return date.toLocaleString();
              }
              return "";
            }
          }
        },
        y: { beginAtZero: true }
      },
      plugins: {
        legend: { labels: { color: "#eaf6f8" } },
        zoom: {
          zoom: {
            drag: { enabled: true },
            mode: "x",
            onZoomComplete({ chart }) {
              const wrapper = chart.canvas.parentElement;
              wrapper.scrollLeft = (wrapper.scrollWidth - wrapper.clientWidth) / 2;
            }
          },
          pan: { enabled: true, mode: "x" }
        }
      }
    }
  });
});

// === Función para renderizar ===
function renderChart(v) {
  const chart = charts[v];
  const data = mode[v] === "live" ? liveBuffer : allData[v] || [];
  chart.data.labels = data.map(d => d.fecha);
  chart.data.datasets[0].data = data.map(d => d[v]);
  chart.update("none");
}

// === Cargar histórico ===
async function loadHistoric(v) {
  const res = await fetch(`/api/data/${v}`);
  const json = await res.json();
  allData[v] = json.map(d => ({ ...d, fecha: new Date(d.fecha) }));
  renderChart(v);
}

// === MQTT live ===
socket.on("mqtt-data", d => {
  lastMqttTimestamp = Date.now();
  liveBuffer.push(d);
  if (liveBuffer.length > 300) liveBuffer.shift();
  variables.forEach(v => {
    if (mode[v] === "live") renderChart(v);
  });
});

// === Chequear desconexión MQTT ===
setInterval(() => {
  const diff = Date.now() - lastMqttTimestamp;
  if (diff > MQTT_TIMEOUT_MS) return;
  variables.forEach(v => {
    if (mode[v] === "live") renderChart(v);
  });
}, 2000);

// === Botones ===
document.querySelectorAll(".resetZoom").forEach(btn => {
  btn.onclick = e => {
    const v = e.target.dataset.var;
    charts[v].resetZoom();
  };
});

document.querySelectorAll(".toggleMode").forEach(btn => {
  btn.onclick = async e => {
    const v = e.target.dataset.var;
    if (mode[v] === "live") {
      mode[v] = "historico";
      e.target.textContent = "Datos Actuales";
      await loadHistoric(v);
      renderChart(v);
    } else {
      mode[v] = "live";
      e.target.textContent = "Histórico";
      renderChart(v);
      const wrapper = charts[v].canvas.parentElement;
      wrapper.scrollLeft = wrapper.scrollWidth; // 🔹 Se centra en los datos actuales
    }
  };
});
