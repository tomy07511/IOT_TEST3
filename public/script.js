// === CONFIGURACIÓN ===
const BLOCK_SIZE = 500;        // Cuántos registros se piden por bloque
const GAP_HOURS = 24;          // Horas para marcar línea punteada
let skip = 0;                  // Cuántos datos ya pedimos

// Contenedor general
const container = document.getElementById("graficaPlotlyContainer");

// Variables que deseas graficar
const VARIABLES = [
  "temperatura",
  "humedad",
  "conductividad",
  "ph",
  "nitrogeno",
  "fosforo",
  "potasio",
  "bateria",
  "corriente"
];

// Cada variable tendrá su gráfica
let charts = {};  
let dataBuffers = {};  

// Inicializar buffers
VARIABLES.forEach(v => { dataBuffers[v] = []; });


// === FUNCIÓN PRINCIPAL PARA DESCARGAR BLOQUES ===
async function loadBlock() {
  console.log("Pidiendo bloque:", skip);

  const res = await fetch(`/historicos?skip=${skip}&limit=${BLOCK_SIZE}`);
  const block = await res.json();

  if (!block.length) {
    console.log("No hay más datos.");
    return;
  }

  skip += block.length;

  processBlock(block);
}


// === PROCESAR BLOQUE ===
function processBlock(block) {
  block.forEach(row => {
    const fecha = new Date(row.fecha);

    VARIABLES.forEach(v => {
      if (row[v] !== undefined) {
        dataBuffers[v].push({
          x: fecha,
          y: row[v]
        });
      }
    });
  });

  updateCharts();
}


// === DETECTAR GAPS Y MARCAR LÍNEA PUNTEADA ===
function buildTraces(buffer) {
  if (buffer.length === 0) return [];

  let traces = [];
  let currentX = [];
  let currentY = [];

  for (let i = 0; i < buffer.length; i++) {
    const point = buffer[i];
    currentX.push(point.x);
    currentY.push(point.y);

    if (i < buffer.length - 1) {
      const diffHours = (buffer[i + 1].x - point.x) / 1000 / 3600;

      // Si hay > 24 horas: cerrar trace, iniciar nuevo con línea punteada
      if (diffHours > GAP_HOURS) {

        // Trace normal
        traces.push({
          x: currentX,
          y: currentY,
          mode: "lines",
          line: { width: 2 },
          type: "scattergl"
        });

        // Trace punteado
        traces.push({
          x: [point.x, buffer[i + 1].x],
          y: [point.y, buffer[i + 1].y],
          mode: "lines",
          line: { dash: "dot", width: 1 },
          type: "scattergl"
        });

        currentX = [];
        currentY = [];
      }
    }
  }

  // Último segmento
  if (currentX.length) {
    traces.push({
      x: currentX,
      y: currentY,
      mode: "lines",
      line: { width: 2 },
      type: "scattergl"
    });
  }

  return traces;
}


// === ACTUALIZAR GRÁFICAS ===
function updateCharts() {
  VARIABLES.forEach(variable => {
    const buffer = dataBuffers[variable];
    const traces = buildTraces(buffer);

    const layout = {
      title: `${variable.toUpperCase()}`,
      autosize: true,
      showlegend: false,
      xaxis: {
        type: "date",
        rangeslider: { visible: true }
      },
      yaxis: {
        automargin: true,
        autorange: true
      }
    };

    if (!charts[variable]) {
      // Crear nuevo div
      const div = document.createElement("div");
      div.style.height = "300px";
      div.style.marginBottom = "40px";
      container.appendChild(div);

      charts[variable] = div;

      Plotly.newPlot(div, traces, layout, { responsive: true });
    } else {
      Plotly.react(charts[variable], traces, layout);
    }
  });
}


// === SCROLL: CARGA AUTOMÁTICAMENTE MÁS BLOQUES ===
window.addEventListener("scroll", () => {
  const bottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;

  if (bottom) {
    console.log("Cargando más datos…");
    loadBlock();
  }
});


// === CARGA INICIAL ===
loadBlock();
