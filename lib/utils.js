import fs from 'fs';
import path from 'path';

export function formatDate(date, locale = 'en-US') {
  return new Date(date).toLocaleString(locale, {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
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
