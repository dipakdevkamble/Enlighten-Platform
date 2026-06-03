document.addEventListener("DOMContentLoaded", () => {
  const API_BASE =
    window.ENLIGHTEN_API_BASE ||
    (window.location.protocol === "file:" ||
    (window.location.hostname === "localhost" && window.location.port && window.location.port !== "3000") ||
    (window.location.hostname === "127.0.0.1" && window.location.port && window.location.port !== "3000")
      ? "http://localhost:3000"
      : "");

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function subjectKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function getCardSubject(card) {
    const info = card.querySelector(".card-info");
    if (!info) return "";

    const clone = info.cloneNode(true);
    clone.querySelector("p")?.remove();
    return clone.textContent.replace(/^\s*\d+\.\s*/, "").trim();
  }

  document.querySelectorAll(".sidebar-section h3").forEach((header) => {
    header.tabIndex = 0;
    header.setAttribute("role", "button");
    header.setAttribute("aria-expanded", header.parentElement.classList.contains("open"));

    const toggleSection = () => {
      const parent = header.parentElement;

      // Close all other sections first
      document.querySelectorAll(".sidebar-section").forEach((section) => {
        if (section !== parent) {
          section.classList.remove("open");
          section.querySelector("h3")?.setAttribute("aria-expanded", "false");
        }
      });

      // Toggle the clicked section
      parent.classList.toggle("open");
      header.setAttribute("aria-expanded", parent.classList.contains("open"));
    };

    header.addEventListener("click", toggleSection);
    header.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleSection();
      }
    });
  });

  const uploadedSection = document.getElementById("uploadedNotesSection");
  const uploadedNotes = document.getElementById("uploadedNotes");
  const subjectPanel = document.getElementById("subjectNotesPanel");
  const subjectPanelTitle = document.getElementById("subjectNotesTitle");
  const subjectPanelBody = document.getElementById("subjectNotesBody");

  async function loadUploadedNotes() {
    if (!uploadedSection || !uploadedNotes) return;

    try {
      const response = await fetch(`${API_BASE}/api/notes`, { credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.notes?.length) return;

      uploadedNotes.innerHTML = body.notes
        .map(
          (note) => `
            <article class="uploaded-note-card">
              <strong>${escapeHtml(note.title)}</strong>
              <span>${escapeHtml(note.subject)}${note.branch ? ` - ${escapeHtml(note.branch)}` : ""}</span>
              <span>${escapeHtml(note.unit || "")} ${escapeHtml(note.semester || "")}</span>
              <a href="${escapeHtml(note.file_url)}" target="_blank" rel="noopener noreferrer">Open PDF</a>
            </article>
          `
        )
        .join("");
      uploadedSection.hidden = false;
    } catch {
      uploadedSection.hidden = true;
    }
  }

  loadUploadedNotes();

  async function openSubjectNotes(subject) {
    if (!subjectPanel || !subjectPanelTitle || !subjectPanelBody) return;

    subjectPanel.hidden = false;
    subjectPanelTitle.textContent = `${subject} Notes`;
    subjectPanelBody.innerHTML = '<p class="subject-panel-state">Loading PDFs...</p>';
    subjectPanel.scrollIntoView({ behavior: "smooth", block: "start" });

    try {
      const response = await fetch(`${API_BASE}/api/notes?subjectKey=${encodeURIComponent(subjectKey(subject))}`, {
        credentials: "include",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Could not load notes.");

      if (!body.notes?.length) {
        subjectPanelBody.innerHTML =
          '<p class="subject-panel-state">No PDFs uploaded for this subject yet.</p>';
        return;
      }

      subjectPanelBody.innerHTML = body.notes
        .map(
          (note) => `
            <a class="subject-pdf-link" href="${escapeHtml(note.file_url)}" target="_blank" rel="noopener noreferrer">
              <strong>${escapeHtml(note.title)}</strong>
              <span>${escapeHtml(note.unit || note.semester || "Notes PDF")}</span>
            </a>
          `
        )
        .join("");
    } catch (err) {
      subjectPanelBody.innerHTML = `<p class="subject-panel-state">${escapeHtml(err.message)}</p>`;
    }
  }

  document.querySelectorAll(".notes-grid .card").forEach((card) => {
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    const subject = getCardSubject(card);
    if (subject) card.setAttribute("aria-label", `Open ${subject} notes PDFs`);

    card.addEventListener("click", () => {
      const selectedSubject = getCardSubject(card);
      if (selectedSubject) openSubjectNotes(selectedSubject);
    });

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const selectedSubject = getCardSubject(card);
        if (selectedSubject) openSubjectNotes(selectedSubject);
      }
    });
  });
});
