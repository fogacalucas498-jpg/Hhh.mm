'use strict';

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../lib/db');
const { limiters } = require('../lib/middleware');

router.post('/register', limiters.auth, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password e name são obrigatórios.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Senha deve ter pelo menos 8 caracteres.' });
    }
    const exists = await db.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (exists.rows.length) {
      return res.status(409).json({ error: 'E-mail já cadastrado.' });
    }
    const hash = await bcrypt.hash(password, 12);
    const r = await db.query(
      'INSERT INTO users(email, password_hash, name) VALUES($1,$2,$3) RETURNING id, email, name',
      [email.toLowerCase(), hash, name]
    );
    const user = r.rows[0];
    req.session.userId = user.id;
    req.session.save((err) => {
      if (err) {
        console.error('[auth] session save error:', err.message);
        return res.status(500).json({ error: 'Erro ao salvar sessão.' });
      }
      res.status(201).json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
    });
  } catch (e) {
    console.error('[auth] register error:', e.message);
    res.status(500).json({ error: 'Erro ao criar conta.' });
  }
});

router.post('/login', limiters.auth, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email e password são obrigatórios.' });
    }
    const r = await db.query(
      'SELECT id, email, name, password_hash FROM users WHERE email=$1',
      [email.toLowerCase()]
    );
    const user = r.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }
    req.session.userId = user.id;
    req.session.save((err) => {
      if (err) {
        console.error('[auth] session save error:', err.message);
        return res.status(500).json({ error: 'Erro ao salvar sessão.' });
      }
      res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
    });
  } catch (e) {
    console.error('[auth] login error:', e.message);
    res.status(500).json({ error: 'Erro ao fazer login.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Não autenticado.' });
  db.query('SELECT id, email, name FROM users WHERE id=$1', [req.session.userId])
    .then(r => {
      const user = r.rows[0];
      if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
      res.json({ user });
    })
    .catch(() => res.status(500).json({ error: 'Erro interno.' }));
});

router.patch('/profile', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Não autenticado.' });
  try {
    const { name, email } = req.body;
    if (!name && !email) return res.status(400).json({ error: 'Forneça name ou email.' });
    const updates = [];
    const vals = [];
    if (name) { updates.push(`name=$${vals.length + 1}`); vals.push(name.trim()); }
    if (email) {
      const lc = email.toLowerCase().trim();
      const exists = await db.query('SELECT id FROM users WHERE email=$1 AND id!=$2', [lc, req.session.userId]);
      if (exists.rows.length) return res.status(409).json({ error: 'E-mail já está em uso.' });
      updates.push(`email=$${vals.length + 1}`); vals.push(lc);
    }
    vals.push(req.session.userId);
    const r = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id=$${vals.length} RETURNING id, email, name`,
      vals
    );
    res.json({ user: r.rows[0] });
  } catch (e) {
    console.error('[auth] profile error:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar perfil.' });
  }
});

router.patch('/password', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Não autenticado.' });
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword e newPassword são obrigatórios.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Nova senha deve ter pelo menos 8 caracteres.' });
    }
    const r = await db.query('SELECT password_hash FROM users WHERE id=$1', [req.session.userId]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Senha atual incorreta.' });
    const hash = await bcrypt.hash(newPassword, 12);
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.session.userId]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[auth] password error:', e.message);
    res.status(500).json({ error: 'Erro ao alterar senha.' });
  }
});

module.exports = router;
