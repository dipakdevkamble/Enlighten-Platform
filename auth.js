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

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    validatePasswordsMatch();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (mode === "signup") {
      const email = form.querySelector("#email")?.value.trim();
      setMessage("Demo account created. Connect this form to a backend before using real authentication.", "success");
      sessionStorage.setItem("enlightenDemoUser", email || "student");
      return;
    }

    if (mode === "login") {
      setMessage("Demo login successful. Real login needs a backend authentication service.", "success");
      sessionStorage.setItem("enlightenDemoUser", form.querySelector("#email")?.value.trim() || "student");
    }
  });
});
