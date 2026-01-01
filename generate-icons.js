// Simple script to generate extension icons
// Run with: node generate-icons.js

const fs = require('fs');
const path = require('path');

// Simple PNG generator for solid colored icons with a play button
function createIcon(size) {
  // PNG header and IHDR chunk
  const width = size;
  const height = size;
  
  // Create a simple canvas-like approach using raw pixel data
  const pixels = [];
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = size * 0.4;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= radius) {
        // Red circle (YouTube-like)
        // Check if inside play triangle
        const triSize = radius * 0.5;
        const triX = centerX - triSize * 0.3;
        const triY = centerY;
        
        // Simple triangle check
        const inTriangle = (
          x >= triX && 
          x <= triX + triSize &&
          Math.abs(y - triY) <= (x - triX) * 0.6
        );
        
        if (inTriangle) {
          pixels.push(255, 255, 255, 255); // White play button
        } else {
          pixels.push(255, 0, 0, 255); // Red background
        }
      } else {
        pixels.push(0, 0, 0, 0); // Transparent
      }
    }
  }
  
  return createPNG(width, height, pixels);
}

function createPNG(width, height, pixels) {
  const zlib = require('zlib');
  
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);  // bit depth
  ihdrData.writeUInt8(6, 9);  // color type (RGBA)
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  const ihdr = createChunk('IHDR', ihdrData);
  
  // IDAT chunk (image data)
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const pixelIndex = (y * width + x) * 4;
      rawData[offset++] = pixels[pixelIndex];     // R
      rawData[offset++] = pixels[pixelIndex + 1]; // G
      rawData[offset++] = pixels[pixelIndex + 2]; // B
      rawData[offset++] = pixels[pixelIndex + 3]; // A
    }
  }
  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idat = createChunk('IDAT', compressed);
  
  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type);
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(data) {
  let crc = 0xffffffff;
  const table = [];
  
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  
  return (crc ^ 0xffffffff) >>> 0;
}

// Generate icons
const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

sizes.forEach(size => {
  const png = createIcon(size);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Created ${filePath}`);
});

console.log('Icons generated successfully!');

