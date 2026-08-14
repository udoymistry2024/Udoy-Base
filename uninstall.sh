#!/usr/bin/env bash

# ====================================================================
# Udoy Base — 1-Line Automated Uninstaller & Cleanup Script
# Works on Linux and macOS
# Usage: curl -sSL https://raw.githubusercontent.com/udoymistry2024/Udoy Base/main/uninstall.sh | bash
# ====================================================================

BOLD='\033[1m'
ORANGE='\033[38;5;208m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
RESET='\033[0m'

echo -e "${RED}${BOLD}"
echo "================================================================="
echo "       ⚠️ UDOY BASE — UNINSTALLATION & CLEANUP SCRIPT"
echo "================================================================="
echo -e "${RESET}"

INSTALL_DIR="$HOME/udoybase"

# 1. Stop Node.js Server Process
echo -e "${CYAN}▶ Stopping Udoy Base server processes...${RESET}"
if [ -f "$INSTALL_DIR/.udoybase.pid" ]; then
    PID=$(cat "$INSTALL_DIR/.udoybase.pid")
    kill -9 $PID 2>/dev/null || true
    rm -f "$INSTALL_DIR/.udoybase.pid"
fi
pkill -f "node server.js" 2>/dev/null || true

# 2. Stop & Remove Docker Containers and Volumes
if [ -d "$INSTALL_DIR" ]; then
    cd "$INSTALL_DIR"
    echo -e "${CYAN}▶ Stopping and removing Docker PostgreSQL containers and volumes...${RESET}"
    if docker compose version &> /dev/null; then
        docker compose down -v 2>/dev/null || true
    elif command -v docker-compose &> /dev/null; then
        docker-compose down -v 2>/dev/null || true
    else
        docker compose down -v 2>/dev/null || true
    fi
fi

# Remove Docker named volume explicitly if still present
docker volume rm udoybase-pg-data 2>/dev/null || true

# 3. Remove Installation Directory
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${CYAN}▶ Removing Udoy Base directory ($INSTALL_DIR)...${RESET}"
    rm -rf "$INSTALL_DIR"
fi

echo -e "\n${GREEN}${BOLD}================================================================="
echo -e " ✅ UDOY BASE UNINSTALLED & PURGED SUCCESSFULLY!"
echo -e "=================================================================${RESET}"
echo -e "• All background processes stopped."
echo -e "• Docker database containers and volume 'udoybase-pg-data' removed."
echo -e "• Installation directory '$INSTALL_DIR' removed."
echo -e "-----------------------------------------------------------------"
echo -e "To reinstall Udoy Base anytime, run:"
echo -e "  curl -sSL https://raw.githubusercontent.com/udoymistry2024/Udoy Base/main/install.sh | bash"
echo -e "=================================================================\n"
