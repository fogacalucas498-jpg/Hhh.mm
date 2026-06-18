---
name: Bot.io session cookie config
description: How to configure express-session cookies to work in Replit's HTTPS proxy environment.
---

## Rule
In Replit, requests go through an HTTPS proxy chain (browser → Replit proxy → Vite proxy → Express). Session cookies must use `sameSite: 'none'` + `secure: true` or they are blocked by the browser.

## How to apply
```js
const isReplit = !!process.env.REPL_ID;
const isProd = process.env.NODE_ENV === 'production';

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isReplit || isProd,
    httpOnly: true,
    sameSite: isReplit ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));
```

Also: always call `req.session.save(cb)` explicitly before sending the login/register response to avoid race conditions with MemoryStore.

**Why:** `sameSite: 'lax'` blocks cookies when the iframe origin differs from the API origin (Replit's proxied preview). `secure: true` is required when `sameSite: 'none'`. Without these, session cookies are set but never sent back on subsequent requests, causing the "login succeeds but redirects back to homepage" bug.
