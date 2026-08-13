#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BOLD='\033[1m'
ORANGE='\033[38;5;208m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RESET='\033[0m'

echo -e "${ORANGE}${BOLD}"
echo "=========================================================="
echo "⚡ Starting DataForge — Self-Hosted Database Platform"
echo "=========================================================="
echo -e "${RESET}"

# 1. Start PostgreSQL container
echo -e "${CYAN}📦 Starting PostgreSQL 15 container...${RESET}"
if docker compose version &> /dev/null; then
    docker compose up -d
elif command -v docker-compose &> /dev/null; then
    docker-compose up -d
else
    docker compose up -d
fi

echo -e "${CYAN}⏳ Waiting for PostgreSQL database to be ready...${RESET}"
for i in {1..30}; do
  if docker exec dataforge-db pg_isready -U postgres > /dev/null 2>&1 || sudo docker exec dataforge-db pg_isready -U postgres > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PostgreSQL is ready!${RESET}"
    break
  fi
  sleep 1
done

# 2. Stop any previous background server instance
pkill -f "node server.js" 2>/dev/null || true
if [ -f .dataforge.pid ]; then
  OLD_PID=$(cat .dataforge.pid)
  kill -9 $OLD_PID 2>/dev/null || true
  rm -f .dataforge.pid
fi

# 3. Launch Node.js server detached in the background
echo -e "${CYAN}🚀 Launching DataForge server in background...${RESET}"
nohup node server.js > dataforge.log 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > .dataforge.pid

sleep 1.5

echo ""
echo -e "${GREEN}${BOLD}=========================================================="
echo -e "  ⚡ DataForge is running in the background! (PID: $SERVER_PID)"
echo -e "==========================================================${RESET}"
echo ""
echo -e "  🌐 ${BOLD}Dashboard URL:${RESET}   http://localhost:4000"
echo -e "  🐘 ${BOLD}PostgreSQL Host:${RESET} localhost:5432"
echo -e "  👤 ${BOLD}DB Superuser:${RESET}    postgres"
echo -e "  📄 ${BOLD}Server Logs:${RESET}     tail -f dataforge.log"
echo ""
echo -e "  ${CYAN}You can safely close this terminal window now.${RESET}"
echo -e "  ${CYAN}To stop DataForge anytime, run: ./stop.sh${RESET}"
echo -e "${BOLD}==========================================================${RESET}"
echo ""
