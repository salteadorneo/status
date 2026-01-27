import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RETRIES = 3;
const RETRY_DELAY = 1000;

const CSS = `body{font-family:monospace;max-width:900px;margin:2rem auto;padding:0 1rem;background:#fff;color:#000;line-height:1.6}h1{font-size:1.5rem;margin-bottom:.5rem}h2{font-size:1.2rem;margin:1.5rem 0 .5rem}a{color:#00e;text-decoration:underline}.up{color:#0a0}.down{color:#d00}table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{text-align:left;padding:.5rem;border-bottom:1px solid #ddd}th{font-weight:bold}@media(prefers-color-scheme:dark){body{background:#1a1a1a;color:#e0e0e0}a{color:#6af}.up{color:#0f0}.down{color:#f44}th,td{border-bottom-color:#444}}`;

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/urls.json'), 'utf-8'));
const lang = JSON.parse(fs.readFileSync(path.join(__dirname, `../lang/${config.language || 'en'}.json`), 'utf-8'));
const locale = config.language === 'es' ? 'es-ES' : 'en-US';

const timeAgo = date => {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  const prefix = lang.ago.seconds;
  if (s < 60) return `${prefix} ${s}${lang.timeUnits.s}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${prefix} ${m}${lang.timeUnits.m}`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${prefix} ${h}${lang.timeUnits.h}` : `${prefix} ${Math.floor(h / 24)}${lang.timeUnits.d}`;
};

const formatDate = date => new Date(date).toLocaleString(locale, {
  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
});

const html = (title, body) => `<!DOCTYPE html>
<html lang="${config.language || 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>${CSS}</style>
</head>
<body>${body}</body>
</html>`;

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
  
  // Save status JSON
  const statusData = { lastCheck: now.toISOString(), services: results };
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'status.json'), JSON.stringify(statusData, null, 2));
  console.log('Status saved to status.json');
  
  // Save/update history JSON
  const historyDir = path.join(dataDir, 'history');
  if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });
  const historyPath = path.join(historyDir, `${yearMonth}.json`);
  let history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, 'utf-8')) : [];
  history.push({ timestamp: now.toISOString(), services: results });
  if (history.length > 4320) history = history.slice(-4320);
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  console.log(`History saved to ${yearMonth}.json`);
  
  // Generate HTML files
  console.log('\nGenerating HTML files...');
  
  // Index page
  const servicesRows = results.map(s => `<tr><td><a href="service/${s.id}.html">${s.name}</a></td><td class="${s.status}">${s.status === 'up' ? `✓ ${lang.up}` : `✗ ${lang.down}`}</td><td>${s.responseTime}ms</td><td>${timeAgo(s.timestamp)}</td></tr>`).join('');
  const up = results.filter(s => s.status === 'up').length;
  const indexHTML = html(lang.statusMonitor, `
    <h1>${lang.statusMonitor}</h1>
    <p>${lang.lastUpdate}: ${formatDate(statusData.lastCheck)}</p>
    <h2>${lang.summary}</h2>
    <p><strong>${up}/${results.length}</strong> ${lang.operationalServices}</p>
    <h2>${lang.services}</h2>
    <table><thead><tr><th>${lang.service}</th><th>${lang.status}</th><th>${lang.time}</th><th>${lang.lastCheck}</th></tr></thead><tbody>${servicesRows}</tbody></table>
    <h2>${lang.apiJsonData}</h2>
    <ul><li><a href="data/status.json">${lang.currentStatus}</a></li><li><a href="data/history/">${lang.monthlyHistory}</a></li></ul>
    <hr><p><small>${lang.updatedEvery}</small></p>
  `);
  
  fs.writeFileSync(path.join(__dirname, '../index.html'), indexHTML);
  console.log('Generated index.html');
  
  // Service pages
  const serviceDir = path.join(__dirname, '../service');
  if (!fs.existsSync(serviceDir)) fs.mkdirSync(serviceDir, { recursive: true });
  
  config.services.forEach(service => {
    const serviceHistory = history.map(h => h.services.find(s => s.id === service.id)).filter(Boolean);
    const uptimeCount = serviceHistory.filter(s => s.status === 'up').length;
    const uptime = serviceHistory.length > 0 ? (uptimeCount / serviceHistory.length * 100).toFixed(2) : 100;
    const avgTime = serviceHistory.length > 0 ? (serviceHistory.reduce((sum, s) => sum + s.responseTime, 0) / serviceHistory.length).toFixed(0) : 0;
    const incidents = serviceHistory.filter(s => s.status === 'down').slice(-10).reverse();
    const current = results.find(s => s.id === service.id);
    
    const checksRows = serviceHistory.slice(-20).reverse().map(c => `<tr><td>${formatDate(c.timestamp)}</td><td class="${c.status}">${c.status === 'up' ? `✓ ${lang.up}` : `✗ ${lang.down}`}</td><td>${c.responseTime}ms</td><td>${c.error || '-'}</td></tr>`).join('');
    const incidentsHTML = incidents.length > 0 ? `<h2>${lang.recentIncidents}</h2><ul>${incidents.map(i => `<li><strong>${formatDate(i.timestamp)}</strong> - ${i.error || 'Error ' + (i.statusCode || 'unknown')}</li>`).join('')}</ul>` : '';
    
    const serviceHTML = html(`${service.name} - ${lang.status}`, `
      <p><a href="../index.html">${lang.backToDashboard}</a></p>
      <h1>${service.name}</h1>
      <p><a href="${service.url}" target="_blank">${service.url}</a></p>
      ${current ? `<p><strong>${lang.currentState}:</strong> <span class="${current.status}">${current.status === 'up' ? `✓ ${lang.up}` : `✗ ${lang.down}`}</span></p><p><strong>${lang.responseTime}:</strong> ${current.responseTime}ms</p><p><strong>${lang.lastVerification}:</strong> ${formatDate(current.timestamp)}</p>` : ''}
      <h2>${lang.statsThisMonth}</h2>
      <table><tr><th>${lang.uptime}</th><td>${uptime}% (${uptimeCount}/${serviceHistory.length} ${lang.checks})</td></tr><tr><th>${lang.avgResponseTime}</th><td>${avgTime}ms</td></tr><tr><th>${lang.incidents}</th><td>${incidents.length}</td></tr></table>
      <h2>${lang.latestChecks}</h2>
      <table><thead><tr><th>${lang.date}</th><th>${lang.status}</th><th>${lang.time}</th><th>${lang.error}</th></tr></thead><tbody>${checksRows}</tbody></table>
      ${incidentsHTML}
      <h2>${lang.jsonData}</h2>
      <ul><li><a href="../data/status.json">${lang.currentStatus}</a></li><li><a href="../data/history/">${lang.fullHistory}</a></li></ul>
    `);
    
    fs.writeFileSync(path.join(serviceDir, `${service.id}.html`), serviceHTML);
    console.log(`Generated service/${service.id}.html`);
  });
  
  console.log('\n=== Status Summary ===');
  results.forEach(r => console.log(`${r.status === 'up' ? '✓' : '✗'} ${r.name}: ${r.status} (${r.responseTime}ms)`));
  console.log('\n✅ HTML files generated successfully!');
}

checkAllServices().catch(console.error);
