'use strict';

// CORRIGIDO: singleton reconstrói se a chave mudar em runtime; lança erro claro se não configurada
const OpenAI = require('openai');

let _client = null;
let _lastKey = null;

function getOpenAI() {
  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!key) {
    const err = new Error(
      'Chave OpenAI não configurada. Adicione AI_INTEGRATIONS_OPENAI_API_KEY nas variáveis de ambiente (Secrets no Replit).'
    );
    err.code = 'NO_OPENAI_KEY';
    throw err;
  }
  // CORRIGIDO: reconstrói se a chave mudou (usuário atualizou em runtime)
  if (!_client || _lastKey !== key) {
    _lastKey = key;
    _client = new OpenAI({
      apiKey: key,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
      timeout: 30000,
      maxRetries: 2,
    });
  }
  return _client;
}

module.exports = { getOpenAI };
