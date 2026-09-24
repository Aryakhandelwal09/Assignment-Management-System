// Timeliness Status Computation Utility
// ---------------------------------------------------------
// This is the single source of truth for submission status.
// It is PURE and side-effect free: it takes the assignment,
// the student's submission (or null), and "now", and returns
// the status. Never trust a client-sent status.
//
// Rules (from spec):
//   submittedAt <= deadline          -> 'On Time'
//   submittedAt >  deadline          -> 'Late'
//   no submission, deadline passed   -> 'Missing'
//   no submission, deadline not past -> 'Pending'
//
// Edge cases:
//   * Exactly at the deadline (submittedAt == deadline) is On Time
//     because the comparison uses <=.
//   * One second after the deadline is Late because any value
//     strictly greater than the deadline fails the <= test.
//   * "Pending" is NOT a stored state; it is derived at read time.
//     A student with no submission therefore flips from Pending
//     to Missing the instant the deadline elapses - no cron job,
//     no batch process, no state machine to maintain.

const ON_TIME = 'On Time';
const LATE = 'Late';
const MISSING = 'Missing';
const PENDING = 'Pending';

function computeStatus(assignment, submission, now = new Date()) {
  const deadline = new Date(assignment.deadline);
  if (submission) {
    const submittedAt = new Date(submission.submittedAt);
    // <= ensures "exactly at deadline" counts as On Time.
    return submittedAt <= deadline ? ON_TIME : LATE;
  }
  return now <= deadline ? PENDING : MISSING;
}

function isValidFutureDeadline(value, now = new Date()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return d > now;
}

module.exports = { computeStatus, isValidFutureDeadline, ON_TIME, LATE, MISSING, PENDING };
