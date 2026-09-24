const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { computeStatus } = require('../status');
const { toCsv } = require('../csv');

const router = express.Router();

// POST /api/assignments/:id/submissions - student only
// The submittedAt timestamp is captured from the SERVER clock at ingestion.
// A client-sent timestamp is deliberately ignored.
router.post('/:id/submissions', requireAuth, requireRole('student'), (req, res) => {
  const data = db.load();
  const assignment = data.assignments.find((a) => a.id === req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });

  const content = String((req.body || {}).content || '').trim();
  if (!content) return res.status(400).json({ error: 'Submission content (text or URL/file link) is required.' });

  // Duplicate submission guard: one submission per student per assignment.
  const existing = data.submissions.find(
    (s) => s.assignmentId === assignment.id && s.studentId === req.user.sub
  );
  if (existing) {
    return res.status(409).json({ error: 'You have already submitted this assignment. Resubmission is not supported.' });
  }

  const submission = {
    id: db.id(),
    assignmentId: assignment.id,
    studentId: req.user.sub,
    content,
    submittedAt: new Date().toISOString(), // authoritative server timestamp
  };
  data.submissions.push(submission);
  db.save();

  res.status(201).json({
    submission: {
      id: submission.id,
      content: submission.content,
      submittedAt: submission.submittedAt,
      status: computeStatus(assignment, submission), // On Time or Late
    },
  });
});

// GET /api/assignments/:id/submissions - professor only
router.get('/:id/submissions', requireAuth, requireRole('professor'), (req, res) => {
  const data = db.load();
  const assignment = data.assignments.find((a) => a.id === req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  const submissions = data.submissions
    .filter((s) => s.assignmentId === assignment.id)
    .map((s) => {
      const student = data.users.find((u) => u.id === s.studentId);
      return {
        id: s.id,
        student: student ? { id: student.id, name: student.name, email: student.email } : { id: s.studentId },
        content: s.content,
        submittedAt: s.submittedAt,
        status: computeStatus(assignment, s),
      };
    })
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  res.json({ submissions });
});

// GET /api/assignments/:id/export - professor only
// Streams a CSV report: who submitted, when, and their status.
// Reuses computeStatus() so the export can never drift from the UI/API.
router.get('/:id/export', requireAuth, requireRole('professor'), (req, res) => {
  const data = db.load();
  const assignment = data.assignments.find((a) => a.id === req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });

  // One row per student who has ever interacted with the assignment.
  // Students with no submission still appear, correctly shown as
  // Pending/Missing via the same computeStatus() the UI uses.
  const students = data.users.filter((u) => u.role === 'student');
  const rows = students.map((student) => {
    const submission = data.submissions.find(
      (s) => s.assignmentId === assignment.id && s.studentId === student.id
    );
    return {
      name: student.name,
      email: student.email,
      status: computeStatus(assignment, submission),
      submittedAt: submission ? submission.submittedAt : '',
      content: submission ? submission.content : '',
    };
  });

  const csv = toCsv(rows, [
    { key: 'name', header: 'Student Name' },
    { key: 'email', header: 'Student Email' },
    { key: 'status', header: 'Status' },
    { key: 'submittedAt', header: 'Submitted At' },
    { key: 'content', header: 'Content' },
  ]);

  const safeTitle = assignment.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${safeTitle || 'assignment'}-submissions.csv"`
  );
  res.status(200).send(csv);
});

module.exports = router;
