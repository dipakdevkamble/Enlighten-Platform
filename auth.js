document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const form = document.querySelector("[data-auth-form]");
  if (!form) return;

  const mode = form.dataset.authForm;
  const message = form.querySelector(".form-message");
  const password = form.querySelector("#password");
  const confirmPassword = form.querySelector("#confirmPassword");
  const submitButton = form.querySelector('button[type="submit"]');
  const API = window.EnlightenApi;

  function setMessage(text, type = "info") {
    if (!message) return;
    message.textContent = text;
    message.dataset.type = type;
  }

  function validatePasswordsMatch() {
    if (!confirmPassword || !password) return;

    if (confirmPassword.value && confirmPassword.value !== password.value) {
      confirmPassword.setCustomValidity("Passwords do not match.");
    } else {
      confirmPassword.setCustomValidity("");
    }
  }

  function getFormPayload() {
    const data = new FormData(form);
    return Object.fromEntries(data.entries());
  }

  async function postJson(url, payload) {
    if (!API) {
      throw new Error("Site configuration failed. Refresh the page and try again.");
    }
    return API.fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      fallbackMessage: "Request failed. Please try again.",
    });
  }

  password?.addEventListener("input", validatePasswordsMatch);
  confirmPassword?.addEventListener("input", validatePasswordsMatch);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    validatePasswordsMatch();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const endpointByMode = {
      signup: "/api/auth/signup",
      login: "/api/auth/login",
      "admin-login": "/api/auth/admin-login",
      forgot: "/api/auth/forgot",
    };

    const endpoint = endpointByMode[mode];
    if (!endpoint) {
      setMessage("This form is not configured correctly. Refresh the page and try again.", "error");
      return;
    }

    submitButton?.setAttribute("disabled", "true");
    setMessage("Working...", "info");

    try {
      const result = await postJson(endpoint, getFormPayload());
      setMessage(result.message || "Success.", "success");

      if (mode === "signup") {
        form.reset();
      }
      if (result.redirectUrl) {
        window.setTimeout(() => {
          window.location.href = API.safeLocalUrl(result.redirectUrl, "index.html");
        }, 600);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Request failed. Please try again.", "error");
    } finally {
      submitButton?.removeAttribute("disabled");
    }
  });
});
