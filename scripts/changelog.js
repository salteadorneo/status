/**
 * Changelog management utility
 * Handles reading, parsing, and updating CHANGELOG.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');

/**
 * Parse changelog file to extract versions
 * @returns {Object} Object with versions and their sections
 */
export function parseChangelog() {
  const content = fs.readFileSync(changelogPath, 'utf8');
  // Normalize line endings (Windows \r\n or Unix \n)
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedContent.split('\n');
  const versions = {};
  let currentVersion = null;
  let currentSection = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Match version headers: ## [1.0.0] - 2026-01-28 or ## [Unreleased]
    const versionMatch = line.match(/^## \[([^\]]+)\](?:\s*-\s*(.+))?$/);
    
    if (versionMatch) {
      currentVersion = versionMatch[1];
      currentSection = null;
      versions[currentVersion] = {
        date: versionMatch[2] || null,
        sections: {}
      };
    } else if (currentVersion && line.match(/^### /)) {
      // Extract section name: ### Added
      currentSection = line.replace(/^### /, '').trim();
      if (!versions[currentVersion].sections[currentSection]) {
        versions[currentVersion].sections[currentSection] = [];
      }
    } else if (currentVersion && currentSection && line.trim().startsWith('- ')) {
      // Extract item text without leading dash
      const itemText = line.trim().substring(1).trim();
      versions[currentVersion].sections[currentSection].push(itemText);
    }
  }

  return { versions, raw: content };
}

/**
 * Get the current unreleased changes
 * @returns {Object} Unreleased section with all subsections
 */
export function getUnreleasedChanges() {
  const { versions } = parseChangelog();
  return versions['Unreleased'] || { sections: {}, date: null };
}

/**
 * Check if there are unreleased changes
 * @returns {boolean}
 */
export function hasUnreleasedChanges() {
  const unreleased = getUnreleasedChanges();
  return Object.keys(unreleased.sections).some(section => 
    unreleased.sections[section].length > 0
  );
}

/**
 * Get the latest released version
 * @returns {string|null} Version string or null if none exist
 */
export function getLatestVersion() {
  const { versions } = parseChangelog();
  const releases = Object.keys(versions)
    .filter(v => v !== 'Unreleased')
    .sort((a, b) => {
      // Sort by semantic version
      const aParts = a.split('.').map(Number);
      const bParts = b.split('.').map(Number);
      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aDiff = (aParts[i] || 0) - (bParts[i] || 0);
        if (aDiff !== 0) return -aDiff;
      }
      return 0;
    });
  
  return releases.length > 0 ? releases[0] : null;
}

/**
 * Update package.json version
 * @param {string} version New version
 */
export function updatePackageVersion(version) {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
}

/**
 * Create a new release from unreleased changes
 * @param {string} version Version to release
 * @param {string} date Release date (ISO format)
 * @returns {boolean} True if successful
 */
export function createRelease(version, date) {
  const { raw: content } = parseChangelog();
  const unreleased = getUnreleasedChanges();

  // Check if unreleased section exists and has content
  if (!unreleased || Object.keys(unreleased.sections).length === 0) {
    return false;
  }

  // Generate new release section
  let releaseSection = `## [${version}] - ${date}\n\n`;
  for (const [section, items] of Object.entries(unreleased.sections)) {
    if (items.length > 0) {
      const formattedItems = items.map(item => `- ${item}`).join('\n');
      releaseSection += `### ${section}\n${formattedItems}\n\n`;
    }
  }

  // Replace Unreleased section with new release
  const unreleasedPattern = /## \[Unreleased\]([\s\S]*?)(?=## \[|$)/;
  const newContent = content.replace(
    unreleasedPattern,
    `## [Unreleased]\n\n### Added\n\n### Changed\n\n### Fixed\n\n${releaseSection}`
  );

  fs.writeFileSync(changelogPath, newContent);
  updatePackageVersion(version);
  
  return true;
}

/**
 * Add entry to unreleased changes
 * @param {string} section Section (Added, Changed, Fixed, etc.)
 * @param {string} message Entry message
 */
export function addUnreleasedEntry(section, message) {
  let content = fs.readFileSync(changelogPath, 'utf8');
  
  // Find or create section under Unreleased
  const sectionPattern = new RegExp(`(## \\[Unreleased\\].*?### ${section})\n`, 's');
  
  if (sectionPattern.test(content)) {
    // Section exists, add entry
    content = content.replace(
      sectionPattern,
      `$1\n- ${message}\n`
    );
  } else {
    // Section doesn't exist, create it
    const insertPattern = /(## \[Unreleased\].*?)(## \[|$)/s;
    content = content.replace(
      insertPattern,
      `$1### ${section}\n- ${message}\n\n$2`
    );
  }

  fs.writeFileSync(changelogPath, content);
}

export default {
  parseChangelog,
  getUnreleasedChanges,
  hasUnreleasedChanges,
  getLatestVersion,
  updatePackageVersion,
  createRelease,
  addUnreleasedEntry
};
