// ✅ Conectar Socket.IO al mismo dominio donde está desplegado
const socket = io.connect(window.location.origin, {
  transports: ["websocket", "polling"]
});

const ctx = document.getElementById("grafica").getContext("2d");

const chart = new Chart(ctx, {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "Temperatura (°C)",
        borderColor: "#00FFFF",
        backgroundColor: "rgba(0,255,255,0.2)",
        data: [],
        borderWidth: 2,
        tension: 0.2,
      },
      {
        label: "Humedad (%)",
        borderColor: "#1E90FF",
        backgroundColor: "rgba(30,144,255,0.2)",
        data: [],
        borderWidth: 2,
        tension: 0.2,
      },
    ],
  },
  options: {
    scales: {
      x: {
        ticks: { color: "#00FFFF" },
      },
      y: {
        beginAtZero: true,
        ticks: { color: "#00FFFF" },
      },
    },
    plugins: {
      legend: {
        labels: { color: "#00FFFF" },
      },
    },
  },
});

// 🔹 Cargar los últimos datos al iniciar
fetch("/api/data/latest")
  .then(res => res.json())
  .then(data => {
    data.forEach(d => {
      chart.data.labels.push(new Date(d.fecha).toLocaleTimeString());
      chart.data.datasets[0].data.push(d.temperatura);
      chart.data.datasets[1].data.push(d.humedad);
    });
    chart.update();
  });

// 🔹 Escuchar nuevos datos en tiempo real
socket.on("nuevoDato", (data) => {
  console.log("📡 Dato recibido en tiempo real:", data);

  const timeLabel = new Date().toLocaleTimeString();

  chart.data.labels.push(timeLabel);
  chart.data.datasets[0].data.push(data.temperatura);
  chart.data.datasets[1].data.push(data.humedad);

  if (chart.data.labels.length > 15) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
    chart.data.datasets[1].data.shift();
  }

  chart.update();
});
