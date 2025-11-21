const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PRIMARY_COLOR = '#1a73e8'; // Google Blue
const BACKGROUND_COLOR = '#ffffff';
const SIZE = 1024;
const PADDING = 128;

// Create a dollar sign using SVG paths
const createDollarSign = (x, y, size) => {
  const width = size * 0.4;
  const height = size * 0.6;
  const strokeWidth = size * 0.08;
  const x1 = x - width / 2;
  const x2 = x + width / 2;
  const y1 = y - height / 2;
  const y2 = y + height / 2;
  const yMid = y;
  
  return `
    <!-- Vertical line -->
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" 
          stroke="white" stroke-width="${strokeWidth}" stroke-linecap="round"/>
    <!-- Top curve -->
    <path d="M ${x} ${y1} Q ${x2} ${y1} ${x2} ${yMid}" 
          stroke="white" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round"/>
    <path d="M ${x2} ${yMid} Q ${x2} ${yMid + height * 0.1} ${x} ${yMid + height * 0.1}" 
          stroke="white" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round"/>
    <!-- Bottom curve -->
    <path d="M ${x} ${yMid + height * 0.1} Q ${x1} ${yMid + height * 0.1} ${x1} ${yMid}" 
          stroke="white" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round"/>
    <path d="M ${x1} ${yMid} Q ${x1} ${y2} ${x} ${y2}" 
          stroke="white" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round"/>
  `;
};

// Create an SVG for the icon - representing money sharing/splitting
const createIconSVG = () => {
  const centerX = SIZE / 2;
  const centerY = SIZE / 2;
  const radius = SIZE / 2 - PADDING;
  
  // Create a modern icon representing money sharing
  // Using overlapping circles/coins to represent splitting expenses
  return `
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <!-- Background -->
      <rect width="${SIZE}" height="${SIZE}" fill="${BACKGROUND_COLOR}"/>
      
      <!-- Main circle representing a coin/money -->
      <circle cx="${centerX}" cy="${centerY - 60}" r="${radius * 0.4}" fill="${PRIMARY_COLOR}" opacity="0.9"/>
      
      <!-- Dollar sign in the center using paths -->
      ${createDollarSign(centerX, centerY - 60, radius * 0.8)}
      
      <!-- Two smaller circles representing splitting/sharing -->
      <circle cx="${centerX - radius * 0.35}" cy="${centerY + 80}" r="${radius * 0.3}" fill="${PRIMARY_COLOR}" opacity="0.7"/>
      <circle cx="${centerX + radius * 0.35}" cy="${centerY + 80}" r="${radius * 0.3}" fill="${PRIMARY_COLOR}" opacity="0.7"/>
      
      <!-- Connection lines showing sharing/splitting -->
      <line x1="${centerX}" y1="${centerY - 20}" 
            x2="${centerX - radius * 0.35}" y2="${centerY + 50}" 
            stroke="${PRIMARY_COLOR}" 
            stroke-width="20" 
            stroke-linecap="round" 
            opacity="0.5"/>
      <line x1="${centerX}" y1="${centerY - 20}" 
            x2="${centerX + radius * 0.35}" y2="${centerY + 50}" 
            stroke="${PRIMARY_COLOR}" 
            stroke-width="20" 
            stroke-linecap="round" 
            opacity="0.5"/>
    </svg>
  `;
};

const createAdaptiveIconSVG = () => {
  // Adaptive icon should be simpler - just the main symbol
  const centerX = SIZE / 2;
  const centerY = SIZE / 2;
  const radius = SIZE / 2 - PADDING;
  
  return `
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <!-- Transparent background for adaptive icon -->
      <rect width="${SIZE}" height="${SIZE}" fill="transparent"/>
      
      <!-- Main circle -->
      <circle cx="${centerX}" cy="${centerY - 40}" r="${radius * 0.45}" fill="${PRIMARY_COLOR}"/>
      
      <!-- Dollar sign using paths -->
      ${createDollarSign(centerX, centerY - 40, radius * 0.9)}
      
      <!-- Two smaller circles below -->
      <circle cx="${centerX - radius * 0.3}" cy="${centerY + 60}" r="${radius * 0.25}" fill="${PRIMARY_COLOR}" opacity="0.8"/>
      <circle cx="${centerX + radius * 0.3}" cy="${centerY + 60}" r="${radius * 0.25}" fill="${PRIMARY_COLOR}" opacity="0.8"/>
      
      <!-- Connection lines -->
      <line x1="${centerX}" y1="${centerY - 5}" 
            x2="${centerX - radius * 0.3}" y2="${centerY + 35}" 
            stroke="${PRIMARY_COLOR}" 
            stroke-width="18" 
            stroke-linecap="round" 
            opacity="0.6"/>
      <line x1="${centerX}" y1="${centerY - 5}" 
            x2="${centerX + radius * 0.3}" y2="${centerY + 35}" 
            stroke="${PRIMARY_COLOR}" 
            stroke-width="18" 
            stroke-linecap="round" 
            opacity="0.6"/>
    </svg>
  `;
};

async function generateIcons() {
  const assetsDir = path.join(__dirname, '..', 'assets');
  
  try {
    // Generate main icon
    const iconSVG = createIconSVG();
    await sharp(Buffer.from(iconSVG))
      .resize(SIZE, SIZE)
      .png()
      .toFile(path.join(assetsDir, 'icon.png'));
    
    console.log('✓ Generated icon.png');
    
    // Generate adaptive icon (for Android)
    const adaptiveIconSVG = createAdaptiveIconSVG();
    await sharp(Buffer.from(adaptiveIconSVG))
      .resize(SIZE, SIZE)
      .png()
      .toFile(path.join(assetsDir, 'adaptive-icon.png'));
    
    console.log('✓ Generated adaptive-icon.png');
    
    // Generate favicon (smaller, simpler)
    await sharp(Buffer.from(iconSVG))
      .resize(512, 512)
      .png()
      .toFile(path.join(assetsDir, 'favicon.png'));
    
    console.log('✓ Generated favicon.png');
    
    // Generate splash icon (can be same as main icon)
    await sharp(Buffer.from(iconSVG))
      .resize(SIZE, SIZE)
      .png()
      .toFile(path.join(assetsDir, 'splash-icon.png'));
    
    console.log('✓ Generated splash-icon.png');
    
    console.log('\n✅ All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
