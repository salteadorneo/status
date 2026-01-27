import { describe, test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
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

describe('Configuration', () => {
  test('config.json has the correct structure', () => {
    assert.ok(config.language, 'Config file must have a language');
    assert.ok(Array.isArray(config.services), 'Services must be an array');
    assert.ok(config.services.length > 0, 'Must have at least one configured service');
  });

  test('each service has the required fields', () => {
    config.services.forEach(service => {
      assert.ok(service.id, 'Service must have an id');
      assert.ok(service.name, 'Service must have a name');
      assert.ok(service.url, 'Service must have a URL');
      assert.ok(service.method, 'Service must have an HTTP method');
      assert.ok(typeof service.expectedStatus === 'number', 'Service must have an expected status code');
      assert.ok(typeof service.timeout === 'number', 'Service must have a timeout');
    });
  });

  test('language file exists and has the necessary keys', () => {
    assert.ok(lang.ago, 'Language file must have the ago field');
    assert.ok(lang.timeUnits, 'Language file must have the timeUnits field');
    assert.ok(lang.up, 'Language file must have the up field');
    assert.ok(lang.down, 'Language file must have the down field');
  });
});

describe('timeAgo', () => {
  test('returns seconds for recent dates', () => {
    const now = new Date();
    const fiveSecondsAgo = new Date(now - 5000);
    const result = timeAgo(fiveSecondsAgo);
    assert.ok(result.includes('5'), 'Must include the number 5');
    assert.ok(result.includes(lang.timeUnits.s), 'Must include the seconds unit');
  });

  test('returns minutes for dates from minutes ago', () => {
    const now = new Date();
    const twoMinutesAgo = new Date(now - 120000); // 2 minutes
    const result = timeAgo(twoMinutesAgo);
    assert.ok(result.includes('2'), 'Must include the number 2');
    assert.ok(result.includes(lang.timeUnits.m), 'Must include the minutes unit');
  });

  test('returns hours for dates from hours ago', () => {
    const now = new Date();
    const threeHoursAgo = new Date(now - 10800000); // 3 hours
    const result = timeAgo(threeHoursAgo);
    assert.ok(result.includes('3'), 'Must include the number 3');
    assert.ok(result.includes(lang.timeUnits.h), 'Must include the hours unit');
  });

  test('returns days for dates from days ago', () => {
    const now = new Date();
    const twoDaysAgo = new Date(now - 172800000); // 2 days
    const result = timeAgo(twoDaysAgo);
    assert.ok(result.includes('2'), 'Must include the number 2');
    assert.ok(result.includes(lang.timeUnits.d), 'Must include the days unit');
  });
});

describe('formatDate', () => {
  test('formats a date correctly', () => {
    const date = new Date('2026-01-15T10:30:00Z');
    const result = formatDate(date);
    assert.ok(typeof result === 'string', 'Must return a string');
    assert.ok(result.length > 0, 'Formatted date must not be empty');
  });

  test('includes the year in the format', () => {
    const date = new Date('2026-01-15T10:30:00Z');
    const result = formatDate(date);
    assert.ok(result.includes('2026'), 'Must include the year');
  });
});

describe('generateBadge', () => {
  test('generates a valid SVG', () => {
    const badge = generateBadge('Test', 'up', 'up');
    assert.ok(badge.includes('<svg'), 'Must contain an SVG tag');
    assert.ok(badge.includes('</svg>'), 'Must close the SVG tag');
    assert.ok(badge.includes('xmlns="http://www.w3.org/2000/svg"'), 'Must have the correct namespace');
  });

  test('uses green color for up status', () => {
    const badge = generateBadge('Service', 'up', 'up');
    assert.ok(badge.includes('#0a0') || badge.includes('#0f0'), 'Must include green colors');
  });

  test('uses red color for down status', () => {
    const badge = generateBadge('Service', 'down', 'down');
    assert.ok(badge.includes('#d00') || badge.includes('#f44'), 'Must include red colors');
  });

  test('includes the label and message in the SVG', () => {
    const badge = generateBadge('MyService', 'operational', 'up');
    assert.ok(badge.includes('MyService'), 'Must include the label');
    assert.ok(badge.includes('operational'), 'Must include the message');
  });
});

describe('calculateTrend', () => {
  test('returns → if there is not enough history', () => {
    const history = [
      { status: 'up', responseTime: 100 },
      { status: 'up', responseTime: 110 }
    ];
    const trend = calculateTrend(history, 105);
    assert.strictEqual(trend, '→', 'Must return neutral arrow with little history');
  });

  test('returns → for stable trend', () => {
    const history = Array(10).fill(null).map(() => ({ status: 'up', responseTime: 100 }));
    const trend = calculateTrend(history, 100);
    assert.strictEqual(trend, '→', 'Must return neutral arrow for stable trend');
  });

  test('returns ↓ when time improves significantly', () => {
    const history = Array(10).fill(null).map(() => ({ status: 'up', responseTime: 100 }));
    const trend = calculateTrend(history, 80); // Much faster
    assert.strictEqual(trend, '↓', 'Must return down arrow when it improves');
  });

  test('returns ↑ when time worsens significantly', () => {
    const history = Array(10).fill(null).map(() => ({ status: 'up', responseTime: 100 }));
    const trend = calculateTrend(history, 120); // Much slower
    assert.strictEqual(trend, '↑', 'Must return up arrow when it worsens');
  });

  test('ignores entries with down status', () => {
    const history = [
      ...Array(5).fill(null).map(() => ({ status: 'up', responseTime: 100 })),
      { status: 'down', responseTime: 1000 },
      ...Array(5).fill(null).map(() => ({ status: 'up', responseTime: 100 }))
    ];
    const trend = calculateTrend(history, 100);
    assert.strictEqual(trend, '→', 'Must not consider checks with down status');
  });
});

describe('File Structure', () => {
  test('language files exist', () => {
    const langFiles = ['en.json', 'es.json'];
    langFiles.forEach(file => {
      const filePath = path.join(__dirname, 'lang', file);
      assert.ok(fs.existsSync(filePath), `File ${file} must exist`);
    });
  });

  test('api directory exists', () => {
    const apiDir = path.join(__dirname, 'api');
    assert.ok(fs.existsSync(apiDir), 'api directory must exist');
  });

  test('global.css exists', () => {
    const cssPath = path.join(__dirname, 'global.css');
    assert.ok(fs.existsSync(cssPath), 'global.css must exist');
  });
});
