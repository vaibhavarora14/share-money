#!/usr/bin/env node

/**
 * Version management script for ShareMoney
 * 
 * Usage:
 *   node scripts/version.js patch   - Increment patch version (1.0.0 -> 1.0.1)
 *   node scripts/version.js minor    - Increment minor version (1.0.0 -> 1.1.0)
 *   node scripts/version.js major    - Increment major version (1.0.0 -> 2.0.0)
 *   node scripts/version.js show     - Display current version
 */

const fs = require('fs');
const path = require('path');

const VERSION_FILE = path.join(__dirname, '..', 'version.json');
const PACKAGE_FILE = path.join(__dirname, '..', 'package.json');

function readVersion() {
  try {
    const content = fs.readFileSync(VERSION_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error reading version.json:', error.message);
    process.exit(1);
  }
}

function writeVersion(versionConfig) {
  try {
    fs.writeFileSync(VERSION_FILE, JSON.stringify(versionConfig, null, 2) + '\n');
    console.log(`✓ Updated ${VERSION_FILE}`);
  } catch (error) {
    console.error('Error writing version.json:', error.message);
    process.exit(1);
  }
}

function updatePackageJson(version) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(PACKAGE_FILE, 'utf8'));
    packageJson.version = version;
    fs.writeFileSync(PACKAGE_FILE, JSON.stringify(packageJson, null, 2) + '\n');
    console.log(`✓ Updated ${PACKAGE_FILE}`);
  } catch (error) {
    console.error('Error updating package.json:', error.message);
    process.exit(1);
  }
}

function incrementVersion(currentVersion, type) {
  const parts = currentVersion.split('.').map(Number);
  
  if (parts.length !== 3) {
    throw new Error(`Invalid version format: ${currentVersion}. Expected MAJOR.MINOR.PATCH`);
  }

  switch (type) {
    case 'major':
      return `${parts[0] + 1}.0.0`;
    case 'minor':
      return `${parts[0]}.${parts[1] + 1}.0`;
    case 'patch':
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    default:
      throw new Error(`Invalid version type: ${type}. Use 'major', 'minor', or 'patch'`);
  }
}

function showVersion() {
  const versionConfig = readVersion();
  console.log('\n📱 ShareMoney Version Info');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Version:     ${versionConfig.version}`);
  console.log(`Build:       ${versionConfig.buildNumber}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

function bumpVersion(type) {
  const versionConfig = readVersion();
  const oldVersion = versionConfig.version;
  const newVersion = incrementVersion(oldVersion, type);
  
  // Increment build number
  const newBuildNumber = versionConfig.buildNumber + 1;
  
  const newVersionConfig = {
    version: newVersion,
    buildNumber: newBuildNumber
  };
  
  console.log(`\n🔄 Bumping ${type} version`);
  console.log(`   ${oldVersion} → ${newVersion}`);
  console.log(`   Build: ${versionConfig.buildNumber} → ${newBuildNumber}\n`);
  
  writeVersion(newVersionConfig);
  updatePackageJson(newVersion);
  
  console.log(`\n✅ Version updated successfully!`);
  console.log(`   New version: ${newVersion}`);
  console.log(`   New build: ${newBuildNumber}\n`);
}

// Main execution
const command = process.argv[2];

if (!command) {
  console.error('Usage: node scripts/version.js [patch|minor|major|show]');
  process.exit(1);
}

switch (command) {
  case 'patch':
  case 'minor':
  case 'major':
    bumpVersion(command);
    break;
  case 'show':
    showVersion();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error('Usage: node scripts/version.js [patch|minor|major|show]');
    process.exit(1);
}
