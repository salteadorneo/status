import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
const RETRY_DELAY = 1000;

const GITHUB_ICON = `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;

/** @type {Config} */
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
const lang = JSON.parse(fs.readFileSync(path.join(__dirname, `lang/${config.language || 'en'}.json`), 'utf-8'));
const locale = config.language === 'es' ? 'es-ES' : 'en-US';

const timeAgo = date => {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  const ago = lang.ago.seconds;
  if (s < 60) return `${ago} ${s}${lang.timeUnits.s}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${ago} ${m}${lang.timeUnits.m}`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${ago} ${h}${lang.timeUnits.h}` : `${ago} ${Math.floor(h / 24)}${lang.timeUnits.d}`;
};

const formatDate = date => new Date(date).toLocaleString(locale, {
  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
});

const generateHistoryBar = (history) => {
  const days = 90;
  const now = new Date();
  const historyMap = new Map();
  
  history.forEach(entry => {
    const date = new Date(entry.timestamp).toISOString().split('T')[0];
    if (!historyMap.has(date)) historyMap.set(date, []);
    historyMap.get(date).push(entry);
  });
  
  const bars = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayData = historyMap.get(dateStr);
    
    let status = '';
    let title = dateStr;
    if (dayData) {
      const upCount = dayData.filter(d => d.status === 'up').length;
      const uptime = (upCount / dayData.length * 100).toFixed(0);
      status = uptime >= 95 ? 'up' : 'down';
      title = `${dateStr}: ${uptime}% uptime (${dayData.length} checks)`;
    }
    
    bars.push(`<div class="history-day ${status}" title="${title}"></div>`);
  }
  
  return `<div class="history">${bars.join('')}</div>`;
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
  const min = Math.min(...data);
  const range = max - min || 1;
  const padding = 5;
  const step = (width - padding * 2) / (data.length - 1);
  
  const points = data.map((val, i) => {
    const x = padding + i * step;
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  
  return `<svg width="${width}" height="${height}" style="width: 100%; height: auto;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${points}"/>
  <text x="5" y="${height - 5}" font-size="10" fill="currentColor" opacity="0.6">${min}ms</text>
  <text x="5" y="12" font-size="10" fill="currentColor" opacity="0.6">${max}ms</text>
</svg>`;
}

const html = (title, body, cssPath = 'global.css') => `<!DOCTYPE html>
<html lang="${config.language || 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="${cssPath}">
</head>
<body>${body}<footer><a href="https://github.com/salteadorneo/status" target="_blank" rel="noopener">${GITHUB_ICON}salteadorneo/status</a>&nbsp;v${pkg.version}</footer></body>
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
      method: service.method,
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
  const servicesRows = results.map(s => {
    const allHistory = getServiceHistory(s.id);
    const uptimeCount = allHistory.filter(h => h.status === 'up').length;
    const uptime = allHistory.length > 0 ? (uptimeCount / allHistory.length * 100).toFixed(1) : 100;
    const trend = calculateTrend(allHistory, s.responseTime);
    return `<tr><td><a href="service/${s.id}.html">${s.name}</a></td><td class="${s.status}">${s.status === 'up' ? `✓ ${lang.up}` : `✗ ${lang.down}`}</td><td><strong>${uptime}%</strong></td><td>${s.responseTime}ms <span title="Response time trend">${trend}</span></td><td>${formatDate(s.timestamp)}</td></tr>`;
  }).join('');
  const up = results.filter(s => s.status === 'up').length;
  const indexHTML = html(lang.statusMonitor, `
    <h1>${lang.statusMonitor}</h1>
    <p>${lang.lastUpdate}: ${formatDate(now.toISOString())}</p>
    <h2>${lang.summary}</h2>
    <p><strong>${up}/${results.length}</strong> ${lang.operationalServices}</p>
    <h2>${lang.services}</h2>
    <table><thead><tr><th>${lang.service}</th><th>${lang.status}</th><th>${lang.uptime}</th><th>${lang.time}</th><th>${lang.lastCheck}</th></tr></thead><tbody>${servicesRows}</tbody></table>
  `);
  
  fs.writeFileSync(path.join(__dirname, 'index.html'), indexHTML);
  console.log('Generated index.html');
  
  // Service pages
  const serviceHtmlDir = path.join(__dirname, 'service');
  if (!fs.existsSync(serviceHtmlDir)) fs.mkdirSync(serviceHtmlDir, { recursive: true });
  
  config.services.forEach(service => {
    const historyDir = path.join(__dirname, 'api', service.id, 'history');
    const historyFiles = fs.existsSync(historyDir) ? fs.readdirSync(historyDir).filter(f => f.endsWith('.json')).sort().reverse() : [];
    const allHistory = getServiceHistory(service.id);
    
    const uptimeCount = allHistory.filter(s => s.status === 'up').length;
    const uptime = allHistory.length > 0 ? (uptimeCount / allHistory.length * 100).toFixed(2) : 100;
    const avgTime = allHistory.length > 0 ? (allHistory.reduce((sum, s) => sum + s.responseTime, 0) / allHistory.length).toFixed(0) : 0;
    const incidentsCount = allHistory.filter(s => s.status === 'down').length;
    const lastIncident = allHistory.find(s => s.status === 'down');
    const lastIncidentText = lastIncident ? `Last incident: ${timeAgo(lastIncident.timestamp)}` : 'No incidents recorded';
    const current = results.find(s => s.id === service.id);
    const trend = current ? calculateTrend(allHistory, current.responseTime) : '→';
    const historyBar = generateHistoryBar(allHistory);
    const sparkline = generateSparkline(allHistory);
    
    const checksRows = allHistory.slice(-100).reverse().map(c => {
      const errorText = c.statusCode ? `HTTP ${c.statusCode}${c.error ? ': ' + c.error : ''}` : (c.error || '-');
      return `<tr><td>${formatDate(c.timestamp)}</td><td class="${c.status}">${c.status === 'up' ? `✓ ${lang.up}` : `✗ ${lang.down}`}</td><td>${c.responseTime}ms</td><td>${errorText}</td></tr>`;
    }).join('');
    const historyLinksHTML = historyFiles.map(f => `<li><a href="../api/${service.id}/history/${f}">${f.replace('.json', '')}</a></li>`).join('');
    
    const serviceHTML = html(`${service.name} - ${lang.status}`, `
      <p><a href="../index.html">${lang.backToDashboard}</a></p>
      <h1>${service.name}</h1>
      <p><a href="${service.url}" target="_blank">${service.url}</a></p>
      ${current ? `<p><strong>${lang.currentState}:</strong> <span class="${current.status}">${current.status === 'up' ? `✓ ${lang.up}` : `✗ ${lang.down}`}</span></p><p><strong>${lang.responseTime}:</strong> ${current.responseTime}ms <span title="Response time trend: ${trend === '↓' ? 'faster' : trend === '↑' ? 'slower' : 'stable'}">${trend}</span></p>${sparkline ? `<p>Response time graph (last 50 checks):</p>${sparkline}` : ''}<p><strong>${lang.lastVerification}:</strong> ${formatDate(current.timestamp)}</p><p><strong>${lastIncidentText}</strong></p>` : ''}
      <h2>Last days</h2>
      ${historyBar}
      <h2>${lang.statsThisMonth}</h2>
      <table><tr><th>${lang.uptime}</th><td>${uptime}% (${uptimeCount}/${allHistory.length} ${lang.checks})</td></tr><tr><th>${lang.avgResponseTime}</th><td>${avgTime}ms</td></tr><tr><th>${lang.incidents}</th><td>${incidentsCount}</td></tr></table>
      <details>
        <summary><h2 style="display: inline-block; cursor: pointer;">${lang.latestChecks} (${allHistory.length > 100 ? 'last 100' : allHistory.length})</h2></summary>
        <table><thead><tr><th>${lang.date}</th><th>${lang.status}</th><th>${lang.time}</th><th>${lang.error}</th></tr></thead><tbody>${checksRows}</tbody></table>
      </details>
      <h2>${lang.jsonData}</h2>
      <ul><li><a href="../api/${service.id}/status.json">${lang.currentStatus}</a></li></ul>
      ${historyLinksHTML ? `<p><strong>${lang.fullHistory}:</strong></p><ul>${historyLinksHTML}</ul>` : ''}
      <h2>Badge</h2>
      <p>Use this badge to embed the status in other pages:</p>
      <pre style="overflow-x: auto;">![${service.name}](https://salteadorneo.github.io/status/badge/${service.id}.svg)</pre>
      <p><img src="../badge/${service.id}.svg" alt="${service.name} status"></p>
    `, '../global.css');
    
    fs.writeFileSync(path.join(serviceHtmlDir, `${service.id}.html`), serviceHTML);
    console.log(`Generated service/${service.id}.html`);
  });
  
  console.log('\n=== Status Summary ===');
  results.forEach(r => console.log(`${r.status === 'up' ? '✓' : '✗'} ${r.name}: ${r.status} (${r.responseTime}ms)`));
  console.log('\n✅ HTML files generated successfully!');
}

checkAllServices().catch(console.error);
