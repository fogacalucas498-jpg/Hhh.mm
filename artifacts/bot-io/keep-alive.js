'use strict';

// CORRIGIDO: URL usa REPLIT_DEV_DOMAIN; ping a cada 3min (mais seguro que 4min para Replit free)
const APP_URL = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;

let _pingInterval = null;

function startKeepAlive() {
  if (_pingInterval) return;
  const url = `${APP_URL}/ping`;
  console.log('[keep-alive] iniciado, URL:', url);

  const doPing = async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (r.status !== 200) {
        console.warn('[keep-alive] ping retornou status inesperado:', r.status);
      }
    } catch (e) {
      console.warn('[keep-alive] ping falhou:', e.message);
    }
  };

  const first = setTimeout(() => {
    doPing();
    _pingInterval = setInterval(doPing, 3 * 60 * 1000);
  }, 20000);

  if (first.unref) first.unref();
}

function stopKeepAlive() {
  if (_pingInterval) { clearInterval(_pingInterval); _pingInterval = null; }
}

module.exports = { startKeepAlive, stopKeepAlive };
