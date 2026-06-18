'use strict';

const db = require('./db');

const MIGRATIONS = [
  {
    id: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        system_prompt TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
        provider TEXT NOT NULL DEFAULT 'openai',
        enabled BOOLEAN NOT NULL DEFAULT true,
        debounce_ms INTEGER NOT NULL DEFAULT 1500,
        max_tokens INTEGER NOT NULL DEFAULT 500,
        temperature NUMERIC(3,2) NOT NULL DEFAULT 0.7,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS agent_training (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS agent_media (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'image',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS agent_custom_fields (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        field_name TEXT NOT NULL,
        field_value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_devices (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
        name TEXT NOT NULL DEFAULT 'Dispositivo',
        phone TEXT,
        status TEXT NOT NULL DEFAULT 'disconnected',
        session_data JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        jid TEXT NOT NULL,
        name TEXT,
        phone TEXT,
        tags TEXT[] DEFAULT '{}',
        custom_data JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, jid)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id INTEGER REFERENCES agent_devices(id) ON DELETE SET NULL,
        agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
        contact_jid TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('in','out')),
        body TEXT,
        msg_type TEXT NOT NULL DEFAULT 'text',
        wa_msg_id TEXT,
        status TEXT NOT NULL DEFAULT 'sent',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS messages_user_contact ON messages(user_id, contact_jid);
      CREATE INDEX IF NOT EXISTS messages_device ON messages(device_id);

      CREATE TABLE IF NOT EXISTS flows (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        trigger_keyword TEXT NOT NULL,
        trigger_mode TEXT NOT NULL DEFAULT 'exact',
        enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS flow_steps (
        id SERIAL PRIMARY KEY,
        flow_id INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
        step_order INTEGER NOT NULL DEFAULT 0,
        response_text TEXT NOT NULL,
        delay_ms INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS group_bots (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id INTEGER NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
        agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        group_jid TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(device_id, group_jid)
      );

      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `
  },
  {
    id: 2,
    name: 'profile_and_agent_features',
    sql: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

      ALTER TABLE agents ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT NULL;
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS welcome_message TEXT NOT NULL DEFAULT '';

      CREATE TABLE IF NOT EXISTS user_api_keys (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        openai_key TEXT,
        anthropic_key TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS first_contacts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id INTEGER NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
        contact_jid TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(device_id, contact_jid)
      );
    `
  },
  {
    id: 3,
    name: 'webhooks',
    sql: `
      CREATE TABLE IF NOT EXISTS webhooks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        secret TEXT,
        events TEXT[] NOT NULL DEFAULT '{}',
        enabled BOOLEAN NOT NULL DEFAULT true,
        last_triggered_at TIMESTAMPTZ,
        last_status INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS webhooks_user ON webhooks(user_id);
    `
  }
];

async function runMigrations() {
  const client = await db.pool.connect();
  try {
    await client.query('SET statement_timeout = 0');

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const applied = await client.query('SELECT id FROM schema_migrations');
    const appliedIds = new Set(applied.rows.map(r => r.id));

    for (const m of MIGRATIONS) {
      if (appliedIds.has(m.id)) continue;
      console.log(`[migrations] Aplicando migration ${m.id}: ${m.name}`);
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query(
          'INSERT INTO schema_migrations(id, name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',
          [m.id, m.name]
        );
        await client.query('COMMIT');
        console.log(`[migrations] Migration ${m.id} aplicada com sucesso.`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
