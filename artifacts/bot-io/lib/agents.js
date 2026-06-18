'use strict';

const db = require('./db');
const llm = require('./llm');

function trimHistory(history, maxMsgs = 30, maxChars = 8000) {
  let trimmed = history.slice(-maxMsgs);
  let totalChars = trimmed.reduce((s, m) => s + (m.content || '').length, 0);
  while (totalChars > maxChars && trimmed.length > 2) {
    const removed = trimmed.shift();
    totalChars -= (removed.content || '').length;
  }
  return trimmed;
}

async function getAgent(userId, agentId) {
  const r = await db.query(
    'SELECT * FROM agents WHERE id=$1 AND user_id=$2',
    [agentId, userId]
  );
  return r.rows[0] || null;
}

async function listAgents(userId) {
  const r = await db.query(
    'SELECT * FROM agents WHERE user_id=$1 ORDER BY id DESC',
    [userId]
  );
  return r.rows;
}

async function createAgent(userId, data) {
  const name = data.name;
  const systemPrompt = data.system_prompt ?? data.systemPrompt ?? '';
  const model = data.model ?? 'gpt-4o-mini';
  const provider = data.provider ?? 'openai';
  const debounceMs = data.debounce_ms ?? data.debounceMs ?? 1500;
  const maxTokens = data.max_tokens ?? data.maxTokens ?? 500;
  const temperature = data.temperature ?? 0.7;
  const businessHours = data.business_hours ?? null;
  const welcomeMessage = data.welcome_message ?? '';
  const r = await db.query(
    `INSERT INTO agents(user_id, name, system_prompt, model, provider, debounce_ms, max_tokens, temperature, business_hours, welcome_message)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [userId, name, systemPrompt, model, provider, debounceMs, maxTokens, temperature,
     businessHours ? JSON.stringify(businessHours) : null, welcomeMessage]
  );
  return r.rows[0];
}

async function updateAgent(userId, agentId, data) {
  const fields = [];
  const vals = [];
  let i = 1;
  const allowed = ['name','system_prompt','model','provider','enabled','debounce_ms','max_tokens','temperature','welcome_message'];
  for (const [k, v] of Object.entries(data)) {
    const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowed.includes(col)) {
      fields.push(`${col}=$${i++}`);
      vals.push(v);
    }
  }
  // Handle business_hours separately (JSONB)
  if (data.business_hours !== undefined) {
    fields.push(`business_hours=$${i++}`);
    vals.push(data.business_hours ? JSON.stringify(data.business_hours) : null);
  }
  if (!fields.length) return null;
  fields.push(`updated_at=NOW()`);
  vals.push(agentId, userId);
  const r = await db.query(
    `UPDATE agents SET ${fields.join(',')} WHERE id=$${i++} AND user_id=$${i++} RETURNING *`,
    vals
  );
  return r.rows[0] || null;
}

async function deleteAgent(userId, agentId) {
  await db.query('DELETE FROM agents WHERE id=$1 AND user_id=$2', [agentId, userId]);
}

async function getTraining(agentId) {
  const r = await db.query(
    'SELECT content FROM agent_training WHERE agent_id=$1 ORDER BY id',
    [agentId]
  );
  return r.rows.map(r => r.content).join('\n\n');
}

async function addTraining(agentId, content) {
  const r = await db.query(
    'INSERT INTO agent_training(agent_id, content) VALUES($1,$2) RETURNING *',
    [agentId, content]
  );
  return r.rows[0];
}

async function deleteTraining(agentId, trainingId) {
  await db.query('DELETE FROM agent_training WHERE id=$1 AND agent_id=$2', [trainingId, agentId]);
}

async function getMedia(agentId) {
  const r = await db.query(
    'SELECT * FROM agent_media WHERE agent_id=$1 ORDER BY id',
    [agentId]
  );
  return r.rows;
}

async function addMedia(agentId, data) {
  const { name, url, type = 'image' } = data;
  const r = await db.query(
    'INSERT INTO agent_media(agent_id, name, url, type) VALUES($1,$2,$3,$4) RETURNING *',
    [agentId, name, url, type]
  );
  return r.rows[0];
}

async function deleteMedia(agentId, mediaId) {
  await db.query('DELETE FROM agent_media WHERE id=$1 AND agent_id=$2', [mediaId, agentId]);
}

async function getCustomFields(agentId) {
  const r = await db.query(
    'SELECT field_name, field_value FROM agent_custom_fields WHERE agent_id=$1',
    [agentId]
  );
  return r.rows;
}

// Get per-user API key for a given provider
async function getUserApiKey(userId, provider) {
  try {
    const r = await db.query('SELECT openai_key, anthropic_key FROM user_api_keys WHERE user_id=$1', [userId]);
    if (!r.rows[0]) return null;
    return provider === 'anthropic' ? r.rows[0].anthropic_key : r.rows[0].openai_key;
  } catch (_) { return null; }
}

// Check if current time is within business hours
function isWithinBusinessHours(businessHours) {
  if (!businessHours || !businessHours.enabled) return true;

  const tz = businessHours.timezone || 'America/Sao_Paulo';
  const now = new Date();
  // Get local time in the configured timezone
  const localStr = now.toLocaleString('en-US', { timeZone: tz, hour12: false });
  const local = new Date(localStr);

  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dayKey = dayNames[local.getDay()];
  const schedule = businessHours.schedule || {};
  const dayConfig = schedule[dayKey];

  if (!dayConfig || !dayConfig.active) return false;

  const hhmm = (h, m) => h * 60 + m;
  const hours = local.getHours();
  const minutes = local.getMinutes();
  const current = hhmm(hours, minutes);

  const [startH, startM] = (dayConfig.start || '09:00').split(':').map(Number);
  const [endH, endM] = (dayConfig.end || '18:00').split(':').map(Number);

  return current >= hhmm(startH, startM) && current < hhmm(endH, endM);
}

async function isFirstContact(userId, deviceId, contactJid) {
  try {
    const r = await db.query(
      'SELECT id FROM first_contacts WHERE device_id=$1 AND contact_jid=$2',
      [deviceId, contactJid]
    );
    if (r.rows.length === 0) {
      await db.query(
        'INSERT INTO first_contacts(user_id, device_id, contact_jid) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [userId, deviceId, contactJid]
      );
      return true;
    }
    return false;
  } catch (_) { return false; }
}

async function generateReply({ agent, history, userMessage, customFields = [], training = '', userId, deviceId, contactJid }) {
  let systemParts = [];
  if (agent.system_prompt) systemParts.push(agent.system_prompt);
  if (training) systemParts.push(`\n## Base de Conhecimento\n${training}`);
  if (customFields.length) {
    const cfStr = customFields.map(f => `${f.field_name}: ${f.field_value}`).join('\n');
    systemParts.push(`\n## Campos Personalizados\n${cfStr}`);
  }
  const system = systemParts.join('\n') || 'Você é um assistente útil.';

  const trimmedHistory = trimHistory(history);
  const messages = [...trimmedHistory, { role: 'user', content: userMessage }];

  // Use per-user API key first, then fall back to env var
  let apiKey;
  if (userId) {
    apiKey = await getUserApiKey(userId, agent.provider);
  }
  if (!apiKey) {
    apiKey = agent.provider === 'anthropic'
      ? process.env.ANTHROPIC_API_KEY
      : undefined; // openai-client handles env var internally
  }

  return llm.chatComplete({
    provider: agent.provider,
    apiKey,
    model: agent.model,
    system,
    messages,
    maxTokens: agent.max_tokens || 500,
    temperature: parseFloat(agent.temperature) || 0.7,
  });
}

async function getFlows(userId, agentId) {
  const r = await db.query(
    `SELECT f.*, json_agg(fs.* ORDER BY fs.step_order) as steps
     FROM flows f
     LEFT JOIN flow_steps fs ON fs.flow_id = f.id
     WHERE f.user_id=$1 AND f.agent_id=$2
     GROUP BY f.id ORDER BY f.id`,
    [userId, agentId]
  );
  return r.rows;
}

async function createFlow(userId, agentId, data) {
  const { name, triggerKeyword, triggerMode = 'exact', steps = [] } = data;
  const r = await db.query(
    `INSERT INTO flows(user_id, agent_id, name, trigger_keyword, trigger_mode)
     VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [userId, agentId, name, triggerKeyword, triggerMode]
  );
  const flow = r.rows[0];
  for (let i = 0; i < steps.length; i++) {
    await db.query(
      `INSERT INTO flow_steps(flow_id, step_order, response_text, delay_ms)
       VALUES($1,$2,$3,$4)`,
      [flow.id, i, steps[i].responseText || '', steps[i].delayMs || 0]
    );
  }
  return flow;
}

async function deleteFlow(userId, flowId) {
  await db.query('DELETE FROM flows WHERE id=$1 AND user_id=$2', [flowId, userId]);
}

async function tryFlow(userId, body) {
  if (!body) return null;
  const r = await db.query(
    `SELECT f.*, json_agg(fs.* ORDER BY fs.step_order) as steps
     FROM flows f
     LEFT JOIN flow_steps fs ON fs.flow_id = f.id
     WHERE f.user_id=$1 AND f.enabled=true
     GROUP BY f.id`,
    [userId]
  );
  const lower = body.toLowerCase().trim();
  for (const flow of r.rows) {
    const kw = (flow.trigger_keyword || '').toLowerCase().trim();
    const match = flow.trigger_mode === 'contains'
      ? lower.includes(kw)
      : lower === kw;
    if (match && flow.steps && flow.steps[0]) {
      return flow.steps[0].response_text || null;
    }
  }
  return null;
}

module.exports = {
  getAgent, listAgents, createAgent, updateAgent, deleteAgent,
  getTraining, addTraining, deleteTraining,
  getMedia, addMedia, deleteMedia,
  getCustomFields,
  getUserApiKey,
  isWithinBusinessHours,
  isFirstContact,
  generateReply, trimHistory,
  getFlows, createFlow, deleteFlow, tryFlow,
};
