'use strict';

const rateLimit = require('express-rate-limit');

// CORRIGIDO: limites reduzidos para Replit free (single-process)
const limiters = {
  api: rateLimit({ windowMs: 60_000, max: 150, standardHeaders: true, legacyHeaders: false }),
  auth: rateLimit({ windowMs: 5 * 60_000, max: 15, standardHeaders: true, legacyHeaders: false }),
  webhook: rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }),
};

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  req.userId = req.session.userId;
  next();
}

module.exports = { limiters, requireAuth };
