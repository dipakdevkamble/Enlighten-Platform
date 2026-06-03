document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }

  const form = document.querySelector("[data-auth-form]");
  if (!form) return;

  const mode = form.dataset.authForm;
  const message = form.querySelector(".form-message");
  const password = form.querySelector("#password");
  const confirmPassword = form.querySelector("#confirmPassword");
  const submitButton = form.querySelector('button[type="submit"]');
  const API_BASE =
    window.ENLIGHTEN_API_BASE ||
    (window.location.protocol === "file:" ||
    (window.location.hostname === "localhost" && window.location.port && window.location.port !== "3000") ||
    (window.location.hostname === "127.0.0.1" && window.location.port && window.location.port !== "3000")
      ? "http://localhost:3000"
      : "");

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
    const response = await fetch(`${API_BASE}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.message || "Request failed. Please try again.");
      error.fromApi = true;
      throw error;
    }
    return body;
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
    if (!endpoint) return;

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
          window.location.href = result.redirectUrl;
        }, 600);
      }
    } catch (err) {
      setMessage(
        err.fromApi
          ? err.message
          : `${err.message} Open the site at http://localhost:3000 or run the local backend with npm start.`,
        "error"
      );
    } finally {
      submitButton?.removeAttribute("disabled");
    }
  });
});
