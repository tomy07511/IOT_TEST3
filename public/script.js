const socket = io();
const ctxs = {};
const graficas = {};
const dataMaxLength = 20;
const MQTT_TIMEOUT_MS = 20000;
const TABLE_REFRESH_MS = 30000;

const variables = [
  "humedad",
  "temperatura",
  "conductividad",
  "ph",
  "nitrogeno",
  "fosforo",
  "potasio",
  "bateria",
  "corriente" // ✅ nueva variable
];

// === MAPA ===
let map;
let marker;

function inicializarMapa() {
  map = L.map("mapa").setView([0, 0], 2); // vista inicial

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
}

function actualizarMapa(lat, lon) {
  if (!lat || !lon) return;
  if (!marker) {
    marker = L.marker([lat, lon]).addTo(map);
  } else {
    marker.setLatLng([lat, lon]);
  }
  map.setView([lat, lon], 16);
}

// === GRÁFICAS ===
function crearGraficas() {
  variables.forEach((variable) => {
    const canvas = document.getElementById(`grafica-${variable}`);
    if (!canvas) return;

    ctxs[variable] = canvas.getContext("2d");
    graficas[variable] = new Chart(ctxs[variable], {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: variable.toUpperCase(),
            data: [],
            borderWidth: 2,
            fill: false,
          },
        ],
      },
      options: {
        scales: {
          y: { beginAtZero: true },
        },
      },
    });
  });
}

// === ACTUALIZAR DATOS ===
function actualizarGraficas(dato) {
  const tiempo = new Date(dato.tiempo).toLocaleTimeString();

  variables.forEach((variable) => {
    const grafica = graficas[variable];
    if (!grafica) return;

    const valor = dato[variable];
    if (valor !== undefined) {
      grafica.data.labels.push(tiempo);
      grafica.data.datasets[0].data.push(valor);

      if (grafica.data.labels.length > dataMaxLength) {
        grafica.data.labels.shift();
        grafica.data.datasets[0].data.shift();
      }
      grafica.update();
    }
  });

  if (dato.latitud && dato.longitud) {
    actualizarMapa(dato.latitud, dato.longitud);
  }
}

// === EVENTOS SOCKET ===
socket.on("historico", (datos) => {
  datos.forEach(actualizarGraficas);
});

socket.on("nuevoDato", (dato) => {
  actualizarGraficas(dato);
});

window.addEventListener("load", () => {
  inicializarMapa();
  crearGraficas();
});
