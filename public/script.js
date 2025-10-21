const socket = io();
const ctx = document.getElementById("grafica").getContext("2d");

const chart = new Chart(ctx, {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "Temperatura",
        data: [],
        borderWidth: 2,
      },
    ],
  },
  options: {
    scales: {
      y: { beginAtZero: true },
    },
  },
});

socket.on("update", (data) => {
  chart.data.labels.push(new Date().toLocaleTimeString());
  chart.data.datasets[0].data.push(data.temperatura);
  chart.update();
});
