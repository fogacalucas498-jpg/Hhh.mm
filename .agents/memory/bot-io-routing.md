---
name: Bot.io routing
description: How /bot/* API paths are routed to the bot-io backend from the dashboard frontend.
---

## Rule
Do NOT register `artifacts/bot-io` as a Replit artifact (cannot create "api" kind via createArtifact). Instead, use Vite proxy in the dashboard.

## How it works
- `Bot.io Server` workflow runs `node server.js` on port 5000 independently.
- `artifacts/dashboard/vite.config.ts` has `server.proxy["/bot"] → http://localhost:5000`.
- Dashboard frontend calls `/bot/auth/me`, `/bot/api/agents`, etc. — Vite dev server forwards them to port 5000.
- Express routes in bot-io are mounted at both `/bot/*` and `/*` (for flexibility).

**Why:** verifyAndReplaceArtifactToml requires existing artifact.toml; createArtifact only supports frontend types. Adding /bot service to api-server artifact.toml created a conflicting workflow that tried to start bot-io again (port 5000 already in use). Vite proxy is the clean solution.

**How to apply:** Any frontend-only dashboard that needs to call a custom Node.js backend should use Vite proxy, not a separate artifact registration.
