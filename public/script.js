// ---- ZOOM A ÚLTIMOS DATOS CORREGIDO ----
function zoomToLatest(varName) {
  const buf = dataBuffers[varName];
  if (buf.x.length === 0) return;
  
  // Tomar los últimos 15 datos
  const last15 = buf.x.slice(-15).map(x => new Date(x));
  const lastValues = buf.y.slice(-15);
  
  if (last15.length > 0) {
    const minX = new Date(Math.min(...last15.map(x => x.getTime())));
    const maxX = new Date(Math.max(...last15.map(x => x.getTime())));
    const minY = Math.min(...lastValues);
    const maxY = Math.max(...lastValues);
    const padding = (maxY - minY) * 0.1 || 1;
    
    // Aplicar zoom directamente a los últimos datos
    Plotly.relayout(charts[varName].div, {
      'xaxis.range': [minX, maxX],
      'yaxis.range': [minY - padding, maxY + padding],
      'xaxis.autorange': false,
      'yaxis.autorange': false
    });
    
    console.log(`🔍 Zoom a últimos ${last15.length} datos de ${varName}`);
  }
}