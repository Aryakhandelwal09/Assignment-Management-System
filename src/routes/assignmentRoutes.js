const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { computeStatus, isValidFutureDeadline } = require('../status');

const router = express.Router();

function findAssignment(data, id) {
  return data.assignments.find((a) => a.id === id);
}

function validateAssignmentBody(body, now = new Date()) {
  const errors = [];
  if (!body.title || !String(body.title).trim()) errors.push('Title is required.');
  if (!body.subject || !String(body.subject).trim()) errors.push('Subject is required.');
  if (!body.deadline) {
    errors.push('Deadline is required.');
  } else if (!isValidFutureDeadline(body.deadline, now)) {
    // Covers "Assignment created without a valid future deadline":
    // unparseable dates AND dates in the past are both rejected.
    errors.push('Deadline must be a valid date-time in the future.');
  }
  return errors;
}

// Shape an assignment for API responses, attaching role-specific extras.
function shapeAssignment(data, assignment, user) {
  const submissions = data.submissions.filter((s) => s.assignmentId === assignment.id);
  const base = { ...assignment };
  if (user.role === 'professor') {
    base.submissionCount = submissions.length;
    base.submissions = submissions.map((s) => ({
      id: s.id,
      studentId: s.studentId,
      content: s.content,
      submittedAt: s.submittedAt,
      status: computeStatus(assignment, s), // always On Time/Late here
    }));
  } else {
    const mine = submissions.find((s) => s.studentId === user.sub) || null;
    base.mySubmission = mine ? { id: mine.id, content: mine.content, submittedAt: mine.submittedAt } : null;
    base.status = computeStatus(assignment, mine); // Pending / On Time / Late / Missing
  }
  return base;
}

// GET /api/assignments - list (professor sees all + submissions; student sees own status)
router.get('/', requireAuth, (req, res) => {
  const data = db.load();
  const list = data.assignments
    .slice()
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .map((a) => shapeAssignment(data, a, req.user));
  res.json({ assignments: list, serverTime: new Date().toISOString() });
});

// GET /api/assignments/:id
router.get('/:id', requireAuth, (req, res) => {
  const data = db.load();
  const assignment = findAssignment(data, req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  res.json({ assignment: shapeAssignment(data, assignment, req.user), serverTime: new Date().toISOString() });
});

// POST /api/assignments - professor only
router.post('/', requireAuth, requireRole('professor'), (req, res) => {
  const errors = validateAssignmentBody(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  const data = db.load();
  const now = new Date().toISOString();
  const assignment = {
    id: db.id(),
    title: String(req.body.title).trim(),
    subject: String(req.body.subject).trim(),
    description: String(req.body.description || '').trim(),
    deadline: new Date(req.body.deadline).toISOString(),
    createdAt: now,
    updatedAt: now,
  };
  data.assignments.push(assignment);
  db.save();
  res.status(201).json({ assignment });
});

// PUT /api/assignments/:id - professor only
router.put('/:id', requireAuth, requireRole('professor'), (req, res) => {
  const data = db.load();
  const assignment = findAssignment(data, req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  const errors = validateAssignmentBody(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  assignment.title = String(req.body.title).trim();
  assignment.subject = String(req.body.subject).trim();
  assignment.description = String(req.body.description || '').trim();
  assignment.deadline = new Date(req.body.deadline).toISOString();
  assignment.updatedAt = new Date().toISOString();
  db.save();
  res.json({ assignment });
});

// DELETE /api/assignments/:id - professor only (cascades to submissions)
router.delete('/:id', requireAuth, requireRole('professor'), (req, res) => {
  const data = db.load();
  const idx = data.assignments.findIndex((a) => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Assignment not found.' });
  data.assignments.splice(idx, 1);
  data.submissions = data.submissions.filter((s) => s.assignmentId !== req.params.id);
  db.save();
  res.json({ ok: true });
});

module.exports = router;
