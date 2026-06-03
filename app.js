
document.addEventListener("DOMContentLoaded", () => {
  const authAction = document.querySelector(".action.login, [data-auth-action]");
  if (!authAction) return;

  const API_BASE =
    window.ENLIGHTEN_API_BASE ||
    (window.location.protocol === "file:" ||
    (window.location.hostname === "localhost" && window.location.port && window.location.port !== "3000") ||
    (window.location.hostname === "127.0.0.1" && window.location.port && window.location.port !== "3000")
      ? "http://localhost:3000"
      : "");
  const APP_BASE = API_BASE || "";
  const loginUrl = `${APP_BASE}/login.html`;

  async function parseResponse(response) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || "Request failed.");
    }
    return body;
  }

  async function logout() {
    authAction.setAttribute("aria-disabled", "true");
    authAction.textContent = "Logging out...";

    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      window.location.href = loginUrl;
    }
  }

  async function updateAuthAction() {
    try {
      await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" }).then(parseResponse);

      authAction.textContent = "Logout";
      authAction.href = "#";
      authAction.dataset.authState = "signed-in";
      authAction.addEventListener("click", (event) => {
        event.preventDefault();
        logout();
      });
    } catch {
      authAction.textContent = "Login";
      authAction.href = loginUrl;
      authAction.dataset.authState = "signed-out";
    }
  }

  updateAuthAction();
});
