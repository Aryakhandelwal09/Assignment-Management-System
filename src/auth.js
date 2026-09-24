// Authentication utilities: scrypt password hashing + HMAC-signed tokens.
// Uses only Node's built-in crypto module - no external auth dependencies.

const crypto = require('crypto');

const SECRET = process.env.AUTH_SECRET || 'dev-only-secret-change-me-in-production';
if (process.env.NODE_ENV === 'production' && !process.env.AUTH_SECRET) {
  console.warn('WARNING: AUTH_SECRET not set. Set it via an environment variable in production.');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, storedHash) {
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(storedHash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

const b64url = (s) => Buffer.from(s).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

function issueToken(user) {
  const payload = b64url(JSON.stringify({
    sub: user.id, role: user.role, name: user.name, email: user.email, iat: Date.now(),
  }));
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || sign(payload) !== sig) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

// Express middleware: attaches req.user when a valid Bearer token is present.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  req.user = user;
  next();
}

// Express middleware: rejects authenticated users without the required role.
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (req.user.role !== role) {
      return res.status(403).json({ error: `This action requires the '${role}' role.` });
    }
    next();
  };
}

module.exports = { hashPassword, verifyPassword, issueToken, verifyToken, requireAuth, requireRole };
