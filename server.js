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
const DB_PASS = process.env.POSTGRES_PASSWORD || 'dataforge_secure_2026';
const JWT_SECRET = process.env.JWT_SECRET || 'dataforge-jwt-secret-key-must-be-at-least-32-chars-long';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Master pool connects to the system 'postgres' database
const masterPool = new Pool({
  host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS, database: 'postgres',
});

// System databases to exclude from project listing
const SYSTEM_DBS = ['postgres', 'template0', 'template1'];

// --- Helpers ---

function generateJwtKeys(projectName) {
  const anonPayload = {
    iss: 'dataforge', ref: projectName, role: 'anon',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 365 * 10,
  };
  const servicePayload = { ...anonPayload, role: 'service_role' };
  return {
    anonKey: jwt.sign(anonPayload, JWT_SECRET),
    serviceRoleKey: jwt.sign(servicePayload, JWT_SECRET),
  };
}

function connString(dbName) {
  return `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${dbName}`;
}

async function getProjectClient(dbName) {
  const client = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS, database: dbName });
  await client.connect();
  return client;
}

// ====================================================================
// Authentication & Telegram 2FA System
// ====================================================================

const crypto = require('crypto');

async function initAuthDb() {
  try {
    await masterPool.query(`
      CREATE TABLE IF NOT EXISTS _dataforge_admin_users (
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
    `);
  } catch (e) {
    console.error('Failed to init auth DB table:', e.message);
  }
}
initAuthDb();

function hashPassword(password) {
  return crypto.pbkdf2Sync(password, 'dataforge_salt_2026', 100000, 64, 'sha512').toString('hex');
}

const pendingOtps = new Map();

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendTelegramOtp(botToken, chatId, otpCode, purpose = 'Verification') {
  const text = `⚡ <b>DataForge Security Verification</b>\n\nYour 2FA OTP Code for <b>${purpose}</b> is:\n\n<code>${otpCode}</code>\n\n<i>This code is valid for 5 minutes. Do NOT share it with anyone.</i>`;
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
    if (decoded.scope !== 'dataforge_admin') throw new Error('Invalid token scope');
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
    const r = await masterPool.query('SELECT id, name, email, telegram_username, telegram_user_id, avatar_url FROM _dataforge_admin_users LIMIT 1');
    const isRegistered = r.rows.length > 0;
    let isAuthenticated = false;
    let user = null;

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/, '');
    if (token && isRegistered) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.scope === 'dataforge_admin') {
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
    await masterPool.query('DELETE FROM _dataforge_admin_users');
    const r = await masterPool.query(
      `INSERT INTO _dataforge_admin_users (name, email, password_hash, telegram_username, telegram_user_id, telegram_bot_token)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, telegram_username, telegram_user_id`,
      [name, email, passwordHash, telegramUsername, telegramUserId, telegramBotToken]
    );
    pendingOtps.delete(tempId);

    const token = jwt.sign({ id: r.rows[0].id, email: r.rows[0].email, scope: 'dataforge_admin' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: r.rows[0], message: 'Account created successfully!' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/login-step1', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ success: false, message: 'Password required' });

  try {
    const r = await masterPool.query('SELECT * FROM _dataforge_admin_users LIMIT 1');
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

  const r = await masterPool.query('SELECT id, name, email, telegram_username, telegram_user_id FROM _dataforge_admin_users WHERE id = $1', [pending.adminId]);
  pendingOtps.delete(tempId);

  if (!r.rows.length) return res.status(400).json({ success: false, message: 'Admin account not found' });

  const token = jwt.sign({ id: r.rows[0].id, email: r.rows[0].email, scope: 'dataforge_admin' }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ success: true, token, user: r.rows[0], message: 'Login successful!' });
});

app.post('/api/auth/forgot-step1', async (req, res) => {
  try {
    const r = await masterPool.query('SELECT * FROM _dataforge_admin_users LIMIT 1');
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
  await masterPool.query('UPDATE _dataforge_admin_users SET password_hash = $1 WHERE id = $2', [passwordHash, pending.adminId]);
  pendingOtps.delete(tempId);

  res.json({ success: true, message: 'Password reset successfully! Please login with your new password.' });
});

app.get('/api/auth/profile', authMiddleware, async (req, res) => {
  try {
    const r = await masterPool.query('SELECT id, name, email, telegram_username, telegram_user_id, telegram_bot_token FROM _dataforge_admin_users WHERE id = $1', [req.adminUser.id]);
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
    const r = await masterPool.query('SELECT * FROM _dataforge_admin_users WHERE id = $1', [req.adminUser.id]);
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
  await masterPool.query('UPDATE _dataforge_admin_users SET password_hash = $1 WHERE id = $2', [passwordHash, pending.adminId]);
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
    const q = `UPDATE _dataforge_admin_users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, email, telegram_username, telegram_user_id, telegram_bot_token`;
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

    // Initialize extensions
    const c = await getProjectClient(rawName);
    await c.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
    await c.end();

    const keys = generateJwtKeys(rawName);
    res.json({
      success: true,
      project: {
        name: rawName, size: '0 bytes', tableCount: 0,
        connectionString: connString(rawName),
        anonKey: keys.anonKey, serviceRoleKey: keys.serviceRoleKey,
        apiUrl: `http://${DB_HOST}:${PORT}`,
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
    await masterPool.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`, [dbName]);
    await masterPool.query(`DROP DATABASE IF EXISTS "${dbName}"`);
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
    const keys = generateJwtKeys(dbName);
    res.json({
      success: true,
      info: {
        name: dbName, size: sizeR.rows[0].size,
        tableCount: parseInt(tblR.rows[0].count, 10),
        connectionString: connString(dbName),
        anonKey: keys.anonKey, serviceRoleKey: keys.serviceRoleKey,
        host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS,
      },
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

app.post('/api/projects/:name/tables/:table/rows', async (req, res) => {
  const data = req.body;
  const keys = Object.keys(data);
  if (!keys.length) return res.status(400).json({ success: false, message: 'Row data required' });
  const cols = keys.map(k => `"${k}"`).join(', ');
  const vals = keys.map((_, i) => `$${i + 1}`).join(', ');
  try {
    const c = await getProjectClient(req.params.name);
    const r = await c.query(`INSERT INTO "${req.params.table}" (${cols}) VALUES (${vals}) RETURNING *`, keys.map(k => data[k]));
    await c.end();
    res.json({ success: true, row: r.rows[0] });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.put('/api/projects/:name/tables/:table/rows', async (req, res) => {
  const { column, value, data } = req.body;
  if (!column || value === undefined || !data || !Object.keys(data).length) {
    return res.status(400).json({ success: false, message: 'column, value, and data object required' });
  }
  const keys = Object.keys(data);
  const setClauses = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
  const vals = keys.map(k => data[k]);
  vals.push(value);

  try {
    const c = await getProjectClient(req.params.name);
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

const { exec } = require('child_process');

app.get('/api/projects/:name/export', (req, res) => {
  const proj = req.params.name.replace(/[^a-zA-Z0-9_]/g, '');
  const cmd = `docker exec dataforge-db pg_dump -U postgres "${proj}"`;
  exec(cmd, { maxBuffer: 1024 * 1024 * 50 }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ success: false, message: stderr || err.message });
    }
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${proj}_backup.sql"`);
    res.send(stdout);
  });
});

app.post('/api/projects/:name/import', async (req, res) => {
  const { sql } = req.body;
  if (!sql) return res.status(400).json({ success: false, message: 'SQL content required' });
  try {
    const c = await getProjectClient(req.params.name);
    await c.query(sql);
    await c.end();
    res.json({ success: true, message: 'Database schema and data imported successfully!' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ====================================================================
// SPA Fallback
// ====================================================================

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  ⚡ DataForge is running at http://localhost:${PORT}\n`);
});
