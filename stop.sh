#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BOLD='\033[1m'
ORANGE='\033[38;5;208m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RESET='\033[0m'

echo -e "${ORANGE}${BOLD}"
echo "=========================================================="
echo "🛑 Stopping DataForge Platform..."
echo "=========================================================="
echo -e "${RESET}"

# Stop Node.js server process
if [ -f .dataforge.pid ]; then
  PID=$(cat .dataforge.pid)
  kill $PID 2>/dev/null || kill -9 $PID 2>/dev/null || true
  rm -f .dataforge.pid
  echo -e "${GREEN}✅ Node.js server process (PID $PID) stopped.${RESET}"
fi

pkill -f "node server.js" 2>/dev/null || true

# Stop Docker container
echo -e "${CYAN}📦 Stopping PostgreSQL Docker container...${RESET}"
if docker compose version &> /dev/null; then
    docker compose down 2>/dev/null || true
elif command -v docker-compose &> /dev/null; then
    docker-compose down 2>/dev/null || true
else
    docker compose down 2>/dev/null || true
fi

echo ""
echo -e "${GREEN}${BOLD}✅ DataForge platform stopped successfully!${RESET}"
echo -e "   Your database schemas and rows remain safely persisted in Docker volume 'dataforge-pg-data'."
echo ""
