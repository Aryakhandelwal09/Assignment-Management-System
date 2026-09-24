# Assignment Management System — Basic Submission Tracking (B2)

A basic assignment tracking system where a **professor** posts assignments with strict
deadlines and **students** submit solutions. The system automatically computes each
submission's timeliness status — **On Time**, **Late**, or **Missing** — from **server
timestamps**. No status is ever set manually.

---

## 1. Setup Instructions

**Prerequisites:** Node.js 18+ (no other dependencies beyond Express).

```bash
git clone <your-repo-url>
cd assignment-management-system
npm install
npm start          # serves http://localhost:3000
```

Open http://localhost:3000 in a browser.

### Environment variables

| Variable    | Default                    | Purpose                                   |
|-------------|----------------------------|-------------------------------------------|
| `PORT`      | `3000`                     | HTTP port                                 |
| `AUTH_SECRET` | `dev-only-secret-change-me-in-production` | HMAC key used to sign auth tokens — **set this in production** |

Copy `.env.example` if you use a process manager; otherwise export the variables directly.

### Test credentials (seeded automatically on first run)

| Role      | Email                | Password     |
|-----------|----------------------|--------------|
| Professor | `professor@demo.com` | `prof123`    |
| Student   | `student@demo.com`   | `student123` |

(Or register new accounts from the UI — role selectable at registration.)

---

## 2. Data Models

```jsonc
// User
{ "id", "name", "email", "role": "professor" | "student", "salt", "passwordHash" }

// Assignment
{ "id", "title", "subject", "description", "deadline": "<ISO-8601>", "createdAt", "updatedAt" }

// Submission
{ "id", "assignmentId", "studentId", "content": "<text or URL/file link>", "submittedAt": "<ISO-8601, server clock>" }
```

Persistence: `data/db.json`, a JSON file written atomically (temp file + rename). It is
created and seeded on first launch. *(Swap this file for PostgreSQL/MySQL later without
touching route logic — all DB access is isolated in `src/db.js`.)*

---

## 3. API Endpoints

Base URL: `/api` — all endpoints except auth require `Authorization: Bearer <token>`.

| Method | Endpoint                              | Role      | Description |
|--------|---------------------------------------|-----------|-------------|
| POST   | `/auth/register`                      | public    | Create account (role: `student` or `professor`) |
| POST   | `/auth/login`                         | public    | Login → `{ token, user }` |
| GET    | `/assignments`                        | any       | List assignments. Professor: includes submissions + count. Student: includes own submission + **status** |
| GET    | `/assignments/:id`                    | any       | Assignment detail (role-shaped like above) |
| POST   | `/assignments`                        | professor | Create assignment |
| PUT    | `/assignments/:id`                    | professor | Edit assignment |
| DELETE | `/assignments/:id`                    | professor | Delete assignment (cascades submissions) |
| POST   | `/assignments/:id/submissions`        | student   | Submit work; server records timestamp; duplicate → `409` |
| GET    | `/assignments/:id/submissions`        | professor | List submissions with computed status |
| GET    | `/assignments/:id/export`             | professor | Download a CSV report of all students' submissions/status |
| GET    | `/health`                             | public    | `{ ok, serverTime }` |

### Error format
All errors: `{ "error": "<message>" }` with appropriate status (`400` validation, `401`
unauthenticated, `403` wrong role, `404` not found, `409` conflict).

---

## 4. Architectural Choices

- **Express (Node.js)** — single lightweight dependency; easy to deploy to Render/Railway/Vercel.
- **Server-authoritative time.** The `submittedAt` timestamp is captured with `new Date()`
  **inside the submission controller**. A client-sent timestamp field is ignored entirely —
  a student cannot fake timeliness by tampering with the request. This directly implements
  *"System automatically records server timestamp on submission."*
- **Derived, not stored, status.** `Pending`/`Missing` are *computed at read time* by
  `src/status.js` from `(assignment, submission, now)`. Nothing is persisted and no cron
  job is needed: a student with no submission flips from `Pending` → `Missing` the instant
  the deadline passes. Submissions only ever store what actually happened (content + time).
- **Single source of truth for the rule.** `computeStatus()` is one pure, side-effect-free
  function used by every endpoint that returns a status, so the rule can never drift
  between screens.
- **Passwords**: scrypt (Node built-in `crypto`) with per-user random salt and
  `timingSafeEqual` comparison. **Tokens**: HMAC-signed JSON payloads — no `jsonwebtoken`
  dependency required.
- **Role enforcement server-side.** Every mutating route passes through `requireAuth` +
  `requireRole` middleware; the UI merely hides buttons.
- **CSV export reuses `computeStatus()`, not a parallel calculation.** `GET
  /assignments/:id/export` (`src/routes/submissionRoutes.js`) builds one row per student —
  including students who never submitted, correctly shown as `Pending`/`Missing` — by
  calling the same pure function the UI and API use, so the exported report can never
  disagree with what a professor sees on screen. CSV is hand-written in `src/csv.js`
  (RFC 4180 field escaping) to avoid adding a dependency for something this small.
  The professor view's **"Export CSV"** button (`public/app.js`, `exportCsv()`) can't use a
  plain `<a href>` since the route needs the Bearer token — it fetches with auth, then
  saves the response via a throwaway `<a download>` blob link, the same pattern already
  used for every other authenticated request.

---

## 5. State Transitions

```
                    (no submission yet)
                          Pending
                        /         \
        deadline passes /           \ student submits
                      /             \
                 Missing            On Time  (submittedAt <= deadline)
                                        |
                                        | (only reachable if the clock-based
                                        |  check is wrong — never in practice)
                                        v
                                     Late     (submittedAt > deadline)
```

Terminal rules:
- A submission is **immutable** — one per student per assignment; a second attempt → `409`.
- `Missing` is reachable **only** while no submission exists; once submitted, status is
  permanently `On Time` or `Late`.
- Deleting an assignment cascades and deletes its submissions.

---

## 6. Edge-Case Handling (with verification commands)

| # | Spec edge case | How it's handled |
|---|----------------|------------------|
| 1 | Submitted **exactly at** the deadline → **On Time** | Comparison is `submittedAt <= deadline` (`src/status.js`). |
| 2 | Submitted **1 second after** the deadline → **Late** | Any value strictly greater than the deadline fails `<=`. |
| 3 | Queried **before** deadline with no submission → **Pending** (not Missing) | `now <= deadline` branch returns `Pending`. |
| 4 | Assignment created **without a valid future deadline** → rejected | `isValidFutureDeadline()` rejects unparseable dates and past dates with `400`. |
| 5 | **Duplicate submission** for the same assignment → rejected | Unique `(assignmentId, studentId)` enforced; second attempt → `409`. |

### Quick API verification (with curl)

```bash
# 1. Login as professor and student
TOKEN_P=$(curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json'   -d '{"email":"professor@demo.com","password":"prof123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
TOKEN_S=$(curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json'   -d '{"email":"student@demo.com","password":"student123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

# 2. Edge case 4 — past deadline is rejected (expect 400)
curl -s -X POST localhost:3000/api/assignments -H "Authorization: Bearer $TOKEN_P"   -H 'Content-Type: application/json'   -d '{"title":"X","subject":"Y","deadline":"2020-01-01T00:00:00Z"}'

# 3. Create an assignment due in 2 minutes
AID=$(curl -s -X POST localhost:3000/api/assignments -H "Authorization: Bearer $TOKEN_P"   -H 'Content-Type: application/json'   -d "{"title":"Edge Case Lab","subject":"CS","deadline":"$(date -u -d '+2 minutes' +%Y-%m-%dT%H:%M:%S.000Z)"}"   | python3 -c 'import sys,json;print(json.load(sys.stdin)["assignment"]["id"])')

# 4. Edge case 3 — before deadline, no submission → Pending
curl -s localhost:3000/api/assignments -H "Authorization: Bearer $TOKEN_S" | grep -o '"status":"[A-Za-z ]*"'

# 5. Submit, then edge case 5 — duplicate → 409
curl -s -X POST localhost:3000/api/assignments/$AID/submissions -H "Authorization: Bearer $TOKEN_S"   -H 'Content-Type: application/json' -d '{"content":"my answer https://file.link/sol.pdf"}'
curl -s -X POST localhost:3000/api/assignments/$AID/submissions -H "Authorization: Bearer $TOKEN_S"   -H 'Content-Type: application/json' -d '{"content":"again"}'   # expect 409

# 6. Edge cases 1 & 2 — to observe On Time vs Late, wait for the deadline to pass,
#    then submit as a second student: status must be "Late". Submitting before it
#    (as above) must be "On Time".
```

The student dashboard also auto-refreshes every 30 seconds so a `Pending` badge visibly
flips to `Missing` when a deadline elapses.

---

## 7. Out-of-Scope Compliance

Per the spec, this project deliberately does **not** implement: rubric grading/scores,
resubmission workflows, multi-section scoping, complex progress dashboards, or automated
email notifications.

---

## 8. Deployment (Render / Railway)

1. Push this repo to GitHub.
2. On Render: **New → Web Service** → connect repo → build command `npm install`,
   start command `npm start`. Add env var `AUTH_SECRET`.
3. Note: the JSON file DB lives on the instance disk — fine for a demo; for persistent
   multi-instance data, migrate `src/db.js` to Postgres (schema in §2 maps 1:1).
