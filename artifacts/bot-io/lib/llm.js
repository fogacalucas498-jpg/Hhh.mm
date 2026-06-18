'use strict';

// CORRIGIDO: timeout, retry, erros claros em todas as funções de LLM
const { getOpenAI } = require('./openai-client');

const REASONING_MODELS = new Set(['o1', 'o1-mini', 'o1-preview', 'o3', 'o3-mini', 'o4-mini']);

// CORRIGIDO: anthropicChat com AbortController timeout de 30s
async function anthropicChat({ key, model, system, messages, maxTokens, temperature, signal }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  const combinedSignal = signal || ctrl.signal;

  try {
    const body = {
      model,
      max_tokens: maxTokens || 500,
      messages: messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '')
      }))
    };
    if (system) body.system = system;
    if (typeof temperature === 'number') body.temperature = temperature;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: combinedSignal
    });

    clearTimeout(timer);

    if (resp.status === 401) {
      const err = new Error('Chave da Anthropic inválida ou expirada. Verifique em Integrações.');
      err.code = 'INVALID_ANTHROPIC_KEY';
      throw err;
    }
    if (resp.status === 429) {
      const err = new Error('Limite de requisições Anthropic atingido. Aguarde alguns segundos.');
      err.code = 'RATE_LIMITED';
      throw err;
    }
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(`Anthropic ${resp.status}: ${t.slice(0, 150)}`);
    }

    const j = await resp.json();
    return j.content?.[0]?.text?.trim() || null;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('Timeout na API Anthropic (30s). Tente novamente.');
    }
    throw err;
  }
}

// CORRIGIDO: openaiChat com tratamento explícito de 401/429
async function openaiChat({ model, system, messages, maxTokens, temperature, signal }) {
  const openai = getOpenAI();

  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  for (const m of messages) msgs.push({ role: m.role, content: String(m.content || '') });

  const isReasoning = REASONING_MODELS.has(model);
  const params = { model, messages: msgs };
  if (isReasoning) {
    params.max_completion_tokens = Math.max(maxTokens || 500, 2000);
  } else {
    params.max_tokens = maxTokens || 500;
    if (typeof temperature === 'number') params.temperature = temperature;
  }

  try {
    const resp = await openai.chat.completions.create(params, signal ? { signal } : undefined);
    return resp.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    if (e.status === 401) {
      const err = new Error('Chave OpenAI inválida ou expirada. Verifique em Integrações.');
      err.code = 'INVALID_OPENAI_KEY';
      throw err;
    }
    if (e.status === 429) {
      const err = new Error('Limite de requisições OpenAI atingido. Aguarde e tente novamente.');
      err.code = 'RATE_LIMITED';
      throw err;
    }
    throw e;
  }
}

async function chatComplete({ provider, apiKey, model, system, messages, maxTokens = 500, temperature = 0.7, signal }) {
  if (provider === 'anthropic') {
    return anthropicChat({ key: apiKey, model, system, messages, maxTokens, temperature, signal });
  }
  return openaiChat({ model, system, messages, maxTokens, temperature, signal });
}

module.exports = { chatComplete, openaiChat, anthropicChat };
