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

variables.forEach(v => {
  dataBuffers[v] = {x: [], y: []};
  zoomStates[v] = {
    baseRange: null,      // Rango base actual (centro y tamaño)
    zoomX: 1.0,           // Multiplicador de zoom X (1.0 = normal)
    zoomY: 1.0,           // Multiplicador de zoom Y (1.0 = normal)
    centerX: null,        // Centro actual en X
    centerY: null         // Centro actual en Y
  };
});

// ---- INIT MAP ----
let map, marker;
function initMap(){
  map = L.map('map').setView([4.65, -74.1], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}/.png', {attribution: '© OpenStreetMap'}).addTo(map);
  marker = L.marker([4.65, -74.1]).addTo(map).bindPopup('Esperando datos GPS...');
}

// ---- CONTROLES CON SLIDERS MEJORADOS ----
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
  zoomXSlider.min = '25';
  zoomXSlider.max = '400';
  zoomXSlider.value = '100';
  zoomXSlider.style.cssText = `
    flex: 1;
    height: 8px;
    border-radius: 4px;
    background: #2a4a5a;
    outline: none;
    -webkit-appearance: none;
  `;
  
  // Estilos personalizados para el slider
  zoomXSlider.style.background = `linear-gradient(to right, #00e5ff 0%, #00e5ff ${(100/400)*100}%, #2a4a5a ${(100/400)*100}%, #2a4a5a 100%)`;
  
  const zoomXValue = document.createElement('span');
  zoomXValue.textContent = '100%';
  zoomXValue.style.cssText = `color: #00e5ff; font-size: 12px; min-width: 40px; font-weight: 600;`;
  
  // Controles de Zoom Y
  const zoomYDiv = document.createElement('div');
  zoomYDiv.style.cssText = `display: flex; align-items: center; gap: 8px; min-width: 200px;`;
  
  const zoomYLabel = document.createElement('span');
  zoomYLabel.textContent = 'Zoom Y:';
  zoomYLabel.style.cssText = `color: #a0d2e0; font-size: 12px;`;
  
  const zoomYSlider = document.createElement('input');
  zoomYSlider.type = 'range';
  zoomYSlider.min = '25';
  zoomYSlider.max = '400';
  zoomYSlider.value = '100';
  zoomYSlider.style.cssText = `
    flex: 1;
    height: 8px;
    border-radius: 4px;
    background: #2a4a5a;
    outline: none;
    -webkit-appearance: none;
  `;
  
  // Estilos personalizados para el slider Y
  zoomYSlider.style.background = `linear-gradient(to right, #00e5ff 0%, #00e5ff ${(100/400)*100}%, #2a4a5a ${(100/400)*100}%, #2a4a5a 100%)`;
  
  const zoomYValue = document.createElement('span');
  zoomYValue.textContent = '100%';
  zoomYValue.style.cssText = `color: #00e5ff; font-size: 12px; min-width: 40px; font-weight: 600;`;
  
  // Botones con nuevo estilo
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
    const percent = ((value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.background = `linear-gradient(to right, #00e5ff 0%, #00e5ff ${percent}%, #2a4a5a ${percent}%, #2a4a5a 100%)`;
  }
  
  zoomXSlider.addEventListener('input', (e) => {
    const sliderValue = parseInt(e.target.value);
    zoomXValue.textContent = sliderValue + '%';
    updateSliderBackground(zoomXSlider, sliderValue);
    applyMultiplierZoom(varName, 'x', sliderValue / 100);
  });
  
  zoomYSlider.addEventListener('input', (e) => {
    const sliderValue = parseInt(e.target.value);
    zoomYValue.textContent = sliderValue + '%';
    updateSliderBackground(zoomYSlider, sliderValue);
    applyMultiplierZoom(varName, 'y', sliderValue / 100);
  });
  
  // Inicializar fondos de sliders
  updateSliderBackground(zoomXSlider, 100);
  updateSliderBackground(zoomYSlider, 100);
  
  // Event listeners para botones
  btnActuales.addEventListener('click', () => zoomToLatest(varName, zoomXSlider, zoomXValue, zoomYSlider, zoomYValue));
  btnReset.addEventListener('click', () => resetZoom(varName, zoomXSlider, zoomXValue, zoomYSlider, zoomYValue));
  
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
  
  // Si no tenemos baseRange, establecerla desde el rango actual
  if (!state.baseRange) {
    updateBaseRange(varName);
  }
  
  if (!state.baseRange) return;
  
  // Actualizar el multiplicador
  if (axis === 'x') {
    state.zoomX = multiplier;
  } else {
    state.zoomY = multiplier;
  }
  
  // Aplicar el zoom combinado
  applyCombinedZoom(varName);
}

// ---- APLICAR ZOOM COMBINADO (BASE + MULTIPLICADORES) ----
function applyCombinedZoom(varName) {
  const state = zoomStates[varName];
  const base = state.baseRange;
  
  if (!base) return;
  
  // Calcular nuevos rangos aplicando los multiplicadores
  const visibleRangeX = (base.x[1] - base.x[0]) / state.zoomX;
  const visibleRangeY = (base.y[1] - base.y[0]) / state.zoomY;
  
  const centerX = state.centerX || (base.x[0] + base.x[1]) / 2;
  const centerY = state.centerY || (base.y[0] + base.y[1]) / 2;
  
  const newMinX = centerX - visibleRangeX / 2;
  const newMaxX = centerX + visibleRangeX / 2;
  const newMinY = centerY - visibleRangeY / 2;
  const newMaxY = centerY + visibleRangeY / 2;
  
  // Aplicar a la gráfica
  Plotly.relayout(charts[varName].div, {
    'xaxis.range': [new Date(newMinX), new Date(newMaxX)],
    'yaxis.range': [newMinY, newMaxY],
    'xaxis.autorange': false,
    'yaxis.autorange': false
  });
}

// ---- ACTUALIZAR RANGO BASE (cuando el usuario hace zoom manual) ----
function updateBaseRange(varName) {
  const graphDiv = charts[varName].div;
  const layout = graphDiv.layout;
  const buf = dataBuffers[varName];
  
  if (buf.x.length === 0) return;
  
  let baseX, baseY;
  
  if (layout.xaxis.range) {
    // Si hay zoom manual, usar ese como base
    const [minX, maxX] = layout.xaxis.range;
    baseX = [new Date(minX).getTime(), new Date(maxX).getTime()];
    
    // Guardar el centro actual
    zoomStates[varName].centerX = (baseX[0] + baseX[1]) / 2;
  } else {
    // Si no hay zoom, usar todo el rango de datos
    const allDates = buf.x.map(x => new Date(x).getTime());
    baseX = [Math.min(...allDates), Math.max(...allDates)];
  }
  
  if (layout.yaxis.range) {
    // Si hay zoom manual, usar ese como base
    baseY = layout.yaxis.range;
    
    // Guardar el centro actual
    zoomStates[varName].centerY = (baseY[0] + baseY[1]) / 2;
  } else {
    // Si no hay zoom, usar todo el rango de datos
    baseY = [Math.min(...buf.y), Math.max(...buf.y)];
  }
  
  if (baseX && baseY) {
    zoomStates[varName].baseRange = { x: baseX, y: baseY };
    
    // RESETEAR MULTIPLICADORES A 1.0 (100%) CUANDO HAY ZOOM MANUAL
    zoomStates[varName].zoomX = 1.0;
    zoomStates[varName].zoomY = 1.0;
    
    // Actualizar sliders visualmente
    updateSliderDisplay(varName);
  }
}

// ---- DETECTAR ZOOM MANUAL Y ACTUALIZAR BASE ----
function setupPlotlyZoomListener(varName) {
  const container = charts[varName].div;
  
  container.on('plotly_relayout', function(eventdata) {
    // Solo actualizar base si fue zoom manual (no de sliders)
    if (eventdata['xaxis.range[0]'] || eventdata['yaxis.range[0]']) {
      setTimeout(() => {
        updateBaseRange(varName);
      }, 100);
    }
  });
}

// ---- ACTUALIZAR DISPLAY DE SLIDERS ----
function updateSliderDisplay(varName) {
  const state = zoomStates[varName];
  const controlsDiv = charts[varName].div.previousElementSibling;
  
  if (controlsDiv) {
    const zoomXValue = controlsDiv.querySelector('span:nth-child(3)');
    const zoomYValue = controlsDiv.querySelector('span:nth-child(6)');
    const zoomXSlider = controlsDiv.querySelector('input:nth-child(2)');
    const zoomYSlider = controlsDiv.querySelector('input:nth-child(5)');
    
    if (zoomXValue && zoomYValue && zoomXSlider && zoomYSlider) {
      const sliderValueX = Math.round(state.zoomX * 100);
      const sliderValueY = Math.round(state.zoomY * 100);
      
      zoomXSlider.value = sliderValueX;
      zoomYSlider.value = sliderValueY;
      zoomXValue.textContent = sliderValueX + '%';
      zoomYValue.textContent = sliderValueY + '%';
      
      // Actualizar fondos de los sliders
      updateSliderBackground(zoomXSlider, sliderValueX);
      updateSliderBackground(zoomYSlider, sliderValueY);
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

// ---- ZOOM A ÚLTIMOS DATOS ----
function zoomToLatest(varName, zoomXSlider, zoomXValue, zoomYSlider, zoomYValue) {
  const buf = dataBuffers[varName];
  if (buf.x.length === 0) return;
  
  const last20 = buf.x.slice(-20).map(x => new Date(x));
  const lastValues = buf.y.slice(-20);
  
  if (last20.length > 0) {
    const minX = new Date(Math.min(...last20.map(x => x.getTime())));
    const maxX = new Date(Math.max(...last20.map(x => x.getTime())));
    const minY = Math.min(...lastValues);
    const maxY = Math.max(...lastValues);
    const padding = (maxY - minY) * 0.1 || 1;
    
    // Aplicar zoom manual
    Plotly.relayout(charts[varName].div, {
      'xaxis.range': [minX, maxX],
      'yaxis.range': [minY - padding, maxY + padding],
      'xaxis.autorange': false,
      'yaxis.autorange': false
    });
    
    // Actualizar base range y sliders
    setTimeout(() => {
      updateBaseRange(varName);
    }, 100);
  }
}

// ---- RESET ZOOM ----
function resetZoom(varName, zoomXSlider, zoomXValue, zoomYSlider, zoomYValue) {
  Plotly.relayout(charts[varName].div, {
    'xaxis.autorange': true,
    'yaxis.autorange': true
  });
  
  // Resetear estado
  setTimeout(() => {
    zoomStates[varName].baseRange = null;
    zoomStates[varName].zoomX = 1.0;
    zoomStates[varName].zoomY = 1.0;
    zoomStates[varName].centerX = null;
    zoomStates[varName].centerY = null;
    
    updateSliderDisplay(varName);
  }, 100);
}

// ---- ACTUALIZAR GRÁFICA ----
function updateChart(varName) {
  const buf = dataBuffers[varName];
  if (buf.x.length === 0) return;
  
  const combined = buf.x.map((x, i) => ({ 
    x: new Date(x), 
    y: buf.y[i]
  })).sort((a, b) => a.x - b.x);
  
  const trace = {
    x: combined.map(d => d.x),
    y: combined.map(d => d.y),
    type: 'scatter',
    mode: 'lines',
    line: { color: colorMap[varName], width: 2 },
    name: varName,
    hovertemplate: '%{x|%d/%m %H:%M}<br>' + varName + ': %{y:.2f}<extra></extra>',
    connectgaps: false
  };
  
  Plotly.react(charts[varName].div, [trace], charts[varName].layout, charts[varName].config);
}

// ---- CREAR GRAFICAS CON MÁS SEPARACIÓN ----
function createCharts(){
  variables.forEach(v => {
    const divId = 'grafica_' + v;
    let container = document.getElementById(divId);
    if (!container) {
      container = document.createElement('div');
      container.id = divId;
      container.style.width = '100%';
      container.style.height = '380px'; // Un poco más alto
      container.style.marginBottom = '25px'; // Más separación entre gráficas
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
        margin: { l: 60, r: 30, t: 10, b: 80 }, // Más margen abajo
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

// ---- RESTANTE DEL CÓDIGO ----
function pushPoint(varName, fecha, value){
  const buf = dataBuffers[varName];
  buf.x.push(fecha);
  buf.y.push(value);
  
  if(buf.x.length > MAX_POINTS){
    buf.x.shift();
    buf.y.shift();
  }
  
  updateChart(varName);
}

async function loadAllFromMongo(){
  try{
    const res = await fetch('/api/data/all');
    if(!res.ok) throw new Error('Error '+res.status);
    const all = await res.json();
    
    if (!all || !Array.isArray(all)) return;
    
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
    });

    variables.forEach(v => {
      updateChart(v);
    });

  } catch(e) {
    console.error('Error cargando histórico', e);
  }
}

socket.on('connect', () => console.log('Socket conectado'));
socket.on('disconnect', () => console.log('Socket desconectado'));

socket.on('nuevoDato', data => {
  const fecha = data.fecha ? new Date(data.fecha) : new Date();

  if(data.latitud && data.longitud){
    marker.setLatLng([data.latitud, data.longitud]);
    map.setView([data.latitud, data.longitud], 14);
    marker.bindPopup(`📍 ${data.latitud.toFixed(5)}, ${data.longitud.toFixed(5)}`).openPopup();
  }

  variables.forEach(v => {
    if(data[v] !== undefined && data[v] !== null) {
      pushPoint(v, fecha, data[v]);
    }
  });
});

(async function init(){
  initMap();
  createCharts();
  await loadAllFromMongo();
})();