(function () {
  const API_BASE_URL = (window.ENLIGHTEN_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
  const OAUTH_REDIRECT_TARGET = window.location.origin + "/auth.html";

  function setTokenStorage(data) {
    if (data.access) localStorage.setItem("enlightenAccessToken", data.access);
    if (data.refresh) localStorage.setItem("enlightenRefreshToken", data.refresh);
    if (data.user?.email) localStorage.setItem("enlightenUserEmail", data.user.email);
  }

  function getApiUrl(path) {
    return `${API_BASE_URL}${path}`;
  }

  async function postJson(path, payload, withAccessToken) {
    const headers = { "Content-Type": "application/json" };
    if (withAccessToken) {
      const accessToken = localStorage.getItem("enlightenAccessToken");
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(getApiUrl(path), {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data.detail || data.non_field_errors?.[0] || "Request failed.";
      throw new Error(detail);
    }
    return data;
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (window.lucide?.createIcons) {
      window.lucide.createIcons();
    }

    const form = document.querySelector("[data-auth-form]");
    const socialButtons = document.querySelectorAll("[data-social-provider]");

    socialButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const provider = button.getAttribute("data-social-provider");
        if (!provider) return;
        const oauthStartUrl = getApiUrl(`/api/auth/oauth/${provider}/start/?next=${encodeURIComponent(OAUTH_REDIRECT_TARGET)}`);
        window.location.href = oauthStartUrl;
      });
    });

    if (!form) return;

    const mode = form.dataset.authForm;
    const message = form.querySelector(".form-message");
    const password = form.querySelector("#password");
    const confirmPassword = form.querySelector("#confirmPassword");

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

    password?.addEventListener("input", validatePasswordsMatch);
    confirmPassword?.addEventListener("input", validatePasswordsMatch);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      validatePasswordsMatch();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      try {
        if (mode === "signup") {
          const payload = {
            email: form.querySelector("#email")?.value.trim(),
            password: form.querySelector("#password")?.value,
            first_name: form.querySelector("#first-name")?.value.trim() || "",
            last_name: form.querySelector("#last-name")?.value.trim() || "",
          };
          const data = await postJson("/api/auth/register/", payload);
          setTokenStorage(data);
          setMessage("Account created successfully.", "success");
          setTimeout(() => {
            window.location.href = "index.html";
          }, 500);
          return;
        }

        if (mode === "login") {
          const payload = {
            email: form.querySelector("#email")?.value.trim(),
            password: form.querySelector("#password")?.value,
          };
          const data = await postJson("/api/auth/login/", payload);
          setTokenStorage(data);
          setMessage("Login successful.", "success");
          setTimeout(() => {
            window.location.href = "index.html";
          }, 500);
        }
      } catch (error) {
        setMessage(error.message || "Authentication failed.", "error");
      }
    });
  });
})();
