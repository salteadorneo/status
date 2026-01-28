import { describe, test } from 'node:test';
import assert from 'node:assert';
import { generateReportLink } from './utils.js';

describe('generateReportLink', () => {
  test('returns empty string when report is null', () => {
    const result = generateReportLink(null);
    assert.strictEqual(result, '');
  });

  test('returns empty string when report is undefined', () => {
    const result = generateReportLink(undefined);
    assert.strictEqual(result, '');
  });

  test('returns empty string when report is empty string', () => {
    const result = generateReportLink('');
    assert.strictEqual(result, '');
  });

  test('creates mailto link for email addresses', () => {
    const result = generateReportLink('user@example.com', 'Report Issue');
    assert.strictEqual(
      result,
      '<a href="mailto:user@example.com">Report Issue</a>'
    );
  });

  test('creates http link for URLs', () => {
    const result = generateReportLink('https://github.com/user/repo/issues', 'Report Issue');
    assert.ok(result.includes('href="https://github.com/user/repo/issues"'));
    assert.ok(result.includes('target="_blank"'));
    assert.ok(result.includes('rel="noopener"'));
    assert.ok(result.includes('Report Issue'));
  });

  test('uses default text when reportText is not provided', () => {
    const result = generateReportLink('https://github.com/issues');
    assert.ok(result.includes('Report an issue'));
  });

  test('uses custom text when provided', () => {
    const result = generateReportLink('https://github.com/issues', 'Submit Bug');
    assert.ok(result.includes('Submit Bug'));
  });

  test('handles emails with multiple dots', () => {
    const result = generateReportLink('user.name@subdomain.example.co.uk');
    assert.ok(result.includes('mailto:'));
    assert.ok(result.includes('user.name@subdomain.example.co.uk'));
  });

  test('does not add target="_blank" for mailto links', () => {
    const result = generateReportLink('admin@example.com', 'Contact');
    assert.strictEqual(result, '<a href="mailto:admin@example.com">Contact</a>');
    assert.ok(!result.includes('target='));
  });

  test('adds target="_blank" for http URLs', () => {
    const result = generateReportLink('http://example.com/report', 'Report');
    assert.ok(result.includes('target="_blank"'));
    assert.ok(result.includes('rel="noopener"'));
  });

  test('adds target="_blank" for https URLs', () => {
    const result = generateReportLink('https://example.com/report', 'Report');
    assert.ok(result.includes('target="_blank"'));
    assert.ok(result.includes('rel="noopener"'));
  });

  test('handles special characters in report URL', () => {
    const url = 'https://github.com/user/repo/issues/new?title=Bug&labels=urgent';
    const result = generateReportLink(url, 'Report Bug');
    assert.ok(result.includes(url));
    assert.ok(result.includes('target="_blank"'));
  });

  test('preserves HTML escaping in custom text', () => {
    const result = generateReportLink('https://example.com', 'Report & Feedback');
    assert.ok(result.includes('Report & Feedback'));
  });
});
