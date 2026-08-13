#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🛑 Stopping DataForge..."

# Stop Node.js server
if [ -f .dataforge.pid ]; then
  PID=$(cat .dataforge.pid)
  kill $PID 2>/dev/null && echo "  ✅ Server stopped (PID $PID)" || echo "  ⚠️  Server was not running"
  rm -f .dataforge.pid
fi

# Stop Docker container
sudo docker compose down
echo ""
echo "✅ DataForge stopped. Your data is safely persisted in Docker volume 'dataforge-pg-data'."
