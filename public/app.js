/* Assignment Tracker - frontend SPA (no framework, no build step) */

const state = {
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  editingId: null,
};

const $ = (sel) => document.querySelector(sel);
const api = async (path, opts = {}) => {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDT(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const STATUS_CLASS = { 'On Time': 'ok', Late: 'late', Missing: 'missing', Pending: 'pending' };

/* ---------- Auth view ---------- */
let registerMode = false;

function showError(el, msg) {
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
}

function renderAuth() {
  const loggedIn = !!(state.token && state.user);
  $('#authView').classList.toggle('hidden', loggedIn);
  $('#profView').classList.toggle('hidden', !(loggedIn && state.user.role === 'professor'));
  $('#studentView').classList.toggle('hidden', !(loggedIn && state.user.role === 'student'));
  $('#userBox').classList.toggle('hidden', !loggedIn);
  if (loggedIn) {
    $('#userLabel').textContent = `${state.user.name} (${state.user.role})`;
    if (state.user.role === 'professor') loadProfessor();
    else loadStudent();
  }
}

$('#authSwitch').addEventListener('click', (e) => {
  e.preventDefault();
  registerMode = !registerMode;
  $('#authTitle').textContent = registerMode ? 'Create account' : 'Sign in';
  $('#authSubmit').textContent = registerMode ? 'Register' : 'Sign in';
  $('#authSwitchText').textContent = registerMode ? 'Already have an account?' : 'No account?';
  $('#authSwitch').textContent = registerMode ? 'Sign in' : 'Register';
  $('#nameField').classList.toggle('hidden', !registerMode);
  $('#roleField').classList.toggle('hidden', !registerMode);
  showError($('#authError'), '');
});

$('#authSubmit').addEventListener('click', async () => {
  showError($('#authError'), '');
  try {
    let res;
    if (registerMode) {
      res = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: $('#authName').value, email: $('#authEmail').value,
          password: $('#authPassword').value, role: $('#authRole').value,
        }),
      });
    } else {
      res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: $('#authEmail').value, password: $('#authPassword').value }),
      });
    }
    state.token = res.token;
    state.user = res.user;
    localStorage.setItem('token', res.token);
    localStorage.setItem('user', JSON.stringify(res.user));
    renderAuth();
  } catch (err) {
    showError($('#authError'), err.message);
  }
});

$('#logoutBtn').addEventListener('click', () => {
  state.token = null; state.user = null; state.editingId = null;
  localStorage.removeItem('token'); localStorage.removeItem('user');
  renderAuth();
});

/* ---------- Professor ---------- */
async function loadProfessor() {
  const { assignments } = await api('/api/assignments');
  const box = $('#profList');
  if (!assignments.length) { box.innerHTML = '<p class="muted">No assignments yet.</p>'; return; }
  box.innerHTML = assignments.map((a) => `
    <div class="item">
      <div class="item-head">
        <strong>${esc(a.title)}</strong> <span class="muted">· ${esc(a.subject)}</span>
        <span class="badge ${STATUS_CLASS['Pending']}">${a.submissionCount} submission(s)</span>
      </div>
      <div class="muted">Deadline: ${fmtDT(a.deadline)}</div>
      ${a.description ? `<div>${esc(a.description)}</div>` : ''}
      ${a.submissions.length ? `<details><summary>View submissions</summary>
        ${a.submissions.map((s) => `
          <div class="sub">
            <span class="badge ${STATUS_CLASS[s.status]}">${s.status}</span>
            <span class="muted">${fmtDT(s.submittedAt)}</span>
            <div>${esc(s.content)}</div>
          </div>`).join('')}
      </details>` : '<div class="muted">No submissions yet.</div>'}
      <div class="row">
        <button class="btn btn-small" onclick="startEdit('${a.id}')">Edit</button>
        <button class="btn btn-small" onclick="exportCsv('${a.id}')">Export CSV</button>
        <button class="btn btn-small btn-danger" onclick="delAssign('${a.id}')">Delete</button>
      </div>
    </div>`).join('');
  window._assignments = assignments;
}

window.startEdit = (id) => {
  const a = (window._assignments || []).find((x) => x.id === id);
  if (!a) return;
  state.editingId = id;
  $('#aTitle').value = a.title; $('#aSubject').value = a.subject;
  $('#aDesc').value = a.description || '';
  $('#aDeadline').value = new Date(a.deadline).toISOString().slice(0, 16);
  $('#assignFormTitle').textContent = 'Edit assignment';
  $('#assignSubmit').textContent = 'Save changes';
  $('#assignCancel').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function resetAssignForm() {
  state.editingId = null;
  ['#aTitle', '#aSubject', '#aDesc', '#aDeadline'].forEach((s) => { $(s).value = ''; });
  $('#assignFormTitle').textContent = 'Create assignment';
  $('#assignSubmit').textContent = 'Create';
  $('#assignCancel').classList.add('hidden');
}

$('#assignCancel').addEventListener('click', resetAssignForm);

$('#assignSubmit').addEventListener('click', async () => {
  showError($('#assignError'), '');
  const payload = {
    title: $('#aTitle').value, subject: $('#aSubject').value,
    description: $('#aDesc').value, deadline: $('#aDeadline').value,
  };
  try {
    if (state.editingId) {
      await api(`/api/assignments/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/api/assignments', { method: 'POST', body: JSON.stringify(payload) });
    }
    resetAssignForm();
    loadProfessor();
  } catch (err) {
    showError($('#assignError'), err.message);
  }
});

window.delAssign = async (id) => {
  if (!confirm('Delete this assignment and its submissions?')) return;
  await api(`/api/assignments/${id}`, { method: 'DELETE' });
  loadProfessor();
};

// CSV export is a protected route (needs the Bearer token), so a plain
// <a href> can't be used — fetch it with auth, then save the blob via a
// throwaway <a download> link. Same auth pattern as every other request.
window.exportCsv = async (id) => {
  try {
    const res = await fetch(`/api/assignments/${id}/export`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Export failed (${res.status})`);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = /filename="([^"]+)"/.exec(disposition);
    const filename = match ? match[1] : 'submissions.csv';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.message);
  }
};

/* ---------- Student ---------- */
async function loadStudent() {
  const { assignments } = await api('/api/assignments');
  const box = $('#studentList');
  if (!assignments.length) { box.innerHTML = '<p class="muted">No assignments yet.</p>'; return; }
  box.innerHTML = assignments.map((a) => {
    const st = a.status;
    const canSubmit = !a.mySubmission;
    return `
    <div class="item">
      <div class="item-head">
        <strong>${esc(a.title)}</strong> <span class="muted">· ${esc(a.subject)}</span>
        <span class="badge ${STATUS_CLASS[st]}">${st}</span>
      </div>
      <div class="muted">Deadline: ${fmtDT(a.deadline)}</div>
      ${a.description ? `<div>${esc(a.description)}</div>` : ''}
      ${a.mySubmission ? `
        <div class="sub">
          <strong>Your submission</strong> <span class="muted">at ${fmtDT(a.mySubmission.submittedAt)}</span>
          <div>${esc(a.mySubmission.content)}</div>
        </div>` : canSubmit ? `
        <div class="submit-row">
          <textarea id="sub-${a.id}" rows="2" placeholder="Paste your solution text or a URL / file link"></textarea>
          <button class="btn btn-primary" onclick="submitWork('${a.id}')">Submit</button>
          <span id="suberr-${a.id}" class="error hidden"></span>
        </div>` : ''}
    </div>`;
  }).join('');
}

window.submitWork = async (id) => {
  const errEl = $(`#suberr-${id}`);
  showError(errEl, '');
  try {
    await api(`/api/assignments/${id}/submissions`, {
      method: 'POST',
      body: JSON.stringify({ content: $(`#sub-${id}`).value }),
    });
    loadStudent();
  } catch (err) {
    showError(errEl, err.message);
  }
};

/* ---------- Boot ---------- */
renderAuth();
// Refresh the student list every 30s so Pending flips to Missing when a deadline passes.
setInterval(() => {
  if (state.user && state.user.role === 'student' && !$('#studentView').classList.contains('hidden')) {
    loadStudent().catch(() => {});
  }
}, 30000);