// ---- CREAR GRÁFICOS ----
function createCharts() {
  variables.forEach(v => {
    const el = document.getElementById(v);
    if(!el) return;

    // contenedor con scroll horizontal permanente
    const wrapper = document.createElement("div");
    wrapper.style.overflowX = "auto";         // siempre scroll horizontal
    wrapper.style.width = "100%";
    wrapper.style.paddingBottom = "10px";
    wrapper.style.scrollBehavior = "smooth";
    wrapper.style.whiteSpace = "nowrap";      // importante para scroll continuo
    el.parentElement.insertBefore(wrapper, el);
    wrapper.appendChild(el);

    const ctx = el.getContext('2d');
    charts[v] = new Chart(ctx, {
      type:'line',
      data:{labels:[],datasets:[{
        label:v,
        data:[],
        borderColor:colorMap[v],
        backgroundColor:colorMap[v]+'33',
        fill:true,
        tension:0.25,
        pointRadius:5,
        pointHoverRadius:7
      }]},
      options:{
        responsive:true,
        maintainAspectRatio:false,
        interaction:{mode:'nearest',intersect:false},
        animation:{duration:600,easing:"easeOutQuart"},
        plugins:{
          legend:{labels:{color:'#fff'}},
          zoom:{
            pan:{enabled:true,mode:'x',modifierKey:'ctrl'},
            zoom:{
              drag:{enabled:true,backgroundColor:'rgba(0,229,255,0.25)',borderColor:'#00e5ff',borderWidth:1},
              mode:'x',
              onZoomComplete({chart}) {
                const wrapper = chart.canvas.parentElement;
                // mantiene scroll visible
                wrapper.scrollLeft = (wrapper.scrollWidth - wrapper.clientWidth)/2;
              }
            }
          }
        },
        scales:{
          x:{
            ticks:{
              color:'#ccc',
              callback:function(val,index){
                const total = this.chart.data.labels.length;
                const visibleCount = this.chart.scales.x.ticks.length;
                // mostrar fecha si <=15 puntos visibles
                if (visibleCount <= 15) return this.chart.data.labels[index];
                return '';
              }
            },
            grid:{color:'#1e3a4c'}
          },
          y:{ticks:{color:'#ccc'},grid:{color:'#1e3a4c'}}
        }
      }
    });

    charts[v].displayMode = 'live';

    // --- Botones ---
    const btnReset = document.querySelector(`button[data-reset="${v}"]`);
    if(btnReset) btnReset.onclick = ()=>charts[v].resetZoom();

    const btnLive = document.createElement('button');
    btnLive.textContent = 'Datos actuales';
    btnLive.className='btn';
    btnLive.style.marginLeft='6px';
    btnLive.disabled = true;
    btnLive.onclick = () => {
      charts[v].displayMode = 'live';
      btnLive.disabled = true;
      btnHist.disabled = false;
      charts[v].resetZoom();
      renderChart(v, true); // centramos al final
    };

    const btnHist = document.createElement('button');
    btnHist.textContent = 'Histórico';
    btnHist.className='btn';
    btnHist.style.marginLeft='6px';
    btnHist.disabled = false;
    btnHist.onclick = async () => {
      charts[v].displayMode = 'historical';
      btnHist.disabled = true;
      btnLive.disabled = false;
      charts[v].resetZoom();
      await loadAllFromMongo();
      renderChart(v);
      const wrapper = charts[v].chart.canvas.parentElement;
      wrapper.scrollLeft = 0; // inicio histórico
    };

    const actionsDiv = btnReset.parentElement;
    actionsDiv.appendChild(btnLive);
    actionsDiv.appendChild(btnHist);
  });
}

// ---- RENDER ----
function renderChart(v, autoScroll=false){
  const chart = charts[v];
  if(!chart) return;

  const dataArray = chart.displayMode==='live' ? liveBuffer : allData;
  if(!Array.isArray(dataArray)||!dataArray.length) return;

  const labels = dataArray.map(d => new Date(d.fecha).toLocaleString());
  const dataset = dataArray.map(d => d[v] ?? null);

  chart.data.labels = labels;
  chart.data.datasets[0].data = dataset;
  chart.update('active');

  if(autoScroll){
    const wrapper = chart.chart.canvas.parentElement;
    wrapper.scrollLeft = wrapper.scrollWidth; // siempre al final
  }
}
