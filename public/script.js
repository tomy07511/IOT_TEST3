const socket = io();

// ==================== MAPA ====================
var map = L.map('map').setView([4.65, -74.1], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);

var marker = null;

// ==================== DATOS PARA LA GRAFICA ====================
let fechas = [];
let temperaturas = [];

// ==================== CONFIG PLOTLY ====================
let layout = {
    title: "Temperatura en tiempo real",
    xaxis: {
        rangeselector: {
            buttons: [
                {step: 'hour', stepmode: 'backward', count: 1, label: '1h'},
                {step: 'hour', stepmode: 'backward', count: 6, label: '6h'},
                {step: 'day', stepmode: 'backward', count: 1, label: '1d'},
                {step: 'all', label: 'Todo'}
            ]
        },
        rangeslider: { visible: true }
    },
    yaxis: { fixedrange: false }
};

// Crear gráfica vacía
Plotly.newPlot('graficaPlotly', [{
    x: fechas,
    y: temperaturas,
    mode: 'lines',
    name: "Temperatura",
    line: { width: 2 }
}], layout);

// ==================== SOCKET.IO ====================
socket.on("sensores", (data) => {

    // === ACTUALIZAR MAPA ===
    if (data.lat && data.lng) {
        if (!marker) {
            marker = L.marker([data.lat, data.lng]).addTo(map);
        } else {
            marker.setLatLng([data.lat, data.lng]);
        }

        map.setView([data.lat, data.lng]);
    }

    // === ACTUALIZAR GRAFICA ===
    fechas.push(new Date(data.fecha));
    temperaturas.push(data.temperatura);

    Plotly.extendTraces('graficaPlotly', {
        x: [[new Date(data.fecha)]],
        y: [[data.temperatura]]
    }, [0]);

    if (fechas.length > 5000) {
        fechas.shift();
        temperaturas.shift();
    }
});
