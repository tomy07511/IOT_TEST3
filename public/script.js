const socket = io();
const ctx = document.getElementById("grafica").getContext("2d");

// Estilo original (azul oscuro con cyan)
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

// 🔹 Al cargar la página, obtener los últimos 10 registros
fetch("/api/data/latest")
  .then((res) => res.json())
  .then((data) => {
    data.forEach((d) => {
      chart.data.labels.push(new Date(d.fecha).toLocaleTimeString());
      chart.data.datasets[0].data.push(d.temperatura);
      chart.data.datasets[1].data.push(d.humedad);
    });
    chart.update();
  });

// 🔹 Recibir nuevos datos en tiempo real desde Socket.IO
socket.on("nuevoDato", (data) => {
  console.log("📡 Dato recibido en tiempo real:", data);

  chart.data.labels.push(new Date().toLocaleTimeString());
  chart.data.datasets[0].data.push(data.temperatura);
  chart.data.datasets[1].data.push(data.humedad);

  if (chart.data.labels.length > 10) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
    chart.data.datasets[1].data.shift();
  }

  chart.update();
});
