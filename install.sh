#!/usr/bin/env bash

# ====================================================================
# Udoy Base — 1-Line Automated Installer & Setup Script
# Works on Linux (Ubuntu/Debian/Arch/Fedora) and macOS
# Usage: curl -sSL https://raw.githubusercontent.com/udoymistry2024/Udoy Base/main/install.sh | bash
# ====================================================================

set -e

BOLD='\033[1m'
ORANGE='\033[38;5;208m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
RESET='\033[0m'

echo -e "${ORANGE}${BOLD}"
echo "================================================================="
echo "       ⚡ UDOY BASE — SELF-HOSTED DATABASE PLATFORM"
echo "        One-Click Automated Installation & Setup"
echo "================================================================="
echo -e "${RESET}"

# 1. Check for required commands
echo -e "${CYAN}▶ Checking system prerequisites...${RESET}"

if ! command -v git &> /dev/null; then
    echo -e "${RED}✘ Git is not installed. Please install Git first.${RESET}"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}✘ Node.js is not installed. Please install Node.js v18+ first.${RESET}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}✘ Docker is not installed. Please install Docker and Docker Compose first.${RESET}"
    exit 1
fi

echo -e "${GREEN}✔ All system prerequisites met (Git, Node.js, Docker)!${RESET}\n"

# 2. Define Installation Target Directory
INSTALL_DIR="$HOME/udoybase"

if [ -d "$INSTALL_DIR" ]; then
    echo -e "${CYAN}▶ Updating existing Udoy Base installation in $INSTALL_DIR...${RESET}"
    cd "$INSTALL_DIR"
    git pull origin main
else
    echo -e "${CYAN}▶ Cloning Udoy Base repository into $INSTALL_DIR...${RESET}"
    git clone https://github.com/udoymistry2024/Udoy Base.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# 3. Setup Environment Variables (.env)
if [ ! -f .env ]; then
    echo -e "${CYAN}▶ Initializing default .env configuration...${RESET}"
    cp .env.example .env
fi

# 4. Install Node.js Dependencies
echo -e "${CYAN}▶ Installing Node.js dependencies...${RESET}"
npm install --production --silent

# 5. Make Control Scripts Executable
chmod +x start.sh stop.sh install.sh

# 6. Launch Docker Containers (PostgreSQL 15)
echo -e "${CYAN}▶ Launching PostgreSQL 15 database container via Docker...${RESET}"
if docker compose version &> /dev/null; then
    docker compose up -d
elif command -v docker-compose &> /dev/null; then
    docker-compose up -d
else
    docker compose up -d
fi

# 7. Start Udoy Base Platform
echo -e "${CYAN}▶ Starting Udoy Base platform server...${RESET}"

pkill -f "node server.js" 2>/dev/null || true
nohup node server.js > udoybase.log 2>&1 &
echo $! > .udoybase.pid

# 8. Success Banner
SERVER_IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "localhost")

echo -e "\n${GREEN}${BOLD}================================================================="
echo -e " 🎉 UDOY BASE INSTALLED & LAUNCHED SUCCESSFULLY!"
echo -e "=================================================================${RESET}"
echo -e "${BOLD}Local Dashboard:${RESET}  http://localhost:4000"
echo -e "${BOLD}VPS / Public URL:${RESET} http://${SERVER_IP}:4000"
echo -e "-----------------------------------------------------------------"
echo -e "• Stop Server:   ./stop.sh"
echo -e "• Start Server:  ./start.sh"
echo -e "• View Logs:     tail -f udoybase.log"
echo -e "=================================================================\n"
