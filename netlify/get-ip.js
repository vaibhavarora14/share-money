#!/usr/bin/env node

/**
 * Cross-platform script to get local IP address
 * Works on macOS, Windows, and Linux
 */

import { networkInterfaces } from 'os';

function getLocalIP() {
  const interfaces = networkInterfaces();
  
  // Common interface names to check (in order of preference)
  const preferredInterfaces = ['en0', 'eth0', 'Wi-Fi', 'Ethernet', 'Local Area Connection'];
  
  // First, try preferred interfaces
  for (const name of preferredInterfaces) {
    const iface = interfaces[name];
    if (iface) {
      for (const addr of iface) {
        if (addr.family === 'IPv4' && !addr.internal) {
          return addr.address;
        }
      }
    }
  }
  
  // Fallback: find any non-internal IPv4 address
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (iface) {
      for (const addr of iface) {
        if (addr.family === 'IPv4' && !addr.internal) {
          return addr.address;
        }
      }
    }
  }
  
  return '127.0.0.1'; // Fallback to localhost
}

console.log(getLocalIP());

