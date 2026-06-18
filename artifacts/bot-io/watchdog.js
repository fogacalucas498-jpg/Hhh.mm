'use strict';

/**
 * Internal watchdog — pings /healthz on localhost every INTERVAL_MS.
 * If FAIL_THRESHOLD consecutive pings fail or time out, calls process.exit(1)
 * so the Replit VM restarts the process automatically.
 *
 * Also checks /readyz memory status: if the server reports memoryMb >= MEM_LIMIT_MB
 * for MEM_FAIL_THRESHOLD consecutive checks it also exits to prevent OOM.
 */

const INTERVAL_MS        = 30_000;  // ping every 30s
const TIMEOUT_MS         = 10_000;  // abort if no response in 10s
const FAIL_THRESHOLD     = 3;       // exit after 3 consecutive health failures (~90s)
const MEM_LIMIT_MB       = 450;     // treat as unhealthy above this
const MEM_FAIL_THRESHOLD = 5;       // tolerate brief spikes; exit after 5 consecutive (~150s)

let _timer         = null;
let _failCount     = 0;
let _memFailCount  = 0;
let _log           = console;       // replaced by pino instance in startWatchdog()

function _ping(baseUrl) {
  return new Promise(async (resolve) => {
    const ctrl = new AbortController();
    const abort = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(`${baseUrl}/healthz`, { signal: ctrl.signal });
      clearTimeout(abort);
      resolve({ ok: r.ok, status: r.status, body: null });
    } catch (e) {
      clearTimeout(abort);
      resolve({ ok: false, status: 0, error: e.message });
    }
  });
}

function _checkMem(baseUrl) {
  return new Promise(async (resolve) => {
    const ctrl = new AbortController();
    const abort = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(`${baseUrl}/readyz`, { signal: ctrl.signal });
      clearTimeout(abort);
      const json = await r.json().catch(() => ({}));
      resolve({ ok: r.ok, memoryMb: json.memoryMb ?? 0 });
    } catch (e) {
      clearTimeout(abort);
      resolve({ ok: true, memoryMb: 0 }); // don't exit on readyz timeout alone
    }
  });
}

async function _tick(baseUrl) {
  // ── Health check ──────────────────────────────────────────────────────────
  const health = await _ping(baseUrl);

  if (!health.ok) {
    _failCount++;
    _log.warn({
      event:      'watchdog_ping_fail',
      attempt:    _failCount,
      threshold:  FAIL_THRESHOLD,
      status:     health.status,
      error:      health.error,
    });

    if (_failCount >= FAIL_THRESHOLD) {
      _log.error({
        event:   'watchdog_exit',
        reason:  'health_check_failed',
        attempts: _failCount,
      });
      process.exit(1);
    }
    return; // skip mem check when already failing
  }

  _failCount = 0; // reset on success

  // ── Memory check ──────────────────────────────────────────────────────────
  const mem = await _checkMem(baseUrl);

  if (mem.memoryMb >= MEM_LIMIT_MB) {
    _memFailCount++;
    _log.warn({
      event:       'watchdog_memory_high',
      memoryMb:    mem.memoryMb,
      limitMb:     MEM_LIMIT_MB,
      attempt:     _memFailCount,
      threshold:   MEM_FAIL_THRESHOLD,
    });

    if (_memFailCount >= MEM_FAIL_THRESHOLD) {
      _log.error({
        event:    'watchdog_exit',
        reason:   'memory_limit_exceeded',
        memoryMb: mem.memoryMb,
        attempts: _memFailCount,
      });
      process.exit(1);
    }
  } else {
    if (_memFailCount > 0) {
      _log.info({ event: 'watchdog_memory_recovered', memoryMb: mem.memoryMb });
    }
    _memFailCount = 0;
  }
}

/**
 * Start the watchdog.
 * @param {object} opts
 * @param {number} opts.port    - Port the server is listening on (default 5000)
 * @param {object} [opts.logger] - Pino (or console-compatible) logger instance
 */
function startWatchdog({ port = 5000, logger } = {}) {
  if (_timer) return;

  if (logger) _log = logger;

  const baseUrl = `http://localhost:${port}`;

  _log.info({
    event:          'watchdog_started',
    intervalMs:     INTERVAL_MS,
    failThreshold:  FAIL_THRESHOLD,
    memLimitMb:     MEM_LIMIT_MB,
  });

  _timer = setInterval(() => _tick(baseUrl), INTERVAL_MS);

  // Don't hold the event loop open — Replit sends SIGTERM on shutdown
  if (_timer.unref) _timer.unref();
}

function stopWatchdog() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { startWatchdog, stopWatchdog };
