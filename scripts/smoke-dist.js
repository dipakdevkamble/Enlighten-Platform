const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { once } = require("node:events");

const projectRoot = path.resolve(__dirname, "..");
const distServer = path.join(projectRoot, "dist", "server.js");

function request(port, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, headers },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            body: Buffer.concat(chunks),
            headers: res.headers,
            status: res.statusCode,
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  if (!fs.existsSync(distServer)) throw new Error("Run npm run build before the distribution smoke test.");

  Object.assign(process.env, {
    NODE_ENV: "production",
    SUPABASE_URL: "https://smoke-project.supabase.co",
    SUPABASE_ANON_KEY: "smoke-anon-key-1234567890",
    SUPABASE_SERVICE_ROLE_KEY: "smoke-service-key-1234567890",
    SUPABASE_STORAGE_BUCKET: "papers",
    SIGNED_URL_TTL_SECONDS: "900",
    FRONTEND_URL: "https://smoke.example.test",
    PASSWORD_RESET_REDIRECT_URL: "https://smoke.example.test/reset-password.html",
    TRUST_PROXY: "1",
    ADMIN_EMAILS: "admin@smoke.example.test",
  });

  const { startServer } = require(distServer);
  const server = startServer({ port: 0 });
  if (!server.listening) await once(server, "listening");

  try {
    const port = server.address().port;
    const login = await request(port, "/login.html");
    assert.equal(login.status, 200);
    assert.match(login.body.toString("utf8"), /Assets\/js\/login\.bundle\.js/);
    assert.ok(login.headers["content-security-policy"]);
    assert.ok(login.headers["strict-transport-security"]);

    const bundle = await request(port, "/Assets/js/login.bundle.js", { "Accept-Encoding": "gzip" });
    assert.equal(bundle.status, 200);
    assert.equal(bundle.headers["content-encoding"], "gzip");

    const protectedPage = await request(port, "/index.html");
    assert.equal(protectedPage.status, 302);
    assert.equal(protectedPage.headers.location, "/login.html");

    const protectedPaper = await request(port, "/papers/BXE_May_Jun_2022.pdf");
    assert.equal(protectedPaper.status, 401);
    assert.match(protectedPaper.headers["cache-control"] || "", /no-store/);

    const sourceFile = await request(port, "/server.js");
    assert.equal(sourceFile.status, 404);

    console.log("Distribution smoke test passed: assets, auth redirects, PDF protection, compression, and security headers verified.");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
