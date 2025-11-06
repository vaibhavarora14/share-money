#!/bin/bash

# Simple script to seed database using Node.js
# This script checks if the table exists and inserts data if it doesn't

cd "$(dirname "$0")/.."

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
elif [ -f netlify/.env ]; then
  export $(cat netlify/.env | grep -v '^#' | xargs)
else
  echo "❌ Error: .env file not found"
  exit 1
fi

# Check if Node.js is available
if ! command -v node &> /dev/null; then
  echo "❌ Error: Node.js is not installed"
  exit 1
fi

echo "🌱 Seeding Supabase database..."
echo ""

# Run the TypeScript seed script using tsx or ts-node
if command -v tsx &> /dev/null; then
  tsx scripts/seed-db.ts
elif command -v ts-node &> /dev/null; then
  ts-node scripts/seed-db.ts
else
  echo "⚠️  TypeScript runner not found. Installing tsx..."
  npm install -g tsx
  tsx scripts/seed-db.ts
fi

