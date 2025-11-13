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

// ---- MEJORAR DISEÑO DE CONTROLES ----
function createChartControls(varName, container) {
  const controlsDiv = document.createElement('div');
  controlsDiv.style.cssText = `
    display: flex;
    gap: 12px;
    margin-bottom: 15px;
    justify-content: flex-end;
    align-items: center;
    padding: 8px 12px;
    background: rgba(16, 42, 60, 0.8);
    border-radius: 8px;
    border: 1px solid #0f3a45;
  `;
  
  // Título de la variable
  const title = document.createElement('span');
  title.textContent = varName;
  title.style.cssText = `
    color: #00e5ff;
    font-weight: 600;
    font-size: 14px;
    margin-right: auto;
    text-transform: capitalize;
  `;
  
  // Botón "Actuales"
  const btnActuales = document.createElement('button');
  btnActuales.innerHTML = '🕒 Últimos 15';
  btnActuales.title = 'Zoom a los últimos 15 datos';
  btnActuales.style.cssText = `
    padding: 8px 16px;
    background: linear(135deg, #7e57c2, #5e35b1);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.3s ease;
    box-shadow: 0 2px 4px rgba(126, 87, 194, 0.3);
  `;
  
  // Botón "Reset Zoom"
  const btnReset = document.createElement('button');
  btnReset.innerHTML = '🔁 Reset Zoom';
  btnReset.title = 'Resetear zoom a vista completa';
  btnReset.style.cssText = `
    padding: 8px 16px;
    background: linear(135deg, #00e5ff, #00bcd4);
    color: #002;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.3s ease;
    box-shadow: 0 2px 4px rgba(0, 229, 255, 0.3);
  `;
  
  // Efectos hover mejorados
  [btnActuales, btnReset].forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-2px)';
      btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    });
    
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    });
    
    btn.addEventListener('mousedown', () => {
      btn.style.transform = 'translateY(0)';
    });
  });
  
  // Event listeners
  btnActuales.addEventListener('click', () => zoomToLatest(varName));
  btnReset.addEventListener('click', () => resetZoom(varName));
  
  controlsDiv.appendChild(title);
  controlsDiv.appendChild(btnActuales);
  controlsDiv.appendChild(btnReset);
  
  // Insertar antes del contenedor de la gráfica
  container.parentNode.insertBefore(controlsDiv, container);
}

// ---- FUNCIÓN PARA DIVIDIR DATOS EN SEGMENTOS (ELIMINA LÍNEAS ENTRE HUECOS) ----
function createDataSegments(xArray, yArray) {
  if (xArray.length === 0) return [];
  
  const segments = [];
  let currentSegment = { x: [], y: [] };
  
  // Ordenar por fecha por si acaso
  const combined = xArray.map((x, i) => ({ x: new Date(x), y: yArray[i] }))
    .sort((a, b) => a.x - b.x);
  
  for (let i = 0; i < combined.length; i++) {
    const currentPoint = combined[i];
    
    if (currentSegment.x.length === 0) {
      // Primer punto del segmento
      currentSegment.x.push(currentPoint.x);
      currentSegment.y.push(currentPoint.y);
    } else {
      const lastPoint = combined[i - 1];
      const timeDiff = currentPoint.x - lastPoint.x;
      const maxGap = 2 * 60 * 60 * 1000; // 2 horas en milisegundos
      
      if (timeDiff <= maxGap) {
        // Mismo segmento (menos de 2 horas de diferencia)
        currentSegment.x.push(currentPoint.x);
        currentSegment.y.push(currentPoint.y);
      } else {
        // Hueco detectado (> 2 horas), crear nuevo segmento
        segments.push(currentSegment);
        currentSegment = { x: [currentPoint.x], y: [currentPoint.y] };
      }
    }
  }
  
  // Agregar el último segmento
  if (currentSegment.x.length > 0) {
    segments.push(currentSegment);
  }
  
  return segments;
}

// ---- ZOOM A ÚLTIMOS 15 DATOS ----
function zoomToLatest(varName) {
  const buf = dataBuffers[varName];
  if (buf.x.length === 0) return;
  
  // Ordenar por fecha y tomar últimos 15
  const combined = buf.x.map((x, i) => ({x: new Date(x), y: buf.y[i]}))
    .sort((a, b) => a.x - b.x)
    .slice(-15);
  
  if (combined.length > 0) {
    const xValues = combined.map(d => d.x);
    const yValues = combined.map(d => d.y);
    
    const minX = new Date(Math.min(...xValues.map(x => x.getTime())));
    const maxX = new Date(Math.max(...xValues.map(x => x.getTime())));
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const paddingY = (maxY - minY) * 0.15 || 1; // 15% padding
    
    // Aplicar zoom con animación suave
    Plotly.relayout(charts[varName].div, {
      'xaxis.range': [minX, maxX],
      'yaxis.range': [minY - paddingY, maxY + paddingY],
      'xaxis.autorange': false,
      'yaxis.autorange': false
    });
    
    console.log(`🔍 Zoom a últimos ${combined.length} datos de ${varName}`);
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

// ---- CREAR GRAFICAS CON SEGMENTOS ----
function createCharts(){
  variables.forEach(v=>{
    const divId = 'grafica_'+v;
    let container = document.getElementById(divId);
    if(!container){
      container = document.createElement('div');
      container.id = divId;
      container.style.width = '100%';
      container.style.height = '420px';
      container.style.marginTop = '8px';
      container.style.borderRadius = '8px';
      container.style.overflow = 'hidden';
      document.querySelector('#graficaPlotly').appendChild(container);
    }

    // Crear controles mejorados para esta gráfica
    createChartControls(v, container);

    // Inicializar con array vacío de trazas (se llenará con segmentos)
    charts[v] = {
      div: container,
      traces: [], // Ahora será un array de trazas (segmentos)
      layout: {
        title: {text: '', font: {color: '#00e5ff', size: 16}}, // Quitamos título ya que está en controles
        plot_bgcolor:'#071923',
        paper_bgcolor:'#071923',
        font:{color:'#eaf6f8', family: 'Segoe UI, system-ui, Arial'},
        xaxis: {
          rangeslider:{visible:true, bgcolor:'#021014', bordercolor:'#0f3a45'},
          rangeselector:{
            buttons:[
              {step:'hour', stepmode:'backward', count:1, label:'1h'},
              {step:'hour', stepmode:'backward', count:6, label:'6h'},
              {step:'day', stepmode:'backward', count:1, label:'1d'},
              {step:'all', label:'Todo'}
            ],
            bgcolor:'#04161a',
            activecolor:'#00e5ff',
            font: {color: '#eaf6f8'}
          },
          type:'date',
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
        legend:{orientation:'h', y:-0.2, font: {color: '#eaf6f8'}},
        margin: {l:70, r:40, t:20, b:100},
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
    
    // Event listener para zoom
    container.on('plotly_relayout', function(eventdata) {
      if (eventdata['xaxis.range[0]'] && eventdata['xaxis.range[1]']) {
        autoAdjustYAxis(v, [eventdata['xaxis.range[0]'], eventdata['xaxis.range[1]']]);
      } else if (eventdata['xaxis.autorange'] || eventdata['autosize']) {
        Plotly.relayout(container, {'yaxis.autorange': true});
      }
    });
  });
}

// ---- ACTUALIZAR GRÁFICA CON SEGMENTOS ----
function updateChart(varName) {
  const buf = dataBuffers[varName];
  const segments = createDataSegments(buf.x, buf.y);
  
  // Crear trazas para cada segmento
  const traces = segments.map(segment => ({
    x: segment.x,
    y: segment.y,
    type: 'scatter',
    mode: 'lines',
    line: {color: colorMap[varName], width: 2.5, shape: 'spline'},
    name: varName,
    hovertemplate: `%{x|%d/%m %H:%M}<br>${varName}: %{y:.2f}<extra></extra>`,
    showlegend: segments.length > 1 // Solo mostrar leyenda si hay múltiples segmentos
  }));
  
  // Actualizar la gráfica
  Plotly.react(charts[varName].div, traces, charts[varName].layout, charts[varName].config);
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
  
  // Actualizar gráfica con segmentos
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

    // Render inicial con segmentos
    variables.forEach(v=>{
      updateChart(v);
    });

    console.log('✅ Históricos cargados y segmentados');
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