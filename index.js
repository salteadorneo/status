import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseYAML } from './lib/yaml-parser.js';
import { generateHistoryBar, generateBadge, generateSparkline } from './lib/generators.js';
import { formatDate, calculateTrend, getServiceHistory, generateReportLink } from './lib/utils.js';
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
 * Read IS_TEMPLATE from environment variable or .env file
 * @returns {boolean} True if IS_TEMPLATE=true
 */
function isTemplateMode() {
  if (process.env.IS_TEMPLATE !== undefined) {
    const value = process.env.IS_TEMPLATE.toLowerCase();
    return value === 'true' || value === '1';
  }

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
const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

/**
 * Load and parse configuration from YAML or JSON
 * @returns {Config}
 */
function loadConfig() {
  const yamlPath = path.join(__dirname, 'config.yml');
  const jsonPath = path.join(__dirname, 'config.json');
  
  if (fs.existsSync(yamlPath)) {
    const parsed = parseYAML(fs.readFileSync(yamlPath, 'utf-8'));
    return {
      language: parsed.language || 'en',
      report: parsed.report || null,
      logo: parsed.logo || null,
      title: parsed.title || null,
      noindex: parsed.noindex || false,
      services: (parsed.checks || parsed.services || []).map(normalizeService)
    };
  }
  
  return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
}

/**
 * Normalize service configuration
 * @param {Object} check - Raw service check configuration
 * @returns {Service}
 */
function normalizeService(check) {
  const baseConfig = {
    id: check.id || check.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: check.name,
    type: check.type || 'http',
    timeout: check.timeout || 10000,
    maintenance: check.maintenance || null
  };
  
  if (check.type === 'tcp') {
    return { ...baseConfig, host: check.host, port: check.port };
  }
  
  if (check.type === 'dns') {
    return { ...baseConfig, domain: check.domain };
  }
  
  return {
    ...baseConfig,
    url: check.url,
    method: check.method || 'GET',
    expectedStatus: check.expectedStatus || check.expected || 200
  };
}

const config = loadConfig();
const lang = JSON.parse(fs.readFileSync(path.join(__dirname, `lang/${config.language || 'en'}.json`), 'utf-8'));
const locale = config.language === 'es' ? 'es-ES' : 'en-US';

/**
 * Generate title HTML with logo if configured
 * @param {string|null} linkUrl - URL to link to (null for no link)
 * @returns {string}
 */
function generateTitle(linkUrl = null) {
  const titleText = config.title || lang.title;
  const content = config.logo 
    ? `<img src="${config.logo}" alt="${titleText}" style="height: 2rem; vertical-align: middle;" />`
    : titleText;
  
  return linkUrl 
    ? `<a href="${linkUrl}">${content}</a>`
    : content;
}

/**
 * Save check results to API directory and generate badges
 * @param {CheckResult[]} results
 * @param {Date} now
 * @param {string} yearMonth
 */
function saveResults(results, now, yearMonth) {
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
    history.push({
      timestamp: now.toISOString(),
      status: result.status,
      statusCode: result.statusCode,
      responseTime: result.responseTime,
      error: result.error
    });
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
}

/**
 * Calculate overall metrics from check results
 * @param {CheckResult[]} results
 * @returns {Object}
 */
function calculateMetrics(results) {
  const up = results.filter(s => s.status === 'up').length;
  const down = results.filter(s => s.status === 'down').length;
  const maintenance = results.filter(s => s.status === 'maintenance').length;
  const total = results.length;
  const avgResponseTime = total > 0 ? Math.round(results.reduce((sum, s) => sum + s.responseTime, 0) / total) : 0;
  
  let overallStatus = 'operational';
  let overallMessage = lang.allSystemsOperational;
  let overallIcon = '🟢';
  
  if (down > 0) {
    if (down === total) {
      overallStatus = 'major';
      overallMessage = lang.majorOutage;
      overallIcon = '🔴';
    } else {
      overallStatus = 'partial';
      overallMessage = lang.partialOutage;
      overallIcon = '🟡';
    }
  }
  
  return { up, down, maintenance, total, avgResponseTime, overallStatus, overallMessage, overallIcon };
}

/**
 * Get method badge HTML
 * @param {Service} service
 * @returns {string}
 */
function getMethodBadge(service) {
  if (service.type === 'tcp') {
    return `<span class="method-badge tcp">TCP</span>`;
  } else if (service.type === 'dns') {
    return `<span class="method-badge dns">DNS</span>`;
  } else {
    const method = service.method || 'GET';
    const badgeClass = method.toUpperCase() === 'POST' ? 'post' : '';
    return `<span class="method-badge ${badgeClass}">${method.toUpperCase()}</span>`;
  }
}

/**
 * Get service URL or description for display
 * @param {Service} service
 * @returns {string}
 */
function getServiceUrl(service) {
  if (service.type === 'tcp') {
    return `${service.host}:${service.port}`;
  } else if (service.type === 'dns') {
    return `${service.domain}`;
  }
  return service.url;
}

/**
 * Generate service card HTML for dashboard
 * @param {CheckResult} checkResult
 * @param {Service} configService
 * @returns {string}
 */
function generateServiceCard(checkResult, configService) {
  const allHistory = getServiceHistory(checkResult.id, dataDir);
  const activeHistory = allHistory.filter(h => h.status !== 'maintenance');
  const uptimeCount = activeHistory.filter(h => h.status === 'up').length;
  const uptime = activeHistory.length > 0 ? (uptimeCount / activeHistory.length * 100).toFixed(1) : 100;
  const trend = calculateTrend(allHistory, checkResult.responseTime);
  const historyBar = generateHistoryBar(allHistory, '72h', locale);
  
  return `
    <a href="service/${checkResult.id}.html" class="service-card">
      <div class="service-header-row">
        <div class="service-name-status">
          <h3 style="view-transition-name:${checkResult.id}">
            ${getMethodBadge(configService)}
            ${checkResult.name}
            <span class="${checkResult.status}">●</span>
          </h3>
        </div>
        <div class="service-metrics-inline">
          <span class="metric-item">${checkResult.responseTime}ms ${trend}</span>
          <span class="metric-item">${uptime}%</span>
        </div>
      </div>
      <div class="service-history" style="view-transition-name:${checkResult.id}-history">
        ${historyBar}
        <div class="history-labels">
          <span>72 ${lang.hoursAgo}</span>
          <span>${lang.now}</span>
        </div>
      </div>
    </a>`;
}

async function checkAllServices() {
  console.log('Starting status checks...');
  
  const results = await Promise.all(config.services.map(checkUrl));
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  saveResults(results, now, yearMonth);
  
  console.log('\nGenerating HTML files...');
  
  const metrics = calculateMetrics(results);
  
  const serviceCards = results.map(result => {
    const origService = config.services.find(s => s.id === result.id);
    return generateServiceCard(result, origService);
  }).join('');
  
  const reportLink = generateReportLink(config.report, lang.report);
  
  const indexHTML = generateHTML({
    title: config.title || lang.title,
    body: `
    <header>
      <h1 class="title">${generateTitle(IS_TEMPLATE ? '../index.html' : 'index.html')}</h1>
      ${reportLink ? `<nav>${reportLink}</nav>` : ''}
    </header>
    <main>
      <div class="overall-status-banner ${metrics.overallStatus}">
        <p>${metrics.overallIcon} ${metrics.overallMessage}</p>
        <p class="last-update">${lang.lastUpdate}: ${formatDate(now.toISOString())}</p>
      </div>
      
      <h2>${lang.summary}</h2>

      <div class="stats-grid">
        <div class="stat-card operational">
          <div class="label">${lang.operationalServices}</div>
          <div class="value">${metrics.up}/${metrics.total}</div>
        </div>
        
        <div class="stat-card issues">
          <div class="label">${lang.issues}</div>
          <div class="value">${metrics.down}</div>
        </div>
        
        <div class="stat-card">
          <div class="label">${lang.avgResponseTime}</div>
          <div class="value">${metrics.avgResponseTime}ms</div>
        </div>
        
        <div class="stat-card">
          <div class="label">${lang.lastVerification}</div>
          <div class="value">${formatDate(now.toISOString(), locale)}</div>
        </div>
      </div>
      
      <h2>${lang.services}</h2>
      <div class="services-grid">
        ${serviceCards}
      </div>
    </main>
  `, 
    cssPath: IS_TEMPLATE ? '../src/global.css' : 'src/global.css',
    scriptPath: IS_TEMPLATE ? '../src/main.js' : 'src/main.js',
    language: config.language,
    version,
    report: config.report,
    reportText: lang.report,
    noindex: config.noindex,
    bodyClass: 'status-page'
  });
  
  const baseDir = IS_TEMPLATE ? path.join(__dirname, 'demo') : __dirname;
  if (IS_TEMPLATE && !fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  
  fs.writeFileSync(path.join(baseDir, 'index.html'), indexHTML);
  console.log(`Generated ${IS_TEMPLATE ? 'demo/' : ''}index.html`);
  
  generateServicePages(results, now);
  
  console.log('\n=== Status Summary ===');
  results.forEach(r => console.log(`${r.status === 'up' ? '✓' : '✗'} ${r.name}: ${r.status} (${r.responseTime}ms)`));
  console.log('\n✅ HTML files generated successfully!');
}

/**
 * Generate individual service detail pages
 * @param {CheckResult[]} results
 * @param {Date} now
 */
function generateServicePages(results, now) {
  const serviceHtmlDir = IS_TEMPLATE ? path.join(__dirname, 'demo', 'service') : path.join(__dirname, 'service');
  if (!fs.existsSync(serviceHtmlDir)) fs.mkdirSync(serviceHtmlDir, { recursive: true });
  
  const paths = {
    css: IS_TEMPLATE ? '../../src/global.css' : '../src/global.css',
    script: IS_TEMPLATE ? '../../src/main.js' : '../src/main.js',
    api: '../api',
    badge: '../badge',
    apiAbs: IS_TEMPLATE ? '/demo/api' : '/api',
    badgeAbs: IS_TEMPLATE ? '/demo/badge' : '/badge'
  };
  
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
    
    const reportLink = generateReportLink(config.report, lang.report);
    
    const serviceHTML = generateHTML({
      title: `${service.name} - ${lang.status}`,
      body: `
      <header>
        <h1 class="title">${generateTitle('../index.html')}</h1>
        ${reportLink ? `<nav>${reportLink}</nav>` : ''}
      </header>
      <main>
        <div class="service-header">
          <h2 style="view-transition-name:${service.id}">
             <span class="${current.status}">●</span>
             ${service.name}
          </h2>
          <p>
            ${getMethodBadge(service)}
            <span style="opacity: 0.8;">${getServiceUrl(service)}</span>
            <button class="copy-button" onclick="copyToClipboard('${getServiceUrl(service)}')"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-copy"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg></button>
          </p>
        </div>
        
        ${current ? `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="label">${lang.uptime}</div>
            <div class="value">${uptime}%</div>
          </div>
          
          <div class="stat-card">
            <div class="label">${lang.avgResponseTime}</div>
            <div class="value">${avgTime}ms</div>
          </div>
          
          <div class="stat-card">
            <div class="label">${lang.incidents}</div>
            <div class="value">${incidentsCount}</div>
          </div>
          
          <div class="stat-card">
            <div class="label">${lang.lastVerification}</div>
            <div class="value">${formatDate(current.timestamp, locale)}</div>
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
          <div class="api-endpoints">
            <div class="api-endpoint">
              <div class="endpoint-header">
                <span class="method-badge">GET</span>
                https://salteadorneo.github.io/status${paths.apiAbs}/${service.id}/status.json
                <button class="copy-button" onclick="copyToClipboard('https://salteadorneo.github.io/status${paths.apiAbs}/${service.id}/status.json')"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-copy"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg></button>
              </div>
              <p class="endpoint-description">${lang.returnsCurrentStatus}</p>
            </div>
            <div class="api-endpoint">
              <div class="endpoint-header">
                <span class="method-badge">GET</span>
                https://salteadorneo.github.io/status${paths.apiAbs}/${service.id}/history/YYYY-MM.json
                <button class="copy-button" onclick="copyToClipboard('https://salteadorneo.github.io/status${paths.apiAbs}/${service.id}/history/YYYY-MM.json')"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-copy"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg></button>
              </div>
              <p class="endpoint-description">${lang.returnsMonthlyChecks}</p>
            </div>
          </div>
        </details>
        
        <details open>
          <summary>${lang.badge}</summary>
          <p>${lang.useBadge}</p>
          <div class="badge-container">
            <img src="${paths.badge}/${service.id}.svg" alt="${service.name} status" />
            <div class="badge-code-wrapper">
              <div class="badge-code">
                <p>![${service.name}](https://salteadorneo.github.io/status${paths.badgeAbs}/${service.id}.svg)</p>
                <button class="copy-button" onclick="copyToClipboard('![${service.name}](https://salteadorneo.github.io/status${paths.badgeAbs}/${service.id}.svg)')"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-copy"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg></button>
              </div>
            </div>
          </div>
        </details>
      </main>
    `, 
      cssPath: paths.css,
      scriptPath: paths.script,
      language: config.language,
      version,
      report: config.report,
      reportText: lang.report,
      noindex: config.noindex,
      bodyClass: 'status-page'
    });
    
    fs.writeFileSync(path.join(serviceHtmlDir, `${service.id}.html`), serviceHTML);
    console.log(`Generated service/${service.id}.html`);
  });
}

/**
 * Generate landing page for template mode
 */
function generateLandingPage() {
  console.log('\n📄 Generating landing page (template mode)...');
  
  const landingHTML = generateHTML({
    title: 'Status — monitorización ligera para GitHub Pages',
    body: `
    <header class="landing-nav">
      <a class="brand" href="#" aria-label="Status, inicio">
        <span class="brand-mark" aria-hidden="true"></span>
        <span>Status</span>
      </a>
      <nav aria-label="Navegación principal">
        <a href="#comparativa">Comparativa</a>
        <a href="#puesta-en-marcha">Cómo empezar</a>
        <a class="nav-github" href="https://github.com/salteadorneo/status" target="_blank" rel="noopener noreferrer">GitHub</a>
      </nav>
    </header>

    <main class="landing-main">
        <section class="hero hero-centered" aria-labelledby="hero-title">
        <div class="hero-copy">
            <p class="hero-kicker"><span aria-hidden="true"></span> Monitorización y página de estado para GitHub Pages</p>
            <h1 class="landing-title" id="hero-title">Detecta el problema.<br>Cuenta lo que pasa.</h1>
            <p class="hero-description">Comprueba tus servicios cada 10 minutos y publica su estado en una página estática. Sin servidor propio ni dependencias externas.</p>
          <div class="landing-cta">
              <a href="https://github.com/salteadorneo/status" class="btn btn-primary" target="_blank" rel="noopener noreferrer">Usar esta plantilla</a>
              <a href="demo/index.html" class="btn btn-secondary">Ver la página de estado</a>
          </div>
          </div>

          <div class="product-preview" aria-label="Vista ilustrativa del panel de monitorización y la página de estado">
            <div class="monitor-window">
              <div class="preview-topbar">
                <span class="window-dots" aria-hidden="true"><i></i><i></i><i></i></span>
                <span class="preview-breadcrumb">Status <span>/</span> Monitores</span>
                <span class="preview-tag">Vista de ejemplo</span>
              </div>
              <div class="monitor-content">
                <aside class="monitor-sidebar" aria-hidden="true">
                  <span class="sidebar-mark"></span>
                  <i></i><i></i><i></i><i></i>
                  <span class="sidebar-bottom"></span>
                </aside>
                <div class="monitor-main">
                  <div class="monitor-heading">
                    <div><span>MONITORIZACIÓN</span><h2>Todos tus servicios</h2></div>
                    <span class="checks-frequency"><i></i> Checks cada 10 min</span>
                  </div>
                  <div class="monitor-table">
                    <div class="monitor-table-head"><span>Servicio</span><span>Estado</span><span>Último check</span></div>
                    <div class="monitor-row">
                      <span class="monitor-service"><i class="service-symbol">W</i><span>Web<small>example.com</small></span></span>
                      <span class="status-pill"><i></i> Operativo</span><span class="check-value">200 OK</span>
                    </div>
                    <div class="monitor-row">
                      <span class="monitor-service"><i class="service-symbol api-symbol">A</i><span>API<small>api.example.com</small></span></span>
                      <span class="status-pill"><i></i> Operativo</span><span class="check-value">200 OK</span>
                    </div>
                    <div class="monitor-row">
                      <span class="monitor-service"><i class="service-symbol db-symbol">D</i><span>Base de datos<small>db.example.com:5432</small></span></span>
                      <span class="status-pill"><i></i> Operativo</span><span class="check-value">TCP</span>
                    </div>
                  </div>
                  <div class="preview-foot"><span><i></i> Comprobaciones automáticas</span><span>HTTP · TCP · DNS</span></div>
                </div>
              </div>
            </div>
            <aside class="status-window">
              <div class="public-page-brand"><span class="public-brand-mark"></span><strong>Mi plataforma</strong><span class="public-menu" aria-hidden="true">•••</span></div>
              <div class="public-status">
                <span class="public-status-icon">✓</span>
                <div><strong>Todos los sistemas operativos</strong><span>Estado actual · vista de ejemplo</span></div>
              </div>
              <div class="uptime-label"><strong>Historial de disponibilidad</strong><span>Últimos 30 días</span></div>
              <div class="uptime-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
              <div class="public-services"><span>Web</span><strong>Operativo</strong><span>API</span><strong>Operativo</strong></div>
            </aside>
            <p class="preview-caption">Una muestra de la información que puedes publicar. <span>Los datos son ilustrativos.</span></p>
          </div>
        </section>

      <section class="comparison-section" id="comparativa" aria-labelledby="comparison-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">Elige el enfoque que te conviene</p>
            <h2 id="comparison-title">¿Status o una plataforma dedicada?</h2>
          </div>
          <p>Las páginas de estado resuelven necesidades distintas. Esta es una comparación de modelos, no de precios ni de planes.</p>
        </div>

        <div class="comparison-scroll" tabindex="0" role="region" aria-label="Comparativa de productos de páginas de estado; desplázate horizontalmente para ver todas las opciones">
          <table class="comparison-table">
            <caption>Comparación de alojamiento, monitorización y comunicación de incidencias</caption>
            <thead>
              <tr>
                <th scope="col">Qué necesitas</th>
                <th scope="col" class="current-product">Status</th>
                <th scope="col"><a href="https://www.atlassian.com/software/statuspage" target="_blank" rel="noopener noreferrer">Atlassian Statuspage</a></th>
                <th scope="col"><a href="https://betterstack.com/status-page" target="_blank" rel="noopener noreferrer">Better Stack</a></th>
                <th scope="col"><a href="https://www.cachethq.io/" target="_blank" rel="noopener noreferrer">Cachet</a></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Cómo se aloja</th>
                <td class="current-product">GitHub Pages; contenido estático generado en tu repositorio</td>
                <td>Servicio SaaS gestionado</td>
                <td>Servicio SaaS gestionado</td>
                <td>Software abierto que alojas y mantienes</td>
              </tr>
              <tr>
                <th scope="row">Detección de fallos</th>
                <td class="current-product">Checks propios HTTP, TCP y DNS cada 10 min</td>
                <td>Se conecta con herramientas de monitorización externas</td>
                <td>Monitorización integrada con la página</td>
                <td>Normalmente se integra con monitorización externa</td>
              </tr>
              <tr>
                <th scope="row">Incidentes y avisos</th>
                <td class="current-product">Apertura y cierre automáticos de GitHub Issues</td>
                <td>Incidentes y suscripciones de clientes</td>
                <td>Incidentes, suscripciones y opciones de respuesta</td>
                <td>Componentes e incidentes en tu propia instancia</td>
              </tr>
              <tr>
                <th scope="row">Encaja mejor si...</th>
                <td class="current-product">Quieres algo simple, estático y ligado a GitHub</td>
                <td>Necesitas comunicación pública de incidentes y audiencias</td>
                <td>Prefieres reunir monitorización y comunicación</td>
                <td>Necesitas control de alojamiento y puedes operarlo</td>
              </tr>
              <tr>
                <th scope="row">Ten en cuenta</th>
                <td class="current-product">No incluye suscripciones de clientes, SMS ni guardias on-call</td>
                <td>La detección requiere una herramienta conectada</td>
                <td>La plataforma gestiona datos y operación</td>
                <td>Tu equipo gestiona despliegues, actualizaciones y monitorización</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="comparison-note">Las funciones y planes pueden cambiar. Consulta la documentación de cada producto para confirmar los detalles que necesitas.</p>
      </section>

      <section class="workflow-section" aria-labelledby="workflow-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">Ligero por diseño</p>
            <h2 id="workflow-title">Menos infraestructura. Lo esencial cubierto.</h2>
          </div>
          <p>El resultado son páginas rápidas y datos que puedes servir, enlazar o reutilizar sin desplegar una aplicación de estado aparte.</p>
        </div>
        <div class="workflow-grid">
          <article>
            <span class="workflow-number">01</span>
            <h3>Comprueba tus servicios</h3>
            <p>Configura endpoints HTTP/HTTPS, puertos TCP o resolución DNS. Los checks se ejecutan cada diez minutos.</p>
          </article>
          <article>
            <span class="workflow-number">02</span>
            <h3>Publica el estado</h3>
            <p>Se generan una página general, páginas por servicio, historial, badges SVG y endpoints JSON estáticos.</p>
          </article>
          <article>
            <span class="workflow-number">03</span>
            <h3>Recibe aviso en GitHub</h3>
            <p>Cuando un servicio cae, se abre una incidencia; al recuperarse, la incidencia se cierra automáticamente.</p>
          </article>
        </div>
      </section>

      <section class="setup-section" id="puesta-en-marcha" aria-labelledby="setup-title">
        <div class="setup-copy">
          <p class="section-kicker">De cero a publicado</p>
          <h2 id="setup-title">Una configuración y listo.</h2>
          <ol class="setup-steps">
            <li><span>Usa la plantilla en GitHub.</span></li>
            <li><span>Añade tus servicios en <code>config.yml</code>.</span></li>
            <li><span>Activa GitHub Pages en los ajustes del repositorio.</span></li>
          </ol>
          <a class="setup-link" href="https://github.com/salteadorneo/status" target="_blank" rel="noopener noreferrer">Ver instrucciones en GitHub</a>
        </div>
        <pre class="config-sample"><code>language: es

checks:
  - name: Web
    url: https://example.com

  - name: API
    url: https://api.example.com/health
    expected: 200

  - name: Base de datos
    type: tcp
    host: db.example.com
    port: 5432</code></pre>
      </section>
    </main>
  `,
    cssPath: 'src/global.css',
    additionalCssPaths: ['src/landing.css'],
    bodyClass: 'landing-page',
    language: 'es',
    version,
    report: config.report,
    reportText: lang.report,
    noindex: config.noindex
  });
  
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
