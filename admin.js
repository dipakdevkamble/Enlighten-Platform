document.addEventListener("DOMContentLoaded", () => {
  const API_BASE =
    window.ENLIGHTEN_API_BASE ||
    (window.location.protocol === "file:" ||
    (window.location.hostname === "localhost" && window.location.port && window.location.port !== "3000") ||
    (window.location.hostname === "127.0.0.1" && window.location.port && window.location.port !== "3000")
      ? "http://localhost:3000"
      : "");

  const adminStatus = document.getElementById("adminStatus");
  const adminIdentity = document.getElementById("adminIdentity");
  const logoutButton = document.getElementById("logoutButton");
  const noteForm = document.getElementById("noteForm");
  const paperForm = document.getElementById("paperForm");
  const resultForm = document.getElementById("resultForm");
  const noteMessage = document.getElementById("noteMessage");
  const paperMessage = document.getElementById("paperMessage");
  const resultMessage = document.getElementById("resultMessage");
  const notesList = document.getElementById("notesList");
  const papersList = document.getElementById("papersList");
  const resultsList = document.getElementById("resultsList");

  function setMessage(element, text, type = "info") {
    element.textContent = text;
    element.dataset.type = type;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function adminHeaders(extra = {}) {
    return extra;
  }

  async function parseResponse(response) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || "Request failed.");
    }
    return body;
  }

  async function loadPapers() {
    try {
      const response = await fetch(`${API_BASE}/api/papers`, { credentials: "include" });
      const { papers } = await parseResponse(response);
      if (!papers.length) {
        papersList.textContent = "No uploaded papers yet.";
        return;
      }

      papersList.innerHTML = `<div class="data-list">${papers
        .map(
          (paper) => `
            <article class="data-item">
              <strong>${escapeHtml(paper.title)}</strong>
              <span>${escapeHtml(paper.subject)} ${paper.branch ? `- ${escapeHtml(paper.branch)}` : ""}</span>
              <span>${escapeHtml(paper.exam_session || "")} ${escapeHtml(paper.academic_year || "")}</span>
              <a href="${escapeHtml(paper.file_url)}" target="_blank" rel="noopener noreferrer">Open PDF</a>
            </article>
          `
        )
        .join("")}</div>`;
    } catch (err) {
      papersList.textContent = err.message;
    }
  }

  async function loadNotes() {
    try {
      const response = await fetch(`${API_BASE}/api/notes`, { credentials: "include" });
      const { notes } = await parseResponse(response);
      if (!notes.length) {
        notesList.textContent = "No uploaded notes yet.";
        return;
      }

      notesList.innerHTML = `<div class="data-list">${notes
        .map(
          (note) => `
            <article class="data-item">
              <strong>${escapeHtml(note.title)}</strong>
              <span>${escapeHtml(note.subject)} ${note.branch ? `- ${escapeHtml(note.branch)}` : ""}</span>
              <span>${escapeHtml(note.unit || "")} ${escapeHtml(note.semester || "")}</span>
              <a href="${escapeHtml(note.file_url)}" target="_blank" rel="noopener noreferrer">Open PDF</a>
            </article>
          `
        )
        .join("")}</div>`;
    } catch (err) {
      notesList.textContent = err.message;
    }
  }

  async function loadResults() {
    try {
      const response = await fetch(`${API_BASE}/api/admin/results`, {
        headers: adminHeaders(),
        credentials: "include",
      });
      const { results } = await parseResponse(response);
      if (!results.length) {
        resultsList.textContent = "No results added yet.";
        return;
      }

      resultsList.innerHTML = `<div class="data-list">${results
        .map(
          (result) => `
            <article class="data-item">
              <strong>${escapeHtml(result.student_name)} (${escapeHtml(result.roll_no)})</strong>
              <span>${escapeHtml(result.subject)} - ${escapeHtml(result.test_name)}</span>
              <span>Marks: ${escapeHtml(result.marks)}</span>
            </article>
          `
        )
        .join("")}</div>`;
    } catch (err) {
      resultsList.textContent = err.message;
    }
  }

  async function loadAdminSession() {
    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
      const { user } = await parseResponse(response);
      if (user.role !== "admin") {
        window.location.href = "admin-login.html";
        return;
      }
      adminIdentity.textContent = `${user.name} (${user.email})`;
      setMessage(adminStatus, "Admin session active.", "success");
    } catch {
      window.location.href = "admin-login.html";
    }
  }

  logoutButton?.addEventListener("click", async () => {
    await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
    window.location.href = "admin-login.html";
  });

  noteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = noteForm.querySelector("button");
    submit.disabled = true;
    setMessage(noteMessage, "Uploading notes...");

    try {
      const response = await fetch(`${API_BASE}/api/admin/notes`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
        body: new FormData(noteForm),
      });
      const body = await parseResponse(response);
      setMessage(noteMessage, body.message || "Notes uploaded.", "success");
      noteForm.reset();
      loadNotes();
    } catch (err) {
      setMessage(noteMessage, err.message, "error");
    } finally {
      submit.disabled = false;
    }
  });

  paperForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = paperForm.querySelector("button");
    submit.disabled = true;
    setMessage(paperMessage, "Uploading paper...");

    try {
      const response = await fetch(`${API_BASE}/api/admin/papers`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
        body: new FormData(paperForm),
      });
      const body = await parseResponse(response);
      setMessage(paperMessage, body.message || "Paper uploaded.", "success");
      paperForm.reset();
      loadPapers();
    } catch (err) {
      setMessage(paperMessage, err.message, "error");
    } finally {
      submit.disabled = false;
    }
  });

  resultForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = resultForm.querySelector("button");
    submit.disabled = true;
    setMessage(resultMessage, "Adding result...");

    const payload = Object.fromEntries(new FormData(resultForm).entries());
    try {
      const response = await fetch(`${API_BASE}/api/admin/results`, {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const body = await parseResponse(response);
      setMessage(resultMessage, body.message || "Result added.", "success");
      resultForm.reset();
      loadResults();
    } catch (err) {
      setMessage(resultMessage, err.message, "error");
    } finally {
      submit.disabled = false;
    }
  });

  loadAdminSession();
  loadNotes();
  loadPapers();
  loadResults();
});
