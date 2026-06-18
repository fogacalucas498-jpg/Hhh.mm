'use strict';

const crypto = require('crypto');
const db = require('./db');
const pino = require('pino');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const TIMEOUT_MS = 10_000;
const MAX_WEBHOOKS_PER_USER = 10;

const VALID_EVENTS = new Set([
  'message.received',
  'message.sent',
  'device.connected',
  'device.disconnected',
  'device.qr',
]);

function signPayload(secret, body) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function dispatch(userId, event, data) {
  if (!VALID_EVENTS.has(event)) return;

  let rows;
  try {
    const r = await db.query(
      `SELECT id, url, secret, events FROM webhooks
       WHERE user_id=$1 AND enabled=true`,
      [userId]
    );
    rows = r.rows;
  } catch (e) {
    logger.warn({ event: 'webhook_fetch_failed', err: e.message });
    return;
  }

  if (!rows.length) return;

  const payload = JSON.stringify({ event, timestamp: Date.now(), data });

  for (const hook of rows) {
    // If events array is non-empty, only fire for listed events
    if (hook.events.length > 0 && !hook.events.includes(event)) continue;

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'bot777-webhook/1.0',
      'X-Webhook-Event': event,
      'X-Webhook-Timestamp': String(Date.now()),
    };
    if (hook.secret) {
      headers['X-Webhook-Signature'] = signPayload(hook.secret, payload);
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    let status = null;
    try {
      const res = await fetch(hook.url, {
        method: 'POST',
        headers,
        body: payload,
        signal: ctrl.signal,
      });
      status = res.status;
      logger.info({ event: 'webhook_fired', hookId: hook.id, httpStatus: status, webhookEvent: event });
    } catch (e) {
      logger.warn({ event: 'webhook_delivery_failed', hookId: hook.id, err: e.message });
    } finally {
      clearTimeout(timer);
    }

    db.query(
      'UPDATE webhooks SET last_triggered_at=NOW(), last_status=$1 WHERE id=$2',
      [status, hook.id]
    ).catch(() => {});
  }
}

module.exports = { dispatch, VALID_EVENTS, MAX_WEBHOOKS_PER_USER };
