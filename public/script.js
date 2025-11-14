// ---- SOCKET.IO MEJORADO ----
socket.on('connect', () => {
  console.log('🔌 Socket.IO CONECTADO - Listo para datos en tiempo real');
  // Indicador visual
  showConnectionStatus('connected');
});

socket.on('disconnect', (reason) => {
  console.log('🔌 Socket.IO DESCONECTADO:', reason);
  showConnectionStatus('disconnected');
});

socket.on('connect_error', (error) => {
  console.log('❌ Error de conexión Socket.IO:', error);
  showConnectionStatus('error');
});

// Escuchar múltiples eventos posibles
socket.on('nuevoDato', (data) => {
  console.log('📥 EVENTO "nuevoDato" RECIBIDO:', data);
  processNewData(data);
});

socket.on('mqtt_data', (data) => {
  console.log('📥 EVENTO "mqtt_data" RECIBIDO:', data);
  processNewData(data);
});

socket.on('sensor_data', (data) => {
  console.log('📥 EVENTO "sensor_data" RECIBIDO:', data);
  processNewData(data);
});

socket.on('data', (data) => {
  console.log('📥 EVENTO "data" RECIBIDO:', data);
  processNewData(data);
});

// ---- PROCESAR NUEVOS DATOS ----
function processNewData(data) {
  console.log('🔄 Procesando nuevo dato en tiempo real:', data);
  
  const fecha = data.fecha ? new Date(data.fecha) : new Date();
  
  // Destacar visualmente que llegó un nuevo dato
  highlightNewData();
  
  // ACTUALIZAR MAPA EN TIEMPO REAL
  if(data.latitud && data.longitud){
    console.log(`🗺️ Actualizando mapa en tiempo real: ${data.latitud}, ${data.longitud}`);
    updateMap(data.latitud, data.longitud, data.fecha);
  }

  // ACTUALIZAR GRÁFICAS EN TIEMPO REAL
  let updatedVariables = 0;
  variables.forEach(v => {
    if(data[v] !== undefined && data[v] !== null) {
      pushPoint(v, fecha, data[v]);
      updatedVariables++;
      console.log(`📈 ${v} actualizado en tiempo real: ${data[v]}`);
    }
  });
  
  console.log(`✅ ${updatedVariables} variables actualizadas en tiempo real`);
}

// ---- INDICADOR VISUAL DE CONEXIÓN ----
function showConnectionStatus(status) {
  let statusIndicator = document.getElementById('connection-status');
  
  if (!statusIndicator) {
    statusIndicator = document.createElement('div');
    statusIndicator.id = 'connection-status';
    statusIndicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 8px 12px;
      border-radius: 4px;
      font-weight: bold;
      z-index: 10000;
      font-size: 12px;
      background: #333;
      color: white;
    `;
    document.body.appendChild(statusIndicator);
  }
  
  switch(status) {
    case 'connected':
      statusIndicator.textContent = '🔌 CONECTADO';
      statusIndicator.style.background = '#00c853';
      break;
    case 'disconnected':
      statusIndicator.textContent = '❌ DESCONECTADO';
      statusIndicator.style.background = '#ff4444';
      break;
    case 'error':
      statusIndicator.textContent = '⚠️ ERROR CONEXIÓN';
      statusIndicator.style.background = '#ff9800';
      break;
  }
}

// ---- DESTACAR NUEVOS DATOS ----
function highlightNewData() {
  const container = document.querySelector('.container');
  if (container) {
    container.style.boxShadow = '0 0 20px #00ff00';
    container.style.transition = 'box-shadow 0.3s ease';
    
    setTimeout(() => {
      container.style.boxShadow = 'none';
    }, 1000);
  }
}

// ---- VERIFICAR CONEXIÓN SOCKET.IO ----
function checkSocketConnection() {
  console.log('🔍 Estado de Socket.IO:', socket.connected ? '✅ CONECTADO' : '❌ DESCONECTADO');
  console.log('🔍 ID del socket:', socket.id);
  
  if (!socket.connected) {
    console.log('⚠️ Socket.IO no está conectado. Verifica:');
    console.log('   - Que el servidor esté corriendo');
    console.log('   - Que la ruta de Socket.IO sea correcta');
    console.log('   - Que no haya errores en la consola del servidor');
  }
}

// ---- INICIO MEJORADO ----
(async function init(){
  console.log('🚀 Iniciando aplicación...');
  
  // Verificar elementos existentes
  verificarElementos();
  
  // Verificar conexión Socket.IO inmediatamente
  checkSocketConnection();
  
  // 1. Inicializar mapa
  initMap();
  
  // 2. Crear gráficas
  createCharts();
  
  // 3. Cargar datos históricos
  await loadAllFromMongo();
  
  console.log('✅ Aplicación completamente inicializada');
  console.log('📡 Esperando datos MQTT en tiempo real...');
  console.log('📍 El servidor debe emitir eventos: "nuevoDato", "mqtt_data", "sensor_data" o "data"');
})();