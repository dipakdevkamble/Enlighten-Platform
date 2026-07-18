document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const form = document.getElementById("resetPasswordForm");
  if (!form) return;

  const API = window.EnlightenApi;
  const message = form.querySelector(".form-message");
  const password = document.getElementById("password");
  const confirmPassword = document.getElementById("confirmPassword");
  const submitButton = form.querySelector('button[type="submit"]');

  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = params.get("code") || hashParams.get("code") || "";
  const accessToken = hashParams.get("access_token") || "";

  if (!message || !password || !confirmPassword || !submitButton) return;

  if ((code || accessToken) && window.history?.replaceState) {
    window.history.replaceState(null, "", window.location.pathname);
  }

  function setMessage(text, type = "info") {
    message.textContent = text;
    message.dataset.type = type;
  }

  function validatePasswordsMatch() {
    if (confirmPassword.value && confirmPassword.value !== password.value) {
      confirmPassword.setCustomValidity("Passwords do not match.");
    } else {
      confirmPassword.setCustomValidity("");
    }
  }

  if (!code && !accessToken) {
    setMessage("Open this page from the password recovery email link.", "error");
    submitButton.disabled = true;
  }

  password.addEventListener("input", validatePasswordsMatch);
  confirmPassword.addEventListener("input", validatePasswordsMatch);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    validatePasswordsMatch();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    submitButton.disabled = true;
    setMessage("Updating password...");

    try {
      if (!API) {
        throw new Error("Site configuration failed. Refresh the page and try again.");
      }
      const body = await API.fetchJson("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: password.value,
          confirmPassword: confirmPassword.value,
          code,
          accessToken,
        }),
        fallbackMessage: "Could not update password.",
      });

      setMessage(body.message || "Password updated.", "success");
      window.setTimeout(() => {
        window.location.href = API.safeLocalUrl(body.redirectUrl, "login.html");
      }, 900);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not update password.", "error");
    } finally {
      submitButton.disabled = false;
    }
  });
});
