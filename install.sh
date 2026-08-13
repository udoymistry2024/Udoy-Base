#!/usr/bin/env bash

# ====================================================================
# DataForge — 1-Line Automated Installer & Setup Script
# Works on Linux (Ubuntu/Debian/Arch/Fedora) and macOS
# Usage: curl -sSL https://raw.githubusercontent.com/udoymistry/dataforge/main/install.sh | bash
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
echo "       ⚡ DATAFORGE — SELF-HOSTED DATABASE PLATFORM"
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
INSTALL_DIR="$HOME/dataforge"

if [ -d "$INSTALL_DIR" ]; then
    echo -e "${CYAN}▶ Updating existing DataForge installation in $INSTALL_DIR...${RESET}"
    cd "$INSTALL_DIR"
    git pull origin main
else
    echo -e "${CYAN}▶ Cloning DataForge repository into $INSTALL_DIR...${RESET}"
    git clone https://github.com/udoymistry/dataforge.git "$INSTALL_DIR"
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
docker compose up -d

# 7. Start DataForge Platform
echo -e "${CYAN}▶ Starting DataForge platform server...${RESET}"

pkill -f "node server.js" 2>/dev/null || true
nohup node server.js > dataforge.log 2>&1 &
echo $! > .dataforge.pid

# 8. Success Banner
SERVER_IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "localhost")

echo -e "\n${GREEN}${BOLD}================================================================="
echo -e " 🎉 DATAFORGE INSTALLED & LAUNCHED SUCCESSFULLY!"
echo -e "=================================================================${RESET}"
echo -e "${BOLD}Local Dashboard:${RESET}  http://localhost:4000"
echo -e "${BOLD}VPS / Public URL:${RESET} http://${SERVER_IP}:4000"
echo -e "-----------------------------------------------------------------"
echo -e "• Stop Server:   ./stop.sh"
echo -e "• Start Server:  ./start.sh"
echo -e "• View Logs:     tail -f dataforge.log"
echo -e "=================================================================\n"
