# ⚡ Udoy Base — Self-Hosted Database Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](https://opensource.org/licenses/MIT)
[![PostgreSQL 15](https://img.shields.io/badge/PostgreSQL-15-blue.svg)](https://www.postgresql.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Supported-2496ED.svg)](https://www.docker.com/)
[![Security: Telegram 2FA](https://img.shields.io/badge/Security-Telegram%202FA-0088cc.svg)](https://telegram.org/)

**Udoy Base** is a fast, lightweight, self-hosted database platform and **Supabase alternative** designed for local development and private VPS servers. It provisions isolated PostgreSQL 15 databases on demand, complete with a dark-mode web management GUI, visual table editor, raw SQL console, graphical SQL backups, and Telegram 2FA security.

---

## 🌟 Key Features

- 🔒 **Telegram Two-Factor Authentication (2FA)**: Secure admin login, registration, and password change with 6-digit OTP codes delivered straight to your Telegram account with 1-click copy support.
- 🗄️ **Multi-Project Isolation**: Each project automatically provisions a dedicated PostgreSQL database (`CREATE DATABASE "project_name"`).
- 🔑 **API Keys & Connection URIs**: Auto-generated `Anon Key` (Public), `Service Role Key` (Secret), and direct PostgreSQL URIs for Node.js, Python, PHP, Prisma, and Mobile apps.
- 📊 **Visual Table Editor & Data Management**: Create tables, add typed columns, edit rows, paginate, and search data visually.
- 💻 **Interactive SQL Console**: Execute arbitrary raw DDL and DML queries with formatted JSON output.
- 💾 **1-Click SQL Backup & Migration**: Export complete standalone `.sql` dumps or restore database schemas and data visually.
- 🎨 **Carbon Dark Aesthetics**: Supabase-inspired UI built with pure Vanilla JavaScript (SPA), HTML5, and CSS3 for instant load speeds.
- 📦 **100% Persistent Storage**: Powered by Docker named volume (`udoybase-pg-data`), guaranteeing zero data loss across reboots.

---

## ⚡ 1-Line Instant Automated Installation

Run this single command on your Linux PC or VPS terminal to automatically clone, configure dependencies, start PostgreSQL in Docker, and launch Udoy Base:

```bash
curl -sSL https://raw.githubusercontent.com/udoymistry2024/Udoy Base/main/install.sh | bash
```

---

## 🗑️ Uninstallation & Complete Cleanup

If you ever need to completely remove Udoy Base, stop background services, and purge database containers/volumes:

### 1-Line Instant Automated Uninstall

Run this single command in your Linux PC or VPS terminal to purge Udoy Base completely:

```bash
curl -sSL https://raw.githubusercontent.com/udoymistry2024/Udoy Base/main/uninstall.sh | bash
```

### Manual Uninstall

If you installed Udoy Base manually or prefer step-by-step cleanup:

```bash
./stop.sh
docker compose down -v
rm -rf ~/udoybase
```

---

## 🚀 Manual Quickstart Guide

### Prerequisites

- **Node.js** (v18.0.0 or higher)
- **Docker & Docker Compose** (for running PostgreSQL 15)

### 1. Clone the Repository

```bash
git clone https://github.com/udoymistry2024/Udoy Base.git
cd Udoy Base
```

### 2. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Default `.env` configuration:
```env
PORT=4000
JWT_SECRET=udoybase-jwt-secret-key-must-be-at-least-32-chars-long
POSTGRES_USER=postgres
POSTGRES_PASSWORD=udoybase_secure_2026
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
```

### 3. One-Click Automated Launch

Run the automated startup script:

```bash
chmod +x start.sh stop.sh
./start.sh
```

`start.sh` automatically starts PostgreSQL 15 inside Docker and launches the Udoy Base server on `http://localhost:4000`.

To stop the platform gracefully:
```bash
./stop.sh
```

---

## 📱 Telegram 2FA Configuration

When launching Udoy Base for the first time, you will be prompted to set up your master admin credentials and connect your Telegram Bot:

1. **Create a Telegram Bot**:
   - Open Telegram and search for [@BotFather](https://t.me/BotFather).
   - Send `/newbot` and follow instructions to get your **Bot API Token** (e.g., `123456789:ABCdefGHIjklMNO...`).
2. **Find Your Telegram User ID**:
   - Search for [@userinfobot](https://t.me/userinfobot) on Telegram and send `/start`.
   - Copy your numeric **Id** (e.g., `7496488114`).
3. **Complete Admin Setup**:
   - Enter your Bot API Token and Telegram User ID on the Udoy Base setup screen.
   - Enter the 6-digit OTP code sent to your Telegram to activate your admin account!

---

## 🔗 Connecting Your Web Applications

Udoy Base provides direct PostgreSQL connection strings and API credentials for every project:

### Connection String Format
```
postgresql://postgres:udoybase_secure_2026@localhost:5432/your_project
```

### Node.js Integration (`pg`)
```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:udoybase_secure_2026@localhost:5432/your_project'
});

const { rows } = await pool.query('SELECT * FROM users');
console.log(rows);
```

### Python Integration (`psycopg2`)
```python
import psycopg2

conn = psycopg2.connect("postgresql://postgres:udoybase_secure_2026@localhost:5432/your_project")
cur = conn.cursor()
cur.execute("SELECT * FROM users")
print(cur.fetchall())
```

---

## 📡 REST API Reference

All requests must include `Authorization: Bearer <ADMIN_JWT_TOKEN>` header (except health & setup check).

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | System and PostgreSQL status check |
| `GET` | `/api/auth/status` | Checks setup and 2FA authentication state |
| `POST` | `/api/auth/send-signup-otp` | Sends Telegram 2FA code for admin registration |
| `POST` | `/api/auth/verify-signup-otp` | Verifies signup OTP and creates admin account |
| `POST` | `/api/auth/login-step1` | Checks master password and sends login 2FA OTP |
| `POST` | `/api/auth/login-step2` | Verifies login OTP and issues 30-day session token |
| `GET` | `/api/projects` | List all project databases with size & table counts |
| `POST` | `/api/projects` | Create a new isolated PostgreSQL database |
| `DELETE` | `/api/projects/:name` | Drop a project database |
| `GET` | `/api/projects/:name/tables` | List tables and column schemas |
| `POST` | `/api/projects/:name/tables` | Create table from column definitions |
| `POST` | `/api/projects/:name/query` | Execute raw SQL query |
| `GET` | `/api/projects/:name/export` | Export standalone `.sql` backup dump |
| `POST` | `/api/projects/:name/import` | Import and restore `.sql` database schema |

---

## 🧑‍💻 Developer Profile

**Udoy Mistry (উদয় মিস্ত্রি)**  
*Machine Learning & Deep Learning Engineer (ML/DL)*  
- **GitHub**: [github.com/udoymistry](https://github.com/udoymistry)
- **Specialization**: Artificial Intelligence, Deep Learning & Database Architecture

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
