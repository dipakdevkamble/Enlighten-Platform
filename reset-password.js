document.addEventListener("DOMContentLoaded", () => {
  const API_BASE =
    window.ENLIGHTEN_API_BASE ||
    (window.location.protocol === "file:" ||
    (window.location.hostname === "localhost" && window.location.port && window.location.port !== "3000") ||
    (window.location.hostname === "127.0.0.1" && window.location.port && window.location.port !== "3000")
      ? "http://localhost:3000"
      : "");

  const form = document.getElementById("resetPasswordForm");
  const message = form.querySelector(".form-message");
  const password = document.getElementById("password");
  const confirmPassword = document.getElementById("confirmPassword");
  const submitButton = form.querySelector('button[type="submit"]');

  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = params.get("code") || hashParams.get("code") || "";
  const accessToken = hashParams.get("access_token") || "";

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
      const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: password.value,
          confirmPassword: confirmPassword.value,
          code,
          accessToken,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.message || "Could not update password.");
      }

      setMessage(body.message || "Password updated.", "success");
      window.setTimeout(() => {
        window.location.href = body.redirectUrl || "/login.html";
      }, 900);
    } catch (err) {
      setMessage(err.message, "error");
    } finally {
      submitButton.disabled = false;
    }
  });
});
