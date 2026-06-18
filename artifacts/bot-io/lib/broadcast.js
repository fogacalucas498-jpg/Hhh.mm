'use strict';

const db = require('./db');
const wa = require('./wa-manager');
const { dispatch } = require('./webhook-dispatcher');
const pino = require('pino');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const MAX_RECIPIENTS = 1000;
const MIN_DELAY_MS   = 1000;
const MAX_DELAY_MS   = 60_000;
const SCHEDULER_INTERVAL_MS = 30_000; // poll every 30s

// Tracks running broadcasts so cancellation can interrupt mid-send
const activeRuns = new Set();

function normalizeJid(raw) {
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

/**
 * Parse and validate a scheduledAt value from the API.
 * Returns a Date if valid and in the future, null if not provided, or throws if malformed.
 */
function parseScheduledAt(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    throw Object.assign(new Error('scheduled_at inválido. Use formato ISO 8601 (ex: 2026-07-01T15:00:00Z).'), { status: 400 });
  }
  if (d.getTime() <= Date.now()) {
    throw Object.assign(new Error('scheduled_at deve ser uma data/hora futura.'), { status: 400 });
  }
  return d;
}

async function createBroadcast(userId, { deviceId, message, recipients, delayMs = 3000, scheduledAt } = {}) {
  if (!deviceId) throw Object.assign(new Error('deviceId é obrigatório.'), { status: 400 });
  if (!message || !String(message).trim()) throw Object.assign(new Error('message é obrigatório.'), { status: 400 });
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw Object.assign(new Error('recipients deve ser um array não vazio.'), { status: 400 });
  }
  if (recipients.length > MAX_RECIPIENTS) {
    throw Object.assign(new Error(`Máximo de ${MAX_RECIPIENTS} destinatários por broadcast.`), { status: 400 });
  }

  const scheduledDate = parseScheduledAt(scheduledAt);
  const delay = Math.min(Math.max(Number(delayMs) || 3000, MIN_DELAY_MS), MAX_DELAY_MS);

  const jids = recipients.map(normalizeJid).filter(Boolean);
  if (!jids.length) throw Object.assign(new Error('Nenhum número válido encontrado.'), { status: 400 });

  // Verify device belongs to this user
  const dev = await db.query(
    'SELECT id FROM agent_devices WHERE id=$1 AND user_id=$2',
    [deviceId, userId]
  );
  if (!dev.rows[0]) throw Object.assign(new Error('Dispositivo não encontrado.'), { status: 404 });

  const status = scheduledDate ? 'scheduled' : 'pending';

  const br = await db.query(
    `INSERT INTO broadcasts(user_id, device_id, message, delay_ms, status, total, scheduled_at)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [userId, deviceId, String(message).trim(), delay, status, jids.length, scheduledDate || null]
  );
  const broadcast = br.rows[0];

  // Bulk-insert recipients
  const placeholders = jids.map((_, i) => `($${i * 2 + 1},$${i * 2 + 2},'pending')`).join(',');
  const flat = jids.flatMap(jid => [broadcast.id, jid]);
  await db.query(
    `INSERT INTO broadcast_recipients(broadcast_id, jid, status) VALUES ${placeholders}`,
    flat
  );

  if (!scheduledDate) {
    // Immediate — fire and forget
    runBroadcast(userId, broadcast.id).catch(e =>
      logger.error({ event: 'broadcast_run_error', broadcastId: broadcast.id, err: e.message })
    );
  } else {
    logger.info({ event: 'broadcast_scheduled', broadcastId: broadcast.id, scheduledAt: scheduledDate });
  }

  return broadcast;
}

async function runBroadcast(userId, broadcastId) {
  if (activeRuns.has(broadcastId)) return; // already running
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

    for (let idx = 0; idx < rcpts.rows.length; idx++) {
      const rcpt = rcpts.rows[idx];

      if (!activeRuns.has(broadcastId)) {
        // Cancelled mid-run — mark remaining as cancelled
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

      // Delay between sends (skip after the last recipient)
      if (broadcast.delay_ms > 0 && idx < rcpts.rows.length - 1) {
        await new Promise(resolve => setTimeout(resolve, broadcast.delay_ms));
      }
    }

    const finalStatus = !activeRuns.has(broadcastId) ? 'cancelled'
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
  if (!['pending', 'running', 'scheduled'].includes(broadcast.status)) {
    throw Object.assign(new Error('Apenas broadcasts pendentes, agendados ou em execução podem ser cancelados.'), { status: 400 });
  }
  activeRuns.delete(Number(broadcastId));
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

async function listBroadcasts(userId, { limit = 20, offset = 0, status } = {}) {
  let q = `SELECT * FROM broadcasts WHERE user_id=$1`;
  const vals = [userId];
  if (status) {
    q += ` AND status=$${vals.length + 1}`;
    vals.push(status);
  }
  q += ` ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`;
  vals.push(Math.min(Number(limit) || 20, 100), Number(offset) || 0);
  const r = await db.query(q, vals);
  return r.rows;
}

/**
 * Poll the DB every 30 s for broadcasts whose scheduled_at is now due.
 * Safe to call multiple times — the activeRuns Set prevents double-execution.
 */
function startScheduler() {
  const tick = async () => {
    try {
      const r = await db.query(
        `SELECT id, user_id FROM broadcasts
         WHERE status = 'scheduled' AND scheduled_at <= NOW()`
      );
      for (const row of r.rows) {
        logger.info({ event: 'scheduler_firing', broadcastId: row.id });
        runBroadcast(row.user_id, row.id).catch(e =>
          logger.error({ event: 'scheduler_run_error', broadcastId: row.id, err: e.message })
        );
      }
    } catch (e) {
      logger.warn({ event: 'scheduler_tick_error', err: e.message });
    }
  };

  // Run once right away (catches any broadcasts that were due while the server was down)
  tick();
  const timer = setInterval(tick, SCHEDULER_INTERVAL_MS);
  timer.unref(); // don't prevent clean exit
  logger.info({ event: 'broadcast_scheduler_started', intervalMs: SCHEDULER_INTERVAL_MS });
}

module.exports = {
  createBroadcast,
  cancelBroadcast,
  getBroadcast,
  listBroadcasts,
  startScheduler,
  MAX_RECIPIENTS,
  MIN_DELAY_MS,
};
