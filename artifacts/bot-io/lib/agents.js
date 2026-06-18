'use strict';

const db = require('./db');
const llm = require('./llm');

// CORRIGIDO: janela deslizante de histórico — limita tokens e custo
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
  const { name, systemPrompt = '', model = 'gpt-4o-mini', provider = 'openai',
    debounceMs = 1500, maxTokens = 500, temperature = 0.7 } = data;
  const r = await db.query(
    `INSERT INTO agents(user_id, name, system_prompt, model, provider, debounce_ms, max_tokens, temperature)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [userId, name, systemPrompt, model, provider, debounceMs, maxTokens, temperature]
  );
  return r.rows[0];
}

async function updateAgent(userId, agentId, data) {
  const fields = [];
  const vals = [];
  let i = 1;
  const allowed = ['name','system_prompt','model','provider','enabled','debounce_ms','max_tokens','temperature'];
  for (const [k, v] of Object.entries(data)) {
    const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowed.includes(col)) {
      fields.push(`${col}=$${i++}`);
      vals.push(v);
    }
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

async function generateReply({ agent, history, userMessage, customFields = [], training = '' }) {
  let systemParts = [];
  if (agent.system_prompt) systemParts.push(agent.system_prompt);
  if (training) systemParts.push(`\n## Base de Conhecimento\n${training}`);
  if (customFields.length) {
    const cfStr = customFields.map(f => `${f.field_name}: ${f.field_value}`).join('\n');
    systemParts.push(`\n## Campos Personalizados\n${cfStr}`);
  }
  const system = systemParts.join('\n') || 'Você é um assistente útil.';

  // CORRIGIDO: aplica janela deslizante antes de enviar para a API
  const trimmedHistory = trimHistory(history);
  const messages = [...trimmedHistory, { role: 'user', content: userMessage }];

  const apiKey = agent.provider === 'anthropic'
    ? process.env.ANTHROPIC_API_KEY
    : undefined;

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
  generateReply, trimHistory,
  getFlows, createFlow, deleteFlow, tryFlow,
};
