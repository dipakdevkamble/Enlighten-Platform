document.addEventListener("DOMContentLoaded", () => {
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
});
