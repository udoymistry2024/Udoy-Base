#!/usr/bin/env bash

# ====================================================================
# Udoy Base — 1-Line Automated Installer & Setup Script
# Works on Linux (Ubuntu/Debian/Arch/Fedora/CentOS) and macOS
# Usage: curl -sSL https://raw.githubusercontent.com/udoymistry2024/UdoyBase/main/install.sh | bash
# ====================================================================

set -e

BOLD='\033[1m'
ORANGE='\033[38;5;208m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
RESET='\033[0m'

echo -e "${ORANGE}${BOLD}"
echo "================================================================="
echo "       ⚡ UDOY BASE — SELF-HOSTED DATABASE PLATFORM"
echo "        One-Click Automated Installation & Setup"
echo "================================================================="
echo -e "${RESET}"

# ====================================================================
# 1. Auto-detect OS and Package Manager
# ====================================================================

detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS_ID="$ID"
    elif [ "$(uname)" = "Darwin" ]; then
        OS_ID="macos"
    else
        OS_ID="unknown"
    fi
}

detect_os
echo -e "${CYAN}▶ Detected OS: ${BOLD}${OS_ID}${RESET}"

install_package() {
    local pkg="$1"
    echo -e "${YELLOW}  ↳ Installing ${pkg}...${RESET}"
    case "$OS_ID" in
        ubuntu|debian|pop|linuxmint|kali|elementary)
            sudo apt-get update -qq > /dev/null 2>&1
            sudo apt-get install -y -qq "$pkg" > /dev/null 2>&1
            ;;
        fedora)
            sudo dnf install -y -q "$pkg" > /dev/null 2>&1
            ;;
        centos|rhel|rocky|alma)
            sudo yum install -y -q "$pkg" > /dev/null 2>&1
            ;;
        arch|manjaro|endeavouros)
            sudo pacman -S --noconfirm --quiet "$pkg" > /dev/null 2>&1
            ;;
        macos)
            if command -v brew &> /dev/null; then
                brew install "$pkg" > /dev/null 2>&1
            else
                echo -e "${RED}✘ Homebrew not found. Please install Homebrew first: https://brew.sh${RESET}"
                exit 1
            fi
            ;;
        *)
            echo -e "${RED}✘ Cannot auto-install ${pkg} on this OS. Please install it manually.${RESET}"
            exit 1
            ;;
    esac
}

# ====================================================================
# 2. Check & Auto-Install Dependencies
# ====================================================================

echo -e "\n${CYAN}▶ Checking system prerequisites...${RESET}\n"

# --- curl ---
if command -v curl &> /dev/null; then
    echo -e "  ${GREEN}✔ curl${RESET} — $(curl --version | head -1 | cut -d' ' -f1-2)"
else
    echo -e "  ${YELLOW}⚠ curl not found — installing...${RESET}"
    install_package curl
    echo -e "  ${GREEN}✔ curl installed successfully!${RESET}"
fi

# --- git ---
if command -v git &> /dev/null; then
    echo -e "  ${GREEN}✔ git${RESET} — $(git --version)"
else
    echo -e "  ${YELLOW}⚠ git not found — installing...${RESET}"
    install_package git
    echo -e "  ${GREEN}✔ git installed successfully!${RESET}"
fi

# --- Node.js (v18+) ---
if command -v node &> /dev/null; then
    NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VER" -ge 18 ] 2>/dev/null; then
        echo -e "  ${GREEN}✔ Node.js${RESET} — $(node -v)"
    else
        echo -e "  ${YELLOW}⚠ Node.js version too old ($(node -v)). Installing v20 LTS...${RESET}"
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - > /dev/null 2>&1
        install_package nodejs
        echo -e "  ${GREEN}✔ Node.js $(node -v) installed successfully!${RESET}"
    fi
else
    echo -e "  ${YELLOW}⚠ Node.js not found — installing v20 LTS...${RESET}"
    if [ "$OS_ID" = "macos" ]; then
        install_package node
    else
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - > /dev/null 2>&1
        install_package nodejs
    fi
    echo -e "  ${GREEN}✔ Node.js $(node -v) installed successfully!${RESET}"
fi

# --- npm ---
if command -v npm &> /dev/null; then
    echo -e "  ${GREEN}✔ npm${RESET} — v$(npm -v)"
else
    echo -e "  ${YELLOW}⚠ npm not found — installing...${RESET}"
    install_package npm
    echo -e "  ${GREEN}✔ npm installed successfully!${RESET}"
fi

# --- Docker ---
if command -v docker &> /dev/null; then
    echo -e "  ${GREEN}✔ Docker${RESET} — $(docker --version | cut -d' ' -f1-3)"
else
    echo -e "  ${YELLOW}⚠ Docker not found — installing via official script...${RESET}"
    if [ "$OS_ID" = "macos" ]; then
        echo -e "${RED}✘ Please install Docker Desktop for Mac: https://docs.docker.com/desktop/install/mac-install/${RESET}"
        exit 1
    fi
    curl -fsSL https://get.docker.com | sudo sh > /dev/null 2>&1
    sudo usermod -aG docker "$USER" 2>/dev/null || true
    sudo systemctl start docker 2>/dev/null || sudo service docker start 2>/dev/null || true
    sudo systemctl enable docker 2>/dev/null || true
    echo -e "  ${GREEN}✔ Docker installed successfully!${RESET}"
fi

# --- Docker Compose (v2 plugin check) ---
if docker compose version &> /dev/null; then
    echo -e "  ${GREEN}✔ Docker Compose${RESET} — $(docker compose version --short 2>/dev/null || echo 'v2')"
elif command -v docker-compose &> /dev/null; then
    echo -e "  ${GREEN}✔ Docker Compose (legacy)${RESET} — $(docker-compose --version | cut -d' ' -f3-4)"
else
    echo -e "  ${YELLOW}⚠ Docker Compose not found — installing plugin...${RESET}"
    sudo mkdir -p /usr/local/lib/docker/cli-plugins 2>/dev/null || true
    COMPOSE_URL="https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)"
    sudo curl -SL "$COMPOSE_URL" -o /usr/local/lib/docker/cli-plugins/docker-compose > /dev/null 2>&1
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    echo -e "  ${GREEN}✔ Docker Compose plugin installed successfully!${RESET}"
fi

echo -e "\n${GREEN}${BOLD}✔ All system prerequisites satisfied!${RESET}\n"

# ====================================================================
# 3. Clone or Update Repository
# ====================================================================

INSTALL_DIR="$HOME/udoybase"

if [ -d "$INSTALL_DIR" ]; then
    echo -e "${CYAN}▶ Updating existing Udoy Base installation in $INSTALL_DIR...${RESET}"
    cd "$INSTALL_DIR"
    git pull origin main
else
    echo -e "${CYAN}▶ Cloning Udoy Base repository into $INSTALL_DIR...${RESET}"
    git clone https://github.com/udoymistry2024/UdoyBase.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# ====================================================================
# 4. Setup Environment Variables (.env)
# ====================================================================

if [ ! -f .env ]; then
    echo -e "${CYAN}▶ Initializing default .env configuration...${RESET}"
    cp .env.example .env 2>/dev/null || cat > .env << 'ENVEOF'
# Udoy Base — Self-Hosted Database Platform
PLATFORM_PORT=4000
PLATFORM_NAME=Udoy Base
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=udoybase_secure_2026
POSTGRES_DB=postgres
JWT_SECRET=udoybase-jwt-secret-key-must-be-at-least-32-chars-long
ENVEOF
fi

# ====================================================================
# 5. Install Node.js Dependencies
# ====================================================================

echo -e "${CYAN}▶ Installing Node.js dependencies...${RESET}"
npm install --production --silent

# ====================================================================
# 6. Make Control Scripts Executable
# ====================================================================

chmod +x start.sh stop.sh install.sh uninstall.sh 2>/dev/null || true

# ====================================================================
# 7. Launch Docker Containers (PostgreSQL 15)
# ====================================================================

echo -e "${CYAN}▶ Launching PostgreSQL 15 database container via Docker...${RESET}"
if docker compose version &> /dev/null; then
    docker compose up -d
elif command -v docker-compose &> /dev/null; then
    docker-compose up -d
else
    docker compose up -d
fi

# Wait for PostgreSQL readiness
echo -e "${CYAN}⏳ Waiting for PostgreSQL to be ready...${RESET}"
for i in {1..30}; do
    if docker exec udoybase-db pg_isready -U postgres > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PostgreSQL is ready!${RESET}"
        break
    fi
    sleep 1
done

# ====================================================================
# 8. Start Udoy Base Platform Server
# ====================================================================

echo -e "${CYAN}▶ Starting Udoy Base platform server...${RESET}"

pkill -f "node server.js" 2>/dev/null || true
nohup node server.js > udoybase.log 2>&1 & disown %1 2>/dev/null || nohup node server.js > udoybase.log 2>&1 &
echo $! > .udoybase.pid

sleep 2

# ====================================================================
# 9. Success Banner
# ====================================================================

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
echo -e "================================================================="
echo ""
echo -e "  ${CYAN}You can safely close this terminal window now.${RESET}"
echo -e "  ${CYAN}The server runs in the background automatically.${RESET}"
echo ""
