document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const API = window.EnlightenApi;
  const departmentItems = Array.from(document.querySelectorAll(".dept-item"));
  const departmentPanels = Array.from(document.querySelectorAll(".dept-panel"));
  const searchInput = document.getElementById("searchInput");
  const breadcrumbs = document.getElementById("breadcrumbs");
  const pageTitle = document.getElementById("pageTitle");
  const archiveStatus = document.getElementById("archiveStatus");
  const mainContent = document.querySelector(".content");
  const uploadedPaperIds = new Set();
  let subjectListSequence = 0;

  const departmentAliases = new Map([
    ["fy", "fy"],
    ["fe", "fy"],
    ["first-year", "fy"],
    ["first-year-engineering", "fy"],
    ["ce", "ce"],
    ["cse", "ce"],
    ["computer", "ce"],
    ["computer-engineering", "ce"],
    ["se-computer-engineering", "ce"],
    ["it", "it"],
    ["information-technology", "it"],
    ["it-engineering", "it"],
    ["se-it-engineering", "it"],
    ["adis", "adis"],
    ["aids", "adis"],
    ["ai-ds", "adis"],
    ["ai-and-ds", "adis"],
    ["artificial-intelligence-and-data-science", "adis"],
    ["etc", "etc"],
    ["entc", "etc"],
    ["e-tc", "etc"],
    ["e-and-tc", "etc"],
    ["electronics-and-telecommunication", "etc"],
    ["electronics-and-telecommunication-engineering", "etc"],
    ["civil", "civil"],
    ["civil-engineering", "civil"],
    ["se-civil-engineering", "civil"],
  ]);

  const subjectAliases = new Map([
    ["basic-electrical", "basic-electrical-engineering"],
    ["bee", "basic-electrical-engineering"],
    ["basic-electronics", "basic-electronics-engineering"],
    ["bxe", "basic-electronics-engineering"],
    ["chemistry", "engineering-chemistry"],
    ["graphics", "engineering-graphics"],
    ["mathematics-i", "engineering-mathematics-i"],
    ["maths-i", "engineering-mathematics-i"],
    ["mathematics-1", "engineering-mathematics-i"],
    ["maths-1", "engineering-mathematics-i"],
    ["mathematics-ii", "engineering-mathematics-ii"],
    ["maths-ii", "engineering-mathematics-ii"],
    ["mathematics-2", "engineering-mathematics-ii"],
    ["maths-2", "engineering-mathematics-ii"],
    ["mathematics-iii", "engineering-mathematics-iii"],
    ["maths-iii", "engineering-mathematics-iii"],
    ["mathematics-3", "engineering-mathematics-iii"],
    ["maths-3", "engineering-mathematics-iii"],
    ["mechanics", "engineering-mechanics"],
    ["physics", "engineering-physics"],
    ["discrete-maths", "discrete-mathematics"],
    ["digital-logic", "digital-electronics-logic-design"],
    ["oops", "object-oriented-programming"],
    ["oop", "object-oriented-programming"],
    ["principles-of-communication", "principles-of-communication-systems"],
    ["software-engg", "software-engineering"],
    ["python-lang", "programming-problem-solving"],
    ["dsa", "data-structures-algorithms"],
  ]);

  function slugKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function subjectKey(value) {
    const key = slugKey(value);
    return subjectAliases.get(key) || key;
  }

  function canonicalDepartmentKey(...values) {
    for (const value of values) {
      const key = slugKey(value);
      if (!key) continue;

      const exactMatch = departmentAliases.get(key);
      if (exactMatch) return exactMatch;
      if (key.includes("first-year")) return "fy";
      if (key.includes("computer")) return "ce";
      if (key.includes("information-technology")) return "it";
      if (
        key.includes("artificial-intelligence-and-data-science") ||
        key.includes("ai-and-ds") ||
        key.includes("aids") ||
        key.includes("adis")
      ) {
        return "adis";
      }
      if (key.includes("telecommunication") || key.includes("e-and-tc")) return "etc";
      if (key.includes("civil")) return "civil";
    }

    return "";
  }

  function normalizeTitle(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function safeFileUrl(value) {
    return API?.safeFileUrl(value) || "";
  }

  function fileUrlIdentity(value) {
    try {
      const url = new URL(value, window.location.href);
      return `${url.origin}${url.pathname}`.toLowerCase();
    } catch {
      return "";
    }
  }

  function createIcon(className) {
    const icon = document.createElement("i");
    icon.className = className;
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  function createPaperRow(paper, fileUrl, title) {
    const row = document.createElement("div");
    row.className = "pdf-item uploaded-pdf-item";
    if (paper?.id !== undefined && paper?.id !== null) {
      row.dataset.paperId = String(paper.id);
    }

    const fileLink = document.createElement("a");
    fileLink.className = "file-name";
    fileLink.href = fileUrl;
    fileLink.target = "_blank";
    fileLink.rel = "noopener noreferrer";
    fileLink.textContent = title;

    const openLink = document.createElement("a");
    openLink.className = "download-btn";
    openLink.href = fileUrl;
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.textContent = "Open PDF";

    row.append(createIcon("fa-solid fa-file-pdf"), fileLink, openLink);
    return row;
  }

  function initializeSubjectGroup(group) {
    const button = group.querySelector(".subject-header");
    const list = group.querySelector(".pdf-list");
    const subjectName = button?.querySelector("span")?.textContent?.trim() || "";
    if (!button || !list || !subjectName) return false;

    group.dataset.subjectKey = subjectKey(group.dataset.subjectKey || subjectName);
    if (!list.id) {
      subjectListSequence += 1;
      list.id = `paper-list-${subjectListSequence}`;
    }
    button.setAttribute("aria-controls", list.id);
    button.setAttribute("aria-expanded", "false");
    list.hidden = true;
    return true;
  }

  function createSubjectGroup(panel, name, key) {
    const container = panel.querySelector(".hierarchy-container");
    if (!container) return null;

    const group = document.createElement("div");
    group.className = "subject-group";
    group.dataset.subjectKey = key;

    const button = document.createElement("button");
    button.className = "subject-header";
    button.type = "button";
    button.setAttribute("aria-expanded", "false");

    const label = document.createElement("span");
    label.textContent = name;
    button.append(
      createIcon("fa-solid fa-folder"),
      label,
      createIcon("fa-solid fa-chevron-down chevron")
    );

    const list = document.createElement("div");
    list.className = "pdf-list";
    list.hidden = true;
    group.append(button, list);

    const searchEmptyState = container.querySelector(".search-empty-state");
    container.insertBefore(group, searchEmptyState || null);
    return initializeSubjectGroup(group) ? group : null;
  }

  function findSubjectGroup(panel, key) {
    return (
      Array.from(panel.querySelectorAll(".subject-group")).find(
        (group) => subjectKey(group.dataset.subjectKey) === key
      ) || null
    );
  }

  function ensureSearchEmptyState(panel) {
    const container = panel.querySelector(".hierarchy-container");
    if (!container) return null;

    let emptyState = container.querySelector(".search-empty-state");
    if (!emptyState) {
      emptyState = document.createElement("p");
      emptyState.className = "empty-state search-empty-state";
      emptyState.setAttribute("role", "status");
      emptyState.textContent = "No subjects or paper names match your search.";
      emptyState.hidden = true;
      container.append(emptyState);
    }
    return emptyState;
  }

  function refreshDepartmentEmptyState(panel) {
    const hasSubjects = panel.querySelectorAll(".subject-group").length > 0;
    const departmentEmptyState = panel.querySelector("[data-department-empty]");
    if (departmentEmptyState) departmentEmptyState.hidden = hasSubjects;
  }

  function showArchiveStatus(message) {
    if (!archiveStatus) return;
    archiveStatus.textContent = message;
    archiveStatus.hidden = !message;
  }

  function closeAllSubjects() {
    document.querySelectorAll(".subject-group").forEach((group) => {
      group.classList.remove("open");
      const button = group.querySelector(".subject-header");
      const list = group.querySelector(".pdf-list");
      button?.setAttribute("aria-expanded", "false");
      if (list) list.hidden = true;
    });
  }

  function applySearch() {
    const query = searchInput?.value.trim().toLowerCase() || "";
    const activePanel = document.querySelector(".dept-panel.active");
    if (!activePanel) return;

    const groups = Array.from(activePanel.querySelectorAll(".subject-group"));
    let visibleSubjects = 0;
    groups.forEach((group) => {
      const subjectName =
        group.querySelector(".subject-header span")?.textContent?.toLowerCase() || "";
      const pdfNames = Array.from(group.querySelectorAll(".file-name"), (element) =>
        element.textContent.toLowerCase()
      );
      const matches =
        !query || subjectName.includes(query) || pdfNames.some((name) => name.includes(query));
      group.hidden = !matches;
      if (matches) visibleSubjects += 1;
    });

    const searchEmptyState = ensureSearchEmptyState(activePanel);
    if (searchEmptyState) {
      searchEmptyState.hidden = !query || groups.length === 0 || visibleSubjects > 0;
    }
    refreshDepartmentEmptyState(activePanel);
  }

  function appendUploadedPaper(paper) {
    const departmentKey = canonicalDepartmentKey(
      paper?.department_key,
      paper?.department,
      paper?.branch
    );
    const panel = departmentPanels.find(
      (candidate) => candidate.dataset.deptPanel === departmentKey
    );
    const name = String(paper?.subject || "").trim();
    const key = subjectKey(paper?.subject_key || name);
    const title = String(paper?.title || "").trim();
    const fileUrl = safeFileUrl(paper?.file_url);
    if (!panel || !name || !key || !title || !fileUrl) return "invalid";

    const paperId =
      paper?.id === undefined || paper?.id === null ? "" : String(paper.id).trim();
    if (paperId && uploadedPaperIds.has(paperId)) return "duplicate";

    let group = findSubjectGroup(panel, key);
    if (!group) group = createSubjectGroup(panel, name, key);
    const list = group?.querySelector(".pdf-list");
    if (!group || !list) return "invalid";

    const existingTitles = new Set(
      Array.from(group.querySelectorAll(".file-name"), (link) => normalizeTitle(link.textContent))
    );
    const existingUrls = new Set(
      Array.from(group.querySelectorAll(".file-name"), (link) => fileUrlIdentity(link.href))
    );
    if (
      existingTitles.has(normalizeTitle(title)) ||
      existingUrls.has(fileUrlIdentity(fileUrl))
    ) {
      if (paperId) uploadedPaperIds.add(paperId);
      return "duplicate";
    }

    list.append(createPaperRow(paper, fileUrl, title));
    if (paperId) uploadedPaperIds.add(paperId);
    refreshDepartmentEmptyState(panel);
    return "added";
  }

  function activateDepartment(item, moveFocus = false) {
    const departmentKey = item.dataset.dept;
    const matchingPanel = departmentPanels.find(
      (panel) => panel.dataset.deptPanel === departmentKey
    );
    if (!matchingPanel) return;

    departmentItems.forEach((departmentItem) => {
      const isActive = departmentItem === item;
      departmentItem.classList.toggle("active", isActive);
      departmentItem.setAttribute("aria-pressed", String(isActive));
      departmentItem.tabIndex = isActive ? 0 : -1;
    });
    departmentPanels.forEach((panel) => {
      panel.classList.toggle("active", panel === matchingPanel);
    });

    const departmentName = item.textContent.trim();
    if (breadcrumbs) breadcrumbs.textContent = `Home > ${departmentName}`;
    if (pageTitle) pageTitle.textContent = `${departmentName} Subjects`;

    closeAllSubjects();
    applySearch();
    if (moveFocus) item.focus();
  }

  document.querySelectorAll(".subject-group").forEach(initializeSubjectGroup);
  departmentPanels.forEach((panel) => {
    ensureSearchEmptyState(panel);
    refreshDepartmentEmptyState(panel);
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest(".subject-header");
    const group = button?.closest(".subject-group");
    const list = group?.querySelector(".pdf-list");
    if (!button || !group || !list) return;

    const willOpen = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(willOpen));
    list.hidden = !willOpen;
    group.classList.toggle("open", willOpen);
  });

  departmentItems.forEach((item, index) => {
    item.addEventListener("click", () => activateDepartment(item));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateDepartment(item);
        return;
      }

      let targetIndex = -1;
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        targetIndex = (index + 1) % departmentItems.length;
      } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        targetIndex = (index - 1 + departmentItems.length) % departmentItems.length;
      } else if (event.key === "Home") {
        targetIndex = 0;
      } else if (event.key === "End") {
        targetIndex = departmentItems.length - 1;
      }

      if (targetIndex >= 0) {
        event.preventDefault();
        activateDepartment(departmentItems[targetIndex], true);
      }
    });
  });

  searchInput?.addEventListener("input", applySearch);

  async function loadUploadedPapers() {
    if (!API) {
      showArchiveStatus(
        "Uploaded papers could not be loaded. Showing the built-in archive papers."
      );
      return;
    }

    mainContent?.setAttribute("aria-busy", "true");
    try {
      const response = await API.fetchJson("/api/papers", {
        fallbackMessage: "Uploaded papers could not be loaded.",
      });
      const papers = Array.isArray(response?.papers) ? response.papers : [];
      const invalidCount = papers.reduce(
        (count, paper) => count + (appendUploadedPaper(paper) === "invalid" ? 1 : 0),
        0
      );

      if (invalidCount > 0) {
        showArchiveStatus(
          "Some uploaded papers could not be displayed because their archive details or secure PDF link are incomplete."
        );
      } else {
        showArchiveStatus("");
      }
    } catch {
      showArchiveStatus(
        "Uploaded papers could not be loaded. Showing the built-in archive papers."
      );
    } finally {
      mainContent?.removeAttribute("aria-busy");
      departmentPanels.forEach(refreshDepartmentEmptyState);
      applySearch();
    }
  }

  void loadUploadedPapers();
});
