'use strict';

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const agentsLib = require('./agents');
const { getOpenAI } = require('./openai-client');
const { getBreaker } = require('./breaker');

const { dispatch } = require('./webhook-dispatcher');

const appLogger = pino({ level: process.env.LOG_LEVEL || 'info' });
const logger = pino({ level: 'silent' });

const sockets = new Map();
const sseClients = new Map();
const debounceTimers = new Map();
const debounceBuffers = new Map();

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

function key(deviceId) { return `dev:${deviceId}`; }

let _baileysVersion = null;
let _baileysVersionFetchedAt = 0;

async function getBaileysVersion() {
  const AGE_MS = 60 * 60 * 1000;
  if (_baileysVersion && (Date.now() - _baileysVersionFetchedAt) < AGE_MS) {
    return _baileysVersion;
  }
  try {
    const { version } = await fetchLatestBaileysVersion();
    _baileysVersion = version;
    _baileysVersionFetchedAt = Date.now();
    return version;
  } catch (e) {
    appLogger.warn({ event: 'baileys_version_fetch_failed', err: e.message });
    if (_baileysVersion) return _baileysVersion;
    return [2, 3000, 1015901307];
  }
}

function addSse(userId, res) {
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId).add(res);
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  res.on('close', () => removeSse(userId, res));
  res.on('error', () => removeSse(userId, res));
}

function removeSse(userId, res) {
  const set = sseClients.get(userId);
  if (set) { set.delete(res); if (!set.size) sseClients.delete(userId); }
}

function emitSse(userId, event, data) {
  const set = sseClients.get(userId);
  if (!set || !set.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch (_) { removeSse(userId, res); }
  }
}

async function saveMessage({ userId, deviceId, agentId, contactJid, direction, body, msgType = 'text', waMsgId }) {
  try {
    await db.query(
      `INSERT INTO messages(user_id, device_id, agent_id, contact_jid, direction, body, msg_type, wa_msg_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, deviceId, agentId || null, contactJid, direction, body, msgType, waMsgId || null]
    );
  } catch (e) {
    appLogger.warn({ event: 'save_message_failed', err: e.message });
  }
}

async function upsertContact(userId, jid, name) {
  try {
    const phone = jid.split('@')[0];
    await db.query(
      `INSERT INTO contacts(user_id, jid, name, phone) VALUES($1,$2,$3,$4)
       ON CONFLICT(user_id, jid) DO UPDATE SET name=EXCLUDED.name, updated_at=NOW()`,
      [userId, jid, name || phone, phone]
    );
  } catch (_) {}
}

async function sendText(userId, deviceId, jid, text, { agentId } = {}) {
  const e = sockets.get(key(deviceId));
  if (!e || e.status !== 'connected') throw new Error('Dispositivo não conectado.');
  await e.sock.sendMessage(jid, { text });
  await saveMessage({ userId, deviceId, agentId, contactJid: jid, direction: 'out', body: text });
  emitSse(userId, 'message', { deviceId, jid, direction: 'out', body: text });
  dispatch(userId, 'message.sent', { deviceId, jid, direction: 'out', body: text, agentId: agentId || null }).catch(() => {});
}

async function sendMedia(userId, deviceId, jid, opts, { agentId } = {}) {
  const e = sockets.get(key(deviceId));
  if (!e || e.status !== 'connected') throw new Error('Dispositivo não conectado.');

  const mediaBreaker = getBreaker(`wa_send_${deviceId}`, {
    failureThreshold: 5,
    resetTimeoutMs: 30_000,
    fallback: () => { throw new Error('Circuito aberto para envio de mídia. Aguarde 30s.'); }
  });

  await mediaBreaker.execute(() => e.sock.sendMessage(jid, opts));
  await saveMessage({ userId, deviceId, agentId, contactJid: jid, direction: 'out', body: opts.caption || '[mídia]', msgType: opts.image ? 'image' : opts.audio ? 'audio' : 'file' });
}

async function handleIncoming(userId, deviceId, agentId, sock, m) {
  const M = m.message;
  if (!M) return;

  const jid = m.key.remoteJid;
  if (!jid || jid === 'status@broadcast') return;
  if (m.key.fromMe) return;

  let body = M.conversation
    || M.extendedTextMessage?.text
    || M.buttonsResponseMessage?.selectedButtonId
    || M.listResponseMessage?.singleSelectReply?.selectedRowId
    || '';

  const msgType = M.imageMessage ? 'image'
    : M.audioMessage ? 'audio'
    : M.documentMessage ? 'document'
    : 'text';

  const senderName = m.pushName || jid.split('@')[0];
  await upsertContact(userId, jid, senderName);
  await saveMessage({ userId, deviceId, agentId, contactJid: jid, direction: 'in', body: body || `[${msgType}]`, msgType, waMsgId: m.key.id });
  emitSse(userId, 'message', { deviceId, jid, direction: 'in', body, msgType, senderName });
  dispatch(userId, 'message.received', { deviceId, jid, direction: 'in', body: body || `[${msgType}]`, msgType, senderName, agentId: agentId || null }).catch(() => {});

  const agent = await agentsLib.getAgent(userId, agentId).catch(() => null);
  if (!agent || !agent.enabled) return;

  // Check business hours
  if (!agentsLib.isWithinBusinessHours(agent.business_hours)) {
    const outMsg = agent.business_hours?.out_of_hours_msg;
    if (outMsg) {
      // Only send out-of-hours message once per session (debounce key based approach)
      const outKey = `ooh:${deviceId}:${jid}`;
      if (!debounceTimers.has(outKey)) {
        debounceTimers.set(outKey, setTimeout(() => debounceTimers.delete(outKey), 60 * 60 * 1000));
        await sendText(userId, deviceId, jid, outMsg, { agentId: agent.id }).catch(() => {});
      }
    }
    return;
  }

  // Image vision processing
  const modelSupportsVision = agent.provider === 'openai' && ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'].includes(agent.model);
  if (M.imageMessage && modelSupportsVision) {
    try {
      const imgBuf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
      if (imgBuf) {
        const b64 = imgBuf.toString('base64');
        const mime = M.imageMessage.mimetype || 'image/jpeg';
        let openaiClient;
        try {
          // Try user's key first
          const userKey = await agentsLib.getUserApiKey(userId, 'openai');
          if (userKey) {
            const OpenAI = require('openai');
            openaiClient = new OpenAI({ apiKey: userKey, timeout: 30000, maxRetries: 2 });
          } else {
            openaiClient = getOpenAI();
          }
        } catch (e) {
          appLogger.warn({ event: 'vision_no_key', deviceId, err: e.message });
          if (!body) body = '[Imagem recebida]';
        }
        if (openaiClient) {
          const vRes = await openaiClient.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: [
              { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}`, detail: 'low' } },
              { type: 'text', text: body || 'Descreva o que você vê nesta imagem de forma concisa.' }
            ]}],
            max_tokens: 400
          });
          const desc = vRes.choices?.[0]?.message?.content || '';
          if (desc) body = body ? `${body}\n[Imagem: ${desc}]` : `[Imagem: ${desc}]`;
        }
      }
    } catch (e) {
      appLogger.warn({ event: 'vision_error', deviceId, err: e.message });
      if (!body) body = '[Imagem recebida]';
    }
  }

  if (!body) return;

  const debounceKey = `${deviceId}:${jid}`;
  if (debounceTimers.has(debounceKey)) {
    clearTimeout(debounceTimers.get(debounceKey));
    debounceBuffers.get(debounceKey).push(body);
  } else {
    debounceBuffers.set(debounceKey, [body]);
  }

  const timer = setTimeout(async () => {
    debounceTimers.delete(debounceKey);
    const msgs = debounceBuffers.get(debounceKey) || [body];
    debounceBuffers.delete(debounceKey);
    const combined = msgs.join('\n');

    // Check if it's the first contact → send welcome message
    if (agent.welcome_message) {
      try {
        const firstTime = await agentsLib.isFirstContact(userId, deviceId, jid);
        if (firstTime) {
          await sendText(userId, deviceId, jid, agent.welcome_message, { agentId: agent.id });
        }
      } catch (e) {
        appLogger.warn({ event: 'welcome_msg_error', deviceId, err: e.message });
      }
    }

    try {
      const flowReply = await agentsLib.tryFlow(userId, combined);
      if (flowReply) {
        await sendText(userId, deviceId, jid, flowReply, { agentId: agent.id });
        return;
      }
    } catch (e) {
      appLogger.warn({ event: 'flow_error', deviceId, err: e.message });
    }

    let training = '', customFields = [], history = [];
    try {
      [training, customFields, history] = await Promise.all([
        agentsLib.getTraining(agent.id),
        agentsLib.getCustomFields(agent.id),
        db.query(
          `SELECT direction, body FROM messages WHERE user_id=$1 AND contact_jid=$2 ORDER BY id DESC LIMIT 20`,
          [userId, jid]
        ).then(r => r.rows.reverse().map(row => ({
          role: row.direction === 'in' ? 'user' : 'assistant',
          content: row.body || ''
        })).filter(r => r.content))
      ]);
    } catch (e) {
      appLogger.warn({ event: 'history_fetch_error', deviceId, err: e.message });
    }

    try {
      const reply = await agentsLib.generateReply({
        agent, history, userMessage: combined, customFields, training,
        userId, deviceId, contactJid: jid
      });
      if (reply) await sendText(userId, deviceId, jid, reply, { agentId: agent.id });
    } catch (e) {
      appLogger.warn({ event: 'generate_reply_error', deviceId, jid, err: e.message });
    }
  }, agent.debounce_ms || 1500);

  debounceTimers.set(debounceKey, timer);
}

async function handleGroupMessage(userId, deviceId, sock, m) {
  const jid = m.key.remoteJid;
  if (!jid || !jid.endsWith('@g.us')) return;
  if (m.key.fromMe) return;

  const r = await db.query(
    'SELECT * FROM group_bots WHERE device_id=$1 AND group_jid=$2 AND enabled=true',
    [deviceId, jid]
  );
  const groupBot = r.rows[0];
  if (!groupBot) return;

  const agent = await agentsLib.getAgent(userId, groupBot.agent_id);
  if (!agent || !agent.enabled) return;

  await handleIncoming(userId, deviceId, agent.id, sock, m);
}

// Maximum reconnect attempts before giving up (prevents runaway memory growth)
const MAX_RECONNECT = 10;
const reconnectCounts = new Map();

async function startDevice(userId, deviceId) {
  const k = key(deviceId);
  if (sockets.has(k) && sockets.get(k).status === 'connected') return;

  const sessionDir = path.join(SESSIONS_DIR, `device_${deviceId}`);

  // --- Setup: auth state + socket creation — failures must NOT crash the server ---
  let state, saveCreds, sock;
  try {
    fs.mkdirSync(sessionDir, { recursive: true });
    ({ state, saveCreds } = await useMultiFileAuthState(sessionDir));
    const version = await getBaileysVersion();
    sock = makeWASocket({
      version,
      logger,
      auth: state,
      printQRInTerminal: false,
      browser: ['Chrome (Linux)', 'Chrome', '120.0.0'],
      connectTimeoutMs: 30_000,
      keepAliveIntervalMs: 15_000,
      retryRequestDelayMs: 500,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });
  } catch (e) {
    appLogger.error({ event: 'start_device_setup_failed', deviceId, err: e.message });
    sockets.delete(k);
    db.query('UPDATE agent_devices SET status=$1 WHERE id=$2', ['disconnected', deviceId]).catch(() => {});
    emitSse(userId, 'device_status', { deviceId, status: 'disconnected' });
    return; // abort — do not propagate, server stays alive
  }

  let isDestroyed = false;
  const entry = { sock, status: 'connecting', userId, deviceId, qr: null };
  sockets.set(k, entry);

  db.query('UPDATE agent_devices SET status=$1 WHERE id=$2', ['connecting', deviceId]).catch(e =>
    appLogger.warn({ event: 'db_update_connecting_failed', deviceId, err: e.message })
  );
  emitSse(userId, 'device_status', { deviceId, status: 'connecting' });

  // Safe saveCreds — never crashes if session dir was already deleted
  sock.ev.on('creds.update', async (...args) => {
    if (isDestroyed) return;
    try { await saveCreds(...args); } catch (e) {
      if (!isDestroyed) appLogger.warn({ event: 'save_creds_error', deviceId, err: e.message });
    }
  });

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    // Entire handler wrapped — an async event handler that throws becomes an
    // unhandled rejection which can crash the process on Node 15+
    try {
      if (qr) {
        try {
          const QRCode = require('qrcode');
          const qrDataUrl = await QRCode.toDataURL(qr);
          entry.qr = qrDataUrl;
          entry.status = 'qr';
          await db.query('UPDATE agent_devices SET status=$1 WHERE id=$2', ['qr', deviceId]);
          emitSse(userId, 'device_qr', { deviceId, qr: qrDataUrl });
          dispatch(userId, 'device.qr', { deviceId }).catch(() => {});
        } catch (e) {
          appLogger.warn({ event: 'qr_generate_error', deviceId, err: e.message });
        }
      }

      if (connection === 'open') {
        entry.status = 'connected';
        entry.qr = null;
        reconnectCounts.delete(k); // reset counter on successful connect
        const phone = sock.user?.id?.split(':')[0] || null;
        try {
          await db.query(
            'UPDATE agent_devices SET status=$1, phone=$2, updated_at=NOW() WHERE id=$3',
            ['connected', phone, deviceId]
          );
        } catch (e) {
          appLogger.warn({ event: 'db_update_connected_failed', deviceId, err: e.message });
        }
        appLogger.info({ event: 'device_connected', deviceId, phone });
        emitSse(userId, 'device_status', { deviceId, status: 'connected', phone });
        dispatch(userId, 'device.connected', { deviceId, phone }).catch(() => {});
      }

      if (connection === 'close') {
        if (isDestroyed) return;
        const code = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;
        entry.status = 'disconnected';
        try {
          await db.query('UPDATE agent_devices SET status=$1 WHERE id=$2', ['disconnected', deviceId]);
        } catch (e) {
          appLogger.warn({ event: 'db_update_disconnected_failed', deviceId, err: e.message });
        }
        emitSse(userId, 'device_status', { deviceId, status: 'disconnected' });
        dispatch(userId, 'device.disconnected', { deviceId }).catch(() => {});
        appLogger.info({ event: 'device_disconnected', deviceId, code, shouldReconnect });

        if (shouldReconnect) {
          const attempts = (reconnectCounts.get(k) || 0) + 1;
          reconnectCounts.set(k, attempts);

          if (attempts > MAX_RECONNECT) {
            appLogger.warn({ event: 'reconnect_limit_reached', deviceId, attempts });
            reconnectCounts.delete(k);
            isDestroyed = true;
            sockets.delete(k);
            return;
          }

          // Exponential back-off capped at 60s
          const delay = Math.min(5000 * Math.pow(1.5, attempts - 1), 60_000);
          await new Promise(r => setTimeout(r, delay));
          const current = sockets.get(k);
          if (current && current.isPairing) return;
          if (current && current.status === 'connected') return;
          startDevice(userId, deviceId).catch(e =>
            appLogger.error({ event: 'reconnect_failed', deviceId, err: e.message })
          );
        } else {
          isDestroyed = true;
          reconnectCounts.delete(k);
          sockets.delete(k);
          const sessionDir2 = path.join(SESSIONS_DIR, `device_${deviceId}`);
          try { fs.rmSync(sessionDir2, { recursive: true, force: true }); } catch (_) {}
        }
      }
    } catch (e) {
      appLogger.error({ event: 'connection_update_handler_error', deviceId, err: e.message });
    }
  });

  sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
    if (type !== 'notify') return;
    for (const m of msgs) {
      try {
        if (!m.message) continue;
        const jid = m.key.remoteJid || '';
        let agentId;
        try {
          const deviceRow = await db.query('SELECT agent_id FROM agent_devices WHERE id=$1', [deviceId]);
          agentId = deviceRow.rows[0]?.agent_id;
        } catch (e) {
          appLogger.warn({ event: 'db_fetch_agent_failed', deviceId, err: e.message });
          continue;
        }
        if (!agentId) continue;
        if (jid.endsWith('@g.us')) {
          handleGroupMessage(userId, deviceId, sock, m).catch(e =>
            appLogger.error({ event: 'group_msg_error', deviceId, err: e.message })
          );
        } else {
          handleIncoming(userId, deviceId, agentId, sock, m).catch(e =>
            appLogger.error({ event: 'incoming_error', deviceId, err: e.message })
          );
        }
      } catch (e) {
        appLogger.error({ event: 'messages_upsert_handler_error', deviceId, err: e.message });
      }
    }
  });
}

async function stopDevice(userId, deviceId) {
  const k = key(deviceId);
  const e = sockets.get(k);
  if (e) {
    try { e.sock.end(); } catch (_) {}
    sockets.delete(k);
  }
  await db.query('UPDATE agent_devices SET status=$1 WHERE id=$2', ['disconnected', deviceId]);
  emitSse(userId, 'device_status', { deviceId, status: 'disconnected' });
}

async function logoutDevice(userId, deviceId) {
  const k = key(deviceId);
  const e = sockets.get(k);
  if (e) {
    try { await e.sock.logout(); } catch (_) {}
    sockets.delete(k);
  }
  const sessionDir = path.join(SESSIONS_DIR, `device_${deviceId}`);
  fs.rmSync(sessionDir, { recursive: true, force: true });
  await db.query('UPDATE agent_devices SET status=$1, phone=NULL WHERE id=$2', ['disconnected', deviceId]);
  emitSse(userId, 'device_status', { deviceId, status: 'disconnected' });
}

async function restoreAll() {
  const r = await db.query(
    `SELECT d.id, d.user_id FROM agent_devices d WHERE d.status = 'connected'`
  );
  await db.query(
    `UPDATE agent_devices SET status='disconnected' WHERE status IN ('connecting','qr')`
  ).catch(() => {});

  for (const row of r.rows) {
    const k = key(row.id);
    if (sockets.has(k) && sockets.get(k).status === 'connected') continue;
    await new Promise(res => setTimeout(res, 1000));
    startDevice(row.user_id, row.id).catch(e =>
      appLogger.error({ event: 'restore_failed', deviceId: row.id, err: e.message })
    );
  }
}

function getDeviceStatus(deviceId) {
  const e = sockets.get(key(deviceId));
  return e ? { status: e.status, qr: e.qr } : { status: 'disconnected', qr: null };
}

function cleanDebounceOrphans() {
  const MAX_TIMERS = 5000;
  if (debounceTimers.size > MAX_TIMERS) {
    appLogger.warn({ event: 'debounce_timer_overflow', count: debounceTimers.size });
    for (const [k, t] of debounceTimers.entries()) {
      clearTimeout(t);
      debounceTimers.delete(k);
      debounceBuffers.delete(k);
    }
  }
}
setInterval(cleanDebounceOrphans, 5 * 60 * 1000).unref();

async function getPairingCode(userId, deviceId, phoneNumber) {
  const k = key(deviceId);

  // Validate phone number upfront
  const clean = phoneNumber.replace(/[^0-9]/g, '');
  if (clean.length < 10) {
    throw new Error('Número inválido. Use o formato internacional sem + (ex: 5511999999999).');
  }

  // Kill any existing socket for this device
  const existing = sockets.get(k);
  if (existing) {
    if (existing.status === 'connected') {
      throw new Error('Dispositivo já conectado. Faça logout primeiro para reconectar via código.');
    }
    try { existing.sock.end(); } catch (_) {}
    sockets.delete(k);
    // Wait for the old socket to fully close before deleting its session
    await new Promise(r => setTimeout(r, 600));
  }

  // Fresh session directory
  const sessionDir = path.join(SESSIONS_DIR, `device_${deviceId}`);
  fs.rmSync(sessionDir, { recursive: true, force: true });
  fs.mkdirSync(sessionDir, { recursive: true });

  // Destroyed flag — prevents saveCreds crashing after cleanup
  let isDestroyed = false;
  // Set to true after requestPairingCode succeeds so close handler can notify frontend
  let codeGenerated = false;

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const version = await getBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    browser: ['Chrome (Linux)', 'Chrome', '120.0.0'],
    mobile: false,
    connectTimeoutMs: 30_000,
    keepAliveIntervalMs: 15_000,    // Prevents 408 connectionLost on Replit
    retryRequestDelayMs: 500,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });

  const entry = { sock, status: 'connecting', userId, deviceId, qr: null, isPairing: true };
  sockets.set(k, entry);

  await db.query('UPDATE agent_devices SET status=$1 WHERE id=$2', ['connecting', deviceId]);
  emitSse(userId, 'device_status', { deviceId, status: 'connecting' });

  // --- Safe saveCreds: silently skips if session dir was already deleted ---
  sock.ev.on('creds.update', async (...args) => {
    if (isDestroyed) return;
    try { await saveCreds(...args); } catch (e) {
      if (!isDestroyed) appLogger.warn({ event: 'pairing_save_creds_error', deviceId, err: e.message });
    }
  });

  // --- Cleanup helper: idempotent, marks isDestroyed to gate saveCreds ---
  // expired=true → also emits pairing_code_expired so the frontend can auto-retry
  const cleanup = async (expired = false) => {
    if (isDestroyed) return;
    if (expired) emitSse(userId, 'pairing_code_expired', { deviceId });
    isDestroyed = true;
    sockets.delete(k);
    try { sock.end(); } catch (_) {}
    // Give any pending saveCreds calls a moment to see isDestroyed before we delete
    await new Promise(r => setTimeout(r, 100));
    fs.rmSync(sessionDir, { recursive: true, force: true });
    await db.query('UPDATE agent_devices SET status=$1 WHERE id=$2', ['disconnected', deviceId])
      .catch(() => {});
    emitSse(userId, 'device_status', { deviceId, status: 'disconnected' });
    dispatch(userId, 'device.disconnected', { deviceId }).catch(() => {});
  };

  // --- Connection lifecycle handler ---
  // Wrapped in try/catch — an async event handler that throws becomes an
  // unhandled rejection which crashes the process on Node 15+
  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    try {
      if (connection === 'open') {
        entry.status = 'connected';
        entry.isPairing = false;
        const phone = sock.user?.id?.split(':')[0] || null;
        try {
          await db.query(
            'UPDATE agent_devices SET status=$1, phone=$2, updated_at=NOW() WHERE id=$3',
            ['connected', phone, deviceId]
          );
        } catch (e) {
          appLogger.warn({ event: 'pairing_db_update_connected_failed', deviceId, err: e.message });
        }
        appLogger.info({ event: 'device_connected_pairing', deviceId, phone });
        emitSse(userId, 'device_status', { deviceId, status: 'connected', phone });
        dispatch(userId, 'device.connected', { deviceId, phone }).catch(() => {});

        sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
          try {
            if (type !== 'notify') return;
            for (const m of msgs) {
              try {
                if (!m.message) continue;
                const jid = m.key.remoteJid || '';
                let agentId;
                try {
                  const deviceRow = await db.query('SELECT agent_id FROM agent_devices WHERE id=$1', [deviceId]);
                  agentId = deviceRow.rows[0]?.agent_id;
                } catch (e) {
                  appLogger.warn({ event: 'pairing_db_fetch_agent_failed', deviceId, err: e.message });
                  continue;
                }
                if (!agentId) continue;
                if (jid.endsWith('@g.us')) {
                  handleGroupMessage(userId, deviceId, sock, m).catch(e =>
                    appLogger.error({ event: 'group_msg_error', deviceId, err: e.message })
                  );
                } else {
                  handleIncoming(userId, deviceId, agentId, sock, m).catch(e =>
                    appLogger.error({ event: 'incoming_error', deviceId, err: e.message })
                  );
                }
              } catch (e) {
                appLogger.error({ event: 'pairing_msg_upsert_item_error', deviceId, err: e.message });
              }
            }
          } catch (e) {
            appLogger.error({ event: 'pairing_messages_upsert_handler_error', deviceId, err: e.message });
          }
        });
        return;
      }

      if (connection === 'close') {
        if (isDestroyed) return; // Already handled elsewhere
        const code = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = code === DisconnectReason.loggedOut;
        appLogger.info({ event: 'device_disconnected_pairing', deviceId, code });

        if (entry.isPairing) {
          // If code was already generated, notify frontend to auto-retry; otherwise silent cleanup
          await cleanup(codeGenerated);
        } else if (isLoggedOut) {
          // Explicitly logged out after successful pairing
          await cleanup();
        } else {
          // Lost connection after device was fully paired — reconnect via startDevice
          entry.status = 'disconnected';
          await db.query('UPDATE agent_devices SET status=$1 WHERE id=$2', ['disconnected', deviceId])
            .catch(() => {});
          emitSse(userId, 'device_status', { deviceId, status: 'disconnected' });
          await new Promise(r => setTimeout(r, 5000));
          const current = sockets.get(k);
          if (current && (current.isPairing || current.status === 'connected')) return;
          startDevice(userId, deviceId).catch(e =>
            appLogger.error({ event: 'reconnect_failed_pairing', deviceId, err: e.message })
          );
        }
      }
    } catch (e) {
      appLogger.error({ event: 'pairing_connection_update_handler_error', deviceId, err: e.message });
    }
  });

  // --- Wait for WebSocket to reach 'connecting' state ---
  // Baileys fires this quickly after socket creation (usually < 500ms).
  // We use a flag-based guard so the listener no-ops after resolving.
  let connectingResolved = false;
  await new Promise((resolve) => {
    const fallback = setTimeout(() => {
      if (!connectingResolved) { connectingResolved = true; resolve(); }
    }, 12_000);

    sock.ev.on('connection.update', ({ connection }) => {
      if (connectingResolved) return;
      if (connection === 'connecting') {
        connectingResolved = true;
        clearTimeout(fallback);
        resolve();
      } else if (connection === 'close') {
        connectingResolved = true;
        clearTimeout(fallback);
        resolve(); // Socket closed early — will be caught by isDestroyed check below
      }
    });
  });

  // Abort if socket closed before we could request the code
  if (isDestroyed) {
    throw new Error('Falha na conexão com WhatsApp. Tente novamente em alguns segundos.');
  }

  // Small buffer to let the WebSocket handshake stabilize with WhatsApp servers
  await new Promise(r => setTimeout(r, 1500));

  if (isDestroyed) {
    throw new Error('Falha na conexão com WhatsApp. Tente novamente em alguns segundos.');
  }

  try {
    appLogger.info({ event: 'pairing_code_requesting', deviceId, phone: clean });
    const code = await sock.requestPairingCode(clean);
    codeGenerated = true; // Marks that the code was delivered — close handler will emit pairing_code_expired
    appLogger.info({ event: 'pairing_code_generated', deviceId });
    return code;
  } catch (err) {
    appLogger.warn({ event: 'pairing_code_failed', deviceId, err: err.message });
    await cleanup();
    throw new Error('Não foi possível gerar o código de pareamento. Tente novamente em alguns segundos.');
  }
}

module.exports = {
  startDevice, stopDevice, logoutDevice, restoreAll,
  sendText, sendMedia,
  addSse, removeSse, emitSse,
  getDeviceStatus,
  getPairingCode,
};
