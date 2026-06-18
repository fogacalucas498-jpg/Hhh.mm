'use strict';

// CORRIGIDO: múltiplos bugs corrigidos conforme especificação completa
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

const appLogger = pino({ level: process.env.LOG_LEVEL || 'info' });
const logger = pino({ level: 'silent' });

// Map: deviceKey -> { sock, store, status, userId, deviceId, qr }
const sockets = new Map();
// Map: userId -> Set<res>
const sseClients = new Map();
// Debounce timers para mensagens multi-part
const debounceTimers = new Map();
const debounceBuffers = new Map();

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

function key(deviceId) { return `dev:${deviceId}`; }

// CORRIGIDO: cache de versão Baileys — evita chamada de rede em cada reconexão
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

// CORRIGIDO: cleanup automático de SSE clients desconectados
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
}

async function sendMedia(userId, deviceId, jid, opts, { agentId } = {}) {
  const e = sockets.get(key(deviceId));
  if (!e || e.status !== 'connected') throw new Error('Dispositivo não conectado.');

  // CORRIGIDO: circuit breaker para envio de mídia
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

  const agent = await agentsLib.getAgent(userId, agentId).catch(() => null);
  if (!agent || !agent.enabled) return;

  // CORRIGIDO: análise de imagem usando openai-client centralizado
  const modelSupportsVision = agent.provider === 'openai' && ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'].includes(agent.model);
  if (M.imageMessage && modelSupportsVision) {
    try {
      const imgBuf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
      if (imgBuf) {
        const b64 = imgBuf.toString('base64');
        const mime = M.imageMessage.mimetype || 'image/jpeg';
        let openaiClient;
        try { openaiClient = getOpenAI(); } catch (e) {
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

  // Debounce — acumula mensagens rápidas
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

    // CORRIGIDO: tryFlow isolado em try/catch — erro não derruba fluxo principal
    try {
      const flowReply = await agentsLib.tryFlow(userId, combined);
      if (flowReply) {
        await sendText(userId, deviceId, jid, flowReply, { agentId: agent.id });
        return;
      }
    } catch (e) {
      appLogger.warn({ event: 'flow_error', deviceId, err: e.message });
    }

    // CORRIGIDO: queries paralelas para histórico + treinamento + campos
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
      const reply = await agentsLib.generateReply({ agent, history, userMessage: combined, customFields, training });
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

  // CORRIGIDO: verifica agent.enabled no handleGroupMessage
  const agent = await agentsLib.getAgent(userId, groupBot.agent_id);
  if (!agent || !agent.enabled) return;

  await handleIncoming(userId, deviceId, agent.id, sock, m);
}

async function startDevice(userId, deviceId) {
  const k = key(deviceId);
  if (sockets.has(k) && sockets.get(k).status === 'connected') return;

  const sessionDir = path.join(SESSIONS_DIR, `device_${deviceId}`);
  fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  // CORRIGIDO: usa versão cacheada do Baileys
  const version = await getBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    browser: ['Bot.io', 'Chrome', '1.0.0'],
  });

  const entry = { sock, status: 'connecting', userId, deviceId, qr: null };
  sockets.set(k, entry);

  await db.query('UPDATE agent_devices SET status=$1 WHERE id=$2', ['connecting', deviceId]);
  emitSse(userId, 'device_status', { deviceId, status: 'connecting' });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      try {
        const QRCode = require('qrcode');
        const qrDataUrl = await QRCode.toDataURL(qr);
        entry.qr = qrDataUrl;
        entry.status = 'qr';
        await db.query('UPDATE agent_devices SET status=$1 WHERE id=$2', ['qr', deviceId]);
        emitSse(userId, 'device_qr', { deviceId, qr: qrDataUrl });
      } catch (e) {
        appLogger.warn({ event: 'qr_generate_error', deviceId, err: e.message });
      }
    }

    if (connection === 'open') {
      entry.status = 'connected';
      entry.qr = null;
      const phone = sock.user?.id?.split(':')[0] || null;
      await db.query(
        'UPDATE agent_devices SET status=$1, phone=$2, updated_at=NOW() WHERE id=$3',
        ['connected', phone, deviceId]
      );
      appLogger.info({ event: 'device_connected', deviceId, phone });
      emitSse(userId, 'device_status', { deviceId, status: 'connected', phone });
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      entry.status = 'disconnected';
      await db.query('UPDATE agent_devices SET status=$1 WHERE id=$2', ['disconnected', deviceId]);
      emitSse(userId, 'device_status', { deviceId, status: 'disconnected' });
      appLogger.info({ event: 'device_disconnected', deviceId, code, shouldReconnect });

      if (shouldReconnect) {
        await new Promise(r => setTimeout(r, 5000));
        startDevice(userId, deviceId).catch(e =>
          appLogger.error({ event: 'reconnect_failed', deviceId, err: e.message })
        );
      } else {
        sockets.delete(k);
        const sessionDir2 = path.join(SESSIONS_DIR, `device_${deviceId}`);
        fs.rmSync(sessionDir2, { recursive: true, force: true });
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
    if (type !== 'notify') return;
    for (const m of msgs) {
      if (!m.message) continue;
      const jid = m.key.remoteJid || '';
      const deviceRow = await db.query('SELECT agent_id FROM agent_devices WHERE id=$1', [deviceId]);
      const agentId = deviceRow.rows[0]?.agent_id;
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

// CORRIGIDO: restoreAll reseta 'connecting'/'qr' para 'disconnected'; só restaura 'connected'
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

// CORRIGIDO: limpeza de debounce timers órfãos — prevenção de memory leak
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

  const existing = sockets.get(k);
  if (existing && existing.status === 'connected') {
    throw new Error('Dispositivo já conectado. Faça logout primeiro para reconectar via código.');
  }

  if (existing) {
    try { existing.sock.end(); } catch (_) {}
    sockets.delete(k);
  }

  // Clear session — pairing code requires fresh (unregistered) auth state
  const sessionDir = path.join(SESSIONS_DIR, `device_${deviceId}`);
  fs.rmSync(sessionDir, { recursive: true, force: true });
  fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const version = await getBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    browser: ['Bot.io', 'Chrome', '1.0.0'],
  });

  const entry = { sock, status: 'connecting', userId, deviceId, qr: null };
  sockets.set(k, entry);

  await db.query('UPDATE agent_devices SET status=$1 WHERE id=$2', ['connecting', deviceId]);
  emitSse(userId, 'device_status', { deviceId, status: 'connecting' });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      entry.status = 'connected';
      entry.qr = null;
      const phone = sock.user?.id?.split(':')[0] || null;
      await db.query(
        'UPDATE agent_devices SET status=$1, phone=$2, updated_at=NOW() WHERE id=$3',
        ['connected', phone, deviceId]
      );
      appLogger.info({ event: 'device_connected_pairing', deviceId, phone });
      emitSse(userId, 'device_status', { deviceId, status: 'connected', phone });
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      entry.status = 'disconnected';
      await db.query('UPDATE agent_devices SET status=$1 WHERE id=$2', ['disconnected', deviceId]);
      emitSse(userId, 'device_status', { deviceId, status: 'disconnected' });
      appLogger.info({ event: 'device_disconnected_pairing', deviceId, code, shouldReconnect });
      if (shouldReconnect) {
        await new Promise(r => setTimeout(r, 5000));
        startDevice(userId, deviceId).catch(e =>
          appLogger.error({ event: 'reconnect_failed_pairing', deviceId, err: e.message })
        );
      } else {
        sockets.delete(k);
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
    if (type !== 'notify') return;
    for (const m of msgs) {
      if (!m.message) continue;
      const jid = m.key.remoteJid || '';
      const deviceRow = await db.query('SELECT agent_id FROM agent_devices WHERE id=$1', [deviceId]);
      const agentId = deviceRow.rows[0]?.agent_id;
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
    }
  });

  // Validate phone
  const clean = phoneNumber.replace(/[^0-9]/g, '');
  if (clean.length < 10) {
    throw new Error('Número inválido. Use o formato internacional sem + (ex: 5511999999999).');
  }

  // Give socket time to initialize before requesting pairing code
  await new Promise(r => setTimeout(r, 2000));

  const code = await sock.requestPairingCode(clean);
  return code; // e.g. "ABCD-1234"
}

module.exports = {
  startDevice, stopDevice, logoutDevice, restoreAll,
  sendText, sendMedia,
  addSse, removeSse, emitSse,
  getDeviceStatus,
  getPairingCode,
};
