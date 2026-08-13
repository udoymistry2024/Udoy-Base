#!/usr/bin/env bash

# ====================================================================
# DataForge — 1-Line Automated Uninstaller & Cleanup Script
# Works on Linux and macOS
# Usage: curl -sSL https://raw.githubusercontent.com/udoymistry2024/DataForge/main/uninstall.sh | bash
# ====================================================================

BOLD='\033[1m'
ORANGE='\033[38;5;208m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
RESET='\033[0m'

echo -e "${RED}${BOLD}"
echo "================================================================="
echo "       ⚠️ DATAFORGE — UNINSTALLATION & CLEANUP SCRIPT"
echo "================================================================="
echo -e "${RESET}"

INSTALL_DIR="$HOME/dataforge"

# 1. Stop Node.js Server Process
echo -e "${CYAN}▶ Stopping DataForge server processes...${RESET}"
if [ -f "$INSTALL_DIR/.dataforge.pid" ]; then
    PID=$(cat "$INSTALL_DIR/.dataforge.pid")
    kill -9 $PID 2>/dev/null || true
    rm -f "$INSTALL_DIR/.dataforge.pid"
fi
pkill -f "node server.js" 2>/dev/null || true

# 2. Stop & Remove Docker Containers and Volumes
if [ -d "$INSTALL_DIR" ]; then
    cd "$INSTALL_DIR"
    echo -e "${CYAN}▶ Stopping and removing Docker PostgreSQL containers and volumes...${RESET}"
    if command -v docker-compose &> /dev/null; then
        docker-compose down -v 2>/dev/null || true
    else
        docker compose down -v 2>/dev/null || true
    fi
fi

# Remove Docker named volume explicitly if still present
docker volume rm dataforge-pg-data 2>/dev/null || true

# 3. Remove Installation Directory
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${CYAN}▶ Removing DataForge directory ($INSTALL_DIR)...${RESET}"
    rm -rf "$INSTALL_DIR"
fi

echo -e "\n${GREEN}${BOLD}================================================================="
echo -e " ✅ DATAFORGE UNINSTALLED & PURGED SUCCESSFULLY!"
echo -e "=================================================================${RESET}"
echo -e "• All background processes stopped."
echo -e "• Docker database containers and volume 'dataforge-pg-data' removed."
echo -e "• Installation directory '$INSTALL_DIR' removed."
echo -e "-----------------------------------------------------------------"
echo -e "To reinstall DataForge anytime, run:"
echo -e "  curl -sSL https://raw.githubusercontent.com/udoymistry2024/DataForge/main/install.sh | bash"
echo -e "=================================================================\n"
