// Tiny JSON-file persistence layer (zero native dependencies).
// Data lives in data/db.json and is written atomically (tmp file + rename).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hashPassword } = require('./auth');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const empty = () => ({ users: [], assignments: [], submissions: [] });

let cache = null;

function load() {
  if (cache) return cache;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } else {
    cache = seed();
    save();
  }
  return cache;
}

function save() {
  if (!cache) return;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_FILE); // atomic on POSIX
}

function id() {
  return crypto.randomBytes(8).toString('hex');
}

function seed() {
  const db = empty();
  const prof = { id: id(), name: 'Prof. Demo', email: 'professor@demo.com', role: 'professor' };
  const stud = { id: id(), name: 'Student Demo', email: 'student@demo.com', role: 'student' };
  for (const u of [prof, stud]) {
    const { salt, hash } = hashPassword(u.role === 'professor' ? 'prof123' : 'student123');
    db.users.push({ ...u, salt, passwordHash: hash });
  }
  // One sample assignment (deadline ~24h from first boot) so the UI is not empty
  db.assignments.push({
    id: id(),
    title: 'Sample: Week 1 Exercises',
    subject: 'Mathematics',
    description: 'Solve exercises 1-10 from chapter 1. Submit as text or a file link.',
    deadline: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return db;
}

module.exports = { load, save, id };
