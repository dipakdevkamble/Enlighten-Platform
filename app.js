document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const authAction = document.querySelector(".action.login, [data-auth-action]");
  if (!authAction) return;

  const API = window.EnlightenApi;
  const loginUrl = API?.safeLocalUrl("login.html", "login.html") || "login.html";

  async function logout() {
    authAction.setAttribute("aria-disabled", "true");
    authAction.textContent = "Logging out...";

    await API?.fetchJson("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = loginUrl;
  }

  async function updateAuthAction() {
    try {
      if (!API) throw new Error("Site configuration failed.");
      await API.fetchJson("/api/auth/me");

      authAction.textContent = "Logout";
      authAction.href = loginUrl;
      authAction.removeAttribute("aria-disabled");
      authAction.dataset.authState = "signed-in";
      authAction.addEventListener("click", (event) => {
        event.preventDefault();
        if (authAction.getAttribute("aria-disabled") !== "true") {
          void logout();
        }
      });
    } catch {
      authAction.textContent = "Login";
      authAction.href = loginUrl;
      authAction.dataset.authState = "signed-out";
    }
  }

  void updateAuthAction();
});
