export function generateHistoryBar(history, period = '60d', locale = 'en-US') {
  let units, groupBy;
  if (period === '24h') {
    units = 24;
    groupBy = 'hour';
  } else if (period === '72h') {
    units = 72;
    groupBy = 'hour';
  } else if (period === '30d') {
    units = 30;
    groupBy = 'day';
  } else {
    units = 60;
    groupBy = 'day';
  }
  
  const now = new Date();
  const historyMap = new Map();
  
  history.forEach(entry => {
    let key;
    const entryDate = new Date(entry.timestamp);
    if (groupBy === 'hour') {
      const dateStr = entryDate.toISOString().split('.')[0].substring(0, 13);
      key = dateStr;
    } else {
      key = entryDate.toISOString().split('T')[0];
    }
    if (!historyMap.has(key)) historyMap.set(key, []);
    historyMap.get(key).push(entry);
  });
  
  const bars = [];
  for (let i = units - 1; i >= 0; i--) {
    let key, title;
    if (groupBy === 'hour') {
      const date = new Date(now);
      date.setHours(date.getHours() - i);
      key = date.toISOString().split('.')[0].substring(0, 13);
      const displayTime = date.toLocaleString(locale, { hour: '2-digit', hour12: false }) + ':00';
      title = displayTime;
    } else {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      key = date.toISOString().split('T')[0];
      title = key;
    }
    
    const periodData = historyMap.get(key);
    
    let status = '';
    if (periodData) {
      const maintenanceCount = periodData.filter(d => d.status === 'maintenance').length;
      if (maintenanceCount === periodData.length) {
        status = 'maintenance';
        title = `${title}: Maintenance (${periodData.length} checks)`;
      } else {
        const activeChecks = periodData.filter(d => d.status !== 'maintenance');
        if (activeChecks.length > 0) {
          const upCount = activeChecks.filter(d => d.status === 'up').length;
          const uptime = (upCount / activeChecks.length * 100).toFixed(0);
          status = uptime >= 95 ? 'up' : 'down';
          title = `${title}: ${uptime}% uptime (${activeChecks.length} checks)`;
        }
      }
    }
    
    bars.push(`<div class="history-day ${status}" title="${title}"></div>`);
  }
  
  return `<div class="history" data-period="${period}">${bars.join('')}</div>`;
}

export function generateBadge(label, message, status) {
  let color, darkColor;
  if (status === 'up') {
    color = '#0a0';
    darkColor = '#0f0';
  } else if (status === 'maintenance') {
    color = '#fa0';
    darkColor = '#fc6';
  } else {
    color = '#d00';
    darkColor = '#f44';
  }
  const labelWidth = label.length * 6 + 10;
  const messageWidth = message.length * 6 + 10;
  const totalWidth = labelWidth + messageWidth;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${message}">
  <title>${label}: ${message}</title>
  <style>
    text { font: 11px monospace; fill: #fff; }
    @media (prefers-color-scheme: dark) {
      rect.status { fill: ${darkColor}; }
    }
  </style>
  <rect width="${labelWidth}" height="20" fill="#555"/>
  <rect class="status" x="${labelWidth}" width="${messageWidth}" height="20" fill="${color}"/>
  <text x="${labelWidth / 2}" y="14" text-anchor="middle">${label}</text>
  <text x="${labelWidth + messageWidth / 2}" y="14" text-anchor="middle">${message}</text>
</svg>`;
}

export function generateSparkline(history, width = 900, height = 200) {
  if (!history || history.length < 2) return '';
  const data = history.filter(h => h.status === 'up').slice(-50).map(h => h.responseTime);
  if (data.length < 2) return '';
  
  const max = Math.max(...data);
  const maxRounded = Math.ceil(max / 100) * 100;
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const step = chartWidth / (data.length - 1);
  
  const points = data.map((val, i) => {
    const x = paddingLeft + i * step;
    const y = paddingTop + chartHeight - (val / maxRounded) * chartHeight;
    return { x, y, val };
  });
  
  let pathData = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    
    pathData += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  
  const circles = points.map(p => 
    `<circle cx="${p.x}" cy="${p.y}" r="3" fill="currentColor" opacity="0.7"><title>${p.val}ms</title></circle>`
  ).join('');
  
  const yTicks = [];
  for (let i = 0; i <= maxRounded; i += 100) {
    const y = paddingTop + chartHeight - (i / maxRounded) * chartHeight;
    yTicks.push(`<line x1="${paddingLeft - 5}" y1="${y}" x2="${paddingLeft}" y2="${y}" stroke="currentColor" opacity="0.3" stroke-width="1"/>`);
    yTicks.push(`<line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="currentColor" opacity="0.1" stroke-width="1" stroke-dasharray="2,2"/>`);
    yTicks.push(`<text x="${paddingLeft - 8}" y="${y + 3}" font-size="10" fill="currentColor" opacity="0.6" text-anchor="end">${i}</text>`);
  }
  
  const axisY = `<line x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${height - paddingBottom}" stroke="currentColor" opacity="0.3" stroke-width="1"/>`;
  const axisX = `<line x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingRight}" y2="${height - paddingBottom}" stroke="currentColor" opacity="0.3" stroke-width="1"/>`;
  
  return `<svg width="${width}" height="${height}" style="width: 100%; height: auto;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  ${yTicks.join('')}
  ${axisX}
  ${axisY}
  <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="${pathData}"/>
  ${circles}
</svg>`;
}
