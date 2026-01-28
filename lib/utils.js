import fs from 'fs';
import path from 'path';

export function formatDate(date, locale = 'en-US') {
  return new Date(date).toLocaleString(locale, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Generate an HTML link for reporting issues
 * @param {string|null} report - Report URL or email address
 * @param {string} reportText - Text to display in the link
 * @returns {string} HTML link or empty string
 */
export function generateReportLink(report, reportText = 'Report an issue') {
  if (!report) return '';
  const isEmail = /^[^@]+@[^@]+\.[^@]+$/.test(report);
  const reportUrl = isEmail ? `mailto:${report}` : report;
  const attributes = reportUrl.startsWith('mailto:') ? '' : 'target="_blank" rel="noopener"';
  return `<a href="${reportUrl}"${attributes ? ' ' + attributes : ''}>${reportText}</a>`;
}

export function calculateTrend(history, currentTime) {
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

export function getServiceHistory(serviceId, __dirname) {
  const historyDir = path.join(__dirname, 'api', serviceId, 'history');
  if (!fs.existsSync(historyDir)) return [];
  const files = fs.readdirSync(historyDir).filter(f => f.endsWith('.json')).sort().reverse();
  return files.flatMap(f => JSON.parse(fs.readFileSync(path.join(historyDir, f), 'utf-8')));
}
