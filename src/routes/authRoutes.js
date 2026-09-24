const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, issueToken } = require('../auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  if (role !== 'student' && role !== 'professor') {
    return res.status(400).json({ error: "Role must be 'student' or 'professor'." });
  }
  const data = db.load();
  if (data.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  const { salt, hash } = hashPassword(password);
  const user = { id: db.id(), name: String(name).trim(), email: String(email).trim(), role, salt, passwordHash: hash };
  data.users.push(user);
  db.save();
  return res.status(201).json({ token: issueToken(user), user: publicUser(user) });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const data = db.load();
  const user = data.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  return res.json({ token: issueToken(user), user: publicUser(user) });
});

module.exports = router;
