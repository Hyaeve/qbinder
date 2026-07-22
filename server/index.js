import axios from 'axios';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import FormData from 'form-data';
import fs from 'fs/promises';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuid } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.QBINDER_DATA_DIR || path.join(rootDir, 'data');
const configPath = path.join(dataDir, 'config.json');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 200 } });
const app = express();
const port = Number(process.env.PORT || 8080);
const isProduction = process.env.NODE_ENV === 'production';

const defaultConfig = {
  auth: {
    username: 'qBinder',
    passwordHash: bcrypt.hashSync('qBinder', 10)
  },
  sessions: [],
  qbittorrents: [],
  lanes: [],
  cards: [],
  tagPool: []
};

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

async function ensureConfig() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(configPath);
  } catch {
    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
  }
}

async function readConfig() {
  await ensureConfig();
  const raw = await fs.readFile(configPath, 'utf8');
  return { ...defaultConfig, ...JSON.parse(raw) };
}

async function writeConfig(config) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

function publicConfig(config) {
  return {
    username: config.auth.username,
    qbittorrents: config.qbittorrents.map(({ password, cookie, ...item }) => item),
    lanes: config.lanes,
    cards: config.cards,
    tagPool: config.tagPool
  };
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 14
  };
}

function normalizeBaseUrl(account) {
  const protocol = account.protocol || 'http';
  const host = String(account.host || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `${protocol}://${host}:${account.port}`;
}

function requireFields(payload, fields) {
  const missing = fields.filter((field) => payload[field] === undefined || payload[field] === null || String(payload[field]).trim() === '');
  if (missing.length) {
    const error = new Error(`Missing fields: ${missing.join(', ')}`);
    error.status = 400;
    throw error;
  }
}

async function loginQb(account) {
  const baseUrl = normalizeBaseUrl(account);
  const body = new URLSearchParams({ username: account.username, password: account.password });
  const response = await axios.post(`${baseUrl}/api/v2/auth/login`, body.toString(), {
    timeout: 8000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    validateStatus: () => true
  });

  if (response.status !== 200 || String(response.data).trim() !== 'Ok.') {
    const error = new Error('qBittorrent authentication failed');
    error.status = 400;
    throw error;
  }

  const cookie = response.headers['set-cookie']?.map((item) => item.split(';')[0]).join('; ');
  if (!cookie) {
    const error = new Error('qBittorrent did not return a session cookie');
    error.status = 400;
    throw error;
  }

  return { baseUrl, cookie };
}

async function getQbSession(config, qbId) {
  const account = config.qbittorrents.find((item) => item.id === qbId);
  if (!account) {
    const error = new Error('qBittorrent account not found');
    error.status = 404;
    throw error;
  }

  try {
    const { baseUrl, cookie } = await loginQb(account);
    account.cookie = cookie;
    account.lastVerifiedAt = new Date().toISOString();
    await writeConfig(config);
    return { account, baseUrl, cookie };
  } catch (error) {
    account.lastError = error.message;
    await writeConfig(config);
    throw error;
  }
}

async function requireAuth(req, res, next) {
  const config = await readConfig();
  const token = req.cookies.qbinder_session;
  const session = config.sessions.find((item) => item.token === token && new Date(item.expiresAt) > new Date());
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.config = config;
  req.session = session;
  return next();
}

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const config = await readConfig();
    const { username, password } = req.body;
    const valid = username === config.auth.username && await bcrypt.compare(String(password || ''), config.auth.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = uuid();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
    config.sessions = [...config.sessions.filter((item) => new Date(item.expiresAt) > new Date()), { token, expiresAt }];
    await writeConfig(config);
    res.cookie('qbinder_session', token, sessionCookieOptions());
    res.json({ user: { username: config.auth.username }, config: publicConfig(config) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res, next) => {
  try {
    req.config.sessions = req.config.sessions.filter((item) => item.token !== req.session.token);
    await writeConfig(req.config);
    res.clearCookie('qbinder_session');
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/config', requireAuth, async (req, res) => {
  res.json(publicConfig(req.config));
});

app.put('/api/auth/credentials', requireAuth, async (req, res, next) => {
  try {
    requireFields(req.body, ['username', 'password']);
    req.config.auth.username = String(req.body.username).trim();
    req.config.auth.passwordHash = await bcrypt.hash(String(req.body.password), 10);
    await writeConfig(req.config);
    res.json({ username: req.config.auth.username });
  } catch (error) {
    next(error);
  }
});

app.post('/api/qb/test', requireAuth, async (req, res, next) => {
  try {
    requireFields(req.body, ['alias', 'host', 'port', 'username', 'password']);
    await loginQb(req.body);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/qb', requireAuth, async (req, res, next) => {
  try {
    requireFields(req.body, ['alias', 'host', 'port', 'username', 'password']);
    const { cookie } = await loginQb(req.body);
    const account = {
      id: uuid(),
      alias: String(req.body.alias).trim(),
      protocol: req.body.protocol || 'http',
      host: String(req.body.host).trim().replace(/^https?:\/\//, '').replace(/\/+$/, ''),
      port: Number(req.body.port),
      username: String(req.body.username),
      password: String(req.body.password),
      cookie,
      lastVerifiedAt: new Date().toISOString()
    };
    req.config.qbittorrents.push(account);
    await writeConfig(req.config);
    res.json(publicConfig(req.config));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/qb/:id', requireAuth, async (req, res, next) => {
  try {
    req.config.qbittorrents = req.config.qbittorrents.filter((item) => item.id !== req.params.id);
    req.config.lanes = req.config.lanes.filter((item) => item.qbId !== req.params.id);
    req.config.cards = req.config.cards.filter((item) => item.qbId !== req.params.id);
    await writeConfig(req.config);
    res.json(publicConfig(req.config));
  } catch (error) {
    next(error);
  }
});

app.post('/api/lanes', requireAuth, async (req, res, next) => {
  try {
    requireFields(req.body, ['qbId', 'name']);
    const lane = { id: uuid(), qbId: req.body.qbId, name: String(req.body.name).trim(), createdAt: new Date().toISOString() };
    req.config.lanes.push(lane);
    await writeConfig(req.config);
    res.json(publicConfig(req.config));
  } catch (error) {
    next(error);
  }
});

app.post('/api/cards', requireAuth, async (req, res, next) => {
  try {
    requireFields(req.body, ['qbId', 'laneId', 'name']);
    const card = {
      id: uuid(),
      qbId: req.body.qbId,
      laneId: req.body.laneId,
      name: String(req.body.name).trim(),
      savePath: req.body.savePath || '',
      tags: Array.isArray(req.body.tags) ? req.body.tags : [],
      cover: req.body.cover || { type: 'monet', value: '' },
      createdAt: new Date().toISOString()
    };
    req.config.cards.push(card);
    req.config.tagPool = [...new Set([...req.config.tagPool, ...card.tags])];
    await writeConfig(req.config);
    res.json(publicConfig(req.config));
  } catch (error) {
    next(error);
  }
});

app.put('/api/cards/:id', requireAuth, async (req, res, next) => {
  try {
    const card = req.config.cards.find((item) => item.id === req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });
    Object.assign(card, {
      name: req.body.name ?? card.name,
      savePath: req.body.savePath ?? card.savePath,
      tags: Array.isArray(req.body.tags) ? req.body.tags : card.tags,
      cover: req.body.cover ?? card.cover
    });
    req.config.tagPool = [...new Set([...req.config.tagPool, ...card.tags])];
    await writeConfig(req.config);
    res.json(publicConfig(req.config));
  } catch (error) {
    next(error);
  }
});

app.post('/api/cards/:id/upload', requireAuth, upload.array('torrents'), async (req, res, next) => {
  try {
    const card = req.config.cards.find((item) => item.id === req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });
    if (!card.savePath) return res.status(400).json({ error: 'Card save path is required' });
    if (!req.files?.length) return res.status(400).json({ error: 'No torrent files selected' });

    const { baseUrl, cookie } = await getQbSession(req.config, card.qbId);
    const form = new FormData();
    for (const file of req.files) {
      form.append('torrents', file.buffer, { filename: file.originalname, contentType: file.mimetype || 'application/x-bittorrent' });
    }
    form.append('savepath', card.savePath);
    if (card.tags.length) form.append('tags', card.tags.join(','));
    form.append('autoTMM', 'false');

    const response = await axios.post(`${baseUrl}/api/v2/torrents/add`, form, {
      timeout: 30000,
      headers: { ...form.getHeaders(), Cookie: cookie },
      validateStatus: () => true
    });

    if (response.status < 200 || response.status >= 300) {
      return res.status(502).json({ error: `qBittorrent add torrents failed: ${response.status}` });
    }

    res.json({ ok: true, count: req.files.length });
  } catch (error) {
    next(error);
  }
});

if (isProduction) {
  const distDir = path.join(rootDir, 'dist');
  app.use(express.static(distDir));
  app.get('*', (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

app.use((error, req, res, next) => {
  const status = error.status || 500;
  res.status(status).json({ error: error.message || 'Internal server error' });
});

await ensureConfig();
app.listen(port, () => {
  console.log(`qBinder listening on ${port}`);
});
