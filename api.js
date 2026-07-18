(function () {
  "use strict";

  function trimTrailingSlash(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function resolveApiBase() {
    const configured = trimTrailingSlash(window.ENLIGHTEN_API_BASE);
    if (configured) return configured;

    const { hostname, port, protocol } = window.location;
    const localHost = hostname === "localhost" || hostname === "127.0.0.1";
    if (protocol === "file:" || (localHost && port && port !== "3000")) {
      return "http://localhost:3000";
    }
    return "";
  }

  async function parseJsonResponse(response, fallbackMessage = "Request failed.") {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.message || fallbackMessage);
      error.fromApi = true;
      error.status = response.status;
      throw error;
    }
    return body;
  }

  async function fetchJson(path, options = {}) {
    const { fallbackMessage, headers = {}, ...fetchOptions } = options;

    try {
      const response = await fetch(`${window.EnlightenApi.base}${path}`, {
        credentials: "include",
        ...fetchOptions,
        headers: {
          Accept: "application/json",
          ...headers,
        },
      });
      return parseJsonResponse(response, fallbackMessage || "Request failed. Please try again.");
    } catch (error) {
      if (error?.fromApi) throw error;
      throw new Error("Unable to reach the server. Check your connection and try again.");
    }
  }

  function safeFileUrl(value) {
    try {
      const url = new URL(String(value || ""), window.location.href);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function safeLocalUrl(value, fallback = "index.html") {
    const normalizeLocalPath = (candidate) => {
      const text = String(candidate || fallback);
      return window.location.protocol === "file:" ? text.replace(/^\/+/, "") : text;
    };

    try {
      const url = new URL(normalizeLocalPath(value), window.location.href);
      const sameWebOrigin =
        (url.protocol === "http:" || url.protocol === "https:") &&
        url.origin === window.location.origin;
      const sameLocalFile = window.location.protocol === "file:" && url.protocol === "file:";
      if (sameWebOrigin || sameLocalFile) return url.href;
    } catch {
      return new URL(normalizeLocalPath(fallback), window.location.href).href;
    }

    return new URL(normalizeLocalPath(fallback), window.location.href).href;
  }

  window.EnlightenApi = {
    base: resolveApiBase(),
    fetchJson,
    parseJsonResponse,
    safeFileUrl,
    safeLocalUrl,
  };
})();
