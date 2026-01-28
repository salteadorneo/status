import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseYAML } from './lib/yaml-parser.js';
import { generateHistoryBar, generateBadge, generateSparkline } from './lib/generators.js';
import { formatDate, calculateTrend, getServiceHistory } from './lib/utils.js';
import { checkUrl } from './lib/checker.js';
import { generateHTML } from './lib/html.js';

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

/**
 * Read .env file and parse IS_TEMPLATE variable
 * @returns {boolean} True if IS_TEMPLATE=true in .env
 */
function isTemplateMode() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return false;
  
  try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/^IS_TEMPLATE\s*=\s*(.+)$/m);
    if (!match) return false;
    
    const value = match[1].trim().toLowerCase();
    return value === 'true' || value === '1';
  } catch (error) {
    console.error('Error reading .env:', error);
    return false;
  }
}

const IS_TEMPLATE = isTemplateMode();

const dataDir = IS_TEMPLATE ? path.join(__dirname, 'demo') : __dirname;

/** @type {Config} */
let config;
const yamlPath = path.join(__dirname, 'config.yml');
const jsonPath = path.join(__dirname, 'config.json');

if (fs.existsSync(yamlPath)) {
  const yamlContent = fs.readFileSync(yamlPath, 'utf-8');
  const parsed = parseYAML(yamlContent);
  config = {
    language: parsed.language || 'en',
    report: parsed.report || null,
    services: (parsed.checks || parsed.services || []).map((check, index) => {
      const baseConfig = {
        id: check.id || check.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: check.name,
        type: check.type || 'http',
        timeout: check.timeout || 10000,
        maintenance: check.maintenance || null
      };
      
      if (check.type === 'tcp') {
        return {
          ...baseConfig,
          host: check.host,
          port: check.port
        };
      } else if (check.type === 'dns') {
        return {
          ...baseConfig,
          domain: check.domain
        };
      } else {
        return {
          ...baseConfig,
          url: check.url,
          method: check.method || 'GET',
          expectedStatus: check.expectedStatus || check.expected || 200
        };
      }
    })
  };
} else {
  config = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
}

const lang = JSON.parse(fs.readFileSync(path.join(__dirname, `lang/${config.language || 'en'}.json`), 'utf-8'));
const locale = config.language === 'es' ? 'es-ES' : 'en-US';

async function checkAllServices() {
  console.log('Starting status checks...');
  
  const results = await Promise.all(config.services.map(checkUrl));
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const baseDataDir = IS_TEMPLATE ? path.join(__dirname, 'demo') : __dirname;
  const apiDir = path.join(baseDataDir, 'api');
  const badgeDir = path.join(baseDataDir, 'badge');
  
  results.forEach(result => {
    const serviceDir = path.join(apiDir, result.id);
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
  
  if (!fs.existsSync(badgeDir)) fs.mkdirSync(badgeDir, { recursive: true });
  results.forEach(result => {
    const badge = generateBadge(result.name, result.status, result.status);
    fs.writeFileSync(path.join(badgeDir, `${result.id}.svg`), badge);
  });
  console.log('Badges generated');
  
  console.log('\nGenerating HTML files...');
  
  const up = results.filter(s => s.status === 'up').length;
  const down = results.filter(s => s.status === 'down').length;
  const maintenance = results.filter(s => s.status === 'maintenance').length;
  const avgResponseTime = results.length > 0 ? Math.round(results.reduce((sum, s) => sum + s.responseTime, 0) / results.length) : 0;
  const totalServices = results.length;
  
  let overallStatus = 'operational';
  let overallMessage = lang.allSystemsOperational;
  let overallIcon = '🟢';
  
  if (down > 0) {
    if (down === totalServices) {
      overallStatus = 'major';
      overallMessage = lang.majorOutage;
      overallIcon = '🔴';
    } else {
      overallStatus = 'partial';
      overallMessage = lang.partialOutage;
      overallIcon = '🟡';
    }
  }
  
  const serviceCards = results.map(s => {
    const allHistory = getServiceHistory(s.id, dataDir);
    const activeHistory = allHistory.filter(h => h.status !== 'maintenance');
    const uptimeCount = activeHistory.filter(h => h.status === 'up').length;
    const uptime = activeHistory.length > 0 ? (uptimeCount / activeHistory.length * 100).toFixed(1) : 100;
    const trend = calculateTrend(allHistory, s.responseTime);
    const historyBar = generateHistoryBar(allHistory, '72h', locale);
    
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
          <span>72 ${lang.hoursAgo}</span>
          <span>${lang.now}</span>
        </div>
      </div>
    </a>`;
  }).join('');
  
  const indexHTML = generateHTML(lang.title, `
    <h1 class="title">${lang.title}</h1>
    <p class="last-update">${lang.lastUpdate}: ${formatDate(now.toISOString())}</p>
    
    <div class="overall-status-banner ${overallStatus}">
      ${overallIcon} ${overallMessage}
    </div>
    
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
  `, IS_TEMPLATE ? '../src/global.css' : 'src/global.css', IS_TEMPLATE ? '../src/main.js' : 'src/main.js', config.language, '1.0.0', config.report, lang.report);
  
  const baseDir = IS_TEMPLATE ? path.join(__dirname, 'demo') : __dirname;
  if (IS_TEMPLATE && !fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  
  fs.writeFileSync(path.join(baseDir, 'index.html'), indexHTML);
  console.log(`Generated ${IS_TEMPLATE ? 'demo/' : ''}index.html`);
  
  const serviceHtmlDir = IS_TEMPLATE ? path.join(__dirname, 'demo', 'service') : path.join(__dirname, 'service');
  if (!fs.existsSync(serviceHtmlDir)) fs.mkdirSync(serviceHtmlDir, { recursive: true });
  
  const cssPath = IS_TEMPLATE ? '../../src/global.css' : '../src/global.css';
  const scriptPath = IS_TEMPLATE ? '../../src/main.js' : '../src/main.js';
  const apiPath = IS_TEMPLATE ? '../../api' : '../api';
  const badgePath = IS_TEMPLATE ? '../../badge' : '../badge';
  const apiAbsPath = IS_TEMPLATE ? '/demo/api' : '/api';
  const badgeAbsPath = IS_TEMPLATE ? '/demo/badge' : '/badge';
  
  config.services.forEach(service => {
    const allHistory = getServiceHistory(service.id, dataDir);
    const activeHistory = allHistory.filter(s => s.status !== 'maintenance');
    const uptimeCount = activeHistory.filter(s => s.status === 'up').length;
    const uptime = activeHistory.length > 0 ? (uptimeCount / activeHistory.length * 100).toFixed(2) : 100;
    const avgTime = activeHistory.length > 0 ? (activeHistory.reduce((sum, s) => sum + s.responseTime, 0) / activeHistory.length).toFixed(0) : 0;
    const incidentsCount = allHistory.filter(s => s.status === 'down').length;
    const lastIncident = allHistory.find(s => s.status === 'down');
    const lastIncidentText = lastIncident ? `${lang.lastIncident}: ${formatDate(lastIncident.timestamp, locale)}` : lang.noIncidents;
    const current = results.find(s => s.id === service.id);
    const trend = current ? calculateTrend(allHistory, current.responseTime) : '→';
    const historyBar24h = generateHistoryBar(allHistory, '24h', locale);
    const historyBar72h = generateHistoryBar(allHistory, '72h', locale);
    const historyBar30d = generateHistoryBar(allHistory, '30d', locale);
    const historyBar60d = generateHistoryBar(allHistory, '60d', locale);
    const sparkline = generateSparkline(allHistory);
    
    const checksRows = allHistory.slice(-10).reverse().map(c => {
      const errorText = c.statusCode ? `HTTP ${c.statusCode}${c.error ? ': ' + c.error : ''}` : (c.error || '-');
      return `<tr><td>${formatDate(c.timestamp, locale)}</td><td class="${c.status}">●</td><td>${c.responseTime}ms</td><td>${errorText}</td></tr>`;
    }).join('');
    
    const serviceHTML = generateHTML(`${service.name} - ${lang.status}`, `
      <h1 class="title">${lang.title}</h1>
      <p class="last-update">${lang.lastUpdate}: ${formatDate(now.toISOString(), locale)}</p>
      
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
          <div class="value" style="font-size: 0.75rem;">${formatDate(current.timestamp, locale)}</div>
        </div>
      </div>
      
      <p style="opacity: 0.7; font-size: 0.9rem;">${lastIncidentText}</p>
      ` : ''}
      
      <div class="history-header">
        <h2>${lang.history}</h2>
        <div class="history-filters">
          <button class="filter-btn" data-period="24h" aria-pressed="false">24h</button>
          <button class="filter-btn active" data-period="72h" aria-pressed="false">72h</button>
          <button class="filter-btn" data-period="30d" aria-pressed="false">30d</button>
          <button class="filter-btn" data-period="60d" aria-pressed="true">60d</button>
        </div>
      </div>
      <div class="history-container" style="view-transition-name:${service.id}-history">
      <div style="display: none;">${historyBar24h}</div>
      <div>${historyBar72h}</div>
      <div style="display: none;">${historyBar30d}</div>
      <div style="display: none;">${historyBar60d}</div>
      </div>
      
      ${sparkline ? `<h2>${lang.responseTime}</h2>${sparkline}` : ''}
      
      <details open>
        <summary>${lang.latestChecks}</summary>
        <table>
          <thead><tr><th>${lang.date}</th><th>${lang.status}</th><th>${lang.time}</th><th>${lang.error}</th></tr></thead>
          <tbody>${checksRows}</tbody>
        </table>
      </details>
      
      <details open>
        <summary>${lang.api}</summary>
        <p><pre>GET <a href="${apiPath}/${service.id}/status.json">${apiAbsPath}/${service.id}/status.json</a></pre></p>
        <p>${lang.returnsCurrentStatus}</p>
        
        <p><pre>GET ${apiAbsPath}/${service.id}/history/YYYY-MM.json</pre></p>
        <p>${lang.returnsMonthlyChecks}</p>
      </details>
      
      <details open>
        <summary>${lang.badge}</summary>
        <p>${lang.useBadge}</p>
        <pre>![${service.name}](https://YOUR_USERNAME.github.io/YOUR_REPO${badgeAbsPath}/${service.id}.svg)</pre>
        <p><img src="${badgePath}/${service.id}.svg" alt="${service.name} status"></p>
      </details>
    `, cssPath, scriptPath, config.language, '1.0.0', config.report, lang.report);
    
    fs.writeFileSync(path.join(serviceHtmlDir, `${service.id}.html`), serviceHTML);
    console.log(`Generated service/${service.id}.html`);
  });
  
  console.log('\n=== Status Summary ===');
  results.forEach(r => console.log(`${r.status === 'up' ? '✓' : '✗'} ${r.name}: ${r.status} (${r.responseTime}ms)`));
  console.log('\n✅ HTML files generated successfully!');
}

/**
 * Generate landing page for template mode
 */
function generateLandingPage() {
  console.log('\n📄 Generating landing page (template mode)...');
  
  const landingHTML = generateHTML('Status - Zero-dependency GitHub Pages uptime monitoring', `
    <div class="landing-hero">
      <h1 class="landing-title">📊 Status</h1>
      <p class="landing-subtitle">Zero-dependency uptime monitoring for GitHub Pages</p>
      <div class="landing-cta">
        <a href="demo/index.html" class="btn btn-primary">View Demo</a>
        <a href="https://github.com/salteadorneo/status" class="btn btn-secondary" target="_blank">Use Template</a>
      </div>
    </div>

    <div class="features">
      <h2>Features</h2>
      <div class="features-grid">
        <div class="feature-card">
          <h3>🚀 Zero Dependencies</h3>
          <p>Pure Node.js with ES modules. No external packages needed.</p>
        </div>
        <div class="feature-card">
          <h3>📊 Static Generation</h3>
          <p>Works perfectly with GitHub Pages. No servers required.</p>
        </div>
        <div class="feature-card">
          <h3>🔄 Automated Checks</h3>
          <p>GitHub Actions runs checks every 10 minutes automatically.</p>
        </div>
        <div class="feature-card">
          <h3>🔔 Issue Tracking</h3>
          <p>Automatic GitHub Issues creation for service outages.</p>
        </div>
        <div class="feature-card">
          <h3>🌐 JSON API</h3>
          <p>RESTful endpoints for each service status and history.</p>
        </div>
        <div class="feature-card">
          <h3>🎨 Dark Mode</h3>
          <p>Minimal design that respects system theme preference.</p>
        </div>
      </div>
    </div>

    <div class="quick-start">
      <h2>Quick Start</h2>
      <ol>
        <li>
          <strong>Use this template</strong>
          <pre>Click "Use this template" button on GitHub</pre>
        </li>
        <li>
          <strong>Configure services</strong>
          <pre>Edit config.yml with your services to monitor</pre>
        </li>
        <li>
          <strong>Enable GitHub Pages</strong>
          <pre>Settings → Pages → Deploy from main branch</pre>
        </li>
        <li>
          <strong>Done!</strong>
          <pre>Your status page will be live at username.github.io/repo</pre>
        </li>
      </ol>
    </div>

    <div class="example-config">
      <h2>Configuration Example</h2>
      <pre><code>language: en

checks:
  - name: My Website
    url: https://example.com
  
  - name: API
    url: https://api.example.com/health
    method: GET
    expected: 200</code></pre>
    </div>
  `, 'src/global.css', 'src/main.js', 'en', '1.0.0', config.report, lang.report);
  
  fs.writeFileSync(path.join(__dirname, 'index.html'), landingHTML);
  console.log('Generated landing at /index.html');
}

async function main() {
  await checkAllServices();
  
  if (IS_TEMPLATE) {
    generateLandingPage();
  }
}

main().catch(console.error);
