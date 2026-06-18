'use strict';

// CORRIGIDO: validação de env vars ANTES de qualquer require interno
const REQUIRED_ENV = ['DATABASE_URL', 'SESSION_SECRET'];
const WARN_ENV = ['OPENAI_API_KEY', 'PORT'];
for (const v of REQUIRED_ENV) {
  if (!process.env[v]) {
    console.error(`[FATAL] Variável de ambiente obrigatória não definida: ${v}`);
    process.exit(1);
  }
}
for (const v of WARN_ENV) {
  if (!process.env[v]) {
    console.warn(`[WARN] Variável de ambiente recomendada não definida: ${v}`);
  }
}

// CORRIGIDO: SESSION_SECRET fraco/ausente encerra o processo
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  console.error('[FATAL] SESSION_SECRET deve ter pelo menos 32 caracteres. Configure nos Secrets do Replit.');
  process.exit(1);
}

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const pino = require('pino');

const { runMigrations } = require('./lib/migrations');
const wa = require('./lib/wa-manager');
const { startKeepAlive } = require('./keep-alive');

const authRouter = require('./routes/auth');
const apiRouter = require('./routes/api');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const PORT = parseInt(process.env.PORT || '5000', 10);

const app = express();

app.set('trust proxy', 1);

app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

// Rotas montadas em /bot (prefix do proxy Replit)
const BASE = '/bot';

app.get(`${BASE}/ping`, (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get('/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get(`${BASE}/healthz`, (_req, res) => res.json({ ok: true, uptime: process.uptime() }));
app.get('/healthz', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));
app.get(`${BASE}/readyz`, (_req, res) => {
  const mem = process.memoryUsage();
  const memMb = Math.round(mem.rss / 1024 / 1024);
  const memOk = memMb < 450;
  res.status(memOk ? 200 : 503).json({ ok: memOk, memory: memOk ? 'ok' : 'high', memoryMb: memMb, uptime: Math.round(process.uptime()) });
});

app.use(`${BASE}/auth`, authRouter);
app.use('/auth', authRouter);
app.use(`${BASE}/api`, apiRouter);
app.use('/api', apiRouter);

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// Global error handler
app.use((err, _req, res, _next) => {
  logger.error({ event: 'unhandled_route_error', err: err.message });
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

// Global unhandled promise rejection
process.on('unhandledRejection', (reason) => {
  logger.error({ event: 'unhandled_rejection', reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error({ event: 'uncaught_exception', err: err.message });
});

async function start() {
  try {
    logger.info({ event: 'migrations_start' });
    await runMigrations();
    logger.info({ event: 'migrations_done' });

    await new Promise((resolve, reject) => {
      app.listen(PORT, '0.0.0.0', () => {
        logger.info({ event: 'server_started', port: PORT });
        resolve();
      }).on('error', reject);
    });

    logger.info({ event: 'restore_devices_start' });
    await wa.restoreAll();
    logger.info({ event: 'restore_devices_done' });

    startKeepAlive();
  } catch (err) {
    logger.error({ event: 'startup_failed', err: err.message });
    process.exit(1);
  }
}

start();
