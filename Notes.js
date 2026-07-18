document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const API = window.EnlightenApi;

  function appendText(parent, tagName, text) {
    const element = document.createElement(tagName);
    element.textContent = String(text ?? "");
    parent.append(element);
    return element;
  }

  function createFileLink(value, className = "") {
    const fileUrl = API?.safeFileUrl(value);
    if (!fileUrl) return null;

    const link = document.createElement("a");
    link.href = fileUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = className;
    return link;
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
    const section = header.parentElement;
    if (!section) return;

    header.tabIndex = 0;
    header.setAttribute("role", "button");
    header.setAttribute("aria-expanded", String(section.classList.contains("open")));

    const toggleSection = () => {
      document.querySelectorAll(".sidebar-section").forEach((otherSection) => {
        if (otherSection !== section) {
          otherSection.classList.remove("open");
          otherSection.querySelector("h3")?.setAttribute("aria-expanded", "false");
        }
      });

      section.classList.toggle("open");
      header.setAttribute("aria-expanded", String(section.classList.contains("open")));
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
  let subjectRequestId = 0;

  function setSubjectPanelState(text) {
    if (!subjectPanelBody) return;
    const state = document.createElement("p");
    state.className = "subject-panel-state";
    state.textContent = text;
    subjectPanelBody.replaceChildren(state);
  }

  async function loadUploadedNotes() {
    if (!API || !uploadedSection || !uploadedNotes) return;

    try {
      const body = await API.fetchJson("/api/notes");
      if (!body.notes?.length) return;

      const cards = body.notes.map((note) => {
        const article = document.createElement("article");
        article.className = "uploaded-note-card";
        appendText(article, "strong", note.title);
        appendText(
          article,
          "span",
          [note.subject, note.branch && `- ${note.branch}`].filter(Boolean).join(" ")
        );
        appendText(article, "span", [note.unit, note.semester].filter(Boolean).join(" "));

        const link = createFileLink(note.file_url);
        if (link) {
          link.textContent = "Open PDF";
          article.append(link);
        } else {
          appendText(article, "span", "File unavailable");
        }
        return article;
      });

      uploadedNotes.replaceChildren(...cards);
      uploadedSection.hidden = false;
    } catch {
      uploadedSection.hidden = true;
    }
  }

  loadUploadedNotes();

  async function openSubjectNotes(subject) {
    if (!subjectPanel || !subjectPanelTitle || !subjectPanelBody) return;

    const requestId = ++subjectRequestId;

    subjectPanel.hidden = false;
    subjectPanelTitle.textContent = `${subject} Notes`;
    subjectPanel.setAttribute("aria-busy", "true");
    setSubjectPanelState("Loading PDFs...");
    subjectPanel.scrollIntoView({ behavior: "smooth", block: "start" });

    if (!API) {
      subjectPanel.removeAttribute("aria-busy");
      setSubjectPanelState("The notes service is unavailable. Refresh the page and try again.");
      return;
    }

    try {
      const body = await API.fetchJson(`/api/notes?subjectKey=${encodeURIComponent(subjectKey(subject))}`, {
        fallbackMessage: "Could not load notes.",
      });
      if (requestId !== subjectRequestId) return;

      if (!body.notes?.length) {
        setSubjectPanelState("No PDFs uploaded for this subject yet.");
        return;
      }

      const links = body.notes.map((note) => {
        const link = createFileLink(note.file_url, "subject-pdf-link");
        if (!link) {
          const state = document.createElement("div");
          state.className = "subject-pdf-link";
          appendText(state, "strong", note.title);
          appendText(state, "span", "File unavailable");
          return state;
        }

        appendText(link, "strong", note.title);
        appendText(link, "span", note.unit || note.semester || "Notes PDF");
        return link;
      });
      subjectPanelBody.replaceChildren(...links);
    } catch (err) {
      if (requestId === subjectRequestId) {
        setSubjectPanelState(err instanceof Error ? err.message : "Could not load notes.");
      }
    } finally {
      if (requestId === subjectRequestId) subjectPanel.removeAttribute("aria-busy");
    }
  }

  document.querySelectorAll(".notes-grid .card").forEach((card) => {
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    const subject = getCardSubject(card);
    if (subject) card.setAttribute("aria-label", `Open ${subject} notes PDFs`);

    card.addEventListener("click", () => {
      const selectedSubject = getCardSubject(card);
      if (selectedSubject) void openSubjectNotes(selectedSubject);
    });

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const selectedSubject = getCardSubject(card);
        if (selectedSubject) void openSubjectNotes(selectedSubject);
      }
    });
  });
});
