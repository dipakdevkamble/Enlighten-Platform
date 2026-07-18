document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const API = window.EnlightenApi;

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
  const paperTitle = document.getElementById("paperTitle");
  const paperPdf = document.getElementById("paperPdf");

  const departmentLabels = Object.freeze({
    fy: "First Year",
    ce: "SE: Computer Engineering",
    it: "SE: IT Engineering",
    adis: "SE: AIDS Engineering",
    etc: "SE: E & TC Engineering",
    civil: "SE: Civil Engineering",
  });

  function setMessage(element, text, type = "info") {
    if (!element) return;
    element.textContent = text;
    element.dataset.type = type;
  }

  function errorMessage(error, fallback = "Request failed. Please try again.") {
    return error instanceof Error ? error.message : fallback;
  }

  function appendText(parent, tagName, text) {
    const element = document.createElement(tagName);
    element.textContent = String(text ?? "");
    parent.append(element);
  }

  function appendFileLink(parent, value) {
    const fileUrl = API?.safeFileUrl(value);
    if (!fileUrl) {
      appendText(parent, "span", "File unavailable");
      return;
    }

    const link = document.createElement("a");
    link.href = fileUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open PDF";
    parent.append(link);
  }

  function renderList(container, items, renderItem, emptyMessage) {
    if (!Array.isArray(items) || items.length === 0) {
      container.textContent = emptyMessage;
      return;
    }

    const list = document.createElement("div");
    list.className = "data-list";
    items.forEach((item) => list.append(renderItem(item)));
    container.replaceChildren(list);
  }

  function setFormsDisabled(disabled) {
    [noteForm, paperForm, resultForm].forEach((form) => {
      form?.querySelectorAll("input, select, textarea, button").forEach((control) => {
        control.disabled = disabled;
      });
    });
  }

  function getDepartmentLabel(value) {
    const normalized = String(value ?? "").trim();
    if (!normalized) return "";
    return departmentLabels[normalized.toLowerCase()] || normalized;
  }

  function redirectToLogin() {
    window.location.replace(API?.safeLocalUrl("admin-login.html", "admin-login.html") || "admin-login.html");
  }

  async function loadPapers() {
    if (!API || !papersList) return;
    try {
      const { papers } = await API.fetchJson("/api/papers");
      renderList(
        papersList,
        papers,
        (paper) => {
          const article = document.createElement("article");
          const departmentLabel = getDepartmentLabel(
            paper.department_key || paper.department || paper.branch
          );
          article.className = "data-item";
          appendText(article, "strong", paper.title);
          appendText(
            article,
            "span",
            [paper.subject, departmentLabel && `- ${departmentLabel}`]
              .filter(Boolean)
              .join(" ")
          );
          appendText(
            article,
            "span",
            [paper.exam_session, paper.academic_year].filter(Boolean).join(" ")
          );
          appendFileLink(article, paper.file_url);
          return article;
        },
        "No uploaded papers yet."
      );
    } catch (err) {
      papersList.textContent = errorMessage(err, "Could not load papers.");
    }
  }

  async function loadNotes() {
    if (!API || !notesList) return;
    try {
      const { notes } = await API.fetchJson("/api/notes");
      renderList(
        notesList,
        notes,
        (note) => {
          const article = document.createElement("article");
          article.className = "data-item";
          appendText(article, "strong", note.title);
          appendText(
            article,
            "span",
            [note.subject, note.branch && `- ${note.branch}`].filter(Boolean).join(" ")
          );
          appendText(article, "span", [note.unit, note.semester].filter(Boolean).join(" "));
          appendFileLink(article, note.file_url);
          return article;
        },
        "No uploaded notes yet."
      );
    } catch (err) {
      notesList.textContent = errorMessage(err, "Could not load notes.");
    }
  }

  async function loadResults() {
    if (!API || !resultsList) return;
    try {
      const { results } = await API.fetchJson("/api/admin/results");
      renderList(
        resultsList,
        results,
        (result) => {
          const article = document.createElement("article");
          article.className = "data-item";
          appendText(
            article,
            "strong",
            `${result.student_name || "Unknown student"} (${result.roll_no || "-"})`
          );
          appendText(article, "span", result.student_email || "No student email");
          appendText(article, "span", `${result.subject || "-"} - ${result.test_name || "-"}`);
          appendText(article, "span", `Marks: ${result.marks || "-"}`);
          return article;
        },
        "No results added yet."
      );
    } catch (err) {
      resultsList.textContent = errorMessage(err, "Could not load results.");
    }
  }

  async function loadAdminSession() {
    if (!API) {
      setMessage(adminStatus, "Site configuration failed. Refresh the page.", "error");
      if (adminIdentity) adminIdentity.textContent = "Admin tools unavailable.";
      return false;
    }
    try {
      const { user } = await API.fetchJson("/api/auth/me");
      if (!user || user.role !== "admin") {
        redirectToLogin();
        return false;
      }
      if (adminIdentity) adminIdentity.textContent = `${user.name} (${user.email})`;
      setMessage(adminStatus, "Admin session active.", "success");
      return true;
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        redirectToLogin();
      } else {
        if (adminIdentity) adminIdentity.textContent = "Could not verify admin session.";
        setMessage(adminStatus, errorMessage(error, "Could not verify admin session."), "error");
      }
      return false;
    }
  }

  logoutButton?.addEventListener("click", async () => {
    if (API) {
      await API.fetchJson("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    }
    redirectToLogin();
  });

  paperPdf?.addEventListener("change", () => {
    const selectedFile = paperPdf.files?.[0];
    if (paperTitle && !paperTitle.value.trim() && selectedFile?.name) {
      paperTitle.value = selectedFile.name;
    }
  });

  noteForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = noteForm.querySelector("button");
    if (!API || !submit) {
      setMessage(noteMessage, "Admin tools are unavailable. Refresh the page.", "error");
      return;
    }
    submit.disabled = true;
    setMessage(noteMessage, "Uploading notes...");

    try {
      const body = await API.fetchJson("/api/admin/notes", {
        method: "POST",
        body: new FormData(noteForm),
        fallbackMessage: "Could not upload notes.",
      });
      setMessage(noteMessage, body.message || "Notes uploaded.", "success");
      noteForm.reset();
      void loadNotes();
    } catch (err) {
      setMessage(noteMessage, errorMessage(err, "Could not upload notes."), "error");
    } finally {
      submit.disabled = false;
    }
  });

  paperForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = paperForm.querySelector("button");
    if (!API || !submit) {
      setMessage(paperMessage, "Admin tools are unavailable. Refresh the page.", "error");
      return;
    }
    submit.disabled = true;
    setMessage(paperMessage, "Uploading paper...");

    try {
      const body = await API.fetchJson("/api/admin/papers", {
        method: "POST",
        body: new FormData(paperForm),
        fallbackMessage: "Could not upload paper.",
      });
      setMessage(paperMessage, body.message || "Paper uploaded.", "success");
      paperForm.reset();
      void loadPapers();
    } catch (err) {
      setMessage(paperMessage, errorMessage(err, "Could not upload paper."), "error");
    } finally {
      submit.disabled = false;
    }
  });

  resultForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = resultForm.querySelector("button");
    if (!API || !submit) {
      setMessage(resultMessage, "Admin tools are unavailable. Refresh the page.", "error");
      return;
    }
    submit.disabled = true;
    setMessage(resultMessage, "Adding result...");

    const payload = Object.fromEntries(new FormData(resultForm).entries());
    try {
      const body = await API.fetchJson("/api/admin/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setMessage(resultMessage, body.message || "Result added.", "success");
      resultForm.reset();
      void loadResults();
    } catch (err) {
      setMessage(resultMessage, errorMessage(err, "Could not add result."), "error");
    } finally {
      submit.disabled = false;
    }
  });

  async function initializeAdmin() {
    setFormsDisabled(true);
    if (!(await loadAdminSession())) return;

    setFormsDisabled(false);
    await Promise.all([loadNotes(), loadPapers(), loadResults()]);
  }

  void initializeAdmin();
});
