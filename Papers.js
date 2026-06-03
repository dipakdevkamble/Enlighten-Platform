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

  document.querySelectorAll('a.download-btn[href="#"]').forEach((link) => {
    link.textContent = "Coming soon";
    link.setAttribute("aria-disabled", "true");
    link.addEventListener("click", (e) => e.preventDefault());
  });
  document.querySelectorAll('a.download-btn:not([href="#"])').forEach((link) => {
    link.setAttribute("download", "");
  });

  // Subject toggle (show/hide PDF list)
  document.querySelectorAll(".subject-header").forEach((btn) => {
    async function loadSubjectPapers(group, list) {
      const subject = btn.querySelector("span")?.textContent?.trim();
      if (!subject) return;

      list.querySelectorAll(".uploaded-pdf-item").forEach((item) => item.remove());

      try {
        const response = await fetch(`${API_BASE}/api/papers?subjectKey=${encodeURIComponent(subjectKey(subject))}`, {
          credentials: "include",
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.papers?.length) return;

        body.papers
          .slice()
          .reverse()
          .forEach((paper) => {
            const row = document.createElement("div");
            row.className = "pdf-item uploaded-pdf-item";
            row.innerHTML = `
              <i class="fa-solid fa-file-pdf"></i>
              <a class="file-name" href="${escapeHtml(paper.file_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(paper.title)}</a>
              <a href="${escapeHtml(paper.file_url)}" class="download-btn" target="_blank" rel="noopener noreferrer">Open PDF</a>
            `;
            list.prepend(row);
          });
      } catch {
        group.classList.add("api-unavailable");
      }
    }

    btn.addEventListener("click", () => {
      const group = btn.closest(".subject-group");
      const list = group?.querySelector(".pdf-list");
      if (!group || !list) return;

      const isOpen = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!isOpen));

      if (isOpen) {
        list.hidden = true;
        group.classList.remove("open");
      } else {
        list.hidden = false;
        group.classList.add("open");
        loadSubjectPapers(group, list);
      }
    });
  });

  // Department switching
  const deptItems = Array.from(document.querySelectorAll(".dept-item"));
  const deptPanels = Array.from(document.querySelectorAll(".dept-panel"));
  const breadcrumbs = document.getElementById("breadcrumbs");
  const pageTitle = document.getElementById("pageTitle");

  function closeAllSubjects() {
    document.querySelectorAll(".subject-group").forEach((g) => g.classList.remove("open"));
    document.querySelectorAll(".subject-header").forEach((b) => b.setAttribute("aria-expanded", "false"));
    document.querySelectorAll(".pdf-list").forEach((l) => (l.hidden = true));
  }

  deptItems.forEach((item) => {
    // Make <li> focusable for keyboard users
    item.tabIndex = 0;

    const activate = () => {
      const deptKey = item.dataset.dept;
      const deptName = item.textContent.trim();
      const matchingPanel = deptPanels.find((panel) => panel.dataset.deptPanel === deptKey);

      if (!matchingPanel) return;

      deptItems.forEach((x) => x.classList.remove("active"));
      item.classList.add("active");

      deptPanels.forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.deptPanel === deptKey);
      });

      if (breadcrumbs) breadcrumbs.textContent = `Home > ${deptName}`;
      if (pageTitle) pageTitle.textContent = `${deptName} Subjects`;

      closeAllSubjects();
    };

    item.addEventListener("click", activate);
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
  });

  // Search inside current department only
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.trim().toLowerCase();
      const activePanel = document.querySelector(".dept-panel.active");
      if (!activePanel) return;

      activePanel.querySelectorAll(".subject-group").forEach((group) => {
        const subjectName =
          group.querySelector(".subject-header span")?.textContent?.toLowerCase() ?? "";

        const pdfNames = Array.from(group.querySelectorAll(".file-name")).map((x) =>
          x.textContent.toLowerCase()
        );

        const matches = subjectName.includes(q) || pdfNames.some((n) => n.includes(q));
        group.style.display = matches ? "" : "none";
      });
    });
  }

  const uploadedSection = document.getElementById("uploadedPapersSection");
  const uploadedPapers = document.getElementById("uploadedPapers");

  async function loadUploadedPapers() {
    if (!uploadedSection || !uploadedPapers) return;

    try {
      const response = await fetch(`${API_BASE}/api/papers`, { credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.papers?.length) return;

      uploadedPapers.innerHTML = body.papers
        .map(
          (paper) => `
            <article class="uploaded-card">
              <strong>${escapeHtml(paper.title)}</strong>
              <span>${escapeHtml(paper.subject)}${paper.branch ? ` - ${escapeHtml(paper.branch)}` : ""}</span>
              <span>${escapeHtml(paper.exam_session || "")} ${escapeHtml(paper.academic_year || "")}</span>
              <a class="download-btn" href="${escapeHtml(paper.file_url)}" target="_blank" rel="noopener noreferrer">Open PDF</a>
            </article>
          `
        )
        .join("");
      uploadedSection.hidden = false;
    } catch {
      uploadedSection.hidden = true;
    }
  }

  loadUploadedPapers();
});
