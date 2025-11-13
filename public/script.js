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
variables.forEach(v=>dataBuffers[v] = {x:[],y:[]});

// ---- INIT MAP ----
let map, marker;
function initMap(){
  map = L.map('map').setView([4.65,-74.1],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  marker = L.marker([4.65,-74.1]).addTo(map).bindPopup('Esperando datos GPS...');
}

// ---- CREAR CONTROLES MEJORADOS CON LAZY LOAD VISUAL ----
function createChartControls(varName, container) {
  const controlsDiv = document.createElement('div');
  controlsDiv.className = `chart-controls-${varName}`;
  controlsDiv.style.cssText = `
    display: flex;
    gap: 12px;
    margin-bottom: 15px;
    justify-content: flex-end;
    align-items: center;
    padding: 12px 16px;
    background: linear(135deg, #102a3c, #0a1f2d);
    border-radius: 12px;
    border: 1px solid #0f3a45;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    transition: all 0.3s ease;
  `;
  
  // Efecto hover suave en todo el panel de controles
  controlsDiv.addEventListener('mouseenter', () => {
    controlsDiv.style.boxShadow = '0 6px 20px rgba(0, 229, 255, 0.2)';
    controlsDiv.style.borderColor = '#00e5ff';
  });
  
  controlsDiv.addEventListener('mouseleave', () => {
    controlsDiv.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    controlsDiv.style.borderColor = '#0f3a45';
  });

  // Título de la variable con icono
  const title = document.createElement('span');
  title.innerHTML = `📊 <strong>${varName}</strong>`;
  title.style.cssText = `
    color: #00e5ff;
    font-weight: 600;
    font-size: 14px;
    margin-right: auto;
    text-transform: capitalize;
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  
  // Contenedor para botones
  const buttonsContainer = document.createElement('div');
  buttonsContainer.style.cssText = `
    display: flex;
    gap: 8px;
    align-items: center;
  `;
  
  // Botón "Actuales" mejorado
  const btnActuales = document.createElement('button');
  btnActuales.innerHTML = '🕒 Últimos 15';
  btnActuales.title = 'Zoom a los últimos 15 datos';
  btnActuales.style.cssText = `
    padding: 8px 16px;
    background: linear(135deg, #7e57c2, #5e35b1);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.3s ease;
    box-shadow: 0 2px 8px rgba(126, 87, 194, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
  `;
  
  // Botón "Reset Zoom" mejorado
  const btnReset = document.createElement('button');
  btnReset.innerHTML = '🔁 Reset';
  btnReset.title = 'Resetear zoom a vista completa';
  btnReset.style.cssText = `
    padding: 8px 16px;
    background: linear(135deg, #00e5ff, #00bcd4);
    color: #002;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.3s ease;
    box-shadow: 0 2px 8px rgba(0, 229, 255, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.2);
  `;
  
  // Efectos hover premium
  const setupButtonHover = (btn, hoverColor) => {
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-2px) scale(1.05)';
      btn.style.boxShadow = `0 6px 16px ${hoverColor}`;
      btn.style.filter = 'brightness(1.1)';
    });
    
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translateY(0) scale(1)';
      btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
      btn.style.filter = 'brightness(1)';
    });
    
    btn.addEventListener('mousedown', () => {
      btn.style.transform = 'translateY(0) scale(0.98)';
    });
  };
  
  setupButtonHover(btnActuales, 'rgba(126, 87, 194, 0.6)');
  setupButtonHover(btnReset, 'rgba(0, 229, 255, 0.6)');
  
  // Event listeners
  btnActuales.addEventListener('click', () => zoomToLatest(varName));
  btnReset.addEventListener('click', () => resetZoom(varName));
  
  buttonsContainer.appendChild(btnActuales);
  buttonsContainer.appendChild(btnReset);
  
  controlsDiv.appendChild(title);
  controlsDiv.appendChild(buttonsContainer);
  
  // Insertar antes del contenedor de la gráfica
  container.parentNode.insertBefore(controlsDiv, container);
}

// ---- FUNCIÓN MEJORADA PARA COMPRIMIR TIEMPO ----
function createCompressedSegments(xArray, yArray) {
  if (xArray.length === 0) return [];
  
  // Ordenar por fecha
  const combined = xArray.map((x, i) => ({ 
    x: new Date(x), 
    y: yArray[i],
    originalTime: new Date(x).getTime()
  })).sort((a, b) => a.x - b.x);
  
  const segments = [];
  let currentSegment = { x: [], y: [], originalTimes: [] };
  let compressedTime = 0; // Tiempo comprimido (relativo)
  const timeStep = 1; // Paso de tiempo entre puntos (unidades arbitrarias)
  
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000; // 2 días en milisegundos
  
  for (let i = 0; i < combined.length; i++) {
    const currentPoint = combined[i];
    
    if (currentSegment.x.length === 0) {
      // Primer punto del segmento
      currentSegment.x.push(compressedTime);
      currentSegment.y.push(currentPoint.y);
      currentSegment.originalTimes.push(currentPoint.originalTime);
    } else {
      const lastOriginalTime = currentSegment.originalTimes[currentSegment.originalTimes.length - 1];
      const timeDiff = currentPoint.originalTime - lastOriginalTime;
      
      if (timeDiff <= TWO_DAYS_MS) {
        // Mismo segmento (menos de 2 días de diferencia)
        compressedTime += timeStep;
        currentSegment.x.push(compressedTime);
        currentSegment.y.push(currentPoint.y);
        currentSegment.originalTimes.push(currentPoint.originalTime);
      } else {
        // Hueco mayor a 2 días - crear nuevo segmento
        segments.push({
          x: [...currentSegment.x],
          y: [...currentSegment.y],
          originalTimes: [...currentSegment.originalTimes]
        });
        
        // Reiniciar tiempo comprimido para nuevo segmento
        compressedTime = 0;
        currentSegment = { 
          x: [compressedTime], 
          y: [currentPoint.y],
          originalTimes: [currentPoint.originalTime]
        };
      }
    }
  }
  
  // Agregar el último segmento
  if (currentSegment.x.length > 0) {
    segments.push({
      x: currentSegment.x,
      y: currentSegment.y,
      originalTimes: currentSegment.originalTimes
    });
  }
  
  return segments;
}

// ---- ACTUALIZAR GRÁFICA CON TIEMPO COMPRIMIDO ----
function updateChart(varName) {
  const buf = dataBuffers[varName];
  const segments = createCompressedSegments(buf.x, buf.y);
  
  // Crear trazas para cada segmento
  const traces = segments.map((segment, index) => ({
    x: segment.x,
    y: segment.y,
    type: 'scatter',
    mode: 'lines+markers',
    line: {
      color: colorMap[varName], 
      width: 2.5, 
      shape: 'spline',
      smoothing: 1.3
    },
    marker: {
      size: 4,
      color: colorMap[varName],
      opacity: 0.7,
      symbol: 'circle'
    },
    name: segments.length > 1 ? `${varName} (Segmento ${index + 1})` : varName,
    hovertemplate: `%{meta|%d/%m %H:%M}<br>${varName}: %{y:.2f}<extra></extra>`,
    meta: segment.originalTimes.map(t => new Date(t)),
    showlegend: segments.length > 1
  }));
  
  // Layout especial para tiempo comprimido
  const compressedLayout = {
    ...charts[varName].layout,
    xaxis: {
      ...charts[varName].layout.xaxis,
      type: 'linear', // Cambiamos a linear para tiempo comprimido
      title: { text: 'Tiempo Comprimido', font: { color: '#a0d2e0', size: 12 } },
      tickformat: ',d',
      gridcolor: '#0f3a45',
      zerolinecolor: '#0f3a45'
    },
    annotations: segments.length > 1 ? [
      {
        x: 0.5,
        y: -0.25,
        xref: 'paper',
        yref: 'paper',
        text: `📅 Gráfica comprimida - ${segments.length} segmentos de datos`,
        showarrow: false,
        font: { color: '#00e5ff', size: 12 },
        bgcolor: 'rgba(16, 42, 60, 0.9)',
        bordercolor: '#00e5ff',
        borderwidth: 1,
        borderpad: 4,
        bordercolor: '#0f3a45'
      }
    ] : []
  };
  
  // Actualizar la gráfica
  Plotly.react(charts[varName].div, traces, compressedLayout, charts[varName].config);
}

// ---- ZOOM A ÚLTIMOS 15 DATOS (ACTUALIZADO PARA TIEMPO COMPRIMIDO) ----
function zoomToLatest(varName) {
  const buf = dataBuffers[varName];
  if (buf.x.length === 0) return;
  
  // En tiempo comprimido, los últimos 15 puntos son simplemente los últimos del buffer
  const lastIndex = Math.max(0, buf.x.length - 15);
  const latestData = buf.y.slice(lastIndex);
  
  if (latestData.length > 0) {
    const minY = Math.min(...latestData);
    const maxY = Math.max(...latestData);
    const paddingY = (maxY - minY) * 0.15 || 1;
    
    // En tiempo comprimido, hacemos zoom en X para mostrar los últimos 20 unidades
    const segments = createCompressedSegments(buf.x, buf.y);
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      const maxX = Math.max(...lastSegment.x);
      const minX = Math.max(0, maxX - 20); // Mostrar últimas 20 unidades
      
      Plotly.relayout(charts[varName].div, {
        'xaxis.range': [minX, maxX],
        'yaxis.range': [minY - paddingY, maxY + paddingY],
        'xaxis.autorange': false,
        'yaxis.autorange': false
      });
    }
    
    console.log(`🔍 Zoom a últimos ${latestData.length} datos de ${varName}`);
  }
}

// ---- RESET ZOOM INDIVIDUAL ----
function resetZoom(varName) {
  Plotly.relayout(charts[varName].div, {
    'xaxis.autorange': true,
    'yaxis.autorange': true
  });
  
  console.log(`🔄 Zoom resetado en ${varName}`);
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
      container.style.height = '450px'; // Un poco más alto para los controles
      container.style.marginTop = '8px';
      container.style.borderRadius = '8px';
      container.style.overflow = 'hidden';
      container.style.background = '#071923';
      document.querySelector('#graficaPlotly').appendChild(container);
    }

    // Crear controles premium para esta gráfica
    createChartControls(v, container);

    // Inicializar gráfica
    charts[v] = {
      div: container,
      layout: {
        title: {text: '', font: {color: '#00e5ff', size: 16}},
        plot_bgcolor:'#071923',
        paper_bgcolor:'#071923',
        font:{color:'#eaf6f8', family: 'Segoe UI, system-ui, Arial'},
        xaxis: {
          type: 'linear',
          title: { text: 'Tiempo Comprimido', font: { color: '#a0d2e0', size: 12 } },
          gridcolor:'#0f3a45',
          zerolinecolor: '#0f3a45',
          tickcolor:'#0f3a45',
          tickfont: {color: '#a0d2e0'}
        },
        yaxis:{
          gridcolor:'#0f3a45',
          zerolinecolor: '#0f3a45',
          tickcolor:'#0f3a45',
          tickfont: {color: '#a0d2e0'},
          autorange: true,
          fixedrange: false
        },
        legend:{orientation:'h', y:-0.25, font: {color: '#eaf6f8'}},
        margin: {l:70, r:40, t:10, b:80},
        hovermode: 'closest',
        hoverlabel: {
          bgcolor: '#102a3c',
          bordercolor: '#00e5ff',
          font: {color: '#eaf6f8'}
        }
      },
      config:{
        responsive: true,
        displayModeBar: true,
        modeBarButtonsToRemove: ['pan2d','select2d','lasso2d'],
        displaylogo: false,
        scrollZoom: true
      }
    };

    // Crear gráfica inicial vacía
    try {
      Plotly.newPlot(container, [], charts[v].layout, charts[v].config);
    } catch (error) {
      console.error(`❌ Error creando gráfica ${v}:`, error);
    }
  });
}

// ---- ACTUALIZAR BUFFER Y PLOT ----
function pushPoint(varName, fecha, value){
  const buf = dataBuffers[varName];
  buf.x.push(fecha);
  buf.y.push(value);
  
  if(buf.x.length > MAX_POINTS){
    buf.x.shift();
    buf.y.shift();
  }
  
  // Actualizar gráfica con tiempo comprimido
  updateChart(varName);
}

// ---- CARGAR HISTORICO ----
async function loadAllFromMongo(){
  try{
    const res = await fetch('/api/data/all');
    if(!res.ok) throw new Error('Error '+res.status);
    const all = await res.json();
    
    if (!all || !Array.isArray(all)) {
      console.warn('⚠️ No se recibieron datos históricos');
      return;
    }
    
    console.log('📥 Cargando históricos:', all.length);
    
    // Limpiar buffers
    variables.forEach(v => {
      dataBuffers[v].x = [];
      dataBuffers[v].y = [];
    });

    // Cargar datos
    all.forEach(rec=>{
      const fecha = new Date(rec.fecha);
      variables.forEach(v=>{
        if(rec[v] !== undefined && rec[v] !== null){
          dataBuffers[v].x.push(fecha);
          dataBuffers[v].y.push(rec[v]);
        }
      });
    });

    // Render inicial con tiempo comprimido
    variables.forEach(v=>{
      updateChart(v);
    });

    console.log('✅ Históricos cargados con tiempo comprimido');
  }catch(e){
    console.error('❌ Error cargando histórico',e);
  }
}

// ---- SOCKET.IO REALTIME ----
socket.on('connect', ()=>console.log('🔌 Socket conectado'));
socket.on('disconnect', ()=>console.log('🔌 Socket desconectado'));

socket.on('nuevoDato', data=>{
  const fecha = data.fecha ? new Date(data.fecha) : new Date();

  if(data.latitud!==undefined && data.longitud!==undefined){
    marker.setLatLng([data.latitud,data.longitud]);
    map.setView([data.latitud,data.longitud],14);
    marker.setPopupContent(`📍 Lat:${data.latitud.toFixed(5)}<br>Lon:${data.longitud.toFixed(5)}<br>${fecha.toLocaleString()}`).openPopup();
  }

  variables.forEach(v=>{
    if(data[v] !== undefined && data[v] !== null) {
      pushPoint(v, fecha, data[v]);
    }
  });
});

// ---- INICIO ----
(async function init(){
  initMap();
  createCharts();
  await loadAllFromMongo();
})();