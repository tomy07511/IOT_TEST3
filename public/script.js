// ---- CONFIG ----
const socket = io();
const variables = [
  "humedad","temperatura","conductividad","ph","nitrogeno","fosforo","potasio","bateria","corriente"
];

const colorMap = {
  humedad:"#00bcd4", temperatura:"#ff7043", conductividad:"#7e57c2", ph:"#81c784",
  nitrogeno:"#ffca28", fosforo:"#ec407a", potasio:"#29b6f6", bateria:"#8d6e63", corriente:"#c2185b"
};

const MAX_POINTS = 200; // Reducido para mejor performance en tiempo real
const dataBuffers = {};
const charts = {};

// Inicializar buffers
variables.forEach(v => {
  dataBuffers[v] = { x: [], y: [] };
});

// ---- INIT MAP ----
let map, marker;
function initMap(){
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;
  
  mapContainer.innerHTML = '';
  
  const mapInner = document.createElement('div');
  mapInner.id = 'map-inner';
  mapInner.style.width = '100%';
  mapInner.style.height = '400px';
  mapInner.style.borderRadius = '8px';
  mapContainer.appendChild(mapInner);
  
  map = L.map('map-inner').setView([4.65, -74.1], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 18
  }).addTo(map);
  
  marker = L.marker([4.65, -74.1]).addTo(map)
    .bindPopup('Esperando datos GPS...')
    .openPopup();
}

// ---- ACTUALIZAR MAPA EN TIEMPO REAL ----
function updateMap(latitud, longitud, fecha) {
  if (!map || !latitud || !longitud) return;
  
  const newLatLng = [latitud, longitud];
  marker.setLatLng(newLatLng);
  map.setView(newLatLng, 14);
  
  const fechaStr = fecha ? new Date(fecha).toLocaleString() : new Date().toLocaleString();
  marker.bindPopup(`
    <div style="text-align: center;">
      <strong>📍 Ubicación Actual</strong><br>
      Lat: ${latitud.toFixed(5)}<br>
      Lon: ${longitud.toFixed(5)}<br>
      <small>${fechaStr}</small>
    </div>
  `).openPopup();
}

// ---- CREAR GRÁFICAS SIMPLIFICADAS ----
function createCharts(){
  const graficaPlotly = document.getElementById('graficaPlotly');
  if (!graficaPlotly) return;
  
  // Limpiar contenedor
  graficaPlotly.innerHTML = '';
  
  variables.forEach(v => {
    const container = document.createElement('div');
    container.id = `grafica_${v}`;
    container.className = 'chart-container';
    container.style.cssText = `
      width: 100%;
      height: 300px;
      margin-bottom: 20px;
      background: #071923;
      border-radius: 8px;
      border: 1px solid #0f3a45;
    `;
    graficaPlotly.appendChild(container);

    charts[v] = {
      div: container,
      layout: {
        title: { 
          text: v.charAt(0).toUpperCase() + v.slice(1), 
          font: { color: '#00e5ff', size: 14 } 
        },
        plot_bgcolor: '#071923',
        paper_bgcolor: '#071923',
        font: { color: '#eaf6f8' },
        xaxis: {
          type: 'date',
          gridcolor: '#0f3a45',
          tickcolor: '#0f3a45',
          title: { text: 'Tiempo', font: { color: '#a0d2e0' } }
        },
        yaxis: {
          gridcolor: '#0f3a45',
          title: { text: v, font: { color: '#a0d2e0' } }
        },
        margin: { l: 60, r: 30, t: 40, b: 60 },
        showlegend: false
      },
      config: {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d']
      }
    };

    // Crear gráfica vacía
    Plotly.newPlot(container, [{
      x: [],
      y: [],
      type: 'scatter',
      mode: 'lines',
      line: { color: colorMap[v], width: 2 },
      name: v
    }], charts[v].layout, charts[v].config);
  });
}

// ---- ACTUALIZAR GRÁFICA EN TIEMPO REAL ----
function updateChart(varName) {
  const buf = dataBuffers[varName];
  if (buf.x.length === 0) return;
  
  const trace = {
    x: buf.x.map(x => new Date(x)),
    y: buf.y,
    type: 'scatter',
    mode: 'lines',
    line: { color: colorMap[varName], width: 2 },
    name: varName,
    hovertemplate: `%{x|%H:%M:%S}<br>${varName}: %{y:.2f}<extra></extra>`
  };
  
  Plotly.react(charts[varName].div, [trace], charts[varName].layout, charts[varName].config);
}

// ---- AGREGAR NUEVO PUNTO ----
function pushPoint(varName, fecha, value) {
  const buf = dataBuffers[varName];
  
  // Agregar nuevo punto
  buf.x.push(fecha);
  buf.y.push(value);
  
  // Mantener solo los últimos MAX_POINTS puntos
  if (buf.x.length > MAX_POINTS) {
    buf.x.shift();
    buf.y.shift();
  }
  
  // Actualizar gráfica inmediatamente
  updateChart(varName);
}

// ---- CARGAR ÚLTIMOS DATOS ---- 
async function loadRecentData() {
  try {
    const res = await fetch('/api/data/latest');
    if (!res.ok) throw new Error('Error ' + res.status);
    
    const data = await res.json();
    if (!Array.isArray(data)) return;
    
    console.log('📥 Cargando últimos datos:', data.length, 'registros');
    
    // Procesar datos más recientes primero
    data.reverse().forEach(rec => {
      const fecha = new Date(rec.fecha);
      
      variables.forEach(v => {
        if (rec[v] !== undefined && rec[v] !== null) {
          pushPoint(v, fecha, rec[v]);
        }
      });
      
      if (rec.latitud && rec.longitud) {
        updateMap(rec.latitud, rec.longitud, rec.fecha);
      }
    });
    
    console.log('✅ Datos recientes cargados');
    
  } catch (e) {
    console.error('❌ Error cargando datos recientes:', e);
  }
}

// ---- SOCKET.IO - RECEPCIÓN EN TIEMPO REAL ----
socket.on('connect', () => {
  console.log('🔌 Conectado - Listo para datos en tiempo real');
  document.body.style.border = '3px solid #00ff00'; // Indicador visual de conexión
});

socket.on('disconnect', () => {
  console.log('🔌 Desconectado');
  document.body.style.border = '3px solid #ff0000'; // Indicador visual de desconexión
});

socket.on('nuevoDato', data => {
  const fecha = data.fecha ? new Date(data.fecha) : new Date();
  
  console.log('📥 Nuevo dato:', {
    tiempo: fecha.toLocaleTimeString(),
    ...data
  });

  // ACTUALIZAR MAPA EN TIEMPO REAL
  if (data.latitud && data.longitud) {
    updateMap(data.latitud, data.longitud, data.fecha);
  }

  // ACTUALIZAR GRÁFICAS EN TIEMPO REAL
  variables.forEach(v => {
    if (data[v] !== undefined && data[v] !== null) {
      pushPoint(v, fecha, data[v]);
    }
  });
});

// ---- INDICADORES VISUALES DE ESTADO ----
function createStatusIndicator() {
  const statusDiv = document.createElement('div');
  statusDiv.id = 'status-indicator';
  statusDiv.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    padding: 8px 12px;
    background: #102a3c;
    border: 2px solid #00e5ff;
    border-radius: 20px;
    color: #00e5ff;
    font-size: 12px;
    font-weight: bold;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  
  const dot = document.createElement('div');
  dot.id = 'status-dot';
  dot.style.cssText = `
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #00ff00;
    animation: pulse 2s infinite;
  `;
  
  const text = document.createElement('span');
  text.id = 'status-text';
  text.textContent = 'Conectado';
  
  statusDiv.appendChild(dot);
  statusDiv.appendChild(text);
  document.body.appendChild(statusDiv);
  
  // Estilos para la animación del pulso
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.5; }
      100% { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

// ---- ACTUALIZAR INDICADOR DE ESTADO ----
function updateStatus(connected) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  
  if (dot && text) {
    if (connected) {
      dot.style.background = '#00ff00';
      text.textContent = 'Conectado';
    } else {
      dot.style.background = '#ff0000';
      text.textContent = 'Desconectado';
    }
  }
}

// ---- INICIALIZACIÓN ----
async function init(){
  console.log('🚀 Iniciando aplicación de tiempo real...');
  
  // Crear indicador de estado
  createStatusIndicator();
  
  // Verificar librerías
  console.log('📚 Librerías:', {
    io: typeof io,
    L: typeof L, 
    Plotly: typeof Plotly
  });
  
  // Inicializar componentes
  initMap();
  createCharts();
  
  // Cargar datos recientes (no todo el histórico)
  await loadRecentData();
  
  console.log('✅ Aplicación lista para datos en tiempo real');
  console.log('📡 Esperando datos MQTT...');
}

// ---- EVENTOS SOCKET ACTUALIZADOS ----
socket.on('connect', () => {
  console.log('🔌 CONECTADO - Recibiendo datos en tiempo real');
  updateStatus(true);
});

socket.on('disconnect', () => {
  console.log('🔌 DESCONECTADO');
  updateStatus(false);
});

socket.on('nuevoDato', data => {
  const fecha = data.fecha ? new Date(data.fecha) : new Date();
  const timestamp = fecha.toLocaleTimeString();
  
  console.log(`🕒 ${timestamp} - Nuevo dato recibido`);
  
  // Actualizar mapa si hay coordenadas
  if (data.latitud && data.longitud) {
    updateMap(data.latitud, data.longitud, data.fecha);
    console.log(`🗺️ Mapa actualizado: ${data.latitud}, ${data.longitud}`);
  }
  
  // Actualizar todas las variables que tengan datos
  variables.forEach(v => {
    if (data[v] !== undefined && data[v] !== null) {
      pushPoint(v, fecha, data[v]);
      console.log(`📈 ${v}: ${data[v]}`);
    }
  });
});

// Manejar errores de conexión
socket.on('connect_error', (error) => {
  console.error('❌ Error de conexión Socket.IO:', error);
  updateStatus(false);
});

// Iniciar la aplicación
init();