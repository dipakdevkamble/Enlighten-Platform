const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const repositoryRoot = path.resolve(__dirname, "..");
const ignoredDirectories = new Set([".agents", ".codex", ".git", "node_modules", "dist"]);
const requiredEnvKeys = [
  "PORT",
  "NODE_ENV",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "SIGNED_URL_TTL_SECONDS",
  "FRONTEND_URL",
  "ADMIN_EMAILS",
  "PASSWORD_RESET_REDIRECT_URL",
  "TRUST_PROXY",
];
const voidElements = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);
const textExtensions = new Set([".css", ".example", ".html", ".js", ".json", ".txt"]);

function walk(directory, matcher = () => true, files = [], ignored = ignoredDirectories) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) walk(path.join(directory, entry.name), matcher, files, ignored);
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    if (matcher(fullPath)) files.push(fullPath);
  }
  return files;
}

function relative(directory, file) {
  return path.relative(directory, file).replace(/\\/g, "/");
}

function requireFile(directory, file) {
  const fullPath = path.join(directory, file);
  if (!fs.existsSync(fullPath)) throw new Error(`Missing required file: ${file}`);
  return fs.readFileSync(fullPath, "utf8");
}

function collectBuildInputs(directory) {
  const files = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        ([".css", ".html", ".js", ".json"].includes(path.extname(entry.name).toLowerCase()) ||
          entry.name === ".env.example")
    )
    .map((entry) => path.join(directory, entry.name));

  for (const [name, extension] of [
    ["Assets", ".webp"],
    ["papers", ".pdf"],
  ]) {
    const nestedDirectory = path.join(directory, name);
    if (fs.existsSync(nestedDirectory)) {
      files.push(
        ...walk(
          nestedDirectory,
          (file) => path.extname(file).toLowerCase() === extension,
          [],
          new Set()
        )
      );
    }
  }

  files.push(
    path.join(directory, "scripts", "build.js"),
    path.join(directory, "scripts", "start.js")
  );
  return [...new Set(files)].sort((left, right) => left.localeCompare(right));
}

function validateNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) throw new Error(`Node 20 or newer is required; found ${process.version}.`);
}

function validateJavaScript(directory) {
  const files = walk(directory, (file) => path.extname(file).toLowerCase() === ".js");
  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], { cwd: directory, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`${relative(directory, file)} failed syntax check:\n${result.stderr || result.stdout}`);
    }
  }
  return files.length;
}

function validateEnvExample(directory) {
  const envExample = requireFile(directory, ".env.example");
  const missing = requiredEnvKeys.filter((key) => !new RegExp(`^${key}=`, "m").test(envExample));
  if (missing.length) throw new Error(`.env.example is missing: ${missing.join(", ")}`);

  for (const line of envExample.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error(`Invalid .env.example line: ${line}`);
  }
}

function validateServer(directory) {
  const server = requireFile(directory, "server.js");
  if (/express\.static\(\s*ROOT/.test(server)) {
    throw new Error("server.js must not expose the project root through express.static(ROOT). ");
  }
}

function validatePackage(directory) {
  const packageJson = JSON.parse(requireFile(directory, "package.json"));
  const lockfile = JSON.parse(requireFile(directory, "package-lock.json"));
  const nodeEngine = packageJson.engines && packageJson.engines.node;
  if (nodeEngine !== ">=20") throw new Error('package.json must declare "node": ">=20".');
  if (lockfile.packages?.[""]?.engines?.node !== nodeEngine) {
    throw new Error("package-lock.json has a stale Node engine declaration.");
  }

  const dependencyEntries = Object.entries({
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  });
  const floating = dependencyEntries.find(([, version]) => version === "*" || /(?:^|@)latest$/i.test(version));
  if (floating) throw new Error(`Dependency ${floating[0]} is not pinned to a release range.`);

  for (const dependency of ["compression", "express-rate-limit", "helmet"]) {
    if (!packageJson.dependencies?.[dependency]) {
      throw new Error(`Missing production dependency: ${dependency}`);
    }
  }
  for (const dependency of ["esbuild", "html-minifier-terser"]) {
    if (!/^\d+\.\d+\.\d+$/.test(packageJson.devDependencies?.[dependency] || "")) {
      throw new Error(`Build dependency ${dependency} must use an exact version.`);
    }
  }
}

function validateHtmlStructure(file, html, directory) {
  const cleaned = html.replace(/<!--[\s\S]*?-->/g, "");
  const tags = cleaned.matchAll(/<![^>]*>|<\/?([a-z][\w:-]*)\b[^>]*>/gi);
  const stack = [];

  for (const match of tags) {
    const fullTag = match[0];
    const tag = (match[1] || "").toLowerCase();
    if (!tag || voidElements.has(tag) || /\/>$/.test(fullTag)) continue;
    if (!/^<\//.test(fullTag)) {
      stack.push(tag);
      continue;
    }
    const openTag = stack.pop();
    if (openTag !== tag) {
      throw new Error(`${relative(directory, file)} has invalid HTML nesting: expected </${openTag || "none"}> before </${tag}>.`);
    }
  }

  if (stack.length) {
    throw new Error(`${relative(directory, file)} has unclosed HTML tags: ${stack.join(", ")}.`);
  }
}

function validateNoInlineCode(file, html, directory) {
  if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(html)) {
    throw new Error(`${relative(directory, file)} contains an inline script.`);
  }
  if (/<style\b/i.test(html) || /\sstyle\s*=/i.test(html)) {
    throw new Error(`${relative(directory, file)} contains inline CSS.`);
  }
  if (/\son[a-z][\w:-]*\s*=/i.test(html)) {
    throw new Error(`${relative(directory, file)} contains an inline event handler.`);
  }
  if (/@latest\b/i.test(html)) {
    throw new Error(`${relative(directory, file)} uses an unpinned @latest dependency.`);
  }
}

function cleanReference(reference) {
  const withoutFragment = reference.split("#", 1)[0].split("?", 1)[0].trim();
  if (!withoutFragment || withoutFragment === "/") return null;
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(withoutFragment)) return null;
  if (/^\/(?:api)(?:\/|$)/i.test(withoutFragment)) return null;
  return decodeURIComponent(withoutFragment);
}

function assertExactPath(directory, reference, contextFile) {
  const clean = cleanReference(reference);
  if (!clean) return;

  const contextDirectory = path.dirname(contextFile);
  const relativeReference = clean.replace(/^\//, "").replace(/\//g, path.sep);
  const candidate = clean.startsWith("/")
    ? path.resolve(directory, relativeReference)
    : path.resolve(contextDirectory, relativeReference);

  if (candidate !== directory && !candidate.startsWith(`${directory}${path.sep}`)) {
    throw new Error(`${relative(directory, contextFile)} references a path outside the project: ${reference}`);
  }
  if (!fs.existsSync(candidate)) {
    throw new Error(`${relative(directory, contextFile)} references a missing local file: ${reference}`);
  }

  let current = path.parse(candidate).root;
  for (const part of path.relative(current, candidate).split(path.sep).filter(Boolean)) {
    const entries = fs.readdirSync(current);
    if (!entries.includes(part)) {
      throw new Error(`${relative(directory, contextFile)} has a case-mismatched local reference: ${reference}`);
    }
    current = path.join(current, part);
  }
}

function validateLocalReferences(directory, htmlFiles, cssFiles) {
  const attributePattern = /\b(?:action|href|poster|src)\s*=\s*(["'])(.*?)\1/gi;
  const cssUrlPattern = /url\(\s*(["']?)(.*?)\1\s*\)/gi;

  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    let match;
    while ((match = attributePattern.exec(html))) assertExactPath(directory, match[2], file);
  }
  for (const file of cssFiles) {
    const css = fs.readFileSync(file, "utf8");
    let match;
    while ((match = cssUrlPattern.exec(css))) assertExactPath(directory, match[2], file);
  }
}

function validateHtml(directory) {
  const htmlFiles = walk(directory, (file) => path.extname(file).toLowerCase() === ".html");
  const cssFiles = walk(directory, (file) => path.extname(file).toLowerCase() === ".css");
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    validateHtmlStructure(file, html, directory);
    validateNoInlineCode(file, html, directory);
  }
  validateLocalReferences(directory, htmlFiles, cssFiles);
  return htmlFiles.length;
}

function validateAssets(directory) {
  const maxPdfBytes = 25 * 1024 * 1024;
  const assetDirectory = path.join(directory, "Assets");
  const paperDirectory = path.join(directory, "papers");
  if (!fs.existsSync(assetDirectory)) throw new Error("Missing Assets directory.");
  if (!fs.existsSync(paperDirectory)) throw new Error("Missing papers directory.");

  const images = walk(assetDirectory, (file) => path.extname(file).toLowerCase() === ".webp", [], new Set());
  const papers = walk(paperDirectory, (file) => path.extname(file).toLowerCase() === ".pdf", [], new Set());
  if (!images.length) throw new Error("No WebP assets found in Assets/.");
  if (!papers.length) throw new Error("No PDF papers found in papers/.");
  for (const file of papers) {
    if (fs.statSync(file).size > maxPdfBytes) {
      throw new Error(`${relative(directory, file)} exceeds the 25 MB upload/storage limit.`);
    }
  }
}

function envSecretValues(sourceDirectory) {
  const envPath = path.join(sourceDirectory, ".env");
  if (!fs.existsSync(envPath)) return [];
  return fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !/^\s*#/.test(line) && line.includes("="))
    .map((line) => line.slice(line.indexOf("=") + 1).trim().replace(/^(?:"(.*)"|'(.*)')$/, "$1$2"))
    .filter((value) => value.length >= 8 && !/^(?:production|development|papers|\d+)$/.test(value));
}

function validateDist(directory, sourceDirectory) {
  const allowedRootFiles = new Set([
    ".env.example", "build-manifest.json", "package-lock.json", "package.json", "server.js",
    ...fs.readdirSync(directory).filter((file) => /\.(?:css|html)$/i.test(file)),
  ]);
  const allowedRootDirectories = new Set(["Assets", "papers", "scripts"]);

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !allowedRootDirectories.has(entry.name)) {
      throw new Error(`Unexpected directory in dist: ${entry.name}`);
    }
    if (entry.isFile() && !allowedRootFiles.has(entry.name)) {
      throw new Error(`Unexpected file in dist: ${entry.name}`);
    }
  }

  const runtimePackage = JSON.parse(requireFile(directory, "package.json"));
  if (
    JSON.stringify(runtimePackage.scripts) !==
    JSON.stringify({ start: "node scripts/start.js" })
  ) {
    throw new Error("dist/package.json must expose only the runnable production start script.");
  }
  requireFile(directory, path.join("scripts", "start.js"));

  const forbiddenFile = walk(directory, (file) => /(?:^|[\\/])\.env$|\.(?:log|map|md|sql|zip)$/i.test(file))[0];
  if (forbiddenFile) throw new Error(`Forbidden release artifact: ${relative(directory, forbiddenFile)}`);

  const knownSecrets = envSecretValues(sourceDirectory);
  for (const file of walk(directory, (candidate) => textExtensions.has(path.extname(candidate).toLowerCase()))) {
    const contents = fs.readFileSync(file, "utf8");
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsb_secret_[a-z\d_-]+/i.test(contents)) {
      throw new Error(`Potential secret found in ${relative(directory, file)}.`);
    }
    const leakedValue = knownSecrets.find((value) => contents.includes(value));
    if (leakedValue) throw new Error(`A value from the local .env leaked into ${relative(directory, file)}.`);
  }

  const browserBundles = walk(path.join(directory, "Assets"), (file) => /\.bundle\.js$/i.test(file), [], new Set());
  if (!browserBundles.length) throw new Error("dist contains no bundled browser JavaScript.");

  const manifest = JSON.parse(requireFile(directory, "build-manifest.json"));
  if (manifest.schemaVersion !== 2 || !Array.isArray(manifest.sourceFiles)) {
    throw new Error("Build manifest is missing its source fingerprint.");
  }
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error("Build manifest is empty.");

  const currentSourceFiles = collectBuildInputs(sourceDirectory).map((file) => relative(sourceDirectory, file));
  const manifestSourcePaths = manifest.sourceFiles.map((entry) => entry.path);
  if (
    new Set(manifestSourcePaths).size !== manifestSourcePaths.length ||
    JSON.stringify(currentSourceFiles) !== JSON.stringify(manifestSourcePaths)
  ) {
    throw new Error("dist is stale: build inputs have been added or removed since the artifact was created.");
  }
  for (const entry of manifest.sourceFiles) {
    const contents = fs.readFileSync(path.join(sourceDirectory, entry.path));
    const hash = crypto.createHash("sha256").update(contents).digest("hex");
    if (contents.length !== entry.bytes || hash !== entry.sha256) {
      throw new Error(`dist is stale: ${entry.path} changed after the artifact was created.`);
    }
  }

  const artifactFiles = walk(directory, () => true)
    .filter((file) => path.basename(file) !== "build-manifest.json" && !file.includes(`${path.sep}node_modules${path.sep}`))
    .map((file) => relative(directory, file))
    .sort();
  const manifestPaths = manifest.files.map((entry) => entry.path).sort();
  if (new Set(manifestPaths).size !== manifestPaths.length || JSON.stringify(artifactFiles) !== JSON.stringify(manifestPaths)) {
    throw new Error("Build manifest does not match the distribution files.");
  }
  for (const entry of manifest.files) {
    const contents = fs.readFileSync(path.join(directory, entry.path));
    const hash = crypto.createHash("sha256").update(contents).digest("hex");
    if (contents.length !== entry.bytes || hash !== entry.sha256) {
      throw new Error(`Build manifest checksum mismatch: ${entry.path}`);
    }
  }
}

function validateProject({ directory = repositoryRoot, mode = "source", sourceDirectory = repositoryRoot } = {}) {
  validateNodeVersion();
  requireFile(directory, "package.json");
  requireFile(directory, "package-lock.json");
  validatePackage(directory);
  validateEnvExample(directory);
  validateServer(directory);
  const jsCount = validateJavaScript(directory);
  const htmlCount = validateHtml(directory);
  validateAssets(directory);
  if (mode === "dist") validateDist(directory, sourceDirectory);
  console.log(`${mode === "dist" ? "Distribution" : "Source"} validation passed: ${jsCount} JavaScript and ${htmlCount} HTML files checked.`);
}

if (require.main === module) {
  const mode = process.argv.includes("--dist") ? "dist" : "source";
  const directory = mode === "dist" ? path.join(repositoryRoot, "dist") : repositoryRoot;
  try {
    validateProject({ directory, mode, sourceDirectory: repositoryRoot });
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = { validateProject };
