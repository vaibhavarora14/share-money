#!/usr/bin/env node

/**
 * Version management script for ShareMoney
 * 
 * Usage:
 *   node scripts/version.js patch        - Increment patch version (1.0.0 -> 1.0.1)
 *   node scripts/version.js minor        - Increment minor version (1.0.0 -> 1.1.0)
 *   node scripts/version.js major        - Increment major version (1.0.0 -> 2.0.0)
 *   node scripts/version.js build        - Increment build number only (CI/CD use)
 *   node scripts/version.js show         - Display current version
 *   node scripts/version.js patch --dry-run  - Test without modifying files
 */

const fs = require('fs');
const path = require('path');

const VERSION_FILE = path.join(__dirname, '..', 'version.json');
const PACKAGE_FILE = path.join(__dirname, '..', 'package.json');

function validateVersion(version) {
  // Validate version format: MAJOR.MINOR.PATCH
  const versionRegex = /^\d+\.\d+\.\d+$/;
  if (!versionRegex.test(version)) {
    throw new Error(`Invalid version format: "${version}". Expected MAJOR.MINOR.PATCH (e.g., 1.0.0)`);
  }
  
  const parts = version.split('.').map(Number);
  
  // Validate all parts are valid numbers
  if (parts.some(isNaN) || parts.some(p => p < 0)) {
    throw new Error(`Invalid version format: "${version}". All parts must be non-negative integers`);
  }
  
  if (parts.length !== 3) {
    throw new Error(`Invalid version format: "${version}". Expected exactly 3 parts (MAJOR.MINOR.PATCH)`);
  }
  
  return parts;
}

function readVersion() {
  try {
    const content = fs.readFileSync(VERSION_FILE, 'utf8');
    const config = JSON.parse(content);
    
    // Validate structure
    if (!config.version || typeof config.version !== 'string') {
      throw new Error('version.json missing or invalid "version" field');
    }
    if (typeof config.buildNumber !== 'number' || config.buildNumber < 1) {
      throw new Error('version.json missing or invalid "buildNumber" field (must be >= 1)');
    }
    
    // Validate version format
    validateVersion(config.version);
    
    return config;
  } catch (error) {
    console.error('Error reading version.json:', error.message);
    process.exit(1);
  }
}

function writeVersion(versionConfig, isDryRun = false) {
  try {
    // Validate before writing
    if (!versionConfig.version || typeof versionConfig.buildNumber !== 'number') {
      throw new Error('Invalid version config structure');
    }
    validateVersion(versionConfig.version);
    
    if (isDryRun) {
      console.log(`[DRY RUN] Would update ${VERSION_FILE}`);
      console.log(`[DRY RUN] New content:`, JSON.stringify(versionConfig, null, 2));
      return;
    }
    
    // Atomic write: write to temp file first, then rename
    const tempPath = VERSION_FILE + '.tmp';
    try {
      fs.writeFileSync(tempPath, JSON.stringify(versionConfig, null, 2) + '\n');
      fs.renameSync(tempPath, VERSION_FILE);
      console.log(`✓ Updated ${VERSION_FILE}`);
    } catch (writeError) {
      // Clean up temp file on error
      try { fs.unlinkSync(tempPath); } catch {}
      throw writeError;
    }
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
  const parts = validateVersion(currentVersion);

  switch (type) {
    case 'major':
      return `${parts[0] + 1}.0.0`;
    case 'minor':
      return `${parts[0]}.${parts[1] + 1}.0`;
    case 'patch':
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    default:
      throw new Error(`Invalid version type: "${type}". Use 'major', 'minor', or 'patch'`);
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

function bumpBuild(isDryRun = false) {
  const versionConfig = readVersion();
  const newBuildNumber = versionConfig.buildNumber + 1;
  
  // Validate build number won't overflow (safety check)
  if (newBuildNumber > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Build number would exceed maximum safe integer: ${newBuildNumber}`);
  }
  
  const newVersionConfig = {
    version: versionConfig.version,
    buildNumber: newBuildNumber
  };
  
  if (isDryRun) {
    console.log(`\n🔍 [DRY RUN] Would increment build number`);
    console.log(`   Build: ${versionConfig.buildNumber} → ${newBuildNumber}\n`);
  } else {
    console.log(`\n🔄 Incrementing build number`);
    console.log(`   Build: ${versionConfig.buildNumber} → ${newBuildNumber}\n`);
  }
  
  writeVersion(newVersionConfig, isDryRun);
  
  if (!isDryRun) {
    console.log(`\n✅ Build number updated successfully!`);
    console.log(`   Version: ${versionConfig.version}`);
    console.log(`   New build: ${newBuildNumber}\n`);
  }
}

function bumpVersion(type, isDryRun = false) {
  const versionConfig = readVersion();
  const oldVersion = versionConfig.version;
  const newVersion = incrementVersion(oldVersion, type);
  
  // Increment build number
  const newBuildNumber = versionConfig.buildNumber + 1;
  
  // Validate build number won't overflow
  if (newBuildNumber > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Build number would exceed maximum safe integer: ${newBuildNumber}`);
  }
  
  const newVersionConfig = {
    version: newVersion,
    buildNumber: newBuildNumber
  };
  
  if (isDryRun) {
    console.log(`\n🔍 [DRY RUN] Would bump ${type} version`);
    console.log(`   ${oldVersion} → ${newVersion}`);
    console.log(`   Build: ${versionConfig.buildNumber} → ${newBuildNumber}\n`);
  } else {
    console.log(`\n🔄 Bumping ${type} version`);
    console.log(`   ${oldVersion} → ${newVersion}`);
    console.log(`   Build: ${versionConfig.buildNumber} → ${newBuildNumber}\n`);
  }
  
  writeVersion(newVersionConfig, isDryRun);
  
  if (!isDryRun) {
    updatePackageJson(newVersion);
    console.log(`\n✅ Version updated successfully!`);
    console.log(`   New version: ${newVersion}`);
    console.log(`   New build: ${newBuildNumber}\n`);
  }
}

// Main execution
const command = process.argv[2];
const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');

if (!command) {
  console.error('Usage: node scripts/version.js [patch|minor|major|build|show] [--dry-run]');
  process.exit(1);
}

if (isDryRun) {
  console.log('🔍 DRY RUN MODE - No files will be modified\n');
}

switch (command) {
  case 'patch':
  case 'minor':
  case 'major':
    bumpVersion(command, isDryRun);
    break;
  case 'build':
    bumpBuild(isDryRun);
    break;
  case 'show':
    showVersion();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error('Usage: node scripts/version.js [patch|minor|major|build|show] [--dry-run]');
    process.exit(1);
}
