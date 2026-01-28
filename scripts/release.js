#!/usr/bin/env node

/**
 * Release management script
 * Creates releases from unreleased changes with semantic versioning
 * 
 * Usage:
 *   npm run release -- major|minor|patch
 *   npm run release:dry -- major|minor|patch
 */

import { getLatestVersion, hasUnreleasedChanges, createRelease } from './changelog.js';

const args = process.argv.slice(2);
const isDry = args.includes('--dry') || args.includes('-d');
const releaseType = args.find(arg => ['major', 'minor', 'patch'].includes(arg)) || 'patch';

/**
 * Parse semantic version
 * @param {string} version Version string (e.g., "1.0.2")
 * @returns {Object} Object with major, minor, patch
 */
function parseVersion(version) {
  const parts = version.split('.');
  return {
    major: parseInt(parts[0], 10),
    minor: parseInt(parts[1], 10),
    patch: parseInt(parts[2], 10)
  };
}

/**
 * Increment version based on release type
 * @param {string} version Current version
 * @param {string} type Release type: major, minor, or patch
 * @returns {string} New version
 */
function incrementVersion(version, type) {
  const v = parseVersion(version);
  
  switch (type.toLowerCase()) {
    case 'major':
      return `${v.major + 1}.0.0`;
    case 'minor':
      return `${v.major}.${v.minor + 1}.0`;
    case 'patch':
      return `${v.major}.${v.minor}.${v.patch + 1}`;
    default:
      throw new Error(`Invalid release type: ${type}. Use major, minor, or patch.`);
  }
}

/**
 * Get current date in ISO format
 * @returns {string} Date string (YYYY-MM-DD)
 */
function getCurrentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Main release function
 */
async function main() {
  console.log('📦 Release Manager\n');

  // Validate release type
  if (!['major', 'minor', 'patch'].includes(releaseType.toLowerCase())) {
    console.error(`❌ Invalid release type: ${releaseType}`);
    console.error('   Use: npm run release -- major|minor|patch');
    process.exit(1);
  }

  // Check for unreleased changes
  if (!hasUnreleasedChanges()) {
    console.warn('⚠️  No unreleased changes found in CHANGELOG.md');
    console.warn('   Add changes to the [Unreleased] section first.');
    process.exit(1);
  }

  // Get current and new version
  const currentVersion = getLatestVersion() || '0.0.0';
  const newVersion = incrementVersion(currentVersion, releaseType);
  const releaseDate = getCurrentDate();

  console.log(`Current version: ${currentVersion}`);
  console.log(`Release type:    ${releaseType.toUpperCase()}`);
  console.log(`New version:     ${newVersion}`);
  console.log(`Release date:    ${releaseDate}`);
  console.log();

  if (isDry) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log();
    return;
  }

  try {
    // Create release
    const success = createRelease(newVersion, releaseDate);
    
    if (!success) {
      console.error('❌ Failed to create release');
      process.exit(1);
    }

    console.log(`✅ Release ${newVersion} created successfully!`);
    console.log();
    console.log('📝 Changes:');
    console.log(`   • Updated CHANGELOG.md`);
    console.log(`   • Updated package.json version to ${newVersion}`);
    console.log();
    console.log('🚀 Next steps:');
    console.log(`   git add CHANGELOG.md package.json`);
    console.log(`   git commit -m "chore: release v${newVersion}"`);
    console.log(`   git tag v${newVersion}`);
    console.log(`   git push origin main --tags`);

  } catch (error) {
    console.error('❌ Error creating release:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
