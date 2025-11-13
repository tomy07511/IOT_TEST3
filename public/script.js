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
const zoomControls = {};
variables.forEach(v=>dataBuffers[v] = {x:[],y:[]});

// ---- INIT MAP ----
let map, marker;
function initMap(){
  map = L.map('map').setView([4.65,-74.1],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  marker = L.marker([4.65,-74.1]).addTo(map).bindPopup('Esperando datos GPS...');
}

// ---- CONTROLES DE ZOOM MEJORADOS ----
function createZoomControls(varName, container) {
  const controlsDiv = document.createElement('div');
  controlsDiv.style.cssText = `
    display: flex;
    gap: 15px;
    margin-bottom: 10px;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
    background: #102a3c;
    border-radius: 6px;
    flex-wrap: wrap;
  `;
  
  const title = document.createElement('span');
  title.textContent = varName;
  title.style.cssText = `
    color: #00e5ff;
    font-weight: 600;
    min-width: 100px;
    text-transform: capitalize;
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
  zoomXSlider.value = '100';
  zoomXSlider.style.cssText = `
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: #0f3a45;
    outline: none;
  `;
  
  const zoomXValue = document.createElement('span');
  zoomXValue.textContent = '100%';
  zoomXValue.style.cssText = `color: #00e5ff; font-size: 12px; min-width: 40px;`;
  
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
  zoomYSlider.value = '100';
  zoomYSlider.style.cssText = `
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: #0f3a45;
    outline: none;
  `;
  
  const zoomYValue = document.createElement('span');
  zoomYValue.textContent = '100%';
  zoomYValue.style.cssText = `color: #00e5ff; font-size: 12px; min-width: 40px;`;
  
  // Botones
  const buttonsDiv = document.createElement('div');
  buttonsDiv.style.cssText = `display: flex; gap: 5px;`;
  
  const btnActuales = document.createElement('button');
  btnActuales.innerHTML = '🕒';
  btnActuales.title = 'Últimos datos';
  btnActuales.style.cssText = `
    padding: 4px 8px;
    background: #7e57c2;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  `;
  
  const btnReset = document.createElement('button');
  btnReset.innerHTML = '🔁';
  btnReset.title = 'Resetear zoom';
  btnReset.style.cssText = `
    padding: 4px 8px;
    background: #00e5ff;
    color: #002;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  `;
  
  // Guardar referencias
  zoomControls[varName] = {
    zoomXSlider,
    zoomYSlider,
    zoomXValue,
    zoomYValue,
    currentXRange: null,
    currentYRange: null
  };
  
  // Event listeners para sliders - AHORA BASADO EN ZOOM ACTUAL
  zoomXSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    zoomXValue.textContent = value + '%';
    applyZoomFromCurrent(varName, 'x', parseInt(value));
  });
  
  zoomYSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    zoomYValue.textContent = value + '%';
    applyZoomFromCurrent(varName, 'y', parseInt(value));
  });
  
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
}

// ---- APLICAR ZOOM DESDE EL RANGO ACTUAL ----
function applyZoomFromCurrent(varName, axis, zoomPercent) {
  const control = zoomControls[varName];
  
  // Si no tenemos rango actual, obtenerlo del gráfico
  if (!control.currentXRange || !control.currentYRange) {
    updateCurrentRanges(varName);
  }
  
  if (axis === 'x' && control.currentXRange) {
    const [currentMinX, currentMaxX] = control.currentXRange;
    const currentRange = currentMaxX - currentMinX;
    const newRange = currentRange * (100 / zoomPercent); // Invertir la lógica
    
    const center = (currentMinX + currentMaxX) / 2;
    const newMinX = center - newRange / 2;
    const newMaxX = center + newRange / 2;
    
    Plotly.relayout(charts[varName].div, {
      'xaxis.range': [new Date(newMinX), new Date(newMaxX)],
      'xaxis.autorange': false
    });
    
  } else if (axis === 'y' && control.currentYRange) {
    const [currentMinY, currentMaxY] = control.currentYRange;
    const currentRange = currentMaxY - currentMinY;
    const newRange = currentRange * (100 / zoomPercent); // Invertir la lógica
    
    const center = (currentMinY + currentMaxY) / 2;
    const newMinY = center - newRange / 2;
    const newMaxY = center + newRange / 2;
    
    Plotly.relayout(charts[varName].div, {
      'yaxis.range': [newMinY, newMaxY],
      'yaxis.autorange': false
    });
  }
}

// ---- ACTUALIZAR RANGOS ACTUALES ----
function updateCurrentRanges(varName) {
  const control = zoomControls[varName];
  
  // Obtener el rango actual del gráfico
  const graphDiv = charts[varName].div;
  const layout = graphDiv.layout;
  
  if (layout.xaxis.range) {
    const [minX, maxX] = layout.xaxis.range;
    control.currentXRange = [new Date(minX).getTime(), new Date(maxX).getTime()];
  } else {
    // Si no hay zoom, usar todo el rango de datos
    const buf = dataBuffers[varName];
    if (buf.x.length > 0) {
      const allDates = buf.x.map(x => new Date(x).getTime());
      control.currentXRange = [Math.min(...allDates), Math.max(...allDates)];
    }
  }
  
  if (layout.yaxis.range) {
    control.currentYRange = layout.yaxis.range;
  } else {
    // Si no hay zoom, usar todo el rango de datos
    const buf = dataBuffers[varName];
    if (buf.y.length > 0) {
      control.currentYRange = [Math.min(...buf.y), Math.max(...buf.y)];
    }
  }
}

// ---- DETECTAR CAMBIOS DE ZOOM EN PLOTLY ----
function setupPlotlyZoomListener(varName) {
  const container = charts[varName].div;
  
  container.on('plotly_relayout', function(eventdata) {
    const control = zoomControls[varName];
    
    // Actualizar rangos actuales cuando el usuario hace zoom manual
    if (eventdata['xaxis.range[0]'] && eventdata['xaxis.range[1]']) {
      control.currentXRange = [
        new Date(eventdata['xaxis.range[0]']).getTime(),
        new Date(eventdata['xaxis.range[1]']).getTime()
      ];
      
      // Calcular y actualizar el slider X basado en el rango completo
      updateSliderFromCurrentRange(varName, 'x');
    }
    
    if (eventdata['yaxis.range[0]'] && eventdata['yaxis.range[1]']) {
      control.currentYRange = [
        eventdata['yaxis.range[0]'],
        eventdata['yaxis.range[1]']
      ];
      
      // Calcular y actualizar el slider Y basado en el rango completo
      updateSliderFromCurrentRange(varName, 'y');
    }
    
    // Si se resetea el zoom, volver a 100%
    if (eventdata['xaxis.autorange'] || eventdata['yaxis.autorange']) {
      control.zoomXSlider.value = '100';
      control.zoomYSlider.value = '100';
      control.zoomXValue.textContent = '100%';
      control.zoomYValue.textContent = '100%';
      updateCurrentRanges(varName);
    }
  });
}

// ---- ACTUALIZAR SLIDERS DESDE RANGO ACTUAL ----
function updateSliderFromCurrentRange(varName, axis) {
  const control = zoomControls[varName];
  const buf = dataBuffers[varName];
  
  if (buf.x.length === 0) return;
  
  if (axis === 'x') {
    const allDates = buf.x.map(x => new Date(x).getTime());
    const fullRange = Math.max(...allDates) - Math.min(...allDates);
    const currentRange = control.currentXRange[1] - control.currentXRange[0];
    const zoomPercent = Math.round((fullRange / currentRange) * 100);
    
    // Limitar entre 10% y 200%
    const limitedPercent = Math.max(10, Math.min(200, zoomPercent));
    control.zoomXSlider.value = limitedPercent;
    control.zoomXValue.textContent = limitedPercent + '%';
    
  } else if (axis === 'y') {
    const allValues = buf.y;
    const fullRange = Math.max(...allValues) - Math.min(...allValues);
    const currentRange = control.currentYRange[1] - control.currentYRange[0];
    const zoomPercent = Math.round((fullRange / currentRange) * 100);
    
    // Limitar entre 10% y 200%
    const limitedPercent = Math.max(10, Math.min(200, zoomPercent));
    control.zoomYSlider.value = limitedPercent;
    control.zoomYValue.textContent = limitedPercent + '%';
  }
}

// ---- ZOOM A ÚLTIMOS DATOS ----
function zoomToLatest(varName) {
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
    
    Plotly.relayout(charts[varName].div, {
      'xaxis.range': [minX, maxX],
      'yaxis.range': [minY - padding, maxY + padding],
      'xaxis.autorange': false,
      'yaxis.autorange': false
    });
    
    // Actualizar sliders
    setTimeout(() => {
      updateCurrentRanges(varName);
      updateSliderFromCurrentRange(varName, 'x');
      updateSliderFromCurrentRange(varName, 'y');
    }, 100);
  }
}

// ---- RESET ZOOM ----
function resetZoom(varName) {
  Plotly.relayout(charts[varName].div, {
    'xaxis.autorange': true,
    'yaxis.autorange': true
  });
  
  zoomControls[varName].zoomXSlider.value = '100';
  zoomControls[varName].zoomYSlider.value = '100';
  zoomControls[varName].zoomXValue.textContent = '100%';
  zoomControls[varName].zoomYValue.textContent = '100%';
}

// ---- GRÁFICAS SIN ESPACIOS VACÍOS ----
function updateChart(varName) {
  const buf = dataBuffers[varName];
  if (buf.x.length === 0) return;
  
  // Ordenar por fecha y usar todos los datos en una sola línea
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
    connectgaps: false // Esto evita líneas entre huecos grandes
  };
  
  Plotly.react(charts[varName].div, [trace], charts[varName].layout, charts[varName].config);
}

// ---- CREAR GRAFICAS ----
function createCharts(){
  variables.forEach(v=>{
    const divId = 'grafica_'+v;
    let container = document.getElementById(divId);
    if(!container){
      container = document.createElement('div');
      container.id = divId;
      container.style.width = '100%';
      container.style.height = '350px';
      container.style.marginBottom = '10px';
      document.querySelector('#graficaPlotly').appendChild(container);
    }

    createZoomControls(v, container);

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
        margin: { l: 60, r: 30, t: 10, b: 60 },
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
    
    // Inicializar rangos actuales
    setTimeout(() => {
      updateCurrentRanges(v);
    }, 500);
  });
}

// ---- REST