"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { after, before, describe, test } = require("node:test");

require("dotenv").config({ quiet: true });

process.env.NODE_ENV = "production";
process.env.SUPABASE_URL = "https://test-project.supabase.co";
process.env.SUPABASE_ANON_KEY = "test-anon-key-1234567890";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key-1234567890";
process.env.SUPABASE_STORAGE_BUCKET = "papers";
process.env.SIGNED_URL_TTL_SECONDS = "900";
process.env.FRONTEND_URL = "https://app.example.test";
process.env.PASSWORD_RESET_REDIRECT_URL =
  "https://app.example.test/reset-password.html";
process.env.TRUST_PROXY = "1";
process.env.ADMIN_EMAILS = "trusted-admin@example.test";

const {
  app,
  canonicalDepartmentKey,
  checkSupabaseDependencies,
  departmentBranchVariants,
  getConfigurationErrors,
  getUserRole,
  isObviousPlaceholder,
  normalizePaperUploadMetadata,
  parseTrustProxy,
  readDepartmentFilter,
  subjectKeyVariants,
  withPaperDepartmentKey,
} = require("../server");

let server;
let baseUrl;

function request(pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, baseUrl);
    const req = http.request(
      url,
      {
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function json(response) {
  return JSON.parse(response.body.toString("utf8"));
}

before(
  () =>
    new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    })
);

after(
  () =>
    new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    })
);

describe("authorization policy", () => {
  test("ignores an admin role in user-editable metadata", () => {
    assert.equal(
      getUserRole({
        email: "attacker@example.test",
        app_metadata: {},
        user_metadata: { role: "admin" },
      }),
      "student"
    );
  });

  test("accepts only trusted app metadata or the configured allowlist", () => {
    assert.equal(
      getUserRole({
        email: "student@example.test",
        app_metadata: { role: "admin" },
        user_metadata: { role: "student" },
      }),
      "admin"
    );
    assert.equal(
      getUserRole({
        email: "TRUSTED-ADMIN@example.test",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
      }),
      "admin"
    );
    assert.equal(getUserRole({ email: "trusted-admin@example.test" }), "student");
  });

  test("rejects unauthenticated local paper requests", async () => {
    const response = await request("/papers/May_Jun_2022.pdf");
    assert.equal(response.status, 401);
    assert.match(response.headers["content-type"], /^application\/json/);
    assert.equal(response.headers["cache-control"], "private, no-store");
    assert.deepEqual(json(response), { message: "Login required." });
  });
});

describe("production guardrails", () => {
  test("configuration is valid and placeholder values are recognized", () => {
    assert.deepEqual(getConfigurationErrors(), []);
    assert.equal(isObviousPlaceholder("https://your-project-ref.supabase.co"), true);
    assert.equal(isObviousPlaceholder("your-supabase-secret-key"), true);
    assert.equal(isObviousPlaceholder("https://your-domain.example"), true);
    assert.equal(isObviousPlaceholder("https://app.example.test"), false);
  });

  test("production configuration rejects copied example values", () => {
    const script =
      "const {getConfigurationErrors}=require('./server');process.stdout.write(JSON.stringify(getConfigurationErrors()))";
    const child = spawnSync(process.execPath, ["-e", script], {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        SUPABASE_URL: "https://your-project-ref.supabase.co",
        SUPABASE_ANON_KEY: "your-supabase-publishable-key",
        SUPABASE_SERVICE_ROLE_KEY: "your-supabase-secret-key",
        FRONTEND_URL: "https://your-domain.example",
        PASSWORD_RESET_REDIRECT_URL: "https://your-domain.example/reset-password.html",
        TRUST_PROXY: "1",
      },
    });
    assert.equal(child.status, 0, child.stderr);
    const errors = JSON.parse(child.stdout);
    assert.equal(errors.some((error) => error.includes("SUPABASE_URL still contains")), true);
    assert.equal(errors.some((error) => error.includes("SUPABASE_ANON_KEY still contains")), true);
    assert.equal(errors.some((error) => error.includes("SERVICE_ROLE_KEY still contains")), true);
    assert.equal(errors.some((error) => error.includes("FRONTEND_URL still contains")), true);
    assert.equal(errors.some((error) => error.includes("PASSWORD_RESET_REDIRECT_URL still contains")), true);
  });

  test("trust proxy rejects an unbounded boolean configuration", () => {
    assert.deepEqual(parseTrustProxy("true", true), { valid: false, value: false });
    assert.deepEqual(parseTrustProxy("1", true), { valid: true, value: 1 });
    assert.deepEqual(parseTrustProxy("false", true), { valid: true, value: false });
    assert.deepEqual(parseTrustProxy("unknown-proxy", true), { valid: false, value: false });
    assert.deepEqual(parseTrustProxy("loopback,10.0.0.0/8", true), {
      valid: true,
      value: ["loopback", "10.0.0.0/8"],
    });
  });

  test("health response is ready without leaking deployment configuration", async () => {
    const response = await request("/api/health");
    const body = json(response);
    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.ready, true);
    assert.equal(body.dependencies.supabase, "configured");
    assert.equal("storageBucket" in body, false);
    assert.equal("configurationErrors" in body, false);
  });

  test("live readiness checks require the complete schema and private PDF bucket", async () => {
    const selectedColumns = new Map();
    const client = {
      from(table) {
        return {
          select(columns) {
            selectedColumns.set(table, columns);
            return { limit: async () => ({ data: [], error: null }) };
          },
        };
      },
      storage: {
        getBucket: async (name) => ({
          data: {
            id: name,
            public: false,
            file_size_limit: 25 * 1024 * 1024,
            allowed_mime_types: ["application/pdf"],
          },
          error: null,
        }),
      },
    };

    await checkSupabaseDependencies(client, "papers");
    assert.match(selectedColumns.get("results"), /student_email/);
    assert.match(selectedColumns.get("results"), /marks_obtained/);
  });

  test("live readiness rejects an incomplete results schema", async () => {
    const client = {
      from(table) {
        return {
          select() {
            return {
              limit: async () => ({
                data: null,
                error: table === "results" ? { code: "42703" } : null,
              }),
            };
          },
        };
      },
      storage: {
        getBucket: async () => ({
          data: {
            public: false,
            file_size_limit: 25 * 1024 * 1024,
            allowed_mime_types: ["application/pdf"],
          },
          error: null,
        }),
      },
    };

    await assert.rejects(
      () => checkSupabaseDependencies(client, "papers"),
      (error) => error.code === "42703"
    );
  });

  test("sets strict production security headers", async () => {
    const response = await request("/api/health");
    const csp = response.headers["content-security-policy"];
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /style-src 'self' https:\/\/fonts\.googleapis\.com https:\/\/cdnjs\.cloudflare\.com/);
    assert.doesNotMatch(csp, /unsafe-inline/);
    assert.match(response.headers["strict-transport-security"], /max-age=31536000/);
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["x-frame-options"], "DENY");
    assert.equal(response.headers["referrer-policy"], "strict-origin-when-cross-origin");
    assert.equal(response.headers["permissions-policy"], "camera=(), microphone=(), geolocation=()");
    assert.equal(response.headers["x-powered-by"], undefined);
  });

  test("compresses eligible public assets", async () => {
    const response = await request("/login.css", {
      headers: { "Accept-Encoding": "gzip" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers["content-encoding"], "gzip");
    assert.equal(response.body[0], 0x1f);
    assert.equal(response.body[1], 0x8b);
  });
});

describe("paper department metadata", () => {
  test("canonicalizes the supported department keys and legacy labels", () => {
    assert.equal(canonicalDepartmentKey("fy"), "fy");
    assert.equal(canonicalDepartmentKey("First Year"), "fy");
    assert.equal(canonicalDepartmentKey("SE: Computer Engineering"), "ce");
    assert.equal(canonicalDepartmentKey("Information Technology"), "it");
    assert.equal(canonicalDepartmentKey("AI & DS"), "adis");
    assert.equal(canonicalDepartmentKey("ENTC"), "etc");
    assert.equal(canonicalDepartmentKey("Civil Engineering"), "civil");
    assert.equal(canonicalDepartmentKey("unapproved-department"), "");
  });

  test("normalizes upload metadata and always creates a visible PDF name", () => {
    assert.deepEqual(
      normalizePaperUploadMetadata(
        {
          department: "SE: Computer Engineering",
          subject: "Data Structures & Algorithms",
          title: "May June 2026",
          academicYear: "2025-26",
          semester: "4",
          examSession: "May/June",
        },
        "ignored.pdf"
      ),
      {
        departmentKey: "ce",
        subject: "Data Structures & Algorithms",
        title: "May June 2026.pdf",
        academicYear: "2025-26",
        semester: "4",
        examSession: "May/June",
      }
    );

    const fallback = normalizePaperUploadMetadata(
      { branch: "First Year", subject: "Engineering Physics" },
      "Physics.PDF"
    );
    assert.equal(fallback.departmentKey, "fy");
    assert.equal(fallback.title, "Physics.pdf");
  });

  test("rejects unknown departments and unreasonable paper metadata", () => {
    assert.match(
      normalizePaperUploadMetadata(
        { department: "Mechanical", subject: "Mechanics", title: "exam.pdf" },
        "exam.pdf"
      ).error,
      /valid department/i
    );
    assert.match(
      normalizePaperUploadMetadata(
        { department: "fy", subject: "x".repeat(121), title: "exam.pdf" },
        "exam.pdf"
      ).error,
      /120 characters/i
    );
    assert.match(
      normalizePaperUploadMetadata(
        { department: "fy", subject: "Physics", title: "folder/exam.pdf" },
        "exam.pdf"
      ).error,
      /folder separators/i
    );
  });

  test("builds filters only from known server-side department variants", () => {
    assert.deepEqual(readDepartmentFilter({}), { key: "", branches: [] });
    assert.deepEqual(subjectKeyVariants(""), []);
    assert.deepEqual(readDepartmentFilter({ department: "ce" }), {
      key: "ce",
      branches: departmentBranchVariants("ce"),
    });
    assert.match(readDepartmentFilter({ department: "ce,branch.ilike.*" }).error, /valid department/i);

    const row = withPaperDepartmentKey({ id: 1, branch: "SE: E & TC Engineering" });
    assert.equal(row.department_key, "etc");
    assert.equal(withPaperDepartmentKey({ id: 2, branch: "legacy unknown" }).department_key, null);
  });

  test("keeps the admin department choices aligned with archive panels", () => {
    const projectRoot = path.resolve(__dirname, "..");
    const adminHtml = fs.readFileSync(path.join(projectRoot, "admin.html"), "utf8");
    const archiveHtml = fs.readFileSync(path.join(projectRoot, "Papers.html"), "utf8");
    const archiveScript = fs.readFileSync(path.join(projectRoot, "Papers.js"), "utf8");
    const departments = ["fy", "ce", "it", "adis", "etc", "civil"];
    const paperForm = adminHtml.match(/<form[^>]*id="paperForm"[\s\S]*?<\/form>/)?.[0] || "";

    assert.match(paperForm, /<select[\s\S]*?name="department"[\s\S]*?<\/select>/);
    for (const department of departments) {
      assert.match(paperForm, new RegExp(`<option value="${department}">`));
      assert.match(archiveHtml, new RegExp(`data-dept-panel="${department}"`));
    }

    assert.ok(paperForm.indexOf('name="department"') < paperForm.indexOf('name="subject"'));
    assert.ok(paperForm.indexOf('name="subject"') < paperForm.indexOf('name="title"'));
    assert.ok(paperForm.indexOf('name="title"') < paperForm.indexOf('name="pdf"'));
    assert.equal((archiveScript.match(/["']\/api\/papers["']/g) || []).length, 1);
    assert.match(archiveScript, /paper\?\.department_key/);
    assert.doesNotMatch(archiveHtml, /Recently Uploaded Papers/);
  });
});

describe("HTTP fallbacks and exposure controls", () => {
  test("blocks server and package source files", async () => {
    for (const pathname of ["/server.js", "/package.json", "/package-lock.json"]) {
      const response = await request(pathname);
      assert.equal(response.status, 404, pathname);
    }
  });

  test("permanently redirects the retired auth shim", async () => {
    const response = await request("/auth.html");
    assert.equal(response.status, 308);
    assert.equal(response.headers.location, "/signup.html");
  });

  test("returns JSON for API failures and HTML for page failures", async () => {
    const apiResponse = await request("/api/does-not-exist");
    assert.equal(apiResponse.status, 404);
    assert.deepEqual(json(apiResponse), { message: "API route not found." });

    const pageResponse = await request("/does-not-exist");
    assert.equal(pageResponse.status, 404);
    assert.match(pageResponse.headers["content-type"], /^text\/html/);
    assert.match(pageResponse.body.toString("utf8"), /Page not found/);
  });

  test("rejects malformed JSON with a safe client error", async () => {
    const response = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    assert.equal(response.status, 400);
    assert.deepEqual(json(response), { message: "Request body contains invalid JSON." });
  });

  test("allows the configured origin and rejects other origins", async () => {
    const allowed = await request("/api/health", {
      headers: { Origin: "https://app.example.test" },
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers["access-control-allow-origin"], "https://app.example.test");
    assert.equal(allowed.headers["access-control-allow-credentials"], "true");

    const denied = await request("/api/health", {
      headers: { Origin: "https://attacker.example.test" },
    });
    assert.equal(denied.status, 403);
    assert.deepEqual(json(denied), { message: "Origin is not allowed." });
  });
});
