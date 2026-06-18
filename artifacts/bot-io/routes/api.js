'use strict';

const router = require('express').Router();
const db = require('../lib/db');
const agentsLib = require('../lib/agents');
const wa = require('../lib/wa-manager');
const { requireAuth, limiters } = require('../lib/middleware');

router.use(requireAuth);
router.use(limiters.api);

// Helper: trata erros de API key e rate-limit de forma padronizada
// CORRIGIDO: erros de chave ausente/inválida chegam corretamente ao cliente
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

// CORRIGIDO: rota SSE com cleanup correto de conexão (já tratado dentro de addSse)
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
