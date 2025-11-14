// ---- CONFIG ----
const socket = io();
const variables = [
  "humedad","temperatura","conductividad","ph","nitrogeno","fosforo","potasio","bateria","corriente"
];

const colorMap = {
  humedad:"#00bcd4", temperatura:"#ff7043", conductividad:"#7e57c2", ph:"#81c784",
  nitrogeno:"#ffca28", fosforo:"#ec407a", potasio:"#29b6f6", bateria:"#8d6e63", corriente:"#c2185b"
};

const MAX_POINTS = 5000;
const dataBuffers = {};
const charts = {};
const zoomStates = {};
let autoScrollEnabled = true;

variables.forEach(v => {
  dataBuffers[v] = {x: [], y: []};
  zoomStates[v] = {
    baseRange: null,
    zoomX: 1.0,
    zoomY: 1.0,
    centerX: null,
    centerY: null
  };
});

// ---- TOGGLE AUTO-SCROLL ----
function toggleAutoScroll() {
  autoScrollEnabled = !autoScrollEnabled;
  const btn = document.getElementById('toggleScrollBtn');
  if (btn) {
    btn.textContent = autoScrollEnabled ? '🔒 Auto-Scroll: ON' : '🔓 Auto-Scroll: OFF';
    btn.style.background = autoScrollEnabled ? '#00e5ff' : '#ff7043';
    btn.style.color = autoScrollEnabled ? '#002' : '#fff';
  }
  console.log(`Auto-scroll ${autoScrollEnabled ? 'activado' : 'desactivado'}`);
}

function addAutoScrollToggle() {
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'toggleScrollBtn';
  toggleBtn.textContent = '🔒 Auto-Scroll: ON';
  toggleBtn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 10px 15px;
    background: #00e5ff;
    color: #002;
    border: none;
    border-radius: 20px;
    cursor: pointer;
    font-weight: 600;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0,229,255,0.3);
    transition: all 0.3s ease;
  `;
  toggleBtn.addEventListener('click', toggleAutoScroll);
  
  // Efecto hover
  toggleBtn.addEventListener('mouseenter', () => {
    toggleBtn.style.transform = 'translateY(-2px)';
    toggleBtn.style.boxShadow = '0 6px 16px rgba(0,229,255,0.4)';
  });
  
  toggleBtn.addEventListener('mouseleave', () => {
    toggleBtn.style.transform = 'translateY(0)';
    toggleBtn.style.boxShadow = '0 4px 12px rgba(0,229,255,0.3)';
  });
  
  document.body.appendChild(toggleBtn);
}

// ---- AUTO-SCROLL A ÚLTIMOS DATOS ----
function autoScrollToLatest(varName) {
  if (!autoScrollEnabled) return;
  
  const buf = dataBuffers[varName];
  if (buf.x.length === 0) return;
  
  // Tomar últimos 10 puntos para el auto-scroll
  const lastPoints = buf.x.slice(-10).map(x => new Date(x));
  const lastValues = buf.y.slice(-10);
  
  if (lastPoints.length === 0) return;
  
  const minX = new Date(Math.min(...lastPoints.map(x => x.getTime())));
  const maxX = new Date(Math.max(...lastPoints.map(x => x.getTime())));
  const minY = Math.min(...lastValues);
  const maxY = Math.max(...lastValues);
  
  const padding = (maxY - minY) * 0.1 || 1;
  
  Plotly.relayout(charts[varName].div, {
    'xaxis.range': [minX, maxX],
    'yaxis.range': [minY - padding, maxY + padding],
    'xaxis.autorange': false,
    'yaxis.autorange': false
  });
}

// ---- INIT MAP ----
let map, marker;
function initMap(){
  // Verificar si el mapa ya existe
  let mapContainer = document.getElementById('map');
  if (!mapContainer) {
    console.log('❌ Contenedor del mapa no encontrado');
    return;
  }
  
  // Limpiar el contenedor del mapa
  mapContainer.innerHTML = '';
  
  // Crear elemento interno para el mapa
  const mapInner = document.createElement('div');
  mapInner.id = 'map-inner';
  mapInner.style.width = '100%';
  mapInner.style.height = '400px';
  mapInner.style.borderRadius = '8px';
  
  mapContainer.appendChild(mapInner);
  
  // Inicializar el mapa
  map = L.map('map-inner').setView([4.65, -74.1], 12);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 18
  }).addTo(map);
  
  marker = L.marker([4.65, -74.1]).addTo(map)
    .bindPopup('Esperando datos GPS...')
    .openPopup();
  
  console.log('🗺️ Mapa inicializado correctamente');
}

// ---- ACTUALIZAR MAPA EN TIEMPO REAL ----
function updateMap(latitud, longitud, fecha) {
  if (!map) {
    console.log('⚠️ Mapa no está inicializado');
    return;
  }
  
  if (latitud && longitud) {
    const newLatLng = [latitud, longitud];
    
    // Actualizar marcador
    marker.setLatLng(newLatLng);
    
    // Mover el mapa suavemente a la nueva ubicación
    map.setView(newLatLng, 14);
    
    // Actualizar popup con información
    const fechaStr = fecha ? new Date(fecha).toLocaleString() : new Date().toLocaleString();
    marker.bindPopup(`
      <div style="text-align: center;">
        <strong>📍 Ubicación Actual</strong><br>
        Lat: ${latitud.toFixed(5)}<br>
        Lon: ${longitud.toFixed(5)}<br>
        <small>${fechaStr}</small>
      </div>
    `).openPopup();
    
    console.log(`🗺️ Mapa actualizado: ${latitud.toFixed(5)}, ${longitud.toFixed(5)}`);
  }
}

// ---- CONTROLES CON SLIDERS ----
function createChartControls(varName, container) {
  const controlsDiv = document.createElement('div');
  controlsDiv.style.cssText = `
    display: flex;
    gap: 15px;
    margin-bottom: 15px;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: #102a3c;
    border-radius: 8px;
    border: 1px solid #0f3a45;
    flex-wrap: wrap;
  `;
  
  // Título
  const title = document.createElement('span');
  title.textContent = varName;
  title.style.cssText = `
    color: #00e5ff;
    font-weight: 600;
    min-width: 100px;
    text-transform: capitalize;
    font-size: 14px;
  `;
  
  // Controles de Zoom X
  const zoomXDiv = document.createElement('div');
  zoomXDiv.style.cssText = `display: flex; align-items: center; gap: 8px; min-width: 200px;`;
  
  const zoomXLabel = document.createElement('span');
  zoomXLabel.textContent = 'Zoom X:';
  zoomXLabel.style.cssText = `color: #a0d2e0; font-size: 12px;`;
  
  const zoomXSlider = document.createElement('input');
  zoomXSlider.type = 'range';
  zoomXSlider.min = '10';
  zoomXSlider.max = '200';
  zoomXSlider.value = '50';
  zoomXSlider.style.cssText = `
    flex: 1;
    height: 8px;
    border-radius: 4px;
    background: #2a4a5a;
    outline: none;
    -webkit-appearance: none;
  `;
  
  const zoomXValue = document.createElement('span');
  zoomXValue.textContent = '50%';
  zoomXValue.style.cssText = `color: #00e5ff; font-size: 12px; min-width: 40px; font-weight: 600;`;
  
  // Controles de Zoom Y
  const zoomYDiv = document.createElement('div');
  zoomYDiv.style.cssText = `display: flex; align-items: center; gap: 8px; min-width: 200px;`;
  
  const zoomYLabel = document.createElement('span');
  zoomYLabel.textContent = 'Zoom Y:';
  zoomYLabel.style.cssText = `color: #a0d2e0; font-size: 12px;`;
  
  const zoomYSlider = document.createElement('input');
  zoomYSlider.type = 'range';
  zoomYSlider.min = '10';
  zoomYSlider.max = '200';
  zoomYSlider.value = '50';
  zoomYSlider.style.cssText = `
    flex: 1;
    height: 8px;
    border-radius: 4px;
    background: #2a4a5a;
    outline: none;
    -webkit-appearance: none;
  `;
  
  const zoomYValue = document.createElement('span');
  zoomYValue.textContent = '50%';
  zoomYValue.style.cssText = `color: #00e5ff; font-size: 12px; min-width: 40px; font-weight: 600;`;
  
  // Botones
  const buttonsDiv = document.createElement('div');
  buttonsDiv.style.cssText = `display: flex; gap: 10px;`;
  
  const btnActuales = document.createElement('button');
  btnActuales.textContent = 'Últimos';
  btnActuales.title = 'Zoom a los últimos datos';
  btnActuales.style.cssText = `
    padding: 8px 16px;
    background: transparent;
    color: white;
    border: 2px solid #00e5ff;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.3s ease;
    min-width: 80px;
  `;
  
  const btnReset = document.createElement('button');
  btnReset.textContent = 'Reset';
  btnReset.title = 'Resetear zoom';
  btnReset.style.cssText = `
    padding: 8px 16px;
    background: transparent;
    color: white;
    border: 2px solid #00e5ff;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.3s ease;
    min-width: 80px;
  `;
  
  // Efectos hover para botones
  [btnActuales, btnReset].forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#00e5ff';
      btn.style.color = '#002';
      btn.style.transform = 'translateY(-2px)';
    });
    
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
      btn.style.color = 'white';
      btn.style.transform = 'translateY(0)';
    });
  });
  
  // Event listeners para sliders con actualización visual
  function updateSliderBackground(slider, value) {
    const min = parseInt(slider.min);
    const max = parseInt(slider.max);
    const percent = ((value - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right, #00e5ff 0%, #00e5ff ${percent}%, #2a4a5a ${percent}%, #2a4a5a 100%)`;
  }
  
  zoomXSlider.addEventListener('input', (e) => {
    const sliderValue = parseInt(e.target.value);
    zoomXValue.textContent = sliderValue + '%';
    updateSliderBackground(zoomXSlider, sliderValue);
    applyMultiplierZoom(varName, 'x', sliderValue / 50);
  });
  
  zoomYSlider.addEventListener('input', (e) => {
    const sliderValue = parseInt(e.target.value);
    zoomYValue.textContent = sliderValue + '%';
    updateSliderBackground(zoomYSlider, sliderValue);
    applyMultiplierZoom(varName, 'y', sliderValue / 50);
  });
  
  // Inicializar fondos de sliders
  updateSliderBackground(zoomXSlider, 50);
  updateSliderBackground(zoomYSlider, 50);
  
  // Event listeners para botones
  btnActuales.addEventListener('click', () => zoomToLatest(varName));
  btnReset.addEventListener('click', () => resetZoom(varName));
  
  // Ensamblar controles
  zoomXDiv.appendChild(zoomXLabel);
  zoomXDiv.appendChild(zoomXSlider);
  zoomXDiv.appendChild(zoomXValue);
  
  zoomYDiv.appendChild(zoomYLabel);
  zoomYDiv.appendChild(zoomYSlider);
  zoomYDiv.appendChild(zoomYValue);
  
  buttonsDiv.appendChild(btnActuales);
  buttonsDiv.appendChild(btnReset);
  
  controlsDiv.appendChild(title);
  controlsDiv.appendChild(zoomXDiv);
  controlsDiv.appendChild(zoomYDiv);
  controlsDiv.appendChild(buttonsDiv);
  
  container.parentNode.insertBefore(controlsDiv, container);
  
  return { zoomXSlider, zoomXValue, zoomYSlider, zoomYValue };
}

// ---- APLICAR ZOOM COMO MULTIPLICADOR ----
function applyMultiplierZoom(varName, axis, multiplier) {
  const state = zoomStates[varName];
  
  if (!state.baseRange) {
    updateBaseRange(varName);
  }
  
  if (!state.baseRange) return;
  
  if (axis === 'x') {
    state.zoomX = multiplier;
  } else {
    state.zoomY = multiplier;
  }
  
  applyCombinedZoom(varName);
}

// ---- APLICAR ZOOM COMBINADO ----
function applyCombinedZoom(varName) {
  const state = zoomStates[varName];
  const base = state.baseRange;
  
  if (!base) return;
  
  const visibleRangeX = (base.x[1] - base.x[0]) / state.zoomX;
  const visibleRangeY = (base.y[1] - base.y[0]) / state.zoomY;
  
  const centerX = state.centerX || (base.x[0] + base.x[1]) / 2;
  const centerY = state.centerY || (base.y[0] + base.y[1]) / 2;
  
  const newMinX = centerX - visibleRangeX / 2;
  const newMaxX = centerX + visibleRangeX / 2;
  const newMinY = centerY - visibleRangeY / 2;
  const newMaxY = centerY + visibleRangeY / 2;
  
  Plotly.relayout(charts[varName].div, {
    'xaxis.range': [new Date(newMinX), new Date(newMaxX)],
    'yaxis.range': [newMinY, newMaxY],
    'xaxis.autorange': false,
    'yaxis.autorange': false
  });
}

// ---- ACTUALIZAR RANGO BASE ----
function updateBaseRange(varName) {
  const graphDiv = charts[varName].div;
  const layout = graphDiv.layout;
  const buf = dataBuffers[varName];
  
  if (buf.x.length === 0) return;
  
  let baseX, baseY;
  
  if (layout.xaxis.range) {
    const [minX, maxX] = layout.xaxis.range;
    baseX = [new Date(minX).getTime(), new Date(maxX).getTime()];
    zoomStates[varName].centerX = (baseX[0] + baseX[1]) / 2;
  } else {
    const allDates = buf.x.map(x => new Date(x).getTime());
    baseX = [Math.min(...allDates), Math.max(...allDates)];
  }
  
  if (layout.yaxis.range) {
    baseY = layout.yaxis.range;
    zoomStates[varName].centerY = (baseY[0] + baseY[1]) / 2;
  } else {
    baseY = [Math.min(...buf.y), Math.max(...buf.y)];
  }
  
  if (baseX && baseY) {
    zoomStates[varName].baseRange = { x: baseX, y: baseY };
    zoomStates[varName].zoomX = 1.0;
    zoomStates[varName].zoomY = 1.0;
    updateSliderDisplay(varName, 50, 50);
  }
}

// ---- DETECTAR ZOOM MANUAL ----
function setupPlotlyZoomListener(varName) {
  const container = charts[varName].div;
  
  container.on('plotly_relayout', function(eventdata) {
    if (eventdata['xaxis.range[0]'] || eventdata['yaxis.range[0]']) {
      setTimeout(() => {
        updateBaseRange(varName);
      }, 100);
    }
  });
}

// ---- ACTUALIZAR DISPLAY DE SLIDERS ----
function updateSliderDisplay(varName, xValue = 50, yValue = 50) {
  const controlsDiv = charts[varName].div.previousElementSibling;
  
  if (controlsDiv) {
    const zoomXValue = controlsDiv.querySelector('span:nth-child(3)');
    const zoomYValue = controlsDiv.querySelector('span:nth-child(6)');
    const zoomXSlider = controlsDiv.querySelector('input:nth-child(2)');
    const zoomYSlider = controlsDiv.querySelector('input:nth-child(5)');
    
    if (zoomXValue && zoomYValue && zoomXSlider && zoomYSlider) {
      zoomXSlider.value = xValue;
      zoomYSlider.value = yValue;
      zoomXValue.textContent = xValue + '%';
      zoomYValue.textContent = yValue + '%';
      
      updateSliderBackground(zoomXSlider, xValue);
      updateSliderBackground(zoomYSlider, yValue);
    }
  }
}

// ---- FUNCIÓN PARA ACTUALIZAR FONDO DE SLIDERS ----
function updateSliderBackground(slider, value) {
  const min = parseInt(slider.min);
  const max = parseInt(slider.max);
  const percent = ((value - min) / (max - min)) * 100;
  slider.style.background = `linear-gradient(to right, #00e5ff 0%, #00e5ff ${percent}%, #2a4a5a ${percent}%, #2a4a5a 100%)`;
}

// ---- ZOOM A ÚLTIMOS DATOS (MEJORADA) ----
function zoomToLatest(varName) {
  const buf = dataBuffers[varName];
  
  // Validaciones robustas
  if (!buf || !buf.x || !buf.y || buf.x.length === 0) {
    console.log(`⚠️ No hay datos para ${varName}`);
    return;
  }
  
  // Verificar que la gráfica existe y está lista
  if (!charts[varName] || !charts[varName].div) {
    console.log(`⚠️ Gráfica de ${varName} no está lista`);
    return;
  }
  
  // Tomar últimos 15 datos (o menos si no hay suficientes)
  const dataCount = buf.x.length;
  const pointsToShow = Math.min(15, dataCount);
  
  if (pointsToShow === 0) {
    console.log(`⚠️ No hay datos suficientes para ${varName}`);
    return;
  }
  
  const lastPoints = buf.x.slice(-pointsToShow).map(x => new Date(x));
  const lastValues = buf.y.slice(-pointsToShow);
  
  // Validar que las fechas sean válidas
  const validDates = lastPoints.filter(date => !isNaN(date.getTime()));
  const validValues = lastValues.filter(val => val !== null && val !== undefined && !isNaN(val));
  
  if (validDates.length === 0 || validValues.length === 0) {
    console.log(`⚠️ Datos inválidos para ${varName}`);
    return;
  }
  
  // Calcular rangos con padding
  const minX = new Date(Math.min(...validDates.map(x => x.getTime())));
  const maxX = new Date(Math.max(...validDates.map(x => x.getTime())));
  const minY = Math.min(...validValues);
  const maxY = Math.max(...validValues);
  
  // Agregar padding para mejor visualización
  const timeRange = maxX.getTime() - minX.getTime();
  const valueRange = maxY - minY;
  
  const paddedMinX = new Date(minX.getTime() - timeRange * 0.1);
  const paddedMaxX = new Date(maxX.getTime() + timeRange * 0.1);
  const paddedMinY = minY - valueRange * 0.1;
  const paddedMaxY = maxY + valueRange * 0.1;
  
  // Aplicar zoom solo si los rangos son válidos
  if (!isNaN(paddedMinX.getTime()) && !isNaN(paddedMaxX.getTime()) && 
      !isNaN(paddedMinY) && !isNaN(paddedMaxY)) {
    
    Plotly.relayout(charts[varName].div, {
      'xaxis.range': [paddedMinX, paddedMaxX],
      'yaxis.range': [paddedMinY, paddedMaxY],
      'xaxis.autorange': false,
      'yaxis.autorange': false
    });
    
    console.log(`🔍 Zoom a últimos ${pointsToShow} datos de ${varName}`);
    
  } else {
    console.log(`❌ Rangos inválidos para ${varName}`);
  }
}

// ---- RESET ZOOM ----
function resetZoom(varName) {
  Plotly.relayout(charts[varName].div, {
    'xaxis.autorange': true,
    'yaxis.autorange': true
  });
  
  setTimeout(() => {
    zoomStates[varName].baseRange = null;
    zoomStates[varName].zoomX = 1.0;
    zoomStates[varName].zoomY = 1.0;
    zoomStates[varName].centerX = null;
    zoomStates[varName].centerY = null;
    
    updateSliderDisplay(varName, 50, 50);
  }, 100);
}

// ---- ACTUALIZAR GRÁFICA CON PUNTOS ----
function updateChart(varName) {
  const buf = dataBuffers[varName];
  if (buf.x.length === 0) return;
  
  const combined = buf.x.map((x, i) => ({ 
    x: new Date(x), 
    y: buf.y[i]
  })).sort((a, b) => a.x - b.x);
  
  // Determinar el modo basado en la cantidad de datos
  const dataCount = combined.length;
  const mode = dataCount <= 30 ? 'lines+markers' : 'lines';
  const markerSize = dataCount <= 30 ? 6 : 0;
  
  const trace = {
    x: combined.map(d => d.x),
    y: combined.map(d => d.y),
    type: 'scatter',
    mode: mode,
    line: { color: colorMap[varName], width: 2 },
    marker: {
      size: markerSize,
      color: colorMap[varName],
      opacity: 0.8
    },
    name: varName,
    hovertemplate: '%{x|%d/%m %H:%M}<br>' + varName + ': %{y:.2f}<extra></extra>',
    connectgaps: false
  };
  
  Plotly.react(charts[varName].div, [trace], charts[varName].layout, charts[varName].config);
  
  console.log(`📊 ${varName}: ${dataCount} datos, modo: ${mode}`);
}

// ---- CREAR GRAFICAS ----
function createCharts(){
  variables.forEach(v => {
    const divId = 'grafica_' + v;
    let container = document.getElementById(divId);
    if (!container) {
      container = document.createElement('div');
      container.id = divId;
      container.style.width = '100%';
      container.style.height = '380px';
      container.style.marginBottom = '25px';
      container.style.padding = '15px';
      container.style.background = '#071923';
      container.style.borderRadius = '8px';
      container.style.border = '1px solid #0f3a45';
      document.querySelector('#graficaPlotly').appendChild(container);
    }

    createChartControls(v, container);

    charts[v] = {
      div: container,
      layout: {
        title: { text: '', font: { color: '#00e5ff', size: 14 } },
        plot_bgcolor: '#071923',
        paper_bgcolor: '#071923',
        font: { color: '#eaf6f8' },
        xaxis: {
          type: 'date',
          gridcolor: '#0f3a45',
          tickcolor: '#0f3a45'
        },
        yaxis: {
          gridcolor: '#0f3a45',
          autorange: true
        },
        margin: { l: 60, r: 30, t: 10, b: 80 },
        showlegend: false
      },
      config: {
        responsive: true,
        displayModeBar: true,
        displaylogo: false
      }
    };

    Plotly.newPlot(container, [], charts[v].layout, charts[v].config);
    setupPlotlyZoomListener(v);
  });
}

// ---- ACTUALIZAR DATOS EN TIEMPO REAL ----
function pushPoint(varName, fecha, value){
  const buf = dataBuffers[varName];
  buf.x.push(fecha);
  buf.y.push(value);
  
  if(buf.x.length > MAX_POINTS){
    buf.x.shift();
    buf.y.shift();
  }
  
  updateChart(varName);
  
  // AUTO-SCROLL SOLO SI ESTÁ ACTIVADO
  if (autoScrollEnabled) {
    autoScrollToLatest(varName);
  }
}

// ---- CARGAR HISTORICO COMPLETO ----
async function loadAllFromMongo(){
  try{
    const res = await fetch('/api/data/all');
    if(!res.ok) throw new Error('Error '+res.status);
    const all = await res.json();
    
    if (!all || !Array.isArray(all)) {
      console.log('⚠️ No se recibieron datos históricos');
      return;
    }
    
    console.log('📥 Cargando históricos:', all.length, 'registros');
    
    variables.forEach(v => {
      dataBuffers[v].x = [];
      dataBuffers[v].y = [];
    });

    all.forEach(rec => {
      const fecha = new Date(rec.fecha);
      variables.forEach(v => {
        if(rec[v] !== undefined && rec[v] !== null){
          dataBuffers[v].x.push(fecha);
          dataBuffers[v].y.push(rec[v]);
        }
      });
      
      // Actualizar mapa con el último dato histórico que tenga coordenadas
      if (rec.latitud && rec.longitud) {
        updateMap(rec.latitud, rec.longitud, rec.fecha);
      }
    });

    variables.forEach(v => {
      updateChart(v);
    });

    console.log('✅ Históricos cargados correctamente');

  } catch(e) {
    console.error('❌ Error cargando histórico:', e);
  }
}

// ---- INDICADOR DE ESTADO EN TIEMPO REAL ----
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
    background: #ff0000;
  `;
  
  const text = document.createElement('span');
  text.id = 'status-text';
  text.textContent = 'Desconectado';
  
  statusDiv.appendChild(dot);
  statusDiv.appendChild(text);
  document.body.appendChild(statusDiv);
}

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

// ---- SOCKET.IO MEJORADO ----
socket.on('connect', () => {
  console.log('🔌 Socket conectado - Listo para datos MQTT en tiempo real');
  updateStatus(true);
});

socket.on('disconnect', () => {
  console.log('🔌 Socket desconectado');
  updateStatus(false);
});

socket.on('nuevoDato', data => {
  const fecha = data.fecha ? new Date(data.fecha) : new Date();
  
  console.log('📥 Nuevo dato MQTT recibido:', data);

  // ACTUALIZAR MAPA EN TIEMPO REAL
  if(data.latitud && data.longitud){
    updateMap(data.latitud, data.longitud, data.fecha);
  }

  // ACTUALIZAR GRÁFICAS EN TIEMPO REAL
  variables.forEach(v => {
    if(data[v] !== undefined && data[v] !== null) {
      pushPoint(v, fecha, data[v]);
      console.log(`📈 ${v} actualizado: ${data[v]}`);
    }
  });
});

// ---- VERIFICAR ELEMENTOS ----
function verificarElementos() {
  const elementos = ['map', 'btnHistoricos', 'graficaPlotly'];
  elementos.forEach(id => {
    const elemento = document.getElementById(id);
    console.log(`${id}:`, elemento ? '✅ Encontrado' : '❌ No encontrado');
  });
}

// ---- INICIO MEJORADO ----
(async function init(){
  console.log('🚀 Iniciando aplicación...');
  
  // Crear indicador de estado
  createStatusIndicator();
  addAutoScrollToggle();
  
  // Verificar elementos existentes
  verificarElementos();
  
  // 1. Inicializar mapa
  initMap();
  
  // 2. Crear gráficas
  createCharts();
  
  // 3. Cargar datos históricos (COMPLETOS - como antes)
  await loadAllFromMongo();
  
  console.log('✅ Aplicación completamente inicializada');
  console.log('📡 Esperando datos MQTT en tiempo real...');
})();