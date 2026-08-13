// ====================================================================
// DataForge — Frontend Application Logic
// ====================================================================

const API = '';
let currentProject = null;
let projectInfo = null;
let projectTables = [];
let selectedTable = null;
let allProjects = [];

// ====================================================================
// API Client
// ====================================================================

async function api(path, opts = {}) {
  const token = localStorage.getItem('dataforge_admin_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    headers: { ...headers, ...opts.headers },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return res.json();
}

// ====================================================================
// Toast Notifications (replaces browser alerts)
// ====================================================================

function showToast(type, message) {
  const container = document.getElementById('toastContainer');
  const icons = {
    success: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.classList.add('toast-out'); setTimeout(() => el.remove(), 300); }, 3500);
}

// ====================================================================
// Custom Modal System
// ====================================================================

function showModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('active');
  const inp = document.querySelector('#modalContent input');
  if (inp) setTimeout(() => inp.focus(), 100);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

function closeModalOnBackdrop(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

function toggleMobileSidebar() {
  const sidebar = document.querySelector('#dashboardLayout:not([style*="display: none"]) .dashboard-sidebar') || document.querySelector('#docsLayout:not([style*="display: none"]) .dashboard-sidebar');
  const backdrop = document.getElementById('drawerBackdrop');
  if (sidebar) {
    const isOpen = sidebar.classList.toggle('mobile-open');
    if (backdrop) backdrop.classList.toggle('active', isOpen);
  }
}

function closeMobileSidebar() {
  document.querySelectorAll('.dashboard-sidebar').forEach(s => s.classList.remove('mobile-open'));
  const backdrop = document.getElementById('drawerBackdrop');
  if (backdrop) backdrop.classList.remove('active');
}

// ====================================================================
// Navigation & Hash Router
// ====================================================================

function handleRoute() {
  closeMobileSidebar();
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);

  // Update left icon sidebar active icon
  document.querySelectorAll('.icon-sidebar .nav-icon').forEach(icon => icon.classList.remove('active'));

  if (parts[0] === 'docs') {
    const docsIcon = document.querySelector('.icon-sidebar .nav-icon[data-nav="docs"]');
    if (docsIcon) docsIcon.classList.add('active');
    const topic = parts[1] || 'quickstart';
    openDocsRoute(topic);
  } else if (parts[0] === 'project' && parts[1]) {
    const projIcon = document.querySelector('.icon-sidebar .nav-icon[data-nav="projects"]');
    if (projIcon) projIcon.classList.add('active');
    const projectName = parts[1];
    const section = parts[2] || 'dashboard';
    openProjectRoute(projectName, section);
  } else {
    const projIcon = document.querySelector('.icon-sidebar .nav-icon[data-nav="projects"]');
    if (projIcon) projIcon.classList.add('active');
    openProjectsListRoute();
  }
}

function navigateTo(page, projectName, section = 'dashboard') {
  closeMobileSidebar();
  if (page === 'projects') {
    location.hash = '#/projects';
  } else if (page === 'docs') {
    location.hash = '#/docs/quickstart';
  } else if (page === 'project') {
    location.hash = `#/project/${projectName}/${section}`;
  }
}

function goHome() {
  closeMobileSidebar();
  if (location.hash === '#/projects') {
    location.reload();
  } else {
    location.hash = '#/projects';
  }
}

function switchSection(el) {
  const section = el.dataset ? el.dataset.section : el;
  closeMobileSidebar();
  if (currentProject) {
    location.hash = `#/project/${currentProject}/${section}`;
  }
}

function switchDocTopic(topic) {
  closeMobileSidebar();
  location.hash = `#/docs/${topic}`;
}

function updateMobileNavButtons(hasSidebar) {
  const menuBtn = document.querySelector('.mobile-menu-btn');
  const backBtn = document.querySelector('.mobile-back-btn');
  if (menuBtn) {
    menuBtn.classList.toggle('has-sidebar', !!hasSidebar);
    menuBtn.style.display = '';
  }
  if (backBtn) {
    backBtn.classList.toggle('has-history', !!hasSidebar);
    backBtn.style.display = '';
  }
}

function handleMobileBack(e) {
  if (e) e.preventDefault();
  closeMobileSidebar();
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);

  if (parts[0] === 'project' && parts[1] && parts[2] && parts[2] !== 'dashboard') {
    location.hash = `#/project/${parts[1]}/dashboard`;
  } else {
    location.hash = '#/projects';
  }
}

function openProjectsListRoute() {
  currentProject = null;
  updateMobileNavButtons(false);
  document.getElementById('projectsContent').style.display = '';
  document.getElementById('dashboardLayout').style.display = 'none';
  document.getElementById('docsLayout').style.display = 'none';
  loadProjects();
}

async function openProjectRoute(projectName, section = 'dashboard') {
  const isSameProject = (currentProject === projectName);
  currentProject = projectName;
  updateMobileNavButtons(true);

  document.getElementById('projectsContent').style.display = 'none';
  document.getElementById('docsLayout').style.display = 'none';
  document.getElementById('dashboardLayout').style.display = '';
  document.getElementById('dashProjectName').textContent = projectName;

  // Highlight active sidebar item
  document.querySelectorAll('#dashboardLayout .sidebar-item').forEach(i => i.classList.remove('active'));
  const activeItem = document.querySelector(`#dashboardLayout [data-section="${section}"]`);
  if (activeItem) activeItem.classList.add('active');

  // Load project info & tables if entering a new project or not cached
  if (!isSameProject || !projectInfo) {
    const [infoData, tablesData] = await Promise.all([
      api(`/api/projects/${currentProject}/info`),
      api(`/api/projects/${currentProject}/tables`),
    ]);
    if (!infoData.success) {
      showToast('error', `Project "${currentProject}" does not exist.`);
      location.hash = '#/projects';
      openProjectsLandingRoute();
      return;
    }
    projectInfo = infoData.info;
    projectTables = tablesData.success ? tablesData.tables : [];
    selectedTable = projectTables.length ? projectTables[0].name : null;
  }

  // Render requested section
  if (section === 'dashboard') renderDashboardView();
  else if (section === 'table-editor') renderTableEditor();
  else if (section === 'sql-editor') renderSqlEditor();
  else if (section === 'database') renderDatabaseView();
  else if (section === 'settings') renderSettingsView();
}

function openDocsRoute(topic = 'quickstart') {
  currentProject = null;
  updateMobileNavButtons(true);
  document.getElementById('projectsContent').style.display = 'none';
  document.getElementById('dashboardLayout').style.display = 'none';
  document.getElementById('docsLayout').style.display = '';

  // Highlight active doc topic
  document.querySelectorAll('#docsLayout .sidebar-item').forEach(i => i.classList.remove('active'));
  const activeItem = document.querySelector(`#docsLayout [data-doctopic="${topic}"]`);
  if (activeItem) activeItem.classList.add('active');

  renderDocsContent(topic);
}

function renderDocsContent(topic) {
  const container = document.getElementById('docsBody');

  const topics = {
    quickstart: `
      <div class="settings-content" style="max-width:820px">
        <h1 style="font-size:24px;font-weight:700;margin-bottom:8px">DataForge Quickstart Guide</h1>
        <p class="text-muted" style="margin-bottom:24px">Create databases, manage schemas, and connect your web backend in under 3 minutes.</p>

        <div class="settings-section">
          <h3>Step 1: Create a Project</h3>
          <p class="text-muted mb-3">Click the <strong>"+ New Project"</strong> button at the top right of the Projects page. Enter a project name (e.g. <code>ecommerce_app</code>). DataForge will automatically provision an isolated PostgreSQL 15 database instance inside Docker.</p>
        </div>

        <div class="settings-section">
          <h3>Step 2: Create Database Tables</h3>
          <p class="text-muted mb-3">Navigate to the <strong>Database</strong> section in your project sidebar. Click <strong>"Create Table"</strong> and define your columns (e.g., <code>id SERIAL</code>, <code>name TEXT</code>, <code>price FLOAT</code>). Or use the <strong>SQL Editor</strong> to run raw DDL scripts.</p>
        </div>

        <div class="settings-section">
          <h3>Step 3: Connect Your Web Application</h3>
          <p class="text-muted mb-3">Go to the <strong>Dashboard</strong> view inside your project. Copy the <code>Direct PostgreSQL Connection URI</code> or <code>Anon / Service Role Keys</code> into your web application backend configuration (<code>.env</code>).</p>
        </div>
      </div>
    `,

    architecture: `
      <div class="settings-content" style="max-width:820px">
        <h1 style="font-size:24px;font-weight:700;margin-bottom:8px">Platform Architecture</h1>
        <p class="text-muted" style="margin-bottom:24px">How DataForge provides isolated PostgreSQL databases with persistent storage.</p>

        <div class="settings-section">
          <h3>Core Components</h3>
          <div class="connection-card" style="margin-bottom:12px">
            <div style="font-weight:600;color:var(--brand);display:flex;align-items:center;gap:8px">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
              PostgreSQL 15 Engine
            </div>
            <div class="text-sm text-muted mt-2">Runs inside Docker container <code>dataforge-db</code> with persistent named volume <code>dataforge-pg-data</code>.</div>
          </div>
          <div class="connection-card" style="margin-bottom:12px">
            <div style="font-weight:600;color:var(--blue);display:flex;align-items:center;gap:8px">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              Node.js API Gateway
            </div>
            <div class="text-sm text-muted mt-2">Express backend running on port <code>4000</code>. Handles project creation, schema inspection, JWT key generation, and query execution.</div>
          </div>
          <div class="connection-card">
            <div style="font-weight:600;color:var(--text-primary);display:flex;align-items:center;gap:8px">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              SPA Web Interface
            </div>
            <div class="text-sm text-muted mt-2">Supabase-inspired dark theme UI built with vanilla JS, HTML5, and CSS3. Zero heavy frameworks, instant load time.</div>
          </div>
        </div>

        <div class="settings-section">
          <h3>Multi-Project Isolation</h3>
          <p class="text-muted">Each project corresponds to an isolated PostgreSQL database (<code>CREATE DATABASE "project_name"</code>). Data, roles, and schema are completely segregated per project.</p>
        </div>
      </div>
    `,

    nodejs: `
      <div class="settings-content" style="max-width:820px">
        <h1 style="font-size:24px;font-weight:700;margin-bottom:8px">Node.js & Express Integration</h1>
        <p class="text-muted" style="margin-bottom:24px">Connect your Express API or Next.js backend to DataForge using <code>node-postgres</code> (pg).</p>

        <div class="settings-section">
          <h3>1. Install <code>pg</code> module</h3>
          <pre class="code-snippet">npm install pg dotenv</pre>
        </div>

        <div class="settings-section">
          <h3>2. Set up database pool (<code>db.js</code>)</h3>
          <pre class="code-snippet">const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:dataforge_secure_2026@localhost:5432/your_project'
});

module.exports = pool;</pre>
        </div>

        <div class="settings-section">
          <h3>3. Query in Express Route (<code>server.js</code>)</h3>
          <pre class="code-snippet">const express = require('express');
const pool = require('./db');
const app = express();

app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products ORDER BY id DESC');
    res.json({ success: true, products: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});</pre>
        </div>
      </div>
    `,

    python: `
      <div class="settings-content" style="max-width:820px">
        <h1 style="font-size:24px;font-weight:700;margin-bottom:8px">Python Integration</h1>
        <p class="text-muted" style="margin-bottom:24px">Connect Python applications, Django, or Flask using <code>psycopg2</code> or <code>SQLAlchemy</code>.</p>

        <div class="settings-section">
          <h3>Using <code>psycopg2</code></h3>
          <pre class="code-snippet">import psycopg2

conn = psycopg2.connect("postgresql://postgres:dataforge_secure_2026@localhost:5432/your_project")
cur = conn.cursor()

cur.execute("SELECT * FROM products WHERE price > %s", (100,))
products = cur.fetchall()

for p in products:
    print(p)</pre>
        </div>

        <div class="settings-section">
          <h3>Using <code>SQLAlchemy</code></h3>
          <pre class="code-snippet">from sqlalchemy import create_engine

DATABASE_URL = "postgresql://postgres:dataforge_secure_2026@localhost:5432/your_project"
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    result = conn.execute("SELECT * FROM products")
    for row in result:
        print(row)</pre>
        </div>
      </div>
    `,

    prisma: `
      <div class="settings-content" style="max-width:820px">
        <h1 style="font-size:24px;font-weight:700;margin-bottom:8px">Prisma ORM Integration</h1>
        <p class="text-muted" style="margin-bottom:24px">Use Prisma with DataForge for type-safe database queries.</p>

        <div class="settings-section">
          <h3>1. Configure <code>prisma/schema.prisma</code></h3>
          <pre class="code-snippet">datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
}</pre>
        </div>

        <div class="settings-section">
          <h3>2. Set <code>.env</code></h3>
          <pre class="code-snippet">DATABASE_URL="postgresql://postgres:dataforge_secure_2026@localhost:5432/your_project"</pre>
        </div>

        <div class="settings-section">
          <h3>3. Push schema to DataForge</h3>
          <pre class="code-snippet">npx prisma db push</pre>
        </div>
      </div>
    `,

    laravel: `
      <div class="settings-content" style="max-width:820px">
        <h1 style="font-size:24px;font-weight:700;margin-bottom:8px">PHP & Laravel Integration</h1>
        <p class="text-muted" style="margin-bottom:24px">Connect Laravel or vanilla PHP projects to DataForge.</p>

        <div class="settings-section">
          <h3>Laravel <code>.env</code> Configuration</h3>
          <pre class="code-snippet">DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=your_project
DB_USERNAME=postgres
DB_PASSWORD=dataforge_secure_2026</pre>
        </div>

        <div class="settings-section">
          <h3>Run Migrations</h3>
          <pre class="code-snippet">php artisan migrate</pre>
        </div>
      </div>
    `,

    'connection-strings': `
      <div class="settings-content" style="max-width:820px">
        <h1 style="font-size:24px;font-weight:700;margin-bottom:8px">Connection URIs & API Keys Reference</h1>
        <p class="text-muted" style="margin-bottom:24px">Understanding connection formats and key permissions in DataForge.</p>

        <div class="settings-section">
          <h3>PostgreSQL Connection URI Format</h3>
          <pre class="code-snippet">postgresql://[user]:[password]@[host]:[port]/[database_name]</pre>
          <p class="text-muted mt-2">Example: <code>postgresql://postgres:dataforge_secure_2026@localhost:5432/ecommerce</code></p>
        </div>

        <div class="settings-section">
          <h3>Anon Key vs Service Role Key</h3>
          <div class="connection-card" style="margin-bottom:12px">
            <div style="font-weight:600;color:var(--brand)">Anon Key (Public)</div>
            <div class="text-sm text-muted mt-2">Used for client-side API requests. Subject to Row Level Security (RLS) policies. Safe to expose in public web or mobile apps.</div>
          </div>
          <div class="connection-card">
            <div style="font-weight:600;color:var(--red)">Service Role Key (Secret)</div>
            <div class="text-sm text-muted mt-2">Bypasses Row Level Security (RLS). Grants full admin access to the database. NEVER expose in client-side code; use only in secure backend environments.</div>
          </div>
        </div>
      </div>
    `,

    'rest-api': `
      <div class="settings-content" style="max-width:850px">
        <h1 style="font-size:24px;font-weight:700;margin-bottom:8px">DataForge REST API Reference</h1>
        <p class="text-muted" style="margin-bottom:24px">All endpoints exposed by the DataForge API server on port 4000.</p>

        <div class="data-grid-wrap" style="border:1px solid var(--border);border-radius:var(--radius-lg)">
          <table class="data-grid">
            <thead>
              <tr>
                <th>Method</th>
                <th>Endpoint</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span class="badge" style="background:var(--brand-subtle);color:var(--brand)">GET</span></td>
                <td class="mono">/api/health</td>
                <td>PostgreSQL connection health check</td>
              </tr>
              <tr>
                <td><span class="badge" style="background:var(--brand-subtle);color:var(--brand)">GET</span></td>
                <td class="mono">/api/projects</td>
                <td>List all project databases with size & stats</td>
              </tr>
              <tr>
                <td><span class="badge" style="background:var(--blue-subtle);color:var(--blue)">POST</span></td>
                <td class="mono">/api/projects</td>
                <td>Create a new project database</td>
              </tr>
              <tr>
                <td><span class="badge" style="background:var(--red-subtle);color:var(--red)">DELETE</span></td>
                <td class="mono">/api/projects/:name</td>
                <td>Drop a project database</td>
              </tr>
              <tr>
                <td><span class="badge" style="background:var(--brand-subtle);color:var(--brand)">GET</span></td>
                <td class="mono">/api/projects/:name/tables</td>
                <td>List tables and column schemas</td>
              </tr>
              <tr>
                <td><span class="badge" style="background:var(--blue-subtle);color:var(--blue)">POST</span></td>
                <td class="mono">/api/projects/:name/tables</td>
                <td>Create new table from column definitions</td>
              </tr>
              <tr>
                <td><span class="badge" style="background:var(--brand-subtle);color:var(--brand)">GET</span></td>
                <td class="mono">/api/projects/:name/tables/:table/rows</td>
                <td>Fetch rows from a table (paginated)</td>
              </tr>
              <tr>
                <td><span class="badge" style="background:var(--blue-subtle);color:var(--blue)">POST</span></td>
                <td class="mono">/api/projects/:name/tables/:table/rows</td>
                <td>Insert new row into table</td>
              </tr>
              <tr>
                <td><span class="badge" style="background:var(--blue-subtle);color:var(--blue)">POST</span></td>
                <td class="mono">/api/projects/:name/query</td>
                <td>Execute arbitrary raw SQL query</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `,

    persistence: `
      <div class="settings-content" style="max-width:820px">
        <h1 style="font-size:24px;font-weight:700;margin-bottom:8px">Data Safety, Backups & Migration Guide</h1>
        <p class="text-muted" style="margin-bottom:24px">Complete guide on data persistence, SQL backups, restores, and cross-machine database migration.</p>

        <div class="settings-section">
          <h3>1. Data Persistence & Docker Volume</h3>
          <p class="text-muted mb-3">
            DataForge stores all PostgreSQL databases, table schemas, and data rows inside persistent Docker volume <code>dataforge-pg-data</code>.
            Your data remains 100% safe across machine reboots, server restarts, and container updates.
          </p>
        </div>

        <div class="settings-section">
          <h3>2. Single Project Backup (<code>pg_dump</code>)</h3>
          <p class="text-muted mb-2">Export a single project database to a standalone <code>.sql</code> file:</p>
          <pre class="code-snippet"># Backup project database (e.g. portfolio)
docker exec dataforge-db pg_dump -U postgres portfolio > portfolio_backup.sql</pre>
        </div>

        <div class="settings-section">
          <h3>3. Full Server Cluster Backup (<code>pg_dumpall</code>)</h3>
          <p class="text-muted mb-2">Export ALL databases and projects on your DataForge server into one master backup file:</p>
          <pre class="code-snippet"># Backup all databases and projects
docker exec dataforge-db pg_dumpall -U postgres > full_dataforge_backup.sql</pre>
        </div>

        <div class="settings-section">
          <h3>4. Step-by-Step Migration to Another Machine or VPS</h3>
          <p class="text-muted mb-3">Follow these 4 steps to move your local database to another computer or a Linux VPS (DigitalOcean, Hetzner, AWS):</p>
          
          <div class="connection-card" style="margin-bottom:12px">
            <div style="font-weight:600;color:var(--brand)">Step 1: Export SQL Dump on Source Computer</div>
            <pre class="code-snippet" style="margin-top:6px">docker exec dataforge-db pg_dump -U postgres my_project > my_project.sql</pre>
          </div>

          <div class="connection-card" style="margin-bottom:12px">
            <div style="font-weight:600;color:var(--brand)">Step 2: Transfer SQL File to Target Computer or VPS</div>
            <p class="text-sm text-muted mt-1">Copy <code>my_project.sql</code> via Pendrive, Google Drive, or SCP:</p>
            <pre class="code-snippet" style="margin-top:6px">scp my_project.sql user@vps_ip_address:/home/user/</pre>
          </div>

          <div class="connection-card" style="margin-bottom:12px">
            <div style="font-weight:600;color:var(--brand)">Step 3: Setup DataForge & Create Project on Target Computer</div>
            <p class="text-sm text-muted mt-1">Start DataForge on the target machine and create project <code>my_project</code> from UI.</p>
          </div>

          <div class="connection-card">
            <div style="font-weight:600;color:var(--brand)">Step 4: Restore / Import SQL Data into Target Computer</div>
            <pre class="code-snippet" style="margin-top:6px">docker exec -i dataforge-db psql -U postgres -d my_project < my_project.sql</pre>
          </div>
        </div>
      </div>
    `,

    vps: `
      <div class="settings-content" style="max-width:820px">
        <h1 style="font-size:24px;font-weight:700;margin-bottom:8px">VPS Deployment Guide</h1>
        <p class="text-muted" style="margin-bottom:24px">Deploy DataForge to a Linux VPS (DigitalOcean, Hetzner, AWS) with SSL.</p>

        <div class="settings-section">
          <h3>1. Nginx Reverse Proxy with Let's Encrypt SSL</h3>
          <pre class="code-snippet">server {
    server_name dataforge.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}</pre>
        </div>

        <div class="settings-section">
          <h3>2. Secure <code>.env</code> Passwords</h3>
          <p class="text-muted">Before running in production, edit <code>.env</code> and set a random 32+ character string for <code>POSTGRES_PASSWORD</code> and <code>JWT_SECRET</code>.</p>
        </div>
      </div>
    `,

    developer: `
      <div class="settings-content" style="max-width:820px">
        <h1 style="font-size:24px;font-weight:700;margin-bottom:8px">About the Developer</h1>
        <p class="text-muted" style="margin-bottom:24px">The creator and story behind the DataForge Database Platform.</p>

        <div class="connection-card" style="padding:28px;margin-bottom:24px">
          <div style="display:flex;align-items:center;gap:20px;margin-bottom:20px;flex-wrap:wrap">
            <div class="developer-avatar-wrap">
              <img src="/images/developer.jpg" alt="Udoy Mistry" class="developer-avatar-img" onerror="this.style.display='none'; document.getElementById('devAvatarFallback').style.display='flex';">
              <div id="devAvatarFallback" class="developer-avatar-fallback" style="display:none">UM</div>
            </div>
            <div>
              <h2 style="font-size:22px;font-weight:700;color:var(--text-primary);margin-bottom:4px">Udoy Mistry (উদয় মিস্ত্রি)</h2>
              <div style="color:var(--brand);font-weight:600;font-size:14px">Machine Learning & Deep Learning Engineer (ML/DL) • Creator of DataForge</div>
              <div class="text-sm text-muted mt-1" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <span>HSC 1st Year Student</span> • 
                <span>AI / ML & Deep Learning Specialist</span> • 
                <span>Rampal, Bagerhat, Khulna Division, Bangladesh</span>
              </div>
            </div>
          </div>

          <div style="border-top:1px solid var(--border);padding-top:20px;margin-top:20px">
            <h3 style="font-size:15px;font-weight:600;margin-bottom:12px;color:var(--text-primary);display:flex;align-items:center;gap:8px">
              <svg width="18" height="18" fill="none" stroke="var(--brand)" stroke-width="2" viewBox="0 0 24 24"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z"/><path d="M9 12l-5 5"/><path d="M15 9l5-5"/></svg>
              About DataForge & Building Process
            </h3>
            <p class="text-muted" style="line-height:1.8;margin-bottom:16px">
              DataForge was conceptualized and engineered by <strong>Udoy Mistry</strong>, an HSC 1st-year student from Rampal, Bagerhat, Khulna Division, Bangladesh. Dedicated to becoming a professional <strong>Machine Learning (ML) and Deep Learning (DL) Engineer</strong>, Udoy actively researches, trains, and builds Artificial Intelligence models as his core career goal.
            </p>
            <p class="text-muted" style="line-height:1.8">
              To support robust data pipelines and local database infrastructure for AI and full-stack projects, Udoy engineered this complete self-hosted, multi-project PostgreSQL database management platform in pair programming collaboration with <strong>Google Antigravity AI Coding Agent</strong>.
            </p>
          </div>
        </div>

        <div class="settings-section">
          <h3 style="display:flex;align-items:center;gap:8px">
            <svg width="18" height="18" fill="none" stroke="var(--brand)" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Contact & Developer Info
          </h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:12px">
            <div class="connection-card" style="margin:0;padding:16px">
              <div class="conn-label" style="display:flex;align-items:center;gap:6px">
                <svg width="14" height="14" fill="none" stroke="var(--brand)" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                Official Email
              </div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--brand);margin-top:6px">
                <a href="mailto:udoymistry@gmail.com" style="color:inherit;text-decoration:none">udoymistry@gmail.com</a>
              </div>
            </div>
            <div class="connection-card" style="margin:0;padding:16px">
              <div class="conn-label" style="display:flex;align-items:center;gap:6px">
                <svg width="14" height="14" fill="none" stroke="var(--brand)" stroke-width="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                Location & Address
              </div>
              <div style="font-size:13px;color:var(--text-primary);margin-top:6px">Rampal, Bagerhat, Khulna Division, Bangladesh</div>
            </div>
            <div class="connection-card" style="margin:0;padding:16px">
              <div class="conn-label" style="display:flex;align-items:center;gap:6px">
                <svg width="14" height="14" fill="none" stroke="var(--brand)" stroke-width="2" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="15" x2="23" y2="15"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="15" x2="4" y2="15"/></svg>
                AI Collaborator
              </div>
              <div style="font-size:13px;color:var(--text-primary);margin-top:6px">Google Antigravity AI Coding Agent</div>
            </div>
          </div>
        </div>
      </div>
    `
  };

  container.innerHTML = topics[topic] || topics.quickstart;
}

// ====================================================================
// Projects Page
// ====================================================================

async function loadProjects() {
  const grid = document.getElementById('projectsGrid');
  grid.innerHTML = '<div class="loading-screen"><div class="spinner"></div><span>Loading projects...</span></div>';

  const data = await api('/api/projects');
  if (!data.success) { showToast('error', data.message); return; }
  allProjects = data.projects;
  renderProjects(allProjects);
}

function renderProjects(projects) {
  const grid = document.getElementById('projectsGrid');
  let html = '';

  if (!projects.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;padding:80px 20px">
        <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
        <div class="empty-title">No projects found</div>
        <div class="empty-desc">Click <strong>"+ New Project"</strong> above to create your first database.</div>
      </div>
    `;
    return;
  }

  for (const p of projects) {
    html += `
      <div class="project-card" onclick="navigateTo('project','${p.name}')">
        <button class="delete-btn" title="Delete project" onclick="event.stopPropagation();showDeleteModal('${p.name}')">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
        <div class="card-header">
          <div class="db-icon">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
          </div>
          <div>
            <div class="card-title">${p.name}</div>
            <div class="card-subtitle">PostgreSQL 15</div>
          </div>
        </div>
        <div class="card-stats">
          <div class="stat">
            <span class="stat-label">Tables</span>
            <span class="stat-value">${p.tableCount}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Size</span>
            <span class="stat-value">${p.size}</span>
          </div>
        </div>
      </div>
    `;
  }
  grid.innerHTML = html;
}

function filterProjects() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!q) return renderProjects(allProjects);
  renderProjects(allProjects.filter(p => p.name.includes(q)));
}

// ====================================================================
// New Project Modal
// ====================================================================

function showNewProjectModal() {
  showModal(`
    <h2>Create a new project</h2>
    <p class="modal-desc">Give your project a name. This will create a new isolated PostgreSQL database.</p>
    <label>Project Name</label>
    <input type="text" id="newProjectName" placeholder="e.g. ecommerce_app" onkeydown="if(event.key==='Enter')createProject()">
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="createProject()">Create Project</button>
    </div>
  `);
}

async function createProject() {
  const name = document.getElementById('newProjectName').value.trim();
  if (!name) { showToast('error', 'Please enter a project name'); return; }

  const data = await api('/api/projects', { method: 'POST', body: { name } });
  closeModal();
  if (data.success) {
    showToast('success', `Project "${data.project.name}" created successfully!`);
    navigateTo('project', data.project.name, 'dashboard');
  } else {
    showToast('error', data.message);
  }
}

// ====================================================================
// Delete Project Modal (with typed-name confirmation)
// ====================================================================

function showDeleteModal(projectName) {
  showModal(`
    <h2>Delete project</h2>
    <p class="modal-desc">
      This will permanently delete the <span class="delete-confirm-name">${projectName}</span> database and all its data. This action cannot be undone.
    </p>
    <label>Type <span class="delete-confirm-name">${projectName}</span> to confirm</label>
    <input type="text" id="deleteConfirmInput" placeholder="${projectName}" onkeydown="if(event.key==='Enter')confirmDelete('${projectName}')">
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="confirmDelete('${projectName}')">Delete Project</button>
    </div>
  `);
}

async function confirmDelete(projectName) {
  const typed = document.getElementById('deleteConfirmInput').value.trim();
  if (typed !== projectName) {
    showToast('error', 'Project name does not match. Please type the exact name.');
    return;
  }
  const data = await api(`/api/projects/${projectName}`, { method: 'DELETE' });
  closeModal();
  if (data.success) {
    showToast('success', `Project "${projectName}" deleted.`);
    if (currentProject === projectName) {
      navigateTo('projects');
    } else {
      loadProjects();
    }
  } else {
    showToast('error', data.message);
  }
}

// ====================================================================
// Project Dashboard
// ====================================================================

async function loadProjectDashboard() {
  const content = document.getElementById('dashboardContent');
  content.innerHTML = '<div class="loading-screen"><div class="spinner"></div><span>Loading project...</span></div>';

  const [infoData, tablesData] = await Promise.all([
    api(`/api/projects/${currentProject}/info`),
    api(`/api/projects/${currentProject}/tables`),
  ]);

  projectInfo = infoData.success ? infoData.info : null;
  projectTables = tablesData.success ? tablesData.tables : [];
  selectedTable = projectTables.length ? projectTables[0].name : null;

  renderDashboardView();
}

// ====================================================================
// Section Switching
// ====================================================================

function switchSection(el) {
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
  const section = el.dataset.section;
  if (section === 'dashboard') renderDashboardView();
  else if (section === 'table-editor') renderTableEditor();
  else if (section === 'sql-editor') renderSqlEditor();
  else if (section === 'database') renderDatabaseView();
  else if (section === 'settings') renderSettingsView();
}

// ====================================================================
// Dashboard View (Overview & Quick API Credentials)
// ====================================================================

function renderDashboardView() {
  const content = document.getElementById('dashboardContent');
  if (!projectInfo) {
    content.innerHTML = '<div class="loading-screen"><div class="spinner"></div><span>Loading dashboard...</span></div>';
    return;
  }

  const p = projectInfo;

  content.innerHTML = `
    <div class="panel-body" style="padding-top:24px">
      <div class="settings-content" style="max-width:960px">
        
        <!-- Metrics Row -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:14px;margin-bottom:28px">
          <div class="connection-card" style="margin:0;padding:18px">
            <div class="conn-label">Total Tables</div>
            <div style="font-size:26px;font-weight:700;color:var(--text-primary);margin-top:4px">${p.tableCount}</div>
          </div>
          <div class="connection-card" style="margin:0;padding:18px">
            <div class="conn-label">Database Size</div>
            <div style="font-size:26px;font-weight:700;color:var(--brand);margin-top:4px">${p.size}</div>
          </div>
          <div class="connection-card" style="margin:0;padding:18px">
            <div class="conn-label">Database Engine</div>
            <div style="font-size:18px;font-weight:600;color:var(--text-primary);margin-top:8px">PostgreSQL 15</div>
          </div>
          <div class="connection-card" style="margin:0;padding:18px">
            <div class="conn-label">Status</div>
            <div style="font-size:18px;font-weight:600;color:var(--brand);margin-top:8px">Ready for Connect</div>
          </div>
        </div>

        <!-- Direct Connection & API Credentials -->
        <div class="settings-section">
          <h3 style="display:flex;align-items:center;gap:8px">
            <svg width="18" height="18" fill="none" stroke="var(--brand)" stroke-width="2" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Connection Strings & Keys
          </h3>
          
          <div class="connection-card" style="margin-bottom:14px">
            <div class="conn-label">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              Direct PostgreSQL Connection URI
            </div>
            <div class="copy-field">
              <span class="field-value">${p.connectionString}</span>
              <button class="copy-btn" title="Copy URI" onclick="copyToClipboard('${p.connectionString}')">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
          </div>

          <div class="connection-card" style="margin-bottom:14px">
            <div class="conn-label">Anon Key (Public API Key)</div>
            <div class="copy-field">
              <span class="field-value">${p.anonKey}</span>
              <button class="copy-btn" title="Copy Key" onclick="copyToClipboard('${p.anonKey}')">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
          </div>

          <div class="connection-card" style="margin-bottom:14px">
            <div class="conn-label">Service Role Key (Secret Admin Key)</div>
            <div class="copy-field">
              <span class="field-value">${p.serviceRoleKey}</span>
              <button class="copy-btn" title="Copy Key" onclick="copyToClipboard('${p.serviceRoleKey}')">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
          </div>

          <div class="connection-card">
            <div class="conn-label" style="margin-bottom:10px">Individual Database Parameters</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));gap:10px">
              <div>
                <div class="conn-label" style="font-size:11px">Host</div>
                <div class="copy-field" style="padding:6px 10px"><span class="field-value">${p.host}</span></div>
              </div>
              <div>
                <div class="conn-label" style="font-size:11px">Port</div>
                <div class="copy-field" style="padding:6px 10px"><span class="field-value">${p.port}</span></div>
              </div>
              <div>
                <div class="conn-label" style="font-size:11px">Database</div>
                <div class="copy-field" style="padding:6px 10px"><span class="field-value">${p.name}</span></div>
              </div>
              <div>
                <div class="conn-label" style="font-size:11px">User</div>
                <div class="copy-field" style="padding:6px 10px"><span class="field-value">${p.user}</span></div>
              </div>
              <div>
                <div class="conn-label" style="font-size:11px">Password</div>
                <div class="copy-field" style="padding:6px 10px"><span class="field-value">${p.password}</span></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="settings-section">
          <h3>Quick Management Shortcuts</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:12px">
            <div class="connection-card" style="cursor:pointer;transition:all 0.2s" onclick="document.querySelector('[data-section=table-editor]').click()">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:36px;height:36px;border-radius:8px;background:var(--brand-subtle);display:flex;align-items:center;justify-content:center;color:var(--brand)">
                  <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
                </div>
                <div>
                  <div style="font-weight:600;font-size:14px;color:var(--text-primary)">Table Editor</div>
                  <div class="text-sm text-muted">View & insert data rows</div>
                </div>
              </div>
            </div>

            <div class="connection-card" style="cursor:pointer;transition:all 0.2s" onclick="document.querySelector('[data-section=sql-editor]').click()">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:36px;height:36px;border-radius:8px;background:var(--blue-subtle);display:flex;align-items:center;justify-content:center;color:var(--blue)">
                  <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                </div>
                <div>
                  <div style="font-weight:600;font-size:14px;color:var(--text-primary)">SQL Editor</div>
                  <div class="text-sm text-muted">Run queries & scripts</div>
                </div>
              </div>
            </div>

            <div class="connection-card" style="cursor:pointer;transition:all 0.2s" onclick="document.querySelector('[data-section=database]').click()">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:36px;height:36px;border-radius:8px;background:rgba(245,158,11,0.12);display:flex;align-items:center;justify-content:center;color:var(--yellow)">
                  <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                </div>
                <div>
                  <div style="font-weight:600;font-size:14px;color:var(--text-primary)">Create Table</div>
                  <div class="text-sm text-muted">Build table schema</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Backend Integration Example -->
        <div class="settings-section">
          <h3>E-Commerce Backend Connection (Node.js Example)</h3>
          <div class="connection-card">
            <pre class="code-snippet">// npm install pg express
const { Pool } = require('pg');
const pool = new Pool({ connectionString: '${p.connectionString}' });

// Query database from your web backend
app.get('/api/products', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM products ORDER BY id DESC');
  res.json(rows);
});</pre>
          </div>
        </div>

      </div>
    </div>
  `;
}

// ====================================================================
// Table Editor
// ====================================================================

function renderTableEditor() {
  const content = document.getElementById('dashboardContent');

  if (!projectTables.length) {
    content.innerHTML = `
      <div class="empty-state" style="height:100%">
        <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
        <div class="empty-title">No tables yet</div>
        <div class="empty-desc">Create your first table from the Database section.</div>
        <button class="btn btn-primary mt-3" onclick="document.querySelector('[data-section=database]').click()">Go to Database</button>
      </div>
    `;
    return;
  }

  let tableListHtml = '';
  for (const t of projectTables) {
    tableListHtml += `
      <div class="table-list-item ${t.name === selectedTable ? 'active' : ''}" onclick="selectTable('${t.name}')">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>
        ${t.name}
        <span class="row-count">${t.rowCount}</span>
      </div>
    `;
  }

  content.innerHTML = `
    <div class="table-editor-layout">
      <div class="table-list-sidebar">
        <div class="table-list-header">
          <span>Tables</span>
        </div>
        <div class="table-list" id="tableList">${tableListHtml}</div>
      </div>
      <div class="data-grid-container" id="dataGridContainer">
        <div class="loading-screen"><div class="spinner"></div><span>Loading data...</span></div>
      </div>
    </div>
  `;

  if (selectedTable) loadTableData(selectedTable);
}

async function selectTable(name) {
  selectedTable = name;
  // Update active state in sidebar
  document.querySelectorAll('.table-list-item').forEach(el => {
    el.classList.toggle('active', el.textContent.trim().startsWith(name));
  });
  loadTableData(name);
}

async function loadTableData(tableName) {
  const container = document.getElementById('dataGridContainer');
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div><span>Loading rows...</span></div>';

  const data = await api(`/api/projects/${currentProject}/tables/${tableName}/rows`);
  const tableInfo = projectTables.find(t => t.name === tableName);

  if (!data.success) {
    container.innerHTML = `<div class="empty-state"><div class="empty-title">Error</div><div class="empty-desc">${data.message}</div></div>`;
    return;
  }

  const cols = tableInfo ? tableInfo.columns : [];
  const pk = tableInfo ? tableInfo.primaryKey : null;

  let headerHtml = '<tr>';
  for (const col of cols) {
    headerHtml += `<th>${col.column_name}<span class="col-type">${col.data_type}</span></th>`;
  }
  headerHtml += '<th style="width:60px"></th></tr>';

  let bodyHtml = '';
  if (data.rows.length === 0) {
    bodyHtml = `<tr><td colspan="${cols.length + 1}" style="text-align:center;padding:40px;color:var(--text-tertiary)">No rows yet. Click "Insert Row" to add data.</td></tr>`;
  } else {
    for (const row of data.rows) {
      bodyHtml += '<tr>';
      for (const col of cols) {
        const val = row[col.column_name];
        if (val === null || val === undefined) {
          bodyHtml += '<td><span class="null-value">NULL</span></td>';
        } else {
          bodyHtml += `<td>${escapeHtml(String(val))}</td>`;
        }
      }
      bodyHtml += `
        <td>
          <div class="row-actions">
            <button class="row-action-btn danger" title="Delete row" onclick="deleteRow('${tableName}','${pk}','${row[pk]}')">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
            </button>
          </div>
        </td>
      `;
      bodyHtml += '</tr>';
    }
  }

  container.innerHTML = `
    <div class="data-grid-header">
      <div class="table-name-display">
        ${tableName}
        <span class="badge">${data.totalRows} rows</span>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary btn-sm" onclick="showInsertRowModal('${tableName}')">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Insert Row
        </button>
      </div>
    </div>
    <div class="data-grid-wrap">
      <table class="data-grid">
        <thead>${headerHtml}</thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
    <div class="data-grid-footer">
      <span>Showing ${data.rows.length} of ${data.totalRows} rows</span>
    </div>
  `;
}

// ====================================================================
// Insert Row Modal
// ====================================================================

function showInsertRowModal(tableName) {
  const tableInfo = projectTables.find(t => t.name === tableName);
  if (!tableInfo) return;

  let fieldsHtml = '';
  for (const col of tableInfo.columns) {
    // Skip auto-generated columns
    const isAuto = col.column_default && (col.column_default.includes('nextval') || col.column_default.includes('uuid_generate'));
    fieldsHtml += `
      <label>${col.column_name} <span class="text-muted text-sm">(${col.data_type}${isAuto ? ', auto' : ''})</span></label>
      <input type="text" class="insert-field" data-col="${col.column_name}" data-auto="${isAuto}" placeholder="${isAuto ? 'auto-generated' : ''}" ${isAuto ? 'disabled' : ''}>
    `;
  }

  showModal(`
    <h2>Insert row into ${tableName}</h2>
    <p class="modal-desc">Fill in the values for the new row. Auto-generated fields are skipped.</p>
    ${fieldsHtml}
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="insertRow('${tableName}')">Insert</button>
    </div>
  `);
}

async function insertRow(tableName) {
  const fields = document.querySelectorAll('.insert-field');
  const data = {};
  fields.forEach(f => {
    if (f.dataset.auto === 'true' || !f.value.trim()) return;
    data[f.dataset.col] = f.value.trim();
  });

  if (!Object.keys(data).length) { showToast('error', 'Please fill in at least one field'); return; }

  const result = await api(`/api/projects/${currentProject}/tables/${tableName}/rows`, {
    method: 'POST', body: data,
  });
  closeModal();
  if (result.success) {
    showToast('success', 'Row inserted successfully');
    await refreshTables();
    loadTableData(tableName);
  } else {
    showToast('error', result.message);
  }
}

// ====================================================================
// Delete Row
// ====================================================================

async function deleteRow(tableName, pkCol, pkVal) {
  showModal(`
    <h2>Delete row</h2>
    <p class="modal-desc">Are you sure you want to delete the row where <strong>${pkCol} = ${pkVal}</strong>?</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="confirmDeleteRow('${tableName}','${pkCol}','${pkVal}')">Delete</button>
    </div>
  `);
}

async function confirmDeleteRow(tableName, pkCol, pkVal) {
  const result = await api(`/api/projects/${currentProject}/tables/${tableName}/rows`, {
    method: 'DELETE', body: { column: pkCol, value: pkVal },
  });
  closeModal();
  if (result.success) {
    showToast('success', 'Row deleted');
    await refreshTables();
    loadTableData(tableName);
  } else {
    showToast('error', result.message);
  }
}

// ====================================================================
// SQL Editor
// ====================================================================

function renderSqlEditor() {
  const content = document.getElementById('dashboardContent');
  content.innerHTML = `
    <div class="sql-editor-layout">
      <div class="sql-input-area">
        <textarea id="sqlInput" placeholder="-- Write your SQL query here...&#10;SELECT * FROM your_table LIMIT 100;"></textarea>
      </div>
      <div class="sql-toolbar">
        <button class="btn btn-primary btn-sm" onclick="runSql()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Run Query
        </button>
        <span class="text-muted text-sm" style="margin-left:auto">Ctrl+Enter to run</span>
      </div>
      <div class="sql-results" id="sqlResults">
        <div class="empty-state">
          <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          <div class="empty-title">Run a query to see results</div>
          <div class="empty-desc">Write SQL in the editor above and click Run or press Ctrl+Enter.</div>
        </div>
      </div>
    </div>
  `;

  // Ctrl+Enter to run
  document.getElementById('sqlInput').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runSql(); }
  });
}

async function runSql() {
  const sql = document.getElementById('sqlInput').value.trim();
  if (!sql) { showToast('error', 'Please enter a SQL query'); return; }

  const results = document.getElementById('sqlResults');
  results.innerHTML = '<div class="loading-screen"><div class="spinner"></div><span>Executing query...</span></div>';

  const data = await api(`/api/projects/${currentProject}/query`, {
    method: 'POST', body: { sql },
  });

  if (!data.success) {
    results.innerHTML = `
      <div class="sql-result-meta" style="background:var(--red-subtle);color:var(--red)">
        <div class="meta-item"><strong>Error:</strong> ${escapeHtml(data.message)}</div>
      </div>
    `;
    return;
  }

  let html = `
    <div class="sql-result-meta">
      <div class="meta-item"><strong>${data.command || 'OK'}</strong></div>
      <div class="meta-item">Rows: <strong>${data.rowCount || 0}</strong></div>
      <div class="meta-item">Time: <strong>${data.executionTimeMs}ms</strong></div>
    </div>
  `;

  if (data.rows && data.rows.length && data.fields && data.fields.length) {
    html += '<div class="data-grid-wrap"><table class="data-grid"><thead><tr>';
    for (const f of data.fields) html += `<th>${escapeHtml(f)}</th>`;
    html += '</tr></thead><tbody>';
    for (const row of data.rows) {
      html += '<tr>';
      for (const f of data.fields) {
        const v = row[f];
        html += v === null ? '<td><span class="null-value">NULL</span></td>' : `<td>${escapeHtml(String(v))}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
  }

  results.innerHTML = html;
  // Refresh tables in case DDL changed something
  await refreshTables();
}

// ====================================================================
// Database View (tables list + create table)
// ====================================================================

function renderDatabaseView() {
  const content = document.getElementById('dashboardContent');
  let tablesHtml = '';

  if (projectTables.length) {
    tablesHtml = '<div style="display:grid;gap:10px">';
    for (const t of projectTables) {
      tablesHtml += `
        <div class="connection-card">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-weight:600;font-size:14px;color:var(--text-primary)">${t.name}</div>
              <div class="text-sm text-muted mt-2">${t.columns.length} columns · ${t.rowCount} rows</div>
            </div>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="showDropTableModal('${t.name}')">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
              Drop
            </button>
          </div>
          <div class="text-sm text-muted mt-2" style="font-family:'JetBrains Mono',monospace;font-size:11px">
            ${t.columns.map(c => `${c.column_name} (${c.data_type})`).join(' · ')}
          </div>
        </div>
      `;
    }
    tablesHtml += '</div>';
  } else {
    tablesHtml = `
      <div class="empty-state">
        <div class="empty-title">No tables yet</div>
        <div class="empty-desc">Create your first table below.</div>
      </div>
    `;
  }

  content.innerHTML = `
    <div class="panel-header">
      <h2>Database Tables</h2>
      <div class="header-actions">
        <button class="btn btn-primary btn-sm" onclick="showCreateTableForm()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create Table
        </button>
      </div>
    </div>
    <div class="panel-body" id="databasePanelBody">
      ${tablesHtml}
    </div>
  `;
}

// ====================================================================
// Drop Table Modal
// ====================================================================

function showDropTableModal(tableName) {
  showModal(`
    <h2>Drop table</h2>
    <p class="modal-desc">This will permanently delete the table <span class="delete-confirm-name">${tableName}</span> and all its data.</p>
    <label>Type <span class="delete-confirm-name">${tableName}</span> to confirm</label>
    <input type="text" id="dropTableConfirm" placeholder="${tableName}" onkeydown="if(event.key==='Enter')confirmDropTable('${tableName}')">
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="confirmDropTable('${tableName}')">Drop Table</button>
    </div>
  `);
}

async function confirmDropTable(tableName) {
  const typed = document.getElementById('dropTableConfirm').value.trim();
  if (typed !== tableName) { showToast('error', 'Table name does not match'); return; }

  const result = await api(`/api/projects/${currentProject}/tables/${tableName}`, { method: 'DELETE' });
  closeModal();
  if (result.success) {
    showToast('success', `Table "${tableName}" dropped.`);
    await refreshTables();
    if (selectedTable === tableName) selectedTable = projectTables.length ? projectTables[0].name : null;
    renderDatabaseView();
  } else {
    showToast('error', result.message);
  }
}

// ====================================================================
// Create Table Form
// ====================================================================

let createTableColumns = [{ name: 'id', type: 'SERIAL', primaryKey: true, notNull: true }];

function showCreateTableForm() {
  createTableColumns = [{ name: 'id', type: 'SERIAL', primaryKey: true, notNull: true }];
  renderCreateTableForm();
}

function renderCreateTableForm() {
  const body = document.getElementById('databasePanelBody');

  const types = ['SERIAL','BIGSERIAL','INTEGER','BIGINT','TEXT','VARCHAR(255)','BOOLEAN','TIMESTAMP','TIMESTAMPTZ','DATE','FLOAT','DOUBLE PRECISION','NUMERIC','UUID','JSONB','JSON','BYTEA'];

  let colRowsHtml = '';
  createTableColumns.forEach((c, i) => {
    colRowsHtml += `
      <div class="column-row">
        <input type="text" value="${c.name}" placeholder="column_name" onchange="createTableColumns[${i}].name=this.value">
        <select onchange="createTableColumns[${i}].type=this.value">
          ${types.map(t => `<option value="${t}" ${t === c.type ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <label class="checkbox-label"><input type="checkbox" ${c.primaryKey ? 'checked' : ''} onchange="createTableColumns[${i}].primaryKey=this.checked"> PK</label>
        <label class="checkbox-label"><input type="checkbox" ${c.notNull ? 'checked' : ''} onchange="createTableColumns[${i}].notNull=this.checked"> NOT NULL</label>
        <button class="remove-col-btn" onclick="createTableColumns.splice(${i},1);renderCreateTableForm()" ${createTableColumns.length <= 1 ? 'disabled' : ''}>
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `;
  });

  body.innerHTML = `
    <div class="create-table-form">
      <h3 style="font-size:16px;margin-bottom:16px">Create New Table</h3>
      <label>Table Name</label>
      <input type="text" id="createTableName" placeholder="e.g. products" style="width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 14px;font-size:14px;font-family:inherit;color:var(--text-primary);outline:none;margin-bottom:20px">
      <label style="margin-bottom:8px;display:block">Columns</label>
      <div class="column-row" style="margin-bottom:4px">
        <span class="text-muted text-sm">Name</span>
        <span class="text-muted text-sm">Type</span>
        <span class="text-muted text-sm">PK</span>
        <span class="text-muted text-sm">NN</span>
        <span></span>
      </div>
      ${colRowsHtml}
      <button class="btn btn-ghost btn-sm mt-2" onclick="createTableColumns.push({name:'',type:'TEXT',primaryKey:false,notNull:false});renderCreateTableForm()">
        + Add Column
      </button>
      <div style="margin-top:24px;display:flex;gap:10px">
        <button class="btn btn-ghost" onclick="renderDatabaseView()">Cancel</button>
        <button class="btn btn-primary" onclick="submitCreateTable()">Create Table</button>
      </div>
    </div>
  `;
}

async function submitCreateTable() {
  const tableName = document.getElementById('createTableName').value.trim();
  if (!tableName) { showToast('error', 'Please enter a table name'); return; }
  const validCols = createTableColumns.filter(c => c.name.trim());
  if (!validCols.length) { showToast('error', 'Add at least one column'); return; }

  const result = await api(`/api/projects/${currentProject}/tables`, {
    method: 'POST',
    body: { tableName, columns: validCols },
  });

  if (result.success) {
    showToast('success', `Table "${tableName}" created!`);
    await refreshTables();
    selectedTable = tableName;
    renderDatabaseView();
  } else {
    showToast('error', result.message);
  }
}

// ====================================================================
// Settings / API View
// ====================================================================

function renderSettingsView() {
  const content = document.getElementById('dashboardContent');
  if (!projectInfo) {
    content.innerHTML = '<div class="loading-screen"><div class="spinner"></div><span>Loading settings...</span></div>';
    return;
  }

  const p = projectInfo;
  content.innerHTML = `
    <div class="panel-header">
      <h2>Settings & API Keys</h2>
    </div>
    <div class="panel-body">
      <div class="settings-content">
        <div class="settings-section">
          <h3>Project Information</h3>
          <div class="connection-card">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
              <div>
                <div class="conn-label">Database Name</div>
                <div style="font-weight:600;color:var(--text-primary)">${p.name}</div>
              </div>
              <div>
                <div class="conn-label">Tables</div>
                <div style="font-weight:600;color:var(--text-primary)">${p.tableCount}</div>
              </div>
              <div>
                <div class="conn-label">Size</div>
                <div style="font-weight:600;color:var(--text-primary)">${p.size}</div>
              </div>
              <div>
                <div class="conn-label">Engine</div>
                <div style="font-weight:600;color:var(--text-primary)">PostgreSQL 15</div>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <h3>Connection String</h3>
          <div class="connection-card">
            <div class="conn-label">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              Direct PostgreSQL URI
            </div>
            <div class="copy-field">
              <span class="field-value">${p.connectionString}</span>
              <button class="copy-btn" onclick="copyToClipboard('${p.connectionString}')">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <h3>API Keys</h3>
          <div class="connection-card" style="margin-bottom:12px">
            <div class="conn-label">Anon Key (public)</div>
            <div class="copy-field">
              <span class="field-value">${p.anonKey}</span>
              <button class="copy-btn" onclick="copyToClipboard('${p.anonKey}')">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
          </div>
          <div class="connection-card">
            <div class="conn-label">Service Role Key (secret)</div>
            <div class="copy-field">
              <span class="field-value">${p.serviceRoleKey}</span>
              <button class="copy-btn" onclick="copyToClipboard('${p.serviceRoleKey}')">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <h3>Connection Details</h3>
          <div class="connection-card">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div>
                <div class="conn-label">Host</div>
                <div class="copy-field"><span class="field-value">${p.host}</span></div>
              </div>
              <div>
                <div class="conn-label">Port</div>
                <div class="copy-field"><span class="field-value">${p.port}</span></div>
              </div>
              <div>
                <div class="conn-label">User</div>
                <div class="copy-field"><span class="field-value">${p.user}</span></div>
              </div>
              <div>
                <div class="conn-label">Password</div>
                <div class="copy-field"><span class="field-value">${p.password}</span></div>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <h3>Code Snippets</h3>
          <div class="connection-card">
            <div class="conn-label">Node.js (pg)</div>
            <pre class="code-snippet">const { Pool } = require('pg');
const pool = new Pool({
  connectionString: '${p.connectionString}'
});
const res = await pool.query('SELECT * FROM your_table');</pre>
          </div>
          <div class="connection-card" style="margin-top:12px">
            <div class="conn-label">Python (psycopg2)</div>
            <pre class="code-snippet">import psycopg2
conn = psycopg2.connect("${p.connectionString}")
cur = conn.cursor()
cur.execute("SELECT * FROM your_table")</pre>
          </div>
        </div>

        <!-- Database Backup & Migration Operations -->
        <div class="settings-section">
          <h3 style="display:flex;align-items:center;gap:8px">
            <svg width="18" height="18" fill="none" stroke="var(--brand)" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Database Backup & Migration Operations
          </h3>
          <p class="text-muted mb-3">Backup or restore project <strong>${p.name}</strong> data graphically without writing terminal commands.</p>

          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px">
            <!-- Export Card -->
            <div class="connection-card" style="margin:0;padding:22px;display:flex;flex-direction:column;justify-content:space-between">
              <div>
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
                  <div style="width:40px;height:40px;border-radius:10px;background:var(--brand-subtle);border:1px solid rgba(255,107,53,0.25);display:flex;align-items:center;justify-content:center;color:var(--brand)">
                    <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </div>
                  <div>
                    <div style="font-weight:700;font-size:15px;color:var(--text-primary)">Export SQL Backup</div>
                    <div class="text-sm text-muted">Download complete .sql dump</div>
                  </div>
                </div>
                <p class="text-sm text-muted mb-4" style="line-height:1.6">Export all schemas, tables, constraints, and data rows into a single standalone <code>.sql</code> file.</p>
              </div>
              <button class="btn btn-primary" style="width:100%;justify-content:center;padding:10px" onclick="downloadBackup('${p.name}')">
                <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download SQL Backup File
              </button>
            </div>

            <!-- Import Card -->
            <div class="connection-card" style="margin:0;padding:22px;display:flex;flex-direction:column;justify-content:space-between">
              <div>
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
                  <div style="width:40px;height:40px;border-radius:10px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.25);display:flex;align-items:center;justify-content:center;color:var(--blue)">
                    <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  </div>
                  <div>
                    <div style="font-weight:700;font-size:15px;color:var(--text-primary)">Import & Restore SQL</div>
                    <div class="text-sm text-muted">Upload & restore database</div>
                  </div>
                </div>
                <p class="text-sm text-muted mb-4" style="line-height:1.6">Upload a <code>.sql</code> file or paste SQL queries to restore tables into this database.</p>
              </div>
              <button class="btn btn-secondary" style="width:100%;justify-content:center;padding:10px" onclick="showImportModal('${p.name}')">
                <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Import / Restore SQL Data
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function saveAdminSettings() {
  const name = document.getElementById('setAdminName').value.trim();
  const email = document.getElementById('setAdminEmail').value.trim();
  const telegramUsername = document.getElementById('setTgUser').value.trim();
  const telegramUserId = document.getElementById('setTgId').value.trim();
  const telegramBotToken = document.getElementById('setTgToken').value.trim();
  const newPassword = document.getElementById('setNewPass').value.trim();

  showToast('info', 'Updating profile settings...');
  const res = await api('/api/auth/profile', {
    method: 'POST',
    body: { name, email, telegramUsername, telegramUserId, telegramBotToken }
  });

  if (res.success) {
    currentUser = res.user;
  }

  if (newPassword) {
    if (newPassword.length < 6) {
      showToast('error', 'New password must be at least 6 characters');
      return;
    }
    showToast('info', 'Sending 2FA OTP to Telegram to verify password change...');
    const passRes = await api('/api/auth/send-passchange-otp', {
      method: 'POST',
      body: { newPassword }
    });

    if (passRes.success) {
      showToast('success', passRes.message);
      showPassChangeOtpModal(passRes.tempId);
    } else {
      showToast('error', passRes.message);
    }
  } else {
    showToast('success', 'Profile & Security settings updated!');
  }
}

// ====================================================================
// GUI Backup & Import Helpers
// ====================================================================

function downloadBackup(projectName) {
  showToast('info', `Exporting SQL backup for "${projectName}"...`);
  const link = document.createElement('a');
  link.href = `/api/projects/${projectName}/export`;
  link.download = `${projectName}_backup.sql`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function updateSelectedFileName(input) {
  const label = document.getElementById('fileUploadLabel');
  if (!label) return;
  if (input.files && input.files[0]) {
    label.textContent = `Selected: ${input.files[0].name} (${(input.files[0].size / 1024).toFixed(1)} KB)`;
    label.style.color = 'var(--brand)';
  } else {
    label.textContent = 'Click to select .SQL file';
    label.style.color = 'var(--text-primary)';
  }
}

function showImportModal(projectName) {
  showModal(`
    <div style="max-width:540px">
      <h2 style="font-size:20px;font-weight:700;margin-bottom:6px">Import / Restore SQL Backup</h2>
      <p class="modal-desc" style="margin-bottom:18px">Upload a <code>.sql</code> file or paste SQL queries to restore database tables into <strong>${projectName}</strong>.</p>
      
      <div style="margin-bottom:16px">
        <label style="display:block;font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text-primary)">Option 1: Select .SQL Backup File</label>
        <div class="custom-file-upload" onclick="document.getElementById('importSqlFile').click()">
          <input type="file" id="importSqlFile" accept=".sql" style="display:none" onchange="updateSelectedFileName(this)">
          <div class="upload-icon">
            <svg width="22" height="22" fill="none" stroke="var(--brand)" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
          <div class="upload-info">
            <div id="fileUploadLabel" style="font-weight:600;font-size:14px;color:var(--text-primary)">Click to select .SQL file</div>
            <div class="text-sm text-muted">Supports PostgreSQL dump files (.sql)</div>
          </div>
        </div>
      </div>

      <div style="margin-bottom:20px">
        <label style="display:block;font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text-primary)">Option 2: Paste Raw SQL Statements</label>
        <textarea id="importSqlText" class="mono" rows="5" placeholder="CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);\nINSERT INTO users (name) VALUES ('John');" style="width:100%;padding:10px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-size:13px;resize:vertical"></textarea>
      </div>

      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="executeImport('${projectName}')">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Start Import & Restore
        </button>
      </div>
    </div>
  `);
}

async function executeImport(projectName) {
  const fileInput = document.getElementById('importSqlFile');
  const textInput = document.getElementById('importSqlText');
  let sqlContent = textInput ? textInput.value.trim() : '';

  if (fileInput && fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    sqlContent = await file.text();
  }

  if (!sqlContent) {
    showToast('error', 'Please select a .sql file or paste SQL queries to import.');
    return;
  }

  showToast('info', 'Importing database schema and data...');
  const res = await api(`/api/projects/${projectName}/import`, {
    method: 'POST',
    body: { sql: sqlContent }
  });

  if (res.success) {
    showToast('success', res.message || 'Database restored successfully!');
    closeModal();
    projectInfo = null;
    openProjectRoute(projectName, 'dashboard');
  } else {
    showToast('error', res.message || 'SQL import failed');
  }
}

// ====================================================================
// Utilities
// ====================================================================

async function refreshTables() {
  const data = await api(`/api/projects/${currentProject}/tables`);
  if (data.success) projectTables = data.tables;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => showToast('success', 'Copied to clipboard!'));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function toggleSecretVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPass = (input.type === 'password');
  input.type = isPass ? 'text' : 'password';

  const eyeOpen = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const eyeOff = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

  const btnEl = btn || (typeof event !== 'undefined' ? event.currentTarget : null);
  if (btnEl) {
    btnEl.innerHTML = isPass ? eyeOff : eyeOpen;
    btnEl.title = isPass ? "Hide Secret" : "Show Secret";
  }
}

// ====================================================================
// Health Check
// ====================================================================

async function checkHealth() {
  try {
    const data = await api('/api/health');
    const el = document.getElementById('healthText');
    if (data.status === 'online') {
      el.textContent = 'Online';
    } else {
      el.textContent = 'Offline';
      document.querySelector('.health-dot').style.background = 'var(--red)';
    }
  } catch (e) {
    document.getElementById('healthText').textContent = 'Offline';
    document.querySelector('.health-dot').style.background = 'var(--red)';
  }
}

// ====================================================================
// Authentication & Telegram 2FA Logic
// ====================================================================

let currentUser = null;

async function checkAuthStatus() {
  try {
    const data = await api('/api/auth/status');
    const authScreen = document.getElementById('authScreen');
    const topBarAccount = document.getElementById('topBarAccount');
    const mainApp = document.getElementById('app');

    if (!data.isRegistered) {
      if (mainApp) mainApp.style.display = 'none';
      if (authScreen) authScreen.style.display = 'flex';
      if (topBarAccount) topBarAccount.style.display = 'none';
      renderSignupForm();
      return false;
    }

    if (!data.isAuthenticated) {
      if (mainApp) mainApp.style.display = 'none';
      if (authScreen) authScreen.style.display = 'flex';
      if (topBarAccount) topBarAccount.style.display = 'none';
      renderLoginForm();
      return false;
    }

    // Authenticated
    currentUser = data.user;
    if (mainApp) mainApp.style.display = 'flex';
    if (authScreen) authScreen.style.display = 'none';
    if (topBarAccount) topBarAccount.style.display = 'block';
    return true;
  } catch (e) {
    console.error('Auth check error:', e);
    return false;
  }
}

function renderSignupForm() {
  const card = document.getElementById('authCard');
  card.innerHTML = `
    <h1>
      <svg width="22" height="22" fill="none" stroke="var(--brand)" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      Admin Setup & Telegram 2FA
    </h1>
    <div class="auth-subtitle">Create your local admin account and connect your Telegram Bot for 2FA security.</div>

    <div class="auth-form-group">
      <label>Admin Full Name</label>
      <input type="text" id="regName" placeholder="e.g. Udoy Mistry">
    </div>

    <div class="auth-form-group">
      <label>Admin Email</label>
      <input type="email" id="regEmail" placeholder="e.g. udoymistry@gmail.com">
    </div>

    <div class="auth-form-group">
      <label>Master Account Password</label>
      <div class="secret-input-wrap">
        <input type="password" id="regPassword" placeholder="Minimum 6 characters">
        <button type="button" class="eye-toggle-btn" onclick="toggleSecretVisibility('regPassword', this)" title="Show Password">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
    </div>

    <div class="auth-form-group">
      <label>Telegram Username</label>
      <input type="text" id="regTgUser" placeholder="e.g. @udoymistry">
    </div>

    <div class="auth-form-group">
      <label>Telegram User ID / Chat ID (For OTP delivery)</label>
      <input type="text" id="regTgId" placeholder="e.g. 123456789 (Find via @userinfobot)">
    </div>

    <div class="auth-form-group">
      <label>Telegram Bot API Token (Created via @BotFather)</label>
      <div class="secret-input-wrap">
        <input type="password" id="regTgToken" placeholder="e.g. 123456789:ABCdefGHIjklMNOpqrsTUVwxyz">
        <button type="button" class="eye-toggle-btn" onclick="toggleSecretVisibility('regTgToken', this)" title="Show Bot Token">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
    </div>

    <button class="btn btn-primary" style="width:100%;margin-top:10px;justify-content:center;padding:11px" onclick="sendSignupOtp()">
      Send 2FA OTP to Telegram
    </button>
  `;
}

async function sendSignupOtp() {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const telegramUsername = document.getElementById('regTgUser').value.trim();
  const telegramUserId = document.getElementById('regTgId').value.trim();
  const telegramBotToken = document.getElementById('regTgToken').value.trim();

  if (!name || !email || !password || !telegramUsername || !telegramUserId || !telegramBotToken) {
    showToast('error', 'Please fill in all registration & Telegram fields');
    return;
  }

  showToast('info', 'Sending 2FA OTP to Telegram...');
  const res = await api('/api/auth/send-signup-otp', {
    method: 'POST',
    body: { name, email, password, telegramUsername, telegramUserId, telegramBotToken }
  });

  if (res.success) {
    showToast('success', res.message);
    renderSignupOtpForm(res.tempId);
  } else {
    showToast('error', res.message);
  }
}

function renderSignupOtpForm(tempId) {
  const card = document.getElementById('authCard');
  card.innerHTML = `
    <h1>
      <svg width="22" height="22" fill="none" stroke="var(--brand)" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      Enter Telegram OTP
    </h1>
    <div class="auth-subtitle">We sent a 6-digit OTP verification code to your Telegram account.</div>

    <div class="auth-form-group">
      <label>6-Digit Telegram OTP Code</label>
      <input type="text" id="signupOtpCode" class="mono" placeholder="123456" maxlength="6" style="letter-spacing:4px;font-size:18px;text-align:center" onkeydown="if(event.key==='Enter')verifySignupOtp('${tempId}')">
    </div>

    <div style="display:flex;gap:10px;margin-top:20px">
      <button class="btn btn-ghost" style="flex:1;justify-content:center" onclick="renderSignupForm()">Back</button>
      <button class="btn btn-primary" style="flex:2;justify-content:center" onclick="verifySignupOtp('${tempId}')">Verify & Create Account</button>
    </div>
  `;
}

async function verifySignupOtp(tempId) {
  const otp = document.getElementById('signupOtpCode').value.trim();
  if (!otp) { showToast('error', 'Please enter the 6-digit OTP'); return; }

  showToast('info', 'Verifying OTP...');
  const res = await api('/api/auth/verify-signup-otp', {
    method: 'POST',
    body: { tempId, otp }
  });

  if (res.success) {
    localStorage.setItem('dataforge_admin_token', res.token);
    showToast('success', 'Admin account created successfully!');
    location.hash = '#/projects';
    checkAuthStatus().then(ok => { if(ok) handleRoute(); });
  } else {
    showToast('error', res.message);
  }
}

function renderLoginForm() {
  const card = document.getElementById('authCard');
  card.innerHTML = `
    <h1>
      <svg width="22" height="22" fill="none" stroke="var(--brand)" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      Security Authentication
    </h1>
    <div class="auth-subtitle">Enter your password. A 2FA verification OTP will be sent to your registered Telegram ID.</div>

    <div class="auth-form-group">
      <label>Account Password</label>
      <div class="secret-input-wrap">
        <input type="password" id="loginPassword" placeholder="Enter master password" onkeydown="if(event.key==='Enter')submitLoginStep1()">
        <button type="button" class="eye-toggle-btn" onclick="toggleSecretVisibility('loginPassword', this)" title="Show Password">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;margin-bottom:20px">
      <a onclick="showForgotPasswordModal()" style="font-size:12.5px;color:var(--brand);cursor:pointer;text-decoration:none;font-weight:500">Forgot Password?</a>
    </div>

    <button class="btn btn-primary" style="width:100%;justify-content:center;padding:11px" onclick="submitLoginStep1()">
      Send 2FA Telegram OTP
    </button>
  `;
}

async function submitLoginStep1() {
  const password = document.getElementById('loginPassword').value;
  if (!password) { showToast('error', 'Please enter your password'); return; }

  showToast('info', 'Validating password & sending Telegram OTP...');
  const res = await api('/api/auth/login-step1', {
    method: 'POST',
    body: { password }
  });

  if (res.success) {
    showToast('success', res.message);
    renderLoginOtpForm(res.tempId);
  } else {
    showToast('error', res.message);
  }
}

function renderLoginOtpForm(tempId) {
  const card = document.getElementById('authCard');
  card.innerHTML = `
    <h1>
      <svg width="22" height="22" fill="none" stroke="var(--brand)" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      Enter Telegram 2FA OTP
    </h1>
    <div class="auth-subtitle">Check your Telegram bot. Enter the 6-digit OTP code sent to your chat.</div>

    <div class="auth-form-group">
      <label>6-Digit OTP Code</label>
      <input type="text" id="loginOtpCode" class="mono" placeholder="123456" maxlength="6" style="letter-spacing:4px;font-size:18px;text-align:center" onkeydown="if(event.key==='Enter')submitLoginStep2('${tempId}')">
    </div>

    <div style="display:flex;gap:10px;margin-top:20px">
      <button class="btn btn-ghost" style="flex:1;justify-content:center" onclick="renderLoginForm()">Back</button>
      <button class="btn btn-primary" style="flex:2;justify-content:center" onclick="submitLoginStep2('${tempId}')">Verify & Sign In</button>
    </div>
  `;
}

async function submitLoginStep2(tempId) {
  const otp = document.getElementById('loginOtpCode').value.trim();
  if (!otp) { showToast('error', 'Please enter the 6-digit OTP'); return; }

  showToast('info', 'Verifying OTP...');
  const res = await api('/api/auth/login-step2', {
    method: 'POST',
    body: { tempId, otp }
  });

  if (res.success) {
    localStorage.setItem('dataforge_admin_token', res.token);
    showToast('success', 'Logged in successfully!');
    location.hash = '#/projects';
    checkAuthStatus().then(ok => { if(ok) handleRoute(); });
  } else {
    showToast('error', res.message);
  }
}

async function showForgotPasswordModal() {
  showToast('info', 'Sending password reset OTP to your Telegram...');
  const res = await api('/api/auth/forgot-step1', { method: 'POST' });

  if (res.success) {
    showToast('success', res.message);
    const card = document.getElementById('authCard');
    card.innerHTML = `
      <h1>
        <svg width="22" height="22" fill="none" stroke="var(--brand)" stroke-width="2" viewBox="0 0 24 24"><path d="M21 2l-2 2m-2-2l2 2M3 13.5V21h7.5L21 10.5 13.5 3 3 13.5z"/></svg>
        Reset Password
      </h1>
      <div class="auth-subtitle">An OTP was sent to your Telegram. Enter the code and set your new password.</div>

      <div class="auth-form-group">
        <label>6-Digit Telegram OTP Code</label>
        <input type="text" id="forgotOtpCode" class="mono" placeholder="123456" maxlength="6" style="letter-spacing:4px;font-size:18px;text-align:center">
      </div>

      <div class="auth-form-group">
        <label>New Master Password</label>
        <div class="secret-input-wrap">
          <input type="password" id="forgotNewPassword" placeholder="Minimum 6 characters">
          <button type="button" class="eye-toggle-btn" onclick="toggleSecretVisibility('forgotNewPassword', this)" title="Show Password">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>

      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn btn-ghost" style="flex:1;justify-content:center" onclick="renderLoginForm()">Cancel</button>
        <button class="btn btn-primary" style="flex:2;justify-content:center" onclick="submitForgotStep2('${res.tempId}')">Reset Password</button>
      </div>
    `;
  } else {
    showToast('error', res.message);
  }
}

async function submitForgotStep2(tempId) {
  const otp = document.getElementById('forgotOtpCode').value.trim();
  const newPassword = document.getElementById('forgotNewPassword').value;

  if (!otp || !newPassword) { showToast('error', 'Please enter OTP and new password'); return; }

  showToast('info', 'Resetting password...');
  const res = await api('/api/auth/forgot-step2', {
    method: 'POST',
    body: { tempId, otp, newPassword }
  });

  if (res.success) {
    showToast('success', res.message);
    renderLoginForm();
  } else {
    showToast('error', res.message);
  }
}

function showAccountSettingsModal() {
  const u = currentUser || {};
  showModal(`
    <div style="padding:4px">
      <h2 style="font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:6px;display:flex;align-items:center;gap:10px">
        <svg width="20" height="20" fill="none" stroke="var(--brand)" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Master Security & Account Settings
      </h2>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:20px">Manage your local admin credentials, phone number, and Telegram 2FA configuration.</p>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:14px">
        <div class="auth-form-group" style="margin:0">
          <label>Admin Name</label>
          <input type="text" id="modalAdminName" value="${escapeHtml(u.name || '')}" placeholder="e.g. Udoy Mistry">
        </div>
        <div class="auth-form-group" style="margin:0">
          <label>Admin Email</label>
          <input type="email" id="modalAdminEmail" value="${escapeHtml(u.email || '')}" placeholder="e.g. udoymistry@gmail.com">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:14px">
        <div class="auth-form-group" style="margin:0">
          <label>Telegram Username</label>
          <input type="text" id="modalTgUser" value="${escapeHtml(u.telegram_username || '')}" placeholder="e.g. @udoymistry">
        </div>
        <div class="auth-form-group" style="margin:0">
          <label>Telegram User ID / Chat ID</label>
          <input type="text" id="modalTgId" value="${escapeHtml(u.telegram_user_id || '')}" placeholder="e.g. 123456789">
        </div>
      </div>

      <div class="auth-form-group" style="margin-bottom:14px">
        <label>Telegram Bot API Token</label>
        <div class="secret-input-wrap">
          <input type="password" id="modalTgToken" value="${escapeHtml(u.telegram_bot_token || '')}" placeholder="123456789:ABC..." class="mono" style="font-size:12px">
          <button type="button" class="eye-toggle-btn" onclick="toggleSecretVisibility('modalTgToken', this)" title="Show Bot Token">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>

      <div class="auth-form-group" style="margin-bottom:24px">
        <label>New Master Password (Optional)</label>
        <div class="secret-input-wrap">
          <input type="password" id="modalNewPass" placeholder="Leave empty to keep existing password">
          <button type="button" class="eye-toggle-btn" onclick="toggleSecretVisibility('modalNewPass', this)" title="Show Password">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border);padding-top:18px">
        <button class="btn btn-ghost" style="color:var(--red);border:1px solid rgba(239,68,68,0.3)" onclick="closeModal();handleLogout()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign Out / Logout
        </button>

        <div style="display:flex;gap:10px">
          <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveModalAccountSettings()">Save Settings</button>
        </div>
      </div>
    </div>
  `);

  api('/api/auth/profile').then(res => {
    if (res.success && res.user) {
      currentUser = res.user;
      const n = document.getElementById('modalAdminName');
      const e = document.getElementById('modalAdminEmail');
      const u = document.getElementById('modalTgUser');
      const i = document.getElementById('modalTgId');
      const t = document.getElementById('modalTgToken');
      if (n) n.value = res.user.name || '';
      if (e) e.value = res.user.email || '';
      if (u) u.value = res.user.telegram_username || '';
      if (i) i.value = res.user.telegram_user_id || '';
      if (t) t.value = res.user.telegram_bot_token || '';
    }
  });
}

async function saveModalAccountSettings() {
  const name = document.getElementById('modalAdminName').value.trim();
  const email = document.getElementById('modalAdminEmail').value.trim();
  const telegramUsername = document.getElementById('modalTgUser').value.trim();
  const telegramUserId = document.getElementById('modalTgId').value.trim();
  const telegramBotToken = document.getElementById('modalTgToken').value.trim();
  const newPassword = document.getElementById('modalNewPass').value.trim();

  showToast('info', 'Saving settings...');
  const res = await api('/api/auth/profile', {
    method: 'POST',
    body: { name, email, telegramUsername, telegramUserId, telegramBotToken }
  });

  if (res.success) {
    currentUser = res.user;
  }

  if (newPassword) {
    if (newPassword.length < 6) {
      showToast('error', 'New password must be at least 6 characters');
      return;
    }
    showToast('info', 'Sending 2FA OTP to Telegram to verify password change...');
    const passRes = await api('/api/auth/send-passchange-otp', {
      method: 'POST',
      body: { newPassword }
    });

    if (passRes.success) {
      showToast('success', passRes.message);
      showPassChangeOtpModal(passRes.tempId);
    } else {
      showToast('error', passRes.message);
    }
  } else {
    showToast('success', 'Profile & Security settings saved successfully!');
    closeModal();
  }
}

function showPassChangeOtpModal(tempId) {
  showModal(`
    <div style="padding:4px">
      <h2 style="font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:6px;display:flex;align-items:center;gap:10px">
        <svg width="20" height="20" fill="none" stroke="var(--brand)" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Confirm Password Change (2FA)
      </h2>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:20px">We sent a 6-digit verification code to your Telegram account. Enter the OTP below to confirm changing your password.</p>

      <div class="auth-form-group" style="margin-bottom:20px">
        <label>6-Digit Telegram OTP Code</label>
        <input type="text" id="passChangeOtpCode" class="mono" placeholder="123456" maxlength="6" style="letter-spacing:4px;font-size:18px;text-align:center" onkeydown="if(event.key==='Enter')verifyPassChangeOtp('${tempId}')">
      </div>

      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" style="flex:1;justify-content:center" onclick="showAccountSettingsModal()">Cancel</button>
        <button class="btn btn-primary" style="flex:2;justify-content:center" onclick="verifyPassChangeOtp('${tempId}')">Verify & Change Password</button>
      </div>
    </div>
  `);
}

async function verifyPassChangeOtp(tempId) {
  const otp = document.getElementById('passChangeOtpCode').value.trim();
  if (!otp) { showToast('error', 'Please enter the 6-digit OTP code'); return; }

  showToast('info', 'Verifying 2FA OTP...');
  const res = await api('/api/auth/verify-passchange-otp', {
    method: 'POST',
    body: { tempId, otp }
  });

  if (res.success) {
    showToast('success', 'Password updated successfully!');
    closeModal();
  } else {
    showToast('error', res.message);
  }
}

function handleLogout() {
  localStorage.removeItem('dataforge_admin_token');
  currentUser = null;
  showToast('success', 'Logged out successfully');
  checkAuthStatus();
}

// ====================================================================
// Init
// ====================================================================

function onNavigationEvent() {
  const modal = document.getElementById('modalOverlay');
  if (modal && modal.classList.contains('active')) {
    closeModal();
  }
  closeMobileSidebar();
  handleRoute();
}

window.addEventListener('hashchange', onNavigationEvent);
window.addEventListener('popstate', onNavigationEvent);

window.addEventListener('DOMContentLoaded', () => {
  checkHealth();
  checkAuthStatus().then(isAuthenticated => {
    if (isAuthenticated) {
      handleRoute();
    }
  });
});
