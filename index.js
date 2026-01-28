import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseYAML } from './yaml-parser.js';

/**
 * @typedef {Object} Service
 * @property {string} id - Unique service identifier
 * @property {string} name - Display name
 * @property {string} url - URL to check
 * @property {string} method - HTTP method (GET, POST, etc.)
 * @property {number} expectedStatus - Expected HTTP status code
 * @property {number} timeout - Request timeout in milliseconds
 */

/**
 * @typedef {Object} CheckResult
 * @property {string} id - Service identifier
 * @property {string} name - Service name
 * @property {string} url - Service URL
 * @property {'up'|'down'} status - Service status
 * @property {number|null} statusCode - HTTP status code
 * @property {number} responseTime - Response time in milliseconds
 * @property {string} timestamp - ISO timestamp
 * @property {string|null} error - Error message if down
 */

/**
 * @typedef {Object} StatusData
 * @property {string} lastCheck - ISO timestamp of last check
 * @property {'up'|'down'} status - Current status
 * @property {number|null} statusCode - HTTP status code
 * @property {number} responseTime - Response time in milliseconds
 * @property {string} timestamp - ISO timestamp
 * @property {string|null} error - Error message if any
 */

/**
 * @typedef {Object} HistoryEntry
 * @property {string} timestamp - ISO timestamp
 * @property {'up'|'down'} status - Status at this time
 * @property {number|null} statusCode - HTTP status code
 * @property {number} responseTime - Response time in milliseconds
 * @property {string|null} error - Error message if any
 */

/**
 * @typedef {Object} Config
 * @property {string} language - UI language code (en, es)
 * @property {Service[]} services - List of services to monitor
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RETRIES = 3;
const RETRY_DELAY = 2000;

/** @type {Config} */
let config;
const yamlPath = path.join(__dirname, 'config.yml');
const jsonPath = path.join(__dirname, 'config.json');

if (fs.existsSync(yamlPath)) {
  const yamlContent = fs.readFileSync(yamlPath, 'utf-8');
  const parsed = parseYAML(yamlContent);
  config = {
    language: parsed.language || 'en',
    services: (parsed.checks || parsed.services || []).map((check, index) => ({
      id: check.id || check.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: check.name,
      url: check.url,
      method: check.method || 'GET',
      expectedStatus: check.expectedStatus || check.expected || 200,
      timeout: check.timeout || 10000
    }))
  };
} else {
  config = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
}

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
const lang = JSON.parse(fs.readFileSync(path.join(__dirname, `lang/${config.language || 'en'}.json`), 'utf-8'));
const locale = config.language === 'es' ? 'es-ES' : 'en-US';

const formatDate = date => new Date(date).toLocaleString(locale, {
  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
});

const generateHistoryBar = (history, period = '60d') => {
  let units, groupBy;
  if (period === '24h') {
    units = 24;
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
      const dateStr = entryDate.toISOString().split('.')[0].substring(0, 13); // YYYY-MM-DDTHH
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
      const displayTime = date.toLocaleString(locale, { hour: '2-digit', minute: '2-digit' });
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
      const upCount = periodData.filter(d => d.status === 'up').length;
      const uptime = (upCount / periodData.length * 100).toFixed(0);
      status = uptime >= 95 ? 'up' : 'down';
      title = `${title}: ${uptime}% uptime (${periodData.length} checks)`;
    }
    
    bars.push(`<div class="history-day ${status}" title="${title}"></div>`);
  }
  
  return `<div class="history" data-period="${period}">${bars.join('')}</div>`;
};

function generateBadge(label, message, status) {
  const color = status === 'up' ? '#0a0' : '#d00';
  const darkColor = status === 'up' ? '#0f0' : '#f44';
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

function calculateTrend(history, currentTime) {
  if (!history || history.length < 5) return '→';
  const recentChecks = history.filter(h => h.status === 'up').slice(-10);
  if (recentChecks.length < 5) return '→';
  const avgRecent = recentChecks.reduce((sum, h) => sum + h.responseTime, 0) / recentChecks.length;
  const diff = currentTime - avgRecent;
  const threshold = avgRecent * 0.15;
  if (diff > threshold) return '↑';
  if (diff < -threshold) return '↓';
  return '→';
}

function generateSparkline(history, width = 900, height = 200) {
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

const html = (title, body, cssPath = 'global.css', includeScript = false) => `<!DOCTYPE html>
<html lang="${config.language || 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="${cssPath}" />
</head>
<body>
${body}
<footer>
  <a href="https://github.com/salteadorneo/status" target="_blank" rel="noopener">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
    salteadorneo/status
  </a>
  <span>v${pkg.version}</span>
</footer>
${includeScript ? `<script>
document.addEventListener('DOMContentLoaded', () => {
  const filterBtns = document.querySelectorAll('.filter-btn');
  const historyContainers = document.querySelectorAll('.history-container > div');
  
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const period = btn.dataset.period;
      
      filterBtns.forEach(b => {
        const isActive = b.dataset.period === period;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-pressed', isActive);
      });
      
      historyContainers.forEach((container, index) => {
        const shouldShow = (period === '60d' && index === 0) || 
                          (period === '30d' && index === 1) || 
                          (period === '24h' && index === 2);
        container.style.display = shouldShow ? 'block' : 'none';
      });
    });
  });
});
</script>` : ''}
</body>
</html>`;

const getServiceHistory = (serviceId) => {
  const historyDir = path.join(__dirname, 'api', serviceId, 'history');
  if (!fs.existsSync(historyDir)) return [];
  const files = fs.readdirSync(historyDir).filter(f => f.endsWith('.json')).sort().reverse();
  return files.flatMap(f => JSON.parse(fs.readFileSync(path.join(historyDir, f), 'utf-8')));
};

async function checkUrl(service, attempt = 1) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), service.timeout);
    const response = await fetch(service.url, {
      method: service.method || 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'Status-Monitor/1.0' }
    });
    clearTimeout(timeout);
    
    return {
      id: service.id,
      name: service.name,
      url: service.url,
      status: response.status === service.expectedStatus ? 'up' : 'down',
      statusCode: response.status,
      responseTime: Date.now() - start,
      timestamp: new Date().toISOString(),
      error: null
    };
  } catch (error) {
    if (attempt < RETRIES) {
      console.log(`Retry ${attempt}/${RETRIES} for ${service.name} after ${RETRY_DELAY}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return checkUrl(service, attempt + 1);
    }
    return {
      id: service.id,
      name: service.name,
      url: service.url,
      status: 'down',
      statusCode: null,
      responseTime: Date.now() - start,
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}

async function checkAllServices() {
  console.log('Starting status checks...');
  
  const results = await Promise.all(config.services.map(checkUrl));
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  results.forEach(result => {
    const serviceDir = path.join(__dirname, 'api', result.id);
    if (!fs.existsSync(serviceDir)) fs.mkdirSync(serviceDir, { recursive: true });
    
    const statusData = { 
      lastCheck: now.toISOString(), 
      status: result.status, 
      statusCode: result.statusCode, 
      responseTime: result.responseTime, 
      timestamp: result.timestamp, 
      error: result.error
    };
    
    fs.writeFileSync(path.join(serviceDir, 'status.json'), JSON.stringify(statusData, null, 2));
    
    const historyDir = path.join(serviceDir, 'history');
    if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });
    const historyPath = path.join(historyDir, `${yearMonth}.json`);
    let history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, 'utf-8')) : [];
    history.push({ timestamp: now.toISOString(), status: result.status, statusCode: result.statusCode, responseTime: result.responseTime, error: result.error });
    if (history.length > 4320) history = history.slice(-4320);
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  });
  console.log('Status and history saved per service');
  
  const badgeDir = path.join(__dirname, 'badge');
  if (!fs.existsSync(badgeDir)) fs.mkdirSync(badgeDir, { recursive: true });
  results.forEach(result => {
    const badge = generateBadge(result.name, result.status, result.status);
    fs.writeFileSync(path.join(badgeDir, `${result.id}.svg`), badge);
  });
  console.log('Badges generated');
  
  console.log('\nGenerating HTML files...');
  
  const up = results.filter(s => s.status === 'up').length;
  const down = results.filter(s => s.status === 'down').length;
  const avgResponseTime = results.length > 0 ? Math.round(results.reduce((sum, s) => sum + s.responseTime, 0) / results.length) : 0;
  const totalServices = results.length;
  
  const serviceCards = results.map(s => {
    const allHistory = getServiceHistory(s.id);
    const uptimeCount = allHistory.filter(h => h.status === 'up').length;
    const uptime = allHistory.length > 0 ? (uptimeCount / allHistory.length * 100).toFixed(1) : 100;
    const trend = calculateTrend(allHistory, s.responseTime);
    const historyBar = generateHistoryBar(allHistory);
    
    return `
    <a href="service/${s.id}.html" class="service-card">
      <div class="service-header-row">
        <div class="service-name-status">
          <h3 style="view-transition-name:${s.id}">
            ${s.name} <span class="${s.status}">●</span>
          </h3>
        </div>
        <div class="service-metrics-inline">
          <span class="metric-item">${s.responseTime}ms ${trend}</span>
          <span class="metric-item">${uptime}%</span>
        </div>
      </div>
      <div class="service-history" style="view-transition-name:${s.id}-history">
        ${historyBar}
        <div class="history-labels">
          <span>60 ${lang.daysAgo}</span>
          <span>${lang.today}</span>
        </div>
      </div>
    </a>`;
  }).join('');
  
  const indexHTML = html(lang.statusMonitor, `
    <h1>${lang.statusMonitor}</h1>
    <p class="last-update">${lang.lastUpdate}: ${formatDate(now.toISOString())}</p>
    
    <h2>${lang.summary}</h2>
    <div class="stats-grid">
      <div class="stat-card operational">
        <div class="label">${lang.operationalServices}</div>
        <div class="value">${up}/${totalServices}</div>
        <div class="description">${((up/totalServices)*100).toFixed(0)}%</div>
      </div>
      
      <div class="stat-card issues">
        <div class="label">${lang.issues}</div>
        <div class="value">${down}</div>
        <div class="description">${down === 0 ? lang.none : lang.down}</div>
      </div>
      
      <div class="stat-card">
        <div class="label">${lang.avgResponseTime}</div>
        <div class="value">${avgResponseTime}ms</div>
        <div class="description">${lang.average}</div>
      </div>
    </div>
    
    <h2>${lang.services}</h2>
    <div class="services-grid">
      ${serviceCards}
    </div>
  `);
  
  fs.writeFileSync(path.join(__dirname, 'index.html'), indexHTML);
  console.log('Generated index.html');
  
  const serviceHtmlDir = path.join(__dirname, 'service');
  if (!fs.existsSync(serviceHtmlDir)) fs.mkdirSync(serviceHtmlDir, { recursive: true });
  
  config.services.forEach(service => {
    const allHistory = getServiceHistory(service.id);
    
    const uptimeCount = allHistory.filter(s => s.status === 'up').length;
    const uptime = allHistory.length > 0 ? (uptimeCount / allHistory.length * 100).toFixed(2) : 100;
    const avgTime = allHistory.length > 0 ? (allHistory.reduce((sum, s) => sum + s.responseTime, 0) / allHistory.length).toFixed(0) : 0;
    const incidentsCount = allHistory.filter(s => s.status === 'down').length;
    const lastIncident = allHistory.find(s => s.status === 'down');
    const lastIncidentText = lastIncident ? `${lang.lastIncident}: ${formatDate(lastIncident.timestamp)}` : lang.noIncidents;
    const current = results.find(s => s.id === service.id);
    const trend = current ? calculateTrend(allHistory, current.responseTime) : '→';
    const historyBar60d = generateHistoryBar(allHistory, '60d');
    const historyBar30d = generateHistoryBar(allHistory, '30d');
    const historyBar24h = generateHistoryBar(allHistory, '24h');
    const sparkline = generateSparkline(allHistory);
    
    const checksRows = allHistory.slice(-100).reverse().map(c => {
      const errorText = c.statusCode ? `HTTP ${c.statusCode}${c.error ? ': ' + c.error : ''}` : (c.error || '-');
      return `<tr><td>${formatDate(c.timestamp)}</td><td class="${c.status}">●</td><td>${c.responseTime}ms</td><td>${errorText}</td></tr>`;
    }).join('');
    
    const serviceHTML = html(`${service.name} - ${lang.status}`, `
      <h1>${lang.statusMonitor}</h1>
      <p class="last-update">${lang.lastUpdate}: ${formatDate(now.toISOString())}</p>
      
      <p><a href="../index.html">← ${lang.backToDashboard}</a></p>
      
      <div class="service-header">
        <h2 style="view-transition-name:${service.id}">
          ${service.name} <span class="${current.status}">●</span>
        </h2>
        <p><a href="${service.url}" target="_blank">${service.url}</a></p>
      </div>
      
      ${current ? `
      <div class="service-stats">
        <div class="service-stat">
          <div class="label">${lang.responseTime}</div>
          <div class="value">${current.responseTime}ms ${trend}</div>
        </div>
        
        <div class="service-stat">
          <div class="label">${lang.uptime}</div>
          <div class="value">${uptime}%</div>
        </div>
        
        <div class="service-stat">
          <div class="label">${lang.avgResponseTime}</div>
          <div class="value">${avgTime}ms</div>
        </div>
        
        <div class="service-stat">
          <div class="label">${lang.incidents}</div>
          <div class="value">${incidentsCount}</div>
        </div>
        
        <div class="service-stat">
          <div class="label">${lang.lastVerification}</div>
          <div class="value" style="font-size: 0.75rem;">${formatDate(current.timestamp)}</div>
        </div>
      </div>
      
      <p style="opacity: 0.7; font-size: 0.9rem;">${lastIncidentText}</p>
      ` : ''}
      
      <div class="history-header">
        <h2>${lang.history}</h2>
        <div class="history-filters">
          <button class="filter-btn active" data-period="60d" aria-pressed="true">60d</button>
          <button class="filter-btn" data-period="30d" aria-pressed="false">30d</button>
          <button class="filter-btn" data-period="24h" aria-pressed="false">24h</button>
        </div>
      </div>
      <div class="history-container" style="view-transition-name:${service.id}-history">
        <div>${historyBar60d}</div>
        <div style="display: none;">${historyBar30d}</div>
        <div style="display: none;">${historyBar24h}</div>
      </div>
      
      ${sparkline ? `<h2>${lang.responseTime}</h2>${sparkline}` : ''}
      
      <details>
        <summary>${lang.latestChecks}</summary>
        <table><thead><tr><th>${lang.date}</th><th>${lang.status}</th><th>${lang.time}</th><th>${lang.error}</th></tr></thead><tbody>${checksRows}</tbody></table>
      </details>
      
      <details>
        <summary>${lang.api}</summary>
        <p><code>GET <a href="../api/${service.id}/status.json">/api/${service.id}/status.json</a></code></p>
        <p>${lang.returnsCurrentStatus}</p>
        
        <p><code>GET /api/${service.id}/history/YYYY-MM.json</code></p>
        <p>${lang.returnsMonthlyChecks}</p>
      </details>
      
      <details>
        <summary>${lang.badge}</summary>
        <p>${lang.useBadge}</p>
        <pre>![${service.name}](https://salteadorneo.github.io/status/badge/${service.id}.svg)</pre>
        <p><img src="../badge/${service.id}.svg" alt="${service.name} status"></p>
      </details>
    `, '../global.css', true);
    
    fs.writeFileSync(path.join(serviceHtmlDir, `${service.id}.html`), serviceHTML);
    console.log(`Generated service/${service.id}.html`);
  });
  
  console.log('\n=== Status Summary ===');
  results.forEach(r => console.log(`${r.status === 'up' ? '✓' : '✗'} ${r.name}: ${r.status} (${r.responseTime}ms)`));
  console.log('\n✅ HTML files generated successfully!');
}

checkAllServices().catch(console.error);
