document.addEventListener("DOMContentLoaded", () => {
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
});
