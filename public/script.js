// ---- DIAGNÓSTICO SOCKET.IO ----
function setupSocketDiagnostics() {
  console.log('🔍 Iniciando diagnóstico Socket.IO...');
  
  // Verificar si socket.io está cargado
  if (typeof io === 'undefined') {
    console.error('❌ Socket.IO no está cargado en la página');
    return false;
  }
  console.log('✅ Socket.IO cargado correctamente');

  // Verificar conexión
  console.log('🔌 Estado de Socket.IO:', socket.connected ? 'CONECTADO' : 'DESCONECTADO');
  
  // Listar todos los eventos escuchados
  console.log('📡 Eventos escuchados:', socket._callbacks);
  
  return true;
}

// ---- SIMULAR DATOS MQTT PARA PRUEBAS ----
function simulateMQTTData() {
  console.log('🧪 Simulando datos MQTT para prueba...');
  
  const simulatedData = {
    fecha: new Date(),
    humedad: Math.random() * 100,
    temperatura: 20 + Math.random() * 10,
    conductividad: Math.random() * 2000,
    ph: 6 + Math.random() * 2,
    latitud: 4.65 + (Math.random() - 0.5) * 0.01,
    longitud: -74.1 + (Math.random() - 0.5) * 0.01
  };
  
  console.log('🧪 Datos simulados:', simulatedData);
  
  // Procesar como si viniera de Socket.IO
  processNewData(simulatedData);
}

// ---- PROCESAR NUEVOS DATOS ----
function processNewData(data) {
  console.log('🔄 Procesando nuevo dato:', data);
  
  const fecha = data.fecha ? new Date(data.fecha) : new Date();
  
  // Destacar visualmente
  highlightNewData();
  
  // ACTUALIZAR MAPA
  if(data.latitud && data.longitud){
    console.log(`🗺️ Actualizando mapa: ${data.latitud}, ${data.longitud}`);
    updateMap(data.latitud, data.longitud, data.fecha);
  }

  // ACTUALIZAR GRÁFICAS
  let updatedVariables = 0;
  variables.forEach(v => {
    if(data[v] !== undefined && data[v] !== null) {
      pushPoint(v, fecha, data[v]);
      updatedVariables++;
      console.log(`📈 ${v} actualizado: ${data[v]}`);
    }
  });
  
  console.log(`✅ ${updatedVariables} variables actualizadas`);
}

// ---- CONFIGURACIÓN SOCKET.IO MEJORADA ----
function setupSocketListeners() {
  console.log('🔌 Configurando listeners de Socket.IO...');
  
  socket.on('connect', () => {
    console.log('✅ Socket.IO CONECTADO al servidor');
    // Indicador visual de conexión
    showConnectionStatus('connected');
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ Socket.IO DESCONECTADO:', reason);
    showConnectionStatus('disconnected');
  });

  socket.on('connect_error', (error) => {
    console.log('❌ Error de conexión Socket.IO:', error);
    showConnectionStatus('error');
  });

  socket.on('nuevoDato', (data) => {
    console.log('📥 EVENTO "nuevoDato" RECIBIDO via Socket.IO:', data);
    processNewData(data);
  });

  // Escuchar otros eventos posibles
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

  // Evento genérico para ver todos los eventos
  socket.onAny((eventName, ...args) => {
    console.log(`📡 Evento recibido: ${eventName}`, args);
  });
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
    `;
    document.body.appendChild(statusIndicator);
  }
  
  switch(status) {
    case 'connected':
      statusIndicator.textContent = '🔌 CONECTADO';
      statusIndicator.style.background = '#00c853';
      statusIndicator.style.color = 'white';
      break;
    case 'disconnected':
      statusIndicator.textContent = '❌ DESCONECTADO';
      statusIndicator.style.background = '#ff4444';
      statusIndicator.style.color = 'white';
      break;
    case 'error':
      statusIndicator.textContent = '⚠️ ERROR';
      statusIndicator.style.background = '#ff9800';
      statusIndicator.style.color = 'white';
      break;
  }
}

// ---- BOTÓN DE PRUEBA MANUAL ----
function addTestButton() {
  const testButton = document.createElement('button');
  testButton.textContent = '🧪 Simular MQTT';
  testButton.style.cssText = `
    position: fixed;
    bottom: 10px;
    right: 10px;
    padding: 8px 12px;
    background: #7e57c2;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    z-index: 10000;
  `;
  
  testButton.addEventListener('click', simulateMQTTData);
  document.body.appendChild(testButton);
}

// ---- VERIFICAR SERVER.JS ----
function checkServerConfig() {
  console.log('🔍 Verificando configuración del servidor...');
  console.log('📍 El servidor debe tener:');
  console.log('   - Socket.IO configurado en el mismo puerto');
  console.log('   - Evento "nuevoDato" emitido cuando llegan datos MQTT');
  console.log('   - Conexión MQTT activa al broker');
}

// ---- INICIO MEJORADO ----
(async function init(){
  console.log('🚀 Iniciando aplicación con diagnóstico...');
  
  // 1. Diagnóstico Socket.IO
  setupSocketDiagnostics();
  
  // 2. Configurar listeners
  setupSocketListeners();
  
  // 3. Agregar botón de prueba
  addTestButton();
  
  // 4. Verificar configuración del servidor
  checkServerConfig();
  
  // 5. Inicializar componentes
  initMap();
  createCharts();
  await loadAllFromMongo();
  
  console.log('✅ Aplicación iniciada con diagnóstico completo');
  console.log('📡 Esperando datos MQTT...');
  
  // Probar con datos simulados después de 5 segundos
  setTimeout(() => {
    console.log('🧪 Probando con datos simulados...');
    simulateMQTTData();
  }, 5000);
  
})();