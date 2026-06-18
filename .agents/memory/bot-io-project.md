---
name: Bot.io project
description: Plain Node.js WhatsApp bot platform built from scratch in artifacts/bot-io/
---

## Structure
- Entry: `artifacts/bot-io/server.js`
- All libs in `artifacts/bot-io/lib/` (plain CJS, no TypeScript)
- Routes: `artifacts/bot-io/routes/`
- Workflow: "Bot.io Server" → `pnpm --filter @workspace/bot-io run dev` → port 5000

## Environment
- `DATABASE_URL` — runtime-managed by Replit (PostgreSQL); already set
- `SESSION_SECRET` — already set as secret (must be ≥32 chars)
- `AI_INTEGRATIONS_OPENAI_API_KEY` — NOT set; needed for AI features; warn-only at startup
- `ANTHROPIC_API_KEY` — optional; needed for Anthropic model usage

## Key decisions
- Plain Node.js (no TypeScript, no Redis, no Docker) — Replit free plan constraint
- Baileys `@whiskeysockets/baileys@7.0.0-rc13` for WhatsApp
- `onlyBuiltDependencies` in pnpm-workspace.yaml updated to include baileys, protobufjs, sharp
- Sessions stored in `artifacts/bot-io/sessions/` as files (useMultiFileAuthState)
- Circuit breaker in `lib/breaker.js` (in-memory, no external deps)

**Why:** Replit free plan = single process, no Redis, no Docker. All state kept in-process or PostgreSQL.

**How to apply:** Never add Redis/cluster dependencies. Keep everything single-process friendly.
