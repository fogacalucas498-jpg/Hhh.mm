'use strict';

const db = require('./db');
const wa = require('./wa-manager');
const { dispatch } = require('./webhook-dispatcher');
const pino = require('pino');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const MAX_RECIPIENTS = 1000;
const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 60_000;

// Tracks running broadcasts so cancellation can interrupt mid-send
const activeRuns = new Set();

function normalizeJid(raw) {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return null;
  return digits.endsWith('@s.whatsapp.net') ? raw : `${digits}@s.whatsapp.net`;
}

async function createBroadcast(userId, { deviceId, message, recipients, delayMs = 3000 }) {
  if (!deviceId) throw Object.assign(new Error('deviceId é obrigatório.'), { status: 400 });
  if (!message || !message.trim()) throw Object.assign(new Error('message é obrigatório.'), { status: 400 });
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw Object.assign(new Error('recipients deve ser um array não vazio.'), { status: 400 });
  }
  if (recipients.length > MAX_RECIPIENTS) {
    throw Object.assign(new Error(`Máximo de ${MAX_RECIPIENTS} destinatários por broadcast.`), { status: 400 });
  }

  const delay = Math.min(Math.max(Number(delayMs) || 3000, MIN_DELAY_MS), MAX_DELAY_MS);

  const jids = recipients.map(normalizeJid).filter(Boolean);
  if (!jids.length) throw Object.assign(new Error('Nenhum número válido encontrado.'), { status: 400 });

  // Verify device belongs to this user
  const dev = await db.query(
    'SELECT id FROM agent_devices WHERE id=$1 AND user_id=$2',
    [deviceId, userId]
  );
  if (!dev.rows[0]) throw Object.assign(new Error('Dispositivo não encontrado.'), { status: 404 });

  const br = await db.query(
    `INSERT INTO broadcasts(user_id, device_id, message, delay_ms, status, total)
     VALUES($1,$2,$3,$4,'pending',$5) RETURNING *`,
    [userId, deviceId, message.trim(), delay, jids.length]
  );
  const broadcast = br.rows[0];

  // Bulk insert recipients
  const vals = jids.map((jid, i) => `($${i * 2 + 1},$${i * 2 + 2},'pending')`).join(',');
  const flat = jids.flatMap(jid => [broadcast.id, jid]);
  await db.query(
    `INSERT INTO broadcast_recipients(broadcast_id, jid, status) VALUES ${vals}`,
    flat
  );

  // Fire and forget — caller gets immediate response
  runBroadcast(userId, broadcast.id).catch(e =>
    logger.error({ event: 'broadcast_run_error', broadcastId: broadcast.id, err: e.message })
  );

  return broadcast;
}

async function runBroadcast(userId, broadcastId) {
  activeRuns.add(broadcastId);
  try {
    await db.query(
      `UPDATE broadcasts SET status='running', started_at=NOW() WHERE id=$1`,
      [broadcastId]
    );

    const br = await db.query('SELECT * FROM broadcasts WHERE id=$1', [broadcastId]);
    const broadcast = br.rows[0];
    if (!broadcast) return;

    const rcpts = await db.query(
      `SELECT * FROM broadcast_recipients WHERE broadcast_id=$1 AND status='pending' ORDER BY id`,
      [broadcastId]
    );

    let sent = 0;
    let failed = 0;

    for (const rcpt of rcpts.rows) {
      if (!activeRuns.has(broadcastId)) {
        // Cancelled — mark remaining as cancelled
        await db.query(
          `UPDATE broadcast_recipients SET status='cancelled' WHERE broadcast_id=$1 AND status='pending'`,
          [broadcastId]
        );
        break;
      }

      try {
        await wa.sendText(userId, broadcast.device_id, rcpt.jid, broadcast.message);
        await db.query(
          `UPDATE broadcast_recipients SET status='sent', sent_at=NOW() WHERE id=$1`,
          [rcpt.id]
        );
        sent++;
      } catch (e) {
        logger.warn({ event: 'broadcast_send_failed', broadcastId, jid: rcpt.jid, err: e.message });
        await db.query(
          `UPDATE broadcast_recipients SET status='failed', error=$1 WHERE id=$2`,
          [e.message.slice(0, 200), rcpt.id]
        );
        failed++;
      }

      await db.query(
        `UPDATE broadcasts SET sent=$1, failed=$2 WHERE id=$3`,
        [sent, failed, broadcastId]
      );

      // Delay between sends — check cancellation during wait
      if (broadcast.delay_ms > 0 && rcpt !== rcpts.rows[rcpts.rows.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, broadcast.delay_ms));
      }
    }

    const finalStatus = !activeRuns.has(broadcastId) ? 'cancelled'
      : failed === rcpts.rows.length ? 'failed'
      : sent === 0 ? 'failed'
      : 'completed';

    await db.query(
      `UPDATE broadcasts SET status=$1, finished_at=NOW(), sent=$2, failed=$3 WHERE id=$4`,
      [finalStatus, sent, failed, broadcastId]
    );

    dispatch(userId, 'message.sent', {
      broadcastId,
      total: rcpts.rows.length,
      sent,
      failed,
      status: finalStatus,
      _broadcast: true,
    }).catch(() => {});

    logger.info({ event: 'broadcast_finished', broadcastId, sent, failed, finalStatus });
  } finally {
    activeRuns.delete(broadcastId);
  }
}

async function cancelBroadcast(userId, broadcastId) {
  const br = await db.query(
    `SELECT * FROM broadcasts WHERE id=$1 AND user_id=$2`,
    [broadcastId, userId]
  );
  const broadcast = br.rows[0];
  if (!broadcast) throw Object.assign(new Error('Broadcast não encontrado.'), { status: 404 });
  if (!['pending', 'running'].includes(broadcast.status)) {
    throw Object.assign(new Error('Apenas broadcasts em execução podem ser cancelados.'), { status: 400 });
  }
  activeRuns.delete(broadcastId);
  await db.query(
    `UPDATE broadcasts SET status='cancelled', finished_at=NOW() WHERE id=$1`,
    [broadcastId]
  );
  await db.query(
    `UPDATE broadcast_recipients SET status='cancelled' WHERE broadcast_id=$1 AND status='pending'`,
    [broadcastId]
  );
}

async function getBroadcast(userId, broadcastId) {
  const br = await db.query(
    `SELECT * FROM broadcasts WHERE id=$1 AND user_id=$2`,
    [broadcastId, userId]
  );
  const broadcast = br.rows[0];
  if (!broadcast) return null;
  const rcpts = await db.query(
    `SELECT id, jid, status, error, sent_at FROM broadcast_recipients WHERE broadcast_id=$1 ORDER BY id`,
    [broadcastId]
  );
  return { ...broadcast, recipients: rcpts.rows };
}

async function listBroadcasts(userId, { limit = 20, offset = 0 } = {}) {
  const r = await db.query(
    `SELECT * FROM broadcasts WHERE user_id=$1 ORDER BY id DESC LIMIT $2 OFFSET $3`,
    [userId, Math.min(Number(limit), 100), Number(offset)]
  );
  return r.rows;
}

module.exports = { createBroadcast, cancelBroadcast, getBroadcast, listBroadcasts, MAX_RECIPIENTS, MIN_DELAY_MS };
