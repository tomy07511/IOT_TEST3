// === CONFIGURACIÓN GENERAL ===
const charts = {};
const MQTT_TIMEOUT_MS = 15000;
let allData = [];
let liveBuffer = [];
let lastMqttTimestamp = 0;

const variables = ["temperatura", "humedad", "presion"]; // 🔹 Ajusta según tus variables
const chartsContainer = document.getElementById("charts-container");

// === CREAR CONTENEDORES DE GRÁFICAS ===
variables.forEach(v => {
  const div = document.createElement("div");
  div.classList.add("chart-container");
  div.innerHTML = `
    <h3>${v}</h3>
    <div class="chart-scroll">
      <canvas id="${v}-chart"></canvas>
    </div>
    <div class="buttons">
      <button id="${v}-live">Datos actuales</button>
      <button id="${v}-historic">Histórico</button>
      <button id="${v}-reset">Resetear zoom</button>
    </div>
  `;
  chartsContainer.appendChild(div);
});

// === CONFIGURAR CADA GRÁFICO ===
variables.forEach(v => {
  const ctx = document.getElementById(`${v}-chart`).getContext("2d");
  charts[v] = {
    chart: new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          label: v,
          data: [],
          borderColor: "rgba(75,192,192,1)",
          backgroundColor: "rgba(75,192,192,0.2)",
          pointRadius: 4, // 🔹 Puntos un poco más grandes
          tension: 0.3
        }],
      },
      options: {
        animation: { duration: 500 },
        plugins: {
          zoom: {
            zoom: {
              wheel: { enabled: true },
              pinch: { enabled: true },
              drag: { enabled: true, backgroundColor: "rgba(0,0,0,0.1)" },
              mode: "x"
            },
            pan: { enabled: true, mode: "x" }
          }
        },
        scales: {
          x: {
            ticks: { autoSkip: true, maxRotation: 0, minRotation: 0 },
          },
          y: { beginAtZero: true },
        },
      },
    }),
    displayMode: "live",
  };

  // === BOTONES ===
  document.getElementById(`${v}-live`).addEventListener("click", () => {
    charts[v].displayMode = "live";
    renderChart(v);
    // 👇 Auto-scroll al final con animación
    const scrollDiv = document.querySelector(`#${v}-chart`).parentElement;
    scrollDiv.scrollTo({
      left: scrollDiv.scrollWidth,
      behavior: "smooth"
    });
  });

  document.getElementById(`${v}-historic`).addEventListener("click", async () => {
    charts[v].displayMode = "historic";
    const mongoData = await loadAllFromMongo(v);
    if (mongoData.length > 0) {
      allData = mongoData;
      renderChart(v);
    }
  });

  document.getElementById(`${v}-reset`).addEventListener("click", () => {
    charts[v].chart.resetZoom();
  });
});

// === FUNCIÓN PARA RENDERIZAR ===
function renderChart(v) {
  const chart = charts[v].chart;
  const data = charts[v].displayMode === "live" ? liveBuffer : allData;

  chart.data.labels = data.map(d => d.timestamp);
  chart.data.datasets[0].data = data.map(d => d.value);

  // Mostrar fechas solo si hay <=15 puntos
  chart.options.scales.x.ticks.display = data.length <= 15;
  chart.update();
}

// === EJEMPLO DE CARGA DESDE MONGO (simulación) ===
async function loadAllFromMongo(variable) {
  const res = await fetch(`/api/historico/${variable}`);
  return await res.json();
}

// === CSS PARA SCROLL ===
const style = document.createElement("style");
style.textContent = `
  .chart-container {
    margin-bottom: 40px;
  }
  .chart-scroll {
    overflow-x: auto;
    overflow-y: hidden;
    width: 100%;
    padding-bottom: 10px;
    scroll-behavior: smooth; /* 👈 desplazamiento suave */
  }
  .chart-scroll canvas {
    min-width: 900px; /* 👈 ancho mínimo para que se genere scroll */
  }
  .buttons {
    margin-top: 10px;
  }
  button {
    margin-right: 8px;
    padding: 6px 12px;
    border-radius: 8px;
    border: none;
    background: #2b6cb0;
    color: white;
    cursor: pointer;
    transition: 0.2s;
  }
  button:hover {
    background: #2c5282;
  }
`;
document.head.appendChild(style);
