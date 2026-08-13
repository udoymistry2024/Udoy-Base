#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================================="
echo "⚡ Starting DataForge — Self-Hosted Database Platform"
echo "=========================================================="

# Start PostgreSQL container
echo ""
echo "📦 Starting PostgreSQL container..."
sudo docker compose up -d

echo "⏳ Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
  if sudo docker exec dataforge-db pg_isready -U postgres > /dev/null 2>&1; then
    echo "✅ PostgreSQL is ready!"
    break
  fi
  sleep 1
done

# Start Node.js server
echo ""
echo "🚀 Starting DataForge server..."
node server.js &
SERVER_PID=$!
echo $SERVER_PID > .dataforge.pid
sleep 2

echo ""
echo "=========================================================="
echo "  ⚡ DataForge is running!"
echo "=========================================================="
echo ""
echo "  🌐 Dashboard:      http://localhost:4000"
echo "  🐘 PostgreSQL:     localhost:5432"
echo "  👤 DB User:        postgres"
echo "  🔑 DB Password:    dataforge_secure_2026"
echo ""
echo "  Press Ctrl+C to stop."
echo "=========================================================="
echo ""

wait $SERVER_PID
