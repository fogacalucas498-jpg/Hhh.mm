'use strict';

const router = require('express').Router();
const db = require('../lib/db');
const agentsLib = require('../lib/agents');
const wa = require('../lib/wa-manager');
const { requireAuth, limiters } = require('../lib/middleware');

// Health check — must be before requireAuth so the deployment probe can reach it
router.get('/health', (_req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()) }));

router.use(requireAuth);
router.use(limiters.api);

function handleApiError(res, e) {
  if (e.code === 'NO_OPENAI_KEY' || e.code === 'NO_ANTHROPIC_KEY') {
    return res.status(402).json({ error: e.message, code: e.code });
  }
  if (e.code === 'INVALID_OPENAI_KEY' || e.code === 'INVALID_ANTHROPIC_KEY') {
    return res.status(401).json({ error: e.message, code: e.code });
  }
  if (e.code === 'RATE_LIMITED') {
    return res.status(429).json({ error: e.message, code: e.code });
  }
  console.error('[api] error:', e.message);
  res.status(500).json({ error: 'Erro interno. Tente novamente.' });
}

// ── AGENTS ────────────────────────────────────────────────────────────────────
router.get('/agents', async (req, res) => {
  try {
    const agents = await agentsLib.listAgents(req.userId);
    res.json({ agents });
  } catch (e) { handleApiError(res, e); }
});

router.post('/agents', async (req, res) => {
  try {
    const agent = await agentsLib.createAgent(req.userId, req.body);
    res.status(201).json({ agent });
  } catch (e) { handleApiError(res, e); }
});

router.get('/agents/:id', async (req, res) => {
  try {
    const agent = await agentsLib.getAgent(req.userId, req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agente não encontrado.' });
    res.json({ agent });
  } catch (e) { handleApiError(res, e); }
});

router.patch('/agents/:id', async (req, res) => {
  try {
    const agent = await agentsLib.updateAgent(req.userId, req.params.id, req.body);
    if (!agent) return res.status(404).json({ error: 'Agente não encontrado.' });
    res.json({ agent });
  } catch (e) { handleApiError(res, e); }
});

router.delete('/agents/:id', async (req, res) => {
  try {
    await agentsLib.deleteAgent(req.userId, req.params.id);
    res.json({ ok: true });
  } catch (e) { handleApiError(res, e); }
});

// ── TRAINING ──────────────────────────────────────────────────────────────────
router.get('/agents/:id/training', async (req, res) => {
  try {
    const r = await db.query(
      'SELECT * FROM agent_training WHERE agent_id=$1 ORDER BY id',
      [req.params.id]
    );
    res.json({ items: r.rows });
  } catch (e) { handleApiError(res, e); }
});

router.post('/agents/:id/training', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'content é obrigatório.' });
    const item = await agentsLib.addTraining(req.params.id, content);
    res.status(201).json({ item });
  } catch (e) { handleApiError(res, e); }
});

router.delete('/agents/:agentId/training/:trainingId', async (req, res) => {
  try {
    await agentsLib.deleteTraining(req.params.agentId, req.params.trainingId);
    res.json({ ok: true });
  } catch (e) { handleApiError(res, e); }
});

// ── CUSTOM FIELDS (Lead fields) ────────────────────────────────────────────────
router.get('/agents/:id/custom-fields', async (req, res) => {
  try {
    const r = await db.query(
      'SELECT * FROM agent_custom_fields WHERE agent_id=$1 ORDER BY id',
      [req.params.id]
    );
    res.json({ fields: r.rows });
  } catch (e) { handleApiError(res, e); }
});

router.post('/agents/:id/custom-fields', async (req, res) => {
  try {
    const { field_name, field_value } = req.body;
    if (!field_name) return res.status(400).json({ error: 'field_name é obrigatório.' });
    const r = await db.query(
      'INSERT INTO agent_custom_fields(agent_id, field_name, field_value) VALUES($1,$2,$3) RETURNING *',
      [req.params.id, field_name.trim(), field_value || '']
    );
    res.status(201).json({ field: r.rows[0] });
  } catch (e) { handleApiError(res, e); }
});

router.patch('/agents/:agentId/custom-fields/:fieldId', async (req, res) => {
  try {
    const { field_name, field_value } = req.body;
    const updates = [];
    const vals = [];
    if (field_name !== undefined) { updates.push(`field_name=$${vals.length + 1}`); vals.push(field_name.trim()); }
    if (field_value !== undefined) { updates.push(`field_value=$${vals.length + 1}`); vals.push(field_value); }
    if (!updates.length) return res.status(400).json({ error: 'Nada para atualizar.' });
    vals.push(req.params.fieldId, req.params.agentId);
    const r = await db.query(
      `UPDATE agent_custom_fields SET ${updates.join(',')} WHERE id=$${vals.length - 1} AND agent_id=$${vals.length} RETURNING *`,
      vals
    );
    res.json({ field: r.rows[0] });
  } catch (e) { handleApiError(res, e); }
});

router.delete('/agents/:agentId/custom-fields/:fieldId', async (req, res) => {
  try {
    await db.query('DELETE FROM agent_custom_fields WHERE id=$1 AND agent_id=$2', [req.params.fieldId, req.params.agentId]);
    res.json({ ok: true });
  } catch (e) { handleApiError(res, e); }
});

// ── MEDIA ─────────────────────────────────────────────────────────────────────
router.get('/agents/:id/media', async (req, res) => {
  try {
    const media = await agentsLib.getMedia(req.params.id);
    res.json({ media });
  } catch (e) { handleApiError(res, e); }
});

router.post('/agents/:id/media', async (req, res) => {
  try {
    const item = await agentsLib.addMedia(req.params.id, req.body);
    res.status(201).json({ item });
  } catch (e) { handleApiError(res, e); }
});

router.delete('/agents/:agentId/media/:mediaId', async (req, res) => {
  try {
    await agentsLib.deleteMedia(req.params.agentId, req.params.mediaId);
    res.json({ ok: true });
  } catch (e) { handleApiError(res, e); }
});

// ── FLOWS ─────────────────────────────────────────────────────────────────────
router.get('/agents/:id/flows', async (req, res) => {
  try {
    const flows = await agentsLib.getFlows(req.userId, req.params.id);
    res.json({ flows });
  } catch (e) { handleApiError(res, e); }
});

router.post('/agents/:id/flows', async (req, res) => {
  try {
    const flow = await agentsLib.createFlow(req.userId, req.params.id, req.body);
    res.status(201).json({ flow });
  } catch (e) { handleApiError(res, e); }
});

router.delete('/agents/:agentId/flows/:flowId', async (req, res) => {
  try {
    await agentsLib.deleteFlow(req.userId, req.params.flowId);
    res.json({ ok: true });
  } catch (e) { handleApiError(res, e); }
});

// ── USER API KEYS ─────────────────────────────────────────────────────────────
router.get('/settings/api-keys', async (req, res) => {
  try {
    const r = await db.query(
      'SELECT openai_key, anthropic_key FROM user_api_keys WHERE user_id=$1',
      [req.userId]
    );
    const row = r.rows[0] || {};
    // Mask keys: show only last 4 chars
    const mask = (k) => k ? `sk-...${k.slice(-4)}` : '';
    res.json({
      openai_key_set: !!row.openai_key,
      openai_key_hint: mask(row.openai_key),
      anthropic_key_set: !!row.anthropic_key,
      anthropic_key_hint: mask(row.anthropic_key),
    });
  } catch (e) { handleApiError(res, e); }
});

router.patch('/settings/api-keys', async (req, res) => {
  try {
    const { openai_key, anthropic_key } = req.body;
    // Get existing
    const existing = await db.query('SELECT id FROM user_api_keys WHERE user_id=$1', [req.userId]);
    if (existing.rows.length) {
      const updates = [];
      const vals = [];
      if (openai_key !== undefined) {
        updates.push(`openai_key=$${vals.length + 1}`);
        vals.push(openai_key || null);
      }
      if (anthropic_key !== undefined) {
        updates.push(`anthropic_key=$${vals.length + 1}`);
        vals.push(anthropic_key || null);
      }
      if (updates.length) {
        updates.push(`updated_at=NOW()`);
        vals.push(req.userId);
        await db.query(`UPDATE user_api_keys SET ${updates.join(',')} WHERE user_id=$${vals.length}`, vals);
      }
    } else {
      await db.query(
        'INSERT INTO user_api_keys(user_id, openai_key, anthropic_key) VALUES($1,$2,$3)',
        [req.userId, openai_key || null, anthropic_key || null]
      );
    }
    res.json({ ok: true });
  } catch (e) { handleApiError(res, e); }
});

router.delete('/settings/api-keys/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    if (!['openai', 'anthropic'].includes(provider)) {
      return res.status(400).json({ error: 'Provider inválido.' });
    }
    const col = provider === 'openai' ? 'openai_key' : 'anthropic_key';
    await db.query(`UPDATE user_api_keys SET ${col}=NULL WHERE user_id=$1`, [req.userId]);
    res.json({ ok: true });
  } catch (e) { handleApiError(res, e); }
});

// ── DEVICES ───────────────────────────────────────────────────────────────────
router.get('/devices', async (req, res) => {
  try {
    const r = await db.query(
      'SELECT * FROM agent_devices WHERE user_id=$1 ORDER BY id DESC',
      [req.userId]
    );
    const devices = r.rows.map(d => ({
      ...d,
      ...wa.getDeviceStatus(d.id)
    }));
    res.json({ devices });
  } catch (e) { handleApiError(res, e); }
});

router.post('/devices', async (req, res) => {
  try {
    const { name = 'Dispositivo', agentId } = req.body;
    const r = await db.query(
      'INSERT INTO agent_devices(user_id, agent_id, name) VALUES($1,$2,$3) RETURNING *',
      [req.userId, agentId || null, name]
    );
    res.status(201).json({ device: r.rows[0] });
  } catch (e) { handleApiError(res, e); }
});

router.patch('/devices/:id', async (req, res) => {
  try {
    const { name, agentId } = req.body;
    const updates = [];
    const vals = [];
    if (name) { updates.push(`name=$${vals.length + 1}`); vals.push(name); }
    if (agentId !== undefined) { updates.push(`agent_id=$${vals.length + 1}`); vals.push(agentId || null); }
    if (!updates.length) return res.status(400).json({ error: 'Nada para atualizar.' });
    vals.push(req.params.id, req.userId);
    const r = await db.query(
      `UPDATE agent_devices SET ${updates.join(',')} WHERE id=$${vals.length - 1} AND user_id=$${vals.length} RETURNING *`,
      vals
    );
    res.json({ device: r.rows[0] });
  } catch (e) { handleApiError(res, e); }
});

router.delete('/devices/:id', async (req, res) => {
  try {
    await wa.stopDevice(req.userId, req.params.id);
    await db.query('DELETE FROM agent_devices WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (e) { handleApiError(res, e); }
});

router.post('/devices/:id/connect', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM agent_devices WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Dispositivo não encontrado.' });
    wa.startDevice(req.userId, req.params.id).catch(e =>
      console.error('[api] startDevice error:', e.message)
    );
    res.json({ ok: true, message: 'Conectando... aguarde o QR via SSE.' });
  } catch (e) { handleApiError(res, e); }
});

router.post('/devices/:id/disconnect', async (req, res) => {
  try {
    await wa.stopDevice(req.userId, req.params.id);
    res.json({ ok: true });
  } catch (e) { handleApiError(res, e); }
});

router.post('/devices/:id/logout', async (req, res) => {
  try {
    await wa.logoutDevice(req.userId, req.params.id);
    res.json({ ok: true });
  } catch (e) { handleApiError(res, e); }
});

router.post('/devices/:id/pairing-code', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone é obrigatório.' });
    const r = await db.query(
      'SELECT * FROM agent_devices WHERE id=$1 AND user_id=$2',
      [req.params.id, req.userId]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Dispositivo não encontrado.' });
    const code = await wa.getPairingCode(req.userId, req.params.id, phone);
    res.json({ ok: true, code });
  } catch (e) {
    console.error('[api] pairing-code error:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao solicitar código de pareamento.' });
  }
});

// ── MESSAGES ──────────────────────────────────────────────────────────────────
router.get('/messages', async (req, res) => {
  try {
    const { jid, limit = 50, offset = 0 } = req.query;
    let q = 'SELECT * FROM messages WHERE user_id=$1';
    const vals = [req.userId];
    if (jid) { q += ` AND contact_jid=$${vals.length + 1}`; vals.push(jid); }
    q += ` ORDER BY id DESC LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`;
    vals.push(Math.min(Number(limit), 200), Number(offset));
    const r = await db.query(q, vals);
    res.json({ messages: r.rows.reverse() });
  } catch (e) { handleApiError(res, e); }
});

router.post('/messages/send', async (req, res) => {
  try {
    const { deviceId, jid, text } = req.body;
    if (!deviceId || !jid || !text) {
      return res.status(400).json({ error: 'deviceId, jid e text são obrigatórios.' });
    }
    await wa.sendText(req.userId, deviceId, jid, text);
    res.json({ ok: true });
  } catch (e) { handleApiError(res, e); }
});

// ── CONTACTS ──────────────────────────────────────────────────────────────────
router.get('/contacts', async (req, res) => {
  try {
    const r = await db.query(
      'SELECT * FROM contacts WHERE user_id=$1 ORDER BY name ASC',
      [req.userId]
    );
    res.json({ contacts: r.rows });
  } catch (e) { handleApiError(res, e); }
});

// ── GROUP BOTS ────────────────────────────────────────────────────────────────
router.get('/group-bots', async (req, res) => {
  try {
    const r = await db.query(
      'SELECT * FROM group_bots WHERE user_id=$1 ORDER BY id DESC',
      [req.userId]
    );
    res.json({ groupBots: r.rows });
  } catch (e) { handleApiError(res, e); }
});

router.post('/group-bots', async (req, res) => {
  try {
    const { deviceId, agentId, groupJid } = req.body;
    if (!deviceId || !agentId || !groupJid) {
      return res.status(400).json({ error: 'deviceId, agentId e groupJid são obrigatórios.' });
    }
    const r = await db.query(
      `INSERT INTO group_bots(user_id, device_id, agent_id, group_jid)
       VALUES($1,$2,$3,$4) ON CONFLICT(device_id, group_jid) DO UPDATE SET agent_id=$3, enabled=true RETURNING *`,
      [req.userId, deviceId, agentId, groupJid]
    );
    res.status(201).json({ groupBot: r.rows[0] });
  } catch (e) { handleApiError(res, e); }
});

router.delete('/group-bots/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM group_bots WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (e) { handleApiError(res, e); }
});

// ── SERVER STATS ──────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const mem = process.memoryUsage();
    const toMb = (b) => Math.round(b / 1024 / 1024);

    // Count connected devices for this user
    const devicesResult = await db.query(
      'SELECT id FROM devices WHERE user_id=$1', [req.userId]
    );
    const deviceIds = devicesResult.rows.map(r => r.id);
    let connectedDevices = 0;
    for (const id of deviceIds) {
      const s = wa.getDeviceStatus(id);
      if (s.status === 'connected') connectedDevices++;
    }

    // Message counts
    const [totalResult, last24hResult] = await Promise.all([
      db.query('SELECT COUNT(*)::int AS n FROM messages WHERE user_id=$1', [req.userId]),
      db.query(
        "SELECT COUNT(*)::int AS n FROM messages WHERE user_id=$1 AND created_at > NOW() - INTERVAL '24 hours'",
        [req.userId]
      ),
    ]);

    const uptimeSeconds = Math.round(process.uptime());
    const d = Math.floor(uptimeSeconds / 86400);
    const h = Math.floor((uptimeSeconds % 86400) / 3600);
    const m = Math.floor((uptimeSeconds % 3600) / 60);
    const uptimeFormatted =
      d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;

    res.json({
      uptime: uptimeSeconds,
      uptimeFormatted,
      memory: {
        rssMb:       toMb(mem.rss),
        heapUsedMb:  toMb(mem.heapUsed),
        heapTotalMb: toMb(mem.heapTotal),
        limitMb:     450,
      },
      devices: {
        total:     deviceIds.length,
        connected: connectedDevices,
      },
      messages: {
        total:    totalResult.rows[0].n,
        last24h:  last24hResult.rows[0].n,
      },
      process: {
        pid:         process.pid,
        nodeVersion: process.version,
        platform:    process.platform,
      },
    });
  } catch (e) { handleApiError(res, e); }
});

// SSE
router.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  wa.addSse(req.userId, res);
});

module.exports = router;
