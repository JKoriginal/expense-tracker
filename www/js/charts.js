/**
 * Charts Module - Renders interactive charts using Chart.js
 */
const Charts = (() => {
  let categoryChart = null;
  let trendChart = null;
  let monthlyChart = null;

  function destroyAll() {
    if (categoryChart) { categoryChart.destroy(); categoryChart = null; }
    if (trendChart) { trendChart.destroy(); trendChart = null; }
    if (monthlyChart) { monthlyChart.destroy(); monthlyChart = null; }
  }

  function renderCategoryChart(canvasId, categoryBreakdown) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (categoryChart) categoryChart.destroy();

    const labels = Object.keys(categoryBreakdown);
    const data = Object.values(categoryBreakdown);
    const cats = Categorizer.getAllCategoriesInfo();
    const colors = labels.map(l => cats[l] ? cats[l].color : '#64748b');

    categoryChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: 'rgba(10, 14, 39, 0.8)',
          borderWidth: 3,
          hoverBorderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#94a3b8',
              font: { family: 'Inter', size: 11 },
              padding: 12,
              usePointStyle: true,
              pointStyleWidth: 8
            }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#e2e8f0',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(225, 29, 72, 0.3)',
            borderWidth: 1,
            padding: 12,
            titleFont: { family: 'Inter', weight: '600' },
            bodyFont: { family: 'Inter' },
            callbacks: {
              label: ctx => ` Rs. ${ctx.parsed.toLocaleString('en-US', {minimumFractionDigits: 2})}`
            }
          }
        },
        animation: { animateRotate: true, duration: 800 }
      }
    });
  }

  function renderTrendChart(canvasId, dailySpending) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (trendChart) trendChart.destroy();

    const labels = Object.keys(dailySpending).map(d => {
      const dt = new Date(d);
      return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    });
    const data = Object.values(dailySpending);
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 250);
    gradient.addColorStop(0, 'rgba(225, 29, 72, 0.3)');
    gradient.addColorStop(1, 'rgba(225, 29, 72, 0.01)');

    trendChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Daily Spending',
          data,
          borderColor: '#e11d48',
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#e11d48',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { color: 'rgba(148, 163, 184, 0.06)' },
            ticks: { color: '#64748b', font: { family: 'Inter', size: 10 }, maxTicksLimit: 8 }
          },
          y: {
            grid: { color: 'rgba(148, 163, 184, 0.06)' },
            ticks: {
              color: '#64748b', font: { family: 'Inter', size: 10 },
              callback: v => v >= 1000 ? (v/1000).toFixed(0) + 'K' : v
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#e2e8f0', bodyColor: '#94a3b8',
            borderColor: 'rgba(225, 29, 72, 0.3)', borderWidth: 1,
            padding: 12,
            titleFont: { family: 'Inter', weight: '600' },
            bodyFont: { family: 'Inter' },
            callbacks: {
              label: ctx => ` Rs. ${ctx.parsed.y.toLocaleString('en-US', {minimumFractionDigits: 2})}`
            }
          }
        },
        animation: { duration: 1000 }
      }
    });
  }

  function renderMonthlyChart(canvasId, monthlyData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (monthlyChart) monthlyChart.destroy();

    const sortedKeys = Object.keys(monthlyData).sort();
    const last6 = sortedKeys.slice(-6);
    const labels = last6.map(k => {
      const [y, m] = k.split('-');
      return new Date(y, m-1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    });

    monthlyChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Expenses',
            data: last6.map(k => monthlyData[k].debit),
            backgroundColor: 'rgba(255, 107, 107, 0.7)',
            borderColor: '#ff6b6b',
            borderWidth: 1,
            borderRadius: 6
          },
          {
            label: 'Income',
            data: last6.map(k => monthlyData[k].credit),
            backgroundColor: 'rgba(81, 207, 102, 0.7)',
            borderColor: '#51cf66',
            borderWidth: 1,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', font: { family: 'Inter', size: 10 } }
          },
          y: {
            grid: { color: 'rgba(148, 163, 184, 0.06)' },
            ticks: {
              color: '#64748b', font: { family: 'Inter', size: 10 },
              callback: v => v >= 1000 ? (v/1000).toFixed(0) + 'K' : v
            }
          }
        },
        plugins: {
          legend: {
            labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, usePointStyle: true, pointStyleWidth: 8, padding: 16 }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#e2e8f0', bodyColor: '#94a3b8',
            borderColor: 'rgba(225, 29, 72, 0.3)', borderWidth: 1,
            padding: 12,
            callbacks: {
              label: ctx => ` Rs. ${ctx.parsed.y.toLocaleString('en-US', {minimumFractionDigits: 2})}`
            }
          }
        },
        animation: { duration: 800 }
      }
    });
  }

  return { renderCategoryChart, renderTrendChart, renderMonthlyChart, destroyAll };
})();
