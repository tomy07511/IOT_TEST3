import * as echarts from 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.esm.min.js';
import { TitleComponent, TooltipComponent, GridComponent, DataZoomComponent, LineChart, CanvasRenderer, UniversalTransition, AxisBreak } from 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.esm.min.js';

echarts.use([TitleComponent, TooltipComponent, GridComponent, DataZoomComponent, LineChart, CanvasRenderer, UniversalTransition, AxisBreak]);

const variables = ["humedad","temperatura","conductividad","ph","nitrogeno","fosforo","potasio","bateria","corriente"];
const charts = {};
let liveBuffer = [];
let allData = [];
let lastMqttTimestamp = 0;
let isTimelinePaused = false; // Pausa cuando el usuario mueve el slider

// Colores para cada variable
const colors = {
  humedad: '#1f77b4',
  temperatura: '#ff7f0e',
  conductividad: '#2ca02c',
  ph: '#d62728',
  nitrogeno: '#9467bd',
  fosforo: '#8c564b',
  potasio: '#e377c2',
  bateria: '#7f7f7f',
  corriente: '#bcbd22'
};

// ================= ECHARTS =================
function createChart(v){
  const dom = document.getElementById(v);
  const chart = echarts.init(dom);

  const {seriesData, breaks} = generateData(); // Datos de ejemplo / breaks

  const option = {
    useUTC: true,
    title: { text: v, left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: [{
      type: 'time',
      breaks: breaks,
      axisLabel: {
        formatter: (t, _, opt) => opt.break ? echarts.time.format(t, '{HH}:{mm}\n{dd}d', true) : echarts.time.format(t, '{HH}:{mm}', true)
      },
      breakArea: { expandOnClick: false, zigzagAmplitude: 0, zigzagZ: 200, itemStyle: { borderColor: 'none', opacity: 0 } }
    }],
    yAxis: { type: 'value', min: 'dataMin' },
    dataZoom: [
      { type: 'inside', minValueSpan: 3600*1000 },
      { type: 'slider', top: '85%', minValueSpan: 3600*1000, handleSize: 8, height: 12, bottom: 0 }
    ],
    series: [{
      type: 'line',
      symbolSize: 0,
      areaStyle: {},
      lineStyle: { color: colors[v] },
      itemStyle: { color: colors[v] },
      data: seriesData
    }]
  };

  chart.setOption(option);
  charts[v] = chart;
}

// ================= GENERAR DATOS EJEMPLO PARA BREAKS =================
function generateData() {
  const seriesData = [];
  const breaks = [];
  let time = new Date('2024-04-09T00:00:00Z');
  const endTime = new Date('2024-04-12T23:59:59Z').getTime();
  let todayCloseTime = new Date();
  updateDayTime(time, todayCloseTime);

  function updateDayTime(time, todayCloseTime) {
    time.setUTCHours(9, 30);
    todayCloseTime.setUTCHours(16, 0);
  }

  let val = 1000;
  while (time.getTime() <= endTime) {
    val += Math.random()*10-5;
    seriesData.push([time.getTime(), +val.toFixed(2)]);
    time.setMinutes(time.getMinutes()+1);
    if(time.getUTCHours()===16 && time.getUTCMinutes()===0){
      seriesData.push([time.getTime(), NaN]);
      const breakStart = time.getTime();
      time.setUTCDate(time.getUTCDate()+1);
      updateDayTime(time, todayCloseTime);
      const breakEnd = time.getTime();
      breaks.push({ start: breakStart, end: breakEnd, gap: '1%' });
    }
  }
  return { seriesData, breaks };
}

// ================= RENDER CHART =================
function renderChart(v){
  if(isTimelinePaused) return;

  const chart = charts[v];
  if(!chart) return;

  const dataArray = allData.concat(liveBuffer);
  if(!dataArray.length) return;

  dataArray.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));

  chart._allLabels = dataArray.map(d => new Date(d.fecha).toLocaleString());
  chart._allData = dataArray.map(d => d[v] ?? null);

  // Mostrar últimos 15 por defecto
  const total = chart._allLabels.length;
  const start = Math.max(0, total - 15);
  chart.setOption({
    xAxis: { min: chart._allLabels[start], max: chart._allLabels[total-1] },
    series: [{ data: chart._allData.slice(start) }]
  });
}

// ================= SLIDER =================
function createSlider(v){
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = 0;
  slider.max = 100;
  slider.value = 100;
  slider.style.width = '100%';
  slider.style.marginTop = '6px';

  slider.oninput = () => {
    isTimelinePaused = true;
    const chart = charts[v];
    if(!chart._allLabels) return;
    const total = chart._allLabels.length;
    const windowSize = Math.min(15, total);
    const endIndex = Math.floor((slider.value / 100)*(total-windowSize))+windowSize;
    const startIndex = Math.max(0, endIndex-windowSize);
    chart.setOption({ series: [{ data: chart._allData.slice(startIndex,endIndex) }] });
  };

  slider.onmouseup = () => { isTimelinePaused = false; };

  return slider;
}

// ================= SOCKET.IO =================
const socket = io();
socket.on("nuevoDato",(data)=>{
  const record = {...data, fecha: new Date(data.fecha)};
  liveBuffer.push(record);
  if(liveBuffer.length>30) liveBuffer.shift();
  lastMqttTimestamp = Date.now();
  variables.forEach(v=>renderChart(v));
});

socket.on("historico",(data)=>{
  allData = data.map(d => ({...d, fecha:new Date(d.fecha)}));
  variables.forEach(v=>renderChart(v));
});

// ================= INIT =================
function init(){
  variables.forEach(v=>{
    createChart(v);
    const chartContainer = document.getElementById(v);
    const slider = createSlider(v);
    chartContainer.parentElement.appendChild(slider);
  });

  fetch('/api/data/all').then(r=>r.json()).then(d=>{
    allData = d.map(d => ({...d, fecha:new Date(d.fecha)}));
    variables.forEach(v=>renderChart(v));
  });

  setInterval(()=>{
    fetch('/api/data/latest').then(r=>r.json()).then(latest=>{
      allData = latest.map(d => ({...d, fecha:new Date(d.fecha)}));
      variables.forEach(v=>renderChart(v));
    });
  },30000);
}

init();
