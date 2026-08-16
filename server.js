require('dotenv').config();
const express = require('express');
const { Pool, Client } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PLATFORM_PORT || 4000;
const DB_HOST = process.env.POSTGRES_HOST || 'localhost';
const DB_PORT = process.env.POSTGRES_PORT || 5432;
const DB_USER = process.env.POSTGRES_USER || 'postgres';
const DB_PASS = process.env.POSTGRES_PASSWORD || 'udoybase_secure_2026';
const JWT_SECRET = process.env.JWT_SECRET || 'udoybase-jwt-secret-key-must-be-at-least-32-chars-long';

app.use(cors());
app.use(express.json({ limit: '1000tb' }));
app.use(express.urlencoded({ limit: '1000tb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Master pool connects to the system 'postgres' database
const masterPool = new Pool({
  host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS, database: 'postgres',
});

// System databases to exclude from project listing
const SYSTEM_DBS = ['postgres', 'template0', 'template1'];

// --- Helpers ---

function generateRandomPassword(length = 16) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let pass = '';
  for (let i = 0; i < length; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'df_' + pass;
}

function generateJwtKeys(projectName) {
  const anonPayload = {
    iss: 'udoybase', ref: projectName, role: 'anon',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 365 * 10,
  };
  const servicePayload = { ...anonPayload, role: 'service_role' };
  return {
    anonKey: jwt.sign(anonPayload, JWT_SECRET),
    serviceRoleKey: jwt.sign(servicePayload, JWT_SECRET),
  };
}

function connString(dbName, user = DB_USER, pass = DB_PASS, host = DB_HOST) {
  return `postgresql://${user}:${pass}@${host}:${DB_PORT}/${dbName}`;
}

async function getProjectClient(dbName) {
  const client = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS, database: dbName });
  await client.connect();
  return client;
}

async function getProjectCredentials(dbName) {
  try {
    const res = await masterPool.query('SELECT db_user, db_password FROM _udoybase_project_credentials WHERE project_name = $1', [dbName]);
    if (res.rows.length > 0) {
      return { dbUser: res.rows[0].db_user, dbPassword: res.rows[0].db_password };
    }

    // Auto-migrate legacy or missing project
    const dbUser = `${dbName}_user`;
    const dbPassword = generateRandomPassword();

    await masterPool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${dbUser}') THEN
          CREATE ROLE "${dbUser}" WITH LOGIN PASSWORD '${dbPassword}';
        ELSE
          ALTER ROLE "${dbUser}" WITH LOGIN PASSWORD '${dbPassword}';
        END IF;
      END
      $$;
    `);
    await masterPool.query(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}"`);

    try {
      const c = await getProjectClient(dbName);
      await c.query(`GRANT ALL ON SCHEMA public TO "${dbUser}"`);
      await c.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${dbUser}"`);
      await c.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${dbUser}"`);
      await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${dbUser}"`);
      await c.end();
    } catch(err) {
      console.error('Error setting public schema grants for role:', err.message);
    }

    await masterPool.query(
      `INSERT INTO _udoybase_project_credentials (project_name, db_user, db_password) VALUES ($1, $2, $3)
       ON CONFLICT (project_name) DO UPDATE SET db_user = $2, db_password = $3, updated_at = NOW()`,
      [dbName, dbUser, dbPassword]
    );

    return { dbUser, dbPassword };
  } catch (e) {
    console.error('Failed to get/create project credentials:', e.message);
    return { dbUser: DB_USER, dbPassword: DB_PASS };
  }
}

// ====================================================================
// Authentication & Telegram 2FA System
// ====================================================================

const crypto = require('crypto');

async function initAuthDb() {
  try {
    await masterPool.query(`
      CREATE TABLE IF NOT EXISTS _udoybase_admin_users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        telegram_username TEXT NOT NULL,
        telegram_user_id TEXT NOT NULL,
        telegram_bot_token TEXT NOT NULL,
        avatar_url TEXT DEFAULT '/images/developer.jpg',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS _udoybase_project_credentials (
        project_name TEXT PRIMARY KEY,
        db_user TEXT NOT NULL,
        db_password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (e) {
    console.error('Failed to init auth DB table:', e.message);
  }
}
initAuthDb();

function hashPassword(password) {
  return crypto.pbkdf2Sync(password, 'udoybase_salt_2026', 100000, 64, 'sha512').toString('hex');
}

const pendingOtps = new Map();

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendTelegramOtp(botToken, chatId, otpCode, purpose = 'Verification') {
  const text = `⚡ <b>Udoy Base Security Verification</b>\n\nYour 2FA OTP Code for <b>${purpose}</b> is:\n\n<code>${otpCode}</code>\n\n<i>This code is valid for 5 minutes. Do NOT share it with anyone.</i>`;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: `📋 Copy OTP: ${otpCode}`,
            copy_text: { text: otpCode }
          }
        ]
      ]
    }
  };

  let res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data = await res.json();
  
  if (!data.ok) {
    // Fallback without inline button if copy_text isn't supported by older bot father scope
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' }),
    });
    data = await res.json();
  }

  if (!data.ok) {
    throw new Error(data.description || 'Telegram Bot API error. Please check your Bot Token & Chat ID.');
  }
  return true;
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/, '') || req.query.token;
  if (!token) return res.status(401).json({ success: false, message: 'Unauthorized. Please login.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.scope !== 'udoybase_admin') throw new Error('Invalid token scope');
    req.adminUser = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Session expired. Please login.' });
  }
}

// ====================================================================
// Auth Routes
// ====================================================================

app.get('/api/auth/status', async (req, res) => {
  try {
    const r = await masterPool.query('SELECT id, name, email, telegram_username, telegram_user_id, avatar_url FROM _udoybase_admin_users LIMIT 1');
    const isRegistered = r.rows.length > 0;
    let isAuthenticated = false;
    let user = null;

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/, '');
    if (token && isRegistered) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.scope === 'udoybase_admin') {
          isAuthenticated = true;
          user = r.rows[0];
        }
      } catch (e) {}
    }

    res.json({ success: true, isRegistered, isAuthenticated, user });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/send-signup-otp', async (req, res) => {
  const { name, email, password, telegramUsername, telegramUserId, telegramBotToken } = req.body;
  if (!name || !email || !password || !telegramUsername || !telegramUserId || !telegramBotToken) {
    return res.status(400).json({ success: false, message: 'All registration fields are required' });
  }
  try {
    const otp = generateOtp();
    await sendTelegramOtp(telegramBotToken, telegramUserId, otp, 'Account Setup');
    const tempId = crypto.randomUUID();
    pendingOtps.set(tempId, {
      type: 'signup',
      otp,
      data: { name, email, password, telegramUsername, telegramUserId, telegramBotToken },
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    res.json({ success: true, tempId, message: 'Verification OTP sent to your Telegram account!' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/verify-signup-otp', async (req, res) => {
  const { tempId, otp } = req.body;
  const pending = pendingOtps.get(tempId);
  if (!pending || pending.expiresAt < Date.now()) {
    return res.status(400).json({ success: false, message: 'OTP expired or invalid' });
  }
  if (pending.otp !== (otp || '').trim()) {
    return res.status(400).json({ success: false, message: 'Incorrect OTP code' });
  }

  const { name, email, password, telegramUsername, telegramUserId, telegramBotToken } = pending.data;
  const passwordHash = hashPassword(password);

  try {
    await masterPool.query('DELETE FROM _udoybase_admin_users');
    const r = await masterPool.query(
      `INSERT INTO _udoybase_admin_users (name, email, password_hash, telegram_username, telegram_user_id, telegram_bot_token)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, telegram_username, telegram_user_id`,
      [name, email, passwordHash, telegramUsername, telegramUserId, telegramBotToken]
    );
    pendingOtps.delete(tempId);

    const token = jwt.sign({ id: r.rows[0].id, email: r.rows[0].email, scope: 'udoybase_admin' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: r.rows[0], message: 'Account created successfully!' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/login-step1', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ success: false, message: 'Password required' });

  try {
    const r = await masterPool.query('SELECT * FROM _udoybase_admin_users LIMIT 1');
    if (!r.rows.length) return res.status(400).json({ success: false, message: 'No admin account found. Please sign up.' });

    const admin = r.rows[0];
    if (hashPassword(password) !== admin.password_hash) {
      return res.status(400).json({ success: false, message: 'Incorrect password' });
    }

    const otp = generateOtp();
    await sendTelegramOtp(admin.telegram_bot_token, admin.telegram_user_id, otp, 'Account Login');

    const tempId = crypto.randomUUID();
    pendingOtps.set(tempId, {
      type: 'login',
      otp,
      adminId: admin.id,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    res.json({ success: true, tempId, message: 'OTP code sent to your Telegram!' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/login-step2', async (req, res) => {
  const { tempId, otp } = req.body;
  const pending = pendingOtps.get(tempId);
  if (!pending || pending.expiresAt < Date.now()) {
    return res.status(400).json({ success: false, message: 'OTP expired or invalid' });
  }
  if (pending.otp !== (otp || '').trim()) {
    return res.status(400).json({ success: false, message: 'Incorrect OTP code' });
  }

  const r = await masterPool.query('SELECT id, name, email, telegram_username, telegram_user_id FROM _udoybase_admin_users WHERE id = $1', [pending.adminId]);
  pendingOtps.delete(tempId);

  if (!r.rows.length) return res.status(400).json({ success: false, message: 'Admin account not found' });

  const token = jwt.sign({ id: r.rows[0].id, email: r.rows[0].email, scope: 'udoybase_admin' }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ success: true, token, user: r.rows[0], message: 'Login successful!' });
});

app.post('/api/auth/forgot-step1', async (req, res) => {
  try {
    const r = await masterPool.query('SELECT * FROM _udoybase_admin_users LIMIT 1');
    if (!r.rows.length) return res.status(400).json({ success: false, message: 'No admin account configured.' });

    const admin = r.rows[0];
    const otp = generateOtp();
    await sendTelegramOtp(admin.telegram_bot_token, admin.telegram_user_id, otp, 'Password Reset');

    const tempId = crypto.randomUUID();
    pendingOtps.set(tempId, {
      type: 'forgot',
      otp,
      adminId: admin.id,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    res.json({ success: true, tempId, message: 'Password reset OTP sent to your Telegram!' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/forgot-step2', async (req, res) => {
  const { tempId, otp, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

  const pending = pendingOtps.get(tempId);
  if (!pending || pending.expiresAt < Date.now() || pending.type !== 'forgot') {
    return res.status(400).json({ success: false, message: 'OTP expired or invalid' });
  }
  if (pending.otp !== (otp || '').trim()) {
    return res.status(400).json({ success: false, message: 'Incorrect OTP code' });
  }

  const passwordHash = hashPassword(newPassword);
  await masterPool.query('UPDATE _udoybase_admin_users SET password_hash = $1 WHERE id = $2', [passwordHash, pending.adminId]);
  pendingOtps.delete(tempId);

  res.json({ success: true, message: 'Password reset successfully! Please login with your new password.' });
});

app.get('/api/auth/profile', authMiddleware, async (req, res) => {
  try {
    const r = await masterPool.query('SELECT id, name, email, telegram_username, telegram_user_id, telegram_bot_token FROM _udoybase_admin_users WHERE id = $1', [req.adminUser.id]);
    if (!r.rows.length) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/send-passchange-otp', authMiddleware, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }
  try {
    const r = await masterPool.query('SELECT * FROM _udoybase_admin_users WHERE id = $1', [req.adminUser.id]);
    if (!r.rows.length) return res.status(400).json({ success: false, message: 'User not found' });
    const admin = r.rows[0];

    const otp = generateOtp();
    await sendTelegramOtp(admin.telegram_bot_token, admin.telegram_user_id, otp, 'Password Change');

    const tempId = crypto.randomUUID();
    pendingOtps.set(tempId, {
      type: 'passchange',
      otp,
      newPassword,
      adminId: admin.id,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    res.json({ success: true, tempId, message: 'Verification OTP sent to your Telegram to confirm password change!' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/verify-passchange-otp', authMiddleware, async (req, res) => {
  const { tempId, otp } = req.body;
  const pending = pendingOtps.get(tempId);
  if (!pending || pending.expiresAt < Date.now() || pending.type !== 'passchange' || pending.adminId !== req.adminUser.id) {
    return res.status(400).json({ success: false, message: 'OTP expired or invalid' });
  }
  if (pending.otp !== (otp || '').trim()) {
    return res.status(400).json({ success: false, message: 'Incorrect OTP code' });
  }

  const passwordHash = hashPassword(pending.newPassword);
  await masterPool.query('UPDATE _udoybase_admin_users SET password_hash = $1 WHERE id = $2', [passwordHash, pending.adminId]);
  pendingOtps.delete(tempId);

  res.json({ success: true, message: 'Password changed successfully!' });
});

app.post('/api/auth/profile', authMiddleware, async (req, res) => {
  const { name, email, telegramUsername, telegramUserId, telegramBotToken } = req.body;
  try {
    const fields = [];
    const vals = [];
    let idx = 1;

    if (name) { fields.push(`name = $${idx++}`); vals.push(name); }
    if (email) { fields.push(`email = $${idx++}`); vals.push(email); }
    if (telegramUsername) { fields.push(`telegram_username = $${idx++}`); vals.push(telegramUsername); }
    if (telegramUserId) { fields.push(`telegram_user_id = $${idx++}`); vals.push(telegramUserId); }
    if (telegramBotToken) { fields.push(`telegram_bot_token = $${idx++}`); vals.push(telegramBotToken); }

    if (!fields.length) return res.status(400).json({ success: false, message: 'No profile fields to update' });

    vals.push(req.adminUser.id);
    const q = `UPDATE _udoybase_admin_users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, email, telegram_username, telegram_user_id, telegram_bot_token`;
    const r = await masterPool.query(q, vals);
    res.json({ success: true, user: r.rows[0], message: 'Profile & Security settings updated!' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ====================================================================
// API Routes: Health
// ====================================================================

app.get('/api/health', async (req, res) => {
  try {
    const r = await masterPool.query('SELECT version()');
    res.json({ status: 'online', postgres: r.rows[0].version, host: `${DB_HOST}:${DB_PORT}` });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ====================================================================
// API Routes: Projects
// ====================================================================

app.get('/api/projects', async (req, res) => {
  try {
    const dbRows = await masterPool.query(`
      SELECT datname, pg_size_pretty(pg_database_size(datname)) AS size
      FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres','template0','template1')
      ORDER BY datname
    `);
    const projects = await Promise.all(dbRows.rows.map(async (row) => {
      let tableCount = 0;
      try {
        const c = await getProjectClient(row.datname);
        const r = await c.query("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
        tableCount = parseInt(r.rows[0].count, 10);
        await c.end();
      } catch (_) {}
      const keys = generateJwtKeys(row.datname);
      return {
        name: row.datname, size: row.size, tableCount,
        connectionString: connString(row.datname),
        anonKey: keys.anonKey, serviceRoleKey: keys.serviceRoleKey,
        apiUrl: `http://${DB_HOST}:${PORT}`,
      };
    }));
    res.json({ success: true, projects });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/projects', async (req, res) => {
  const rawName = (req.body.name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (!rawName) return res.status(400).json({ success: false, message: 'Project name required' });
  if (SYSTEM_DBS.includes(rawName)) return res.status(400).json({ success: false, message: 'Reserved name' });

  try {
    const exists = await masterPool.query("SELECT 1 FROM pg_database WHERE datname=$1", [rawName]);
    if (exists.rows.length) return res.status(400).json({ success: false, message: `'${rawName}' already exists` });

    await masterPool.query(`CREATE DATABASE "${rawName}"`);

    // Create unique role and password for this project
    const dbUser = `${rawName}_user`;
    const dbPassword = generateRandomPassword();

    await masterPool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${dbUser}') THEN
          CREATE ROLE "${dbUser}" WITH LOGIN PASSWORD '${dbPassword}';
        ELSE
          ALTER ROLE "${dbUser}" WITH LOGIN PASSWORD '${dbPassword}';
        END IF;
      END
      $$;
    `);
    await masterPool.query(`GRANT ALL PRIVILEGES ON DATABASE "${rawName}" TO "${dbUser}"`);

    // Save in _udoybase_project_credentials
    await masterPool.query(
      `INSERT INTO _udoybase_project_credentials (project_name, db_user, db_password) VALUES ($1, $2, $3)
       ON CONFLICT (project_name) DO UPDATE SET db_user = $2, db_password = $3, updated_at = NOW()`,
      [rawName, dbUser, dbPassword]
    );

    // Initialize extensions and schema grants
    const c = await getProjectClient(rawName);
    await c.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
    await c.query(`GRANT ALL ON SCHEMA public TO "${dbUser}"`);
    await c.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${dbUser}"`);
    await c.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${dbUser}"`);
    await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${dbUser}"`);
    await c.end();

    const keys = generateJwtKeys(rawName);
    res.json({
      success: true,
      project: {
        name: rawName, size: '0 bytes', tableCount: 0,
        connectionString: connString(rawName, dbUser, dbPassword),
        anonKey: keys.anonKey, serviceRoleKey: keys.serviceRoleKey,
        apiUrl: `http://${DB_HOST}:${PORT}`,
        user: dbUser, password: dbPassword
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.delete('/api/projects/:name', async (req, res) => {
  const dbName = req.params.name;
  if (SYSTEM_DBS.includes(dbName)) return res.status(400).json({ success: false, message: 'Cannot delete system db' });
  try {
    const creds = await getProjectCredentials(dbName);
    await masterPool.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`, [dbName]);
    await masterPool.query(`DROP DATABASE IF EXISTS "${dbName}"`);

    // Drop dedicated PG role if exists
    if (creds.dbUser && creds.dbUser !== DB_USER) {
      await masterPool.query(`DROP ROLE IF EXISTS "${creds.dbUser}"`);
    }

    // Clean metadata
    await masterPool.query(`DELETE FROM _udoybase_project_credentials WHERE project_name = $1`, [dbName]);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/projects/:name/info', async (req, res) => {
  const dbName = req.params.name;
  try {
    const sizeR = await masterPool.query("SELECT pg_size_pretty(pg_database_size($1)) AS size", [dbName]);
    const c = await getProjectClient(dbName);
    const tblR = await c.query("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
    await c.end();

    const creds = await getProjectCredentials(dbName);
    const keys = generateJwtKeys(dbName);

    // Auto-detect host IP / domain name from incoming request (ideal for VPS deployments)
    const hostHeader = req.headers.host ? req.headers.host.split(':')[0] : null;
    const detectedHost = process.env.POSTGRES_PUBLIC_HOST || hostHeader || DB_HOST;

    res.json({
      success: true,
      info: {
        name: dbName, size: sizeR.rows[0].size,
        tableCount: parseInt(tblR.rows[0].count, 10),
        connectionString: connString(dbName, creds.dbUser, creds.dbPassword, detectedHost),
        anonKey: keys.anonKey, serviceRoleKey: keys.serviceRoleKey,
        host: detectedHost, port: DB_PORT, user: creds.dbUser, password: creds.dbPassword,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.put('/api/projects/:name/credentials', async (req, res) => {
  const dbName = req.params.name;
  const { password } = req.body;
  if (!password || password.trim().length < 4) {
    return res.status(400).json({ success: false, message: 'Password must be at least 4 characters long' });
  }

  try {
    const creds = await getProjectCredentials(dbName);
    const dbUser = creds.dbUser;
    const newPass = password.trim();

    // Update PostgreSQL role password
    await masterPool.query(`ALTER ROLE "${dbUser}" WITH PASSWORD '${newPass.replace(/'/g, "''")}'`);

    // Update metadata table
    await masterPool.query(
      `UPDATE _udoybase_project_credentials SET db_password = $1, updated_at = NOW() WHERE project_name = $2`,
      [newPass, dbName]
    );

    res.json({
      success: true,
      message: 'Password updated successfully!',
      user: dbUser,
      password: newPass,
      connectionString: connString(dbName, dbUser, newPass)
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ====================================================================
// API Routes: Tables
// ====================================================================

app.get('/api/projects/:name/tables', async (req, res) => {
  try {
    const c = await getProjectClient(req.params.name);
    const tblR = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
    const tables = await Promise.all(tblR.rows.map(async (t) => {
      const colR = await c.query("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [t.table_name]);
      const cntR = await c.query(`SELECT count(*) FROM "${t.table_name}"`);
      // Get primary key
      const pkR = await c.query(`SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid='"${t.table_name}"'::regclass AND i.indisprimary`);
      return {
        name: t.table_name,
        rowCount: parseInt(cntR.rows[0].count, 10),
        columns: colR.rows,
        primaryKey: pkR.rows.length ? pkR.rows[0].attname : null,
      };
    }));
    await c.end();
    res.json({ success: true, tables });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/projects/:name/tables', async (req, res) => {
  const { tableName, columns } = req.body;
  if (!tableName || !columns || !columns.length) return res.status(400).json({ success: false, message: 'tableName and columns required' });

  const colDefs = columns.map(c => {
    let def = `"${c.name}" ${c.type}`;
    if (c.primaryKey) def += ' PRIMARY KEY';
    if (c.notNull && !c.primaryKey) def += ' NOT NULL';
    if (c.defaultValue) def += ` DEFAULT ${c.defaultValue}`;
    return def;
  }).join(', ');

  try {
    const c = await getProjectClient(req.params.name);
    await c.query(`CREATE TABLE "${tableName}" (${colDefs})`);
    await c.end();
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/projects/:name/tables/:table', async (req, res) => {
  try {
    const c = await getProjectClient(req.params.name);
    await c.query(`DROP TABLE IF EXISTS "${req.params.table}" CASCADE`);
    await c.end();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ====================================================================
// API Routes: Rows
// ====================================================================

app.get('/api/projects/:name/tables/:table/rows', async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  try {
    const c = await getProjectClient(req.params.name);
    const r = await c.query(`SELECT * FROM "${req.params.table}" LIMIT $1 OFFSET $2`, [limit, offset]);
    const cnt = await c.query(`SELECT count(*) FROM "${req.params.table}"`);
    await c.end();
    res.json({
      success: true,
      rows: r.rows,
      fields: r.fields.map(f => f.name),
      totalRows: parseInt(cnt.rows[0].count, 10),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

async function sanitizeRowData(client, tableName, dataObj) {
  try {
    const colRes = await client.query(
      `SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    );
    const colTypes = {};
    colRes.rows.forEach(r => {
      colTypes[r.column_name] = (r.data_type || r.udt_name || '').toLowerCase();
    });

    const sanitized = {};
    for (const k of Object.keys(dataObj)) {
      let val = dataObj[k];
      const type = colTypes[k] || '';

      if (type.includes('json')) {
        if (val === '' || val === null || val === undefined) {
          val = null;
        } else if (typeof val === 'string') {
          val = val.trim();
          if (!val || val === '[object Object]') {
            val = null;
          } else {
            try {
              val = JSON.stringify(JSON.parse(val));
            } catch (e) {
              try { val = JSON.stringify(val); } catch (err) { val = null; }
            }
          }
        } else if (typeof val === 'object') {
          val = JSON.stringify(val);
        }
      } else if (type.includes('int') || type.includes('num') || type.includes('float') || type.includes('decimal') || type.includes('double')) {
        if (val === '' || val === null || val === undefined) {
          val = null;
        } else if (typeof val === 'string' && !isNaN(val.trim()) && val.trim() !== '') {
          val = Number(val.trim());
        }
      } else if (type.includes('bool')) {
        if (val === '' || val === null || val === undefined) {
          val = null;
        } else if (typeof val === 'string') {
          const lower = val.trim().toLowerCase();
          val = (lower === 'true' || lower === '1');
        }
      } else if (type.includes('timestamp') || type.includes('date') || type.includes('time') || type.includes('uuid')) {
        if (val === '' || val === null || val === undefined) {
          val = null;
        }
      } else if (type.includes('array') || type.includes('[]') || type.startsWith('_')) {
        if (val === '' || val === null || val === undefined) {
          val = null;
        } else if (typeof val === 'string' && val.trim().startsWith('[') && val.trim().endsWith(']')) {
          try { val = JSON.parse(val.trim()); } catch (e) {}
        }
      }

      sanitized[k] = val;
    }
    return sanitized;
  } catch (e) {
    return dataObj;
  }
}

app.post('/api/projects/:name/tables/:table/rows', async (req, res) => {
  const rawData = req.body;
  if (!rawData || !Object.keys(rawData).length) return res.status(400).json({ success: false, message: 'Row data required' });
  try {
    const c = await getProjectClient(req.params.name);
    const data = await sanitizeRowData(c, req.params.table, rawData);
    const keys = Object.keys(data);
    const cols = keys.map(k => `"${k}"`).join(', ');
    const vals = keys.map((_, i) => `$${i + 1}`).join(', ');
    const r = await c.query(`INSERT INTO "${req.params.table}" (${cols}) VALUES (${vals}) RETURNING *`, keys.map(k => data[k]));
    await c.end();
    res.json({ success: true, row: r.rows[0] });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.put('/api/projects/:name/tables/:table/rows', async (req, res) => {
  const { column, value, data: rawData } = req.body;
  if (!column || value === undefined || !rawData || !Object.keys(rawData).length) {
    return res.status(400).json({ success: false, message: 'column, value, and data object required' });
  }

  try {
    const c = await getProjectClient(req.params.name);
    const data = await sanitizeRowData(c, req.params.table, rawData);
    const keys = Object.keys(data);
    const setClauses = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
    const vals = keys.map(k => data[k]);
    vals.push(value);

    const q = `UPDATE "${req.params.table}" SET ${setClauses} WHERE "${column}" = $${vals.length} RETURNING *`;
    const r = await c.query(q, vals);
    await c.end();
    if (!r.rows.length) {
      return res.status(404).json({ success: false, message: 'Row not found or no changes made' });
    }
    res.json({ success: true, row: r.rows[0] });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/projects/:name/tables/:table/rows', async (req, res) => {
  const { column, value } = req.body;
  if (!column || value === undefined) return res.status(400).json({ success: false, message: 'column and value required' });
  try {
    const c = await getProjectClient(req.params.name);
    await c.query(`DELETE FROM "${req.params.table}" WHERE "${column}" = $1`, [value]);
    await c.end();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ====================================================================
// API Routes: SQL Editor
// ====================================================================

app.post('/api/projects/:name/query', async (req, res) => {
  const { sql } = req.body;
  if (!sql) return res.status(400).json({ success: false, message: 'SQL required' });
  try {
    const c = await getProjectClient(req.params.name);
    const start = Date.now();
    const r = await c.query(sql);
    const ms = Date.now() - start;
    await c.end();
    res.json({
      success: true, command: r.command, rowCount: r.rowCount,
      rows: r.rows || [], fields: r.fields ? r.fields.map(f => f.name) : [],
      executionTimeMs: ms,
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ====================================================================
// API Routes: Database Backup & Import (GUI Support)
// ====================================================================

// ====================================================================
// API Routes: Database Backup & Import (Unlimited Streaming Support)
// ====================================================================

const { exec, spawn } = require('child_process');

app.get('/api/projects/:name/export', (req, res) => {
  const proj = req.params.name.replace(/[^a-zA-Z0-9_]/g, '');

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', `attachment; filename="${proj}_backup.sql"`);

  // Stream pg_dump output chunk-by-chunk directly to HTTP response (0 RAM overhead)
  const child = spawn('docker', ['exec', 'udoybase-db', 'pg_dump', '-U', 'postgres', proj]);

  child.stdout.pipe(res);

  child.stderr.on('data', (data) => {
    console.error(`Export stderr [${proj}]:`, data.toString());
  });

  child.on('error', (err) => {
    console.error(`Export process error [${proj}]:`, err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
});

app.post('/api/projects/:name/import', (req, res) => {
  const proj = req.params.name.replace(/[^a-zA-Z0-9_]/g, '');

  // Spawn psql CLI engine with strict error reporting
  const child = spawn('docker', ['exec', '-i', 'udoybase-db', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', proj]);

  let stderrData = '';
  child.stderr.on('data', (d) => {
    stderrData += d.toString();
  });

  child.on('close', (code) => {
    const hasRealError = stderrData.includes('ERROR:') || (code !== 0 && !stderrData.includes('NOTICE'));
    if (hasRealError) {
      console.error(`Import error [${proj}]:`, stderrData);
      const cleanErr = stderrData.split('\n').filter(line => line.includes('ERROR:')).join('; ') || stderrData;
      return res.status(400).json({ success: false, message: cleanErr.trim() });
    }

    // Auto-grant permissions on newly imported tables & sequences to the dedicated project user
    getProjectCredentials(proj).then(creds => {
      if (creds && creds.dbUser && creds.dbUser !== DB_USER) {
        masterPool.query(`GRANT ALL PRIVILEGES ON DATABASE "${proj}" TO "${creds.dbUser}"`).catch(() => {});
        getProjectClient(proj).then(async (c) => {
          try {
            await c.query(`GRANT ALL ON SCHEMA public TO "${creds.dbUser}"`);
            await c.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${creds.dbUser}"`);
            await c.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${creds.dbUser}"`);
            await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${creds.dbUser}"`);
            await c.end();
          } catch (e) {}
        }).catch(() => {});
      }
    });

    res.json({ success: true, message: 'Database schema and data imported successfully!' });
  });

  child.on('error', (err) => {
    console.error(`Import spawn error [${proj}]:`, err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Support both JSON body payload and raw HTTP stream piping
  if (req.body && typeof req.body.sql === 'string' && req.body.sql.length > 0) {
    child.stdin.write(req.body.sql);
    child.stdin.end();
  } else {
    req.pipe(child.stdin);
  }
});

// ====================================================================
// SPA Fallback
// ====================================================================

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  ⚡ Udoy Base is running at http://localhost:${PORT}\n`);
});
