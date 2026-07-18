document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const API = window.EnlightenApi;
  const form = document.getElementById("resultForm");
  const formMessage = document.getElementById("formMessage");
  const findButton = document.getElementById("findButton");
  const resetButton = document.getElementById("resetButton");
  const printButton = document.getElementById("printButton");
  const logoutButton = document.getElementById("logoutButton");
  const resultStatus = document.getElementById("resultStatus");
  const emptyState = document.getElementById("emptyState");
  const resultSheet = document.getElementById("resultSheet");
  const resultNote = document.getElementById("resultNote");
  const subjectOptions = document.getElementById("subjectOptions");
  const testOptions = document.getElementById("testOptions");
  const pageAlert = document.getElementById("pageAlert");
  const output = {
    name: document.getElementById("outName"),
    roll: document.getElementById("outRoll"),
    subject: document.getElementById("outSubject"),
    test: document.getElementById("outTest"),
    marks: document.getElementById("outMarks"),
    status: document.getElementById("outStatus"),
  };

  const requiredElements = [
    form,
    formMessage,
    findButton,
    resetButton,
    printButton,
    logoutButton,
    resultStatus,
    emptyState,
    resultSheet,
    resultNote,
    subjectOptions,
    testOptions,
    pageAlert,
    ...Object.values(output),
  ];
  if (requiredElements.some((element) => !element)) return;

  function setMessage(text, type = "info") {
    formMessage.textContent = text;
    formMessage.dataset.type = type;
  }

  function setStatus(text, type = "") {
    resultStatus.textContent = text;
    if (type) {
      resultStatus.dataset.type = type;
    } else {
      delete resultStatus.dataset.type;
    }
  }

  function setPageError(text) {
    pageAlert.textContent = text;
    pageAlert.hidden = !text;
  }

  function showEmpty(text = "No result loaded.", status = "Not searched", type = "") {
    emptyState.textContent = text;
    emptyState.hidden = false;
    resultSheet.hidden = true;
    setStatus(status, type);
  }

  function displayValue(value) {
    const text = String(value ?? "").trim();
    return text || "-";
  }

  function showResult(result) {
    output.name.textContent = displayValue(result.name);
    output.roll.textContent = displayValue(result.rollNo);
    output.subject.textContent = displayValue(result.subject);
    output.test.textContent = displayValue(result.test);
    output.marks.textContent = displayValue(result.marks);
    output.status.textContent = "Published";

    const viewedAt = new Date();
    resultNote.textContent = `Viewed on ${viewedAt.toLocaleDateString()} at ${viewedAt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}.`;

    emptyState.hidden = true;
    resultSheet.hidden = false;
    setStatus("Result found", "success");
  }

  function errorMessage(error, fallback) {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  function redirectToLogin() {
    window.location.href = "login.html";
  }

  async function loadStudentSession() {
    if (!API) {
      setPageError("Site configuration failed. Refresh the page or contact support.");
      setMessage("Result search is unavailable.", "error");
      showEmpty("Result service unavailable.", "Unavailable", "error");
      return false;
    }

    try {
      await API.fetchJson("/api/auth/me");
      setPageError("");
      return true;
    } catch (error) {
      if (error?.status === 401) {
        redirectToLogin();
        return false;
      }

      const message = errorMessage(
        error,
        "Unable to verify your session. Refresh the page and try again."
      );
      setPageError(message);
      setMessage("Result search is unavailable.", "error");
      showEmpty("Result service unavailable.", "Unavailable", "error");
      return false;
    }
  }

  function addOptions(datalist, values) {
    if (!Array.isArray(values)) return;

    const existing = new Set(
      Array.from(datalist.querySelectorAll("option"), (option) => option.value.toLowerCase())
    );
    values.forEach((value) => {
      const cleanValue = String(value || "").trim();
      const key = cleanValue.toLowerCase();
      if (!cleanValue || existing.has(key)) return;

      const option = document.createElement("option");
      option.value = cleanValue;
      datalist.append(option);
      existing.add(key);
    });
  }

  async function loadResultOptions() {
    try {
      const response = await API.fetchJson("/api/results/options");
      addOptions(subjectOptions, response?.subjects);
      addOptions(testOptions, response?.tests);
    } catch {
      addOptions(testOptions, ["Class Test 1", "Class Test 2"]);
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const payload = Object.fromEntries(
      Array.from(new FormData(form).entries(), ([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : value,
      ])
    );
    findButton.disabled = true;
    setMessage("Searching for your result...");
    setStatus("Searching");

    try {
      const result = await API.fetchJson("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        fallbackMessage: "Result lookup failed. Please try again.",
      });
      if (!result || typeof result !== "object") {
        throw new Error("The server returned an invalid result. Please try again.");
      }

      showResult(result);
      setMessage("Result loaded.", "success");
    } catch (error) {
      if (error?.status === 401) {
        redirectToLogin();
        return;
      }

      if (error?.status === 404) {
        showEmpty("Result not found.", "Not found", "error");
      } else {
        showEmpty("Result could not be loaded.", "Unavailable", "error");
      }
      setMessage(
        errorMessage(error, "Result lookup failed. Please try again."),
        "error"
      );
    } finally {
      findButton.disabled = false;
    }
  });

  resetButton.addEventListener("click", () => {
    form.reset();
    setMessage("");
    showEmpty();
    form.elements.name?.focus();
  });

  printButton.addEventListener("click", () => {
    if (resultSheet.hidden) {
      setMessage("Search for a result before printing.", "warning");
      return;
    }
    window.print();
  });

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    setMessage("Signing out...");

    try {
      if (!API) throw new Error("Site configuration failed.");
      await API.fetchJson("/api/auth/logout", {
        method: "POST",
        fallbackMessage: "Unable to sign out. Please try again.",
      });
      redirectToLogin();
    } catch (error) {
      setMessage(errorMessage(error, "Unable to sign out. Please try again."), "error");
      logoutButton.disabled = false;
    }
  });

  async function initialize() {
    showEmpty();
    setStatus("Checking access");
    const hasSession = await loadStudentSession();
    if (!hasSession) return;

    findButton.disabled = false;
    setStatus("Not searched");
    void loadResultOptions();
  }

  void initialize();
});
