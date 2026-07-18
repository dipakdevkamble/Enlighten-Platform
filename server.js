require("dotenv").config({ quiet: true });

const compression = require("compression");
const cors = require("cors");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const helmet = require("helmet");
const multer = require("multer");
const { isIP } = require("net");
const path = require("path");
const { randomUUID } = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.disable("x-powered-by");
const ROOT = __dirname;
const isProduction = process.env.NODE_ENV === "production";
const PORT = readBoundedInteger(process.env.PORT, 3000, 1, 65535);
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "papers";
const SIGNED_URL_TTL_SECONDS = readBoundedInteger(
  process.env.SIGNED_URL_TTL_SECONDS,
  900,
  60,
  86400
);
const PASSWORD_RESET_REDIRECT_URL = process.env.PASSWORD_RESET_REDIRECT_URL || "";
const ADMIN_EMAILS = new Set(
  String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => normalize(email))
    .filter(Boolean)
);

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

const supabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY
);
let supabaseInitializationError = null;
let supabaseAnon = null;
let supabaseAdmin = null;

if (supabaseConfigured) {
  try {
    supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  } catch (error) {
    supabaseInitializationError = error;
  }
}

const supabaseReady = supabaseConfigured && !supabaseInitializationError;

const devOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "null",
];
const configuredOrigins = String(process.env.FRONTEND_URL || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const allowedOrigins = new Set(isProduction ? configuredOrigins : [...devOrigins, ...configuredOrigins]);
const trustProxyConfiguration = parseTrustProxy(process.env.TRUST_PROXY, isProduction);
if (trustProxyConfiguration.valid && trustProxyConfiguration.value !== false) {
  app.set("trust proxy", trustProxyConfiguration.value);
}
const publicPages = new Set([
  "admin-login.html",
  "forgot-password.html",
  "login.html",
  "reset-password.html",
  "signup.html",
]);
const publicAssets = new Set([
  "About.css",
  "admin.css",
  "admin.js",
  "api.js",
  "app.js",
  "auth.js",
  "config.js",
  "Lectures.css",
  "login.css",
  "Notes.css",
  "Notes.js",
  "Papers.css",
  "Papers.js",
  "result.css",
  "result.js",
  "reset-password.js",
  "signup.css",
  "style.css",
]);
const blockedRootFiles = /\.(?:env|log|json|lock|md|sql|cpp|map)$/i;

function readBoundedInteger(rawValue, fallback, minimum, maximum) {
  if (rawValue === undefined || rawValue === null || rawValue === "") return fallback;
  const value = Number(rawValue);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function parseTrustProxy(rawValue, production) {
  const value = String(rawValue || "").trim();
  if (!value) return { valid: !production, value: false, missing: production };

  const normalized = value.toLowerCase();
  if (normalized === "false" || normalized === "off" || normalized === "0") {
    return { valid: true, value: false };
  }
  if (normalized === "true" || normalized === "on") {
    return { valid: false, value: false };
  }
  if (/^[1-9][0-9]*$/.test(normalized)) {
    const hopCount = Number(normalized);
    return hopCount <= 10
      ? { valid: true, value: hopCount }
      : { valid: false, value: false };
  }

  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const namedRanges = new Set(["loopback", "linklocal", "uniquelocal"]);
  const validEntry = (entry) => {
    if (namedRanges.has(entry.toLowerCase())) return true;
    const [address, prefix, extra] = entry.split("/");
    if (extra !== undefined) return false;
    const family = isIP(address);
    if (!family) return false;
    if (prefix === undefined) return true;
    if (!/^\d+$/.test(prefix)) return false;
    const prefixLength = Number(prefix);
    return prefixLength >= 0 && prefixLength <= (family === 4 ? 32 : 128);
  };
  if (entries.length && entries.every(validEntry)) {
    return { valid: true, value: entries };
  }
  return { valid: false, value: false };
}

function isValidHttpUrl(value, requireHttps = false) {
  try {
    const url = new URL(value);
    return requireHttps ? url.protocol === "https:" : ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function isObviousPlaceholder(value) {
  return /your-project-ref|your-supabase-|your-domain\.example/i.test(String(value || ""));
}

function getConfigurationErrors() {
  const errors = [];
  const rawPort = process.env.PORT;
  const rawTtl = process.env.SIGNED_URL_TTL_SECONDS;

  if (rawPort && PORT !== Number(rawPort)) {
    errors.push("PORT must be an integer between 1 and 65535.");
  }
  if (rawTtl && SIGNED_URL_TTL_SECONDS !== Number(rawTtl)) {
    errors.push("SIGNED_URL_TTL_SECONDS must be an integer between 60 and 86400.");
  }
  if (!SUPABASE_URL) errors.push("SUPABASE_URL is required.");
  if (!SUPABASE_ANON_KEY) errors.push("SUPABASE_ANON_KEY is required.");
  if (!SUPABASE_SERVICE_ROLE_KEY) errors.push("SUPABASE_SERVICE_ROLE_KEY is required.");
  if (isObviousPlaceholder(SUPABASE_URL)) {
    errors.push("SUPABASE_URL still contains an example placeholder.");
  }
  if (isObviousPlaceholder(SUPABASE_ANON_KEY)) {
    errors.push("SUPABASE_ANON_KEY still contains an example placeholder.");
  }
  if (isObviousPlaceholder(SUPABASE_SERVICE_ROLE_KEY)) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY still contains an example placeholder.");
  }
  if (SUPABASE_URL && !isValidHttpUrl(SUPABASE_URL, isProduction)) {
    errors.push(`SUPABASE_URL must be a valid ${isProduction ? "HTTPS " : "HTTP(S) "}URL.`);
  }
  if (
    SUPABASE_ANON_KEY &&
    SUPABASE_SERVICE_ROLE_KEY &&
    SUPABASE_ANON_KEY === SUPABASE_SERVICE_ROLE_KEY
  ) {
    errors.push("The Supabase anonymous and service-role keys must be different.");
  }
  if (!/^[a-z0-9][a-z0-9._-]{1,62}$/.test(STORAGE_BUCKET)) {
    errors.push("SUPABASE_STORAGE_BUCKET has an invalid name.");
  }
  if (!trustProxyConfiguration.valid) {
    errors.push(
      trustProxyConfiguration.missing
        ? "TRUST_PROXY must be explicitly configured in production."
        : "TRUST_PROXY must be false, a hop count from 1 to 10, or a proxy subnet list."
    );
  }
  if (supabaseInitializationError) {
    errors.push("The Supabase client could not be initialized from the configured values.");
  }

  for (const origin of configuredOrigins) {
    if (!isValidHttpUrl(origin, isProduction) || new URL(origin).origin !== origin) {
      errors.push(`FRONTEND_URL contains an invalid origin: ${origin}`);
    }
    if (isObviousPlaceholder(origin)) {
      errors.push("FRONTEND_URL still contains an example placeholder.");
    }
  }
  if (isProduction && configuredOrigins.length === 0) {
    errors.push("FRONTEND_URL must contain at least one HTTPS origin in production.");
  }
  for (const email of ADMIN_EMAILS) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`ADMIN_EMAILS contains an invalid address: ${email}`);
    }
  }
  if (isProduction && !PASSWORD_RESET_REDIRECT_URL) {
    errors.push("PASSWORD_RESET_REDIRECT_URL is required in production.");
  }
  if (
    PASSWORD_RESET_REDIRECT_URL &&
    !isValidHttpUrl(PASSWORD_RESET_REDIRECT_URL, isProduction)
  ) {
    errors.push(
      `PASSWORD_RESET_REDIRECT_URL must be a valid ${isProduction ? "HTTPS " : "HTTP(S) "}URL.`
    );
  }
  if (isObviousPlaceholder(PASSWORD_RESET_REDIRECT_URL)) {
    errors.push("PASSWORD_RESET_REDIRECT_URL still contains an example placeholder.");
  }
  if (
    isProduction &&
    isValidHttpUrl(PASSWORD_RESET_REDIRECT_URL, true) &&
    !allowedOrigins.has(new URL(PASSWORD_RESET_REDIRECT_URL).origin)
  ) {
    errors.push("PASSWORD_RESET_REDIRECT_URL must use an origin listed in FRONTEND_URL.");
  }

  return errors;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fieldNameSize: 100,
    fieldSize: 2048,
    fields: 10,
    fileSize: 25 * 1024 * 1024,
    files: 1,
  },
  fileFilter(req, file, cb) {
    if (file.mimetype !== "application/pdf") {
      const error = new Error("Unsupported upload type.");
      error.code = "INVALID_PDF_TYPE";
      cb(error);
      return;
    }
    cb(null, true);
  },
});

function requirePdfSignature(req, res, next) {
  if (!req.file) {
    next();
    return;
  }
  const signature = req.file.buffer.subarray(0, 5).toString("ascii");
  if (signature !== "%PDF-") {
    res.status(400).json({ message: "The uploaded file is not a valid PDF." });
    return;
  }
  next();
}

function createRateLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message },
  });
}

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many auth attempts. Try again later.",
});
const adminWriteLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many admin requests. Slow down and try again.",
});
const resultLookupLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many result lookups. Try again shortly.",
});
const readinessLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many readiness checks. Try again shortly.",
});

app.use((req, res, next) => {
  const incomingRequestId = req.get("x-request-id");
  req.requestId = /^[a-zA-Z0-9._:-]{1,100}$/.test(incomingRequestId || "")
    ? incomingRequestId
    : randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: [
          "'self'",
          "data:",
          "https://fonts.gstatic.com",
          "https://cdnjs.cloudflare.com",
        ],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: [
          "'self'",
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com",
        ],
        styleSrcAttr: ["'none'"],
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: { action: "deny" },
    hsts: isProduction
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);
app.use(
  cors({
    credentials: true,
    methods: ["GET", "HEAD", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
    maxAge: 600,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      const error = new Error("Origin is not allowed.");
      error.code = "CORS_ORIGIN_DENIED";
      callback(error);
    },
  })
);
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/admin-login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/auth/forgot", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api/admin", adminWriteLimiter);
app.use("/api/results", resultLookupLimiter);
app.use("/api/readiness", readinessLimiter);

function requireSupabase(req, res, next) {
  if (supabaseReady) {
    next();
    return;
  }

  res.status(503).json({ message: "Service configuration is unavailable." });
}

function logOperationalError(req, context, error) {
  console.error(
    JSON.stringify({
      level: "error",
      requestId: req?.requestId || null,
      context,
      errorCode: cleanText(error?.code) || null,
      errorStatus: Number(error?.status) || null,
      errorMessage: cleanText(error?.message) || "Unknown operational error",
    })
  );
}

function sendProviderFailure(req, res, context, error, message, status = 502) {
  logOperationalError(req, context, error);
  res.status(status).json({ message });
}

async function rollbackStoredFile(req, filePath) {
  try {
    const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([filePath]);
    if (error) logOperationalError(req, "storage_rollback", error);
  } catch (error) {
    logOperationalError(req, "storage_rollback", error);
  }
}

function parseCookies(req) {
  const cookies = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const value = part.trim();
    const index = value.indexOf("=");
    if (index < 1) continue;
    try {
      cookies[value.slice(0, index)] = decodeURIComponent(value.slice(index + 1));
    } catch {
      continue;
    }
  }
  return cookies;
}

function getAccessToken(req) {
  const authHeader = req.get("authorization") || "";
  let token = "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  } else {
    token = parseCookies(req).enlighten_access_token || "";
  }
  return token.length <= 8192 ? token : "";
}

function getUserRole(user) {
  const trustedRole = normalize(user?.app_metadata?.role);
  const hasConfirmedAllowlistedEmail =
    ADMIN_EMAILS.has(normalize(user?.email)) &&
    Boolean(user?.email_confirmed_at);
  if (trustedRole === "admin" || hasConfirmedAllowlistedEmail) {
    return "admin";
  }
  return "student";
}

async function getRequestUser(req) {
  if (!supabaseReady) return null;
  const token = getAccessToken(req);
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) {
    if ([400, 401, 403].includes(Number(error.status))) return null;
    throw error;
  }
  if (!data?.user) return null;

  return {
    user: data.user,
    role: getUserRole(data.user),
  };
}

function clearAuthCookie(res) {
  res.clearCookie("enlighten_access_token", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
  });
}

function setAuthCookie(res, session) {
  const token = String(session?.access_token || "");
  if (!token || token.length > 3800 || !/^[a-zA-Z0-9._~-]+$/.test(token)) return false;

  const requestedLifetime = Number(session?.expires_in);
  const maxAgeSeconds = Math.min(
    Math.max(Number.isFinite(requestedLifetime) ? Math.floor(requestedLifetime) : 3600, 60),
    604800
  );
  res.cookie("enlighten_access_token", token, {
    httpOnly: true,
    maxAge: maxAgeSeconds * 1000,
    priority: "high",
    sameSite: "lax",
    secure: isProduction,
    path: "/",
  });
  return true;
}

function isEmailNotConfirmed(error) {
  const value = `${error?.message || ""} ${error?.code || ""}`.toLowerCase();
  return value.includes("email not confirmed") || value.includes("email_not_confirmed");
}

async function requireApiAuth(req, res, next) {
  const session = await getRequestUser(req);
  if (!session) {
    res.status(401).json({ message: "Login required." });
    return;
  }

  req.auth = session;
  next();
}

async function requireAdmin(req, res, next) {
  const session = await getRequestUser(req);
  if (!session) {
    res.status(401).json({ message: "Admin login required." });
    return;
  }
  if (session.role !== "admin") {
    res.status(403).json({ message: "Admin access required." });
    return;
  }

  req.auth = session;
  next();
}

function requirePageAuth(requiredRole = "student") {
  return async (req, res, next) => {
    const session = await getRequestUser(req);
    if (!session) {
      res.redirect(requiredRole === "admin" ? "/admin-login.html" : "/login.html");
      return;
    }

    if (requiredRole === "admin" && session.role !== "admin") {
      res.redirect("/index.html");
      return;
    }

    req.auth = session;
    next();
  };
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function slugify(value) {
  return String(value || "file")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function subjectKey(value) {
  const key = slugify(value);
  return SUBJECT_KEY_ALIASES.get(key) || key;
}

function subjectKeyVariants(value) {
  const input = cleanText(value);
  if (!input) return [];

  const rawKey = slugify(input);
  if (!rawKey) return [];

  const canonicalKey = SUBJECT_KEY_ALIASES.get(rawKey) || rawKey;
  const variants = new Set([canonicalKey, rawKey]);

  for (const [alias, target] of SUBJECT_KEY_ALIASES) {
    if (target === canonicalKey) {
      variants.add(alias);
    }
  }

  return [...variants];
}

function canonicalDepartmentKey(value) {
  return DEPARTMENT_KEY_ALIASES.get(slugify(value)) || "";
}

function departmentBranchVariants(departmentKey) {
  return DEPARTMENT_BRANCH_VARIANTS.get(departmentKey) || [];
}

function readDepartmentFilter(query = {}) {
  const hasDepartment = Object.prototype.hasOwnProperty.call(query, "department");
  const hasDepartmentKey = Object.prototype.hasOwnProperty.call(query, "departmentKey");
  if (!hasDepartment && !hasDepartmentKey) return { key: "", branches: [] };

  const requestedValue = cleanText(hasDepartmentKey ? query.departmentKey : query.department);
  const key = canonicalDepartmentKey(requestedValue);
  if (!requestedValue || !key) {
    return {
      error: "Select a valid department: First Year, Computer, IT, AIDS, E & TC, or Civil.",
    };
  }

  return { key, branches: departmentBranchVariants(key) };
}

function normalizePaperUploadMetadata(body = {}, originalFileName = "") {
  const departmentValue = cleanText(body.department) || cleanText(body.branch);
  if (!departmentValue) {
    return { error: "Department is required." };
  }

  const departmentKey = canonicalDepartmentKey(departmentValue);
  if (!departmentKey) {
    return {
      error: "Select a valid department: First Year, Computer, IT, AIDS, E & TC, or Civil.",
    };
  }

  const explicitDepartment = cleanText(body.department);
  const legacyBranch = cleanText(body.branch);
  if (
    explicitDepartment &&
    legacyBranch &&
    canonicalDepartmentKey(legacyBranch) !== departmentKey
  ) {
    return { error: "Department and branch selections do not match." };
  }

  const subject = cleanText(body.subject).normalize("NFC");
  if (!subject) return { error: "Subject is required." };
  if (subject.length > 120) return { error: "Subject must be 120 characters or fewer." };
  if (/[\u0000-\u001f\u007f]/.test(subject) || !subjectKey(subject)) {
    return { error: "Enter a valid subject name." };
  }

  const fallbackName = path.win32.basename(cleanText(originalFileName));
  let title = (cleanText(body.title) || fallbackName).normalize("NFC");
  if (!title) return { error: "PDF name is required." };
  if (/[\u0000-\u001f\u007f\\/]/.test(title)) {
    return { error: "PDF name cannot contain control characters or folder separators." };
  }
  if (!/\.pdf$/i.test(title)) title = `${title}.pdf`;
  title = title.replace(/\.pdf$/i, ".pdf");
  if (title.length > 180) return { error: "PDF name must be 180 characters or fewer." };
  if (!title.slice(0, -4).trim()) return { error: "Enter a valid PDF name." };

  const optionalFields = [
    ["academicYear", "Academic year", 40],
    ["semester", "Semester", 40],
    ["examSession", "Exam session", 80],
  ];
  const values = {};
  for (const [field, label, maximum] of optionalFields) {
    const value = cleanText(body[field]).normalize("NFC");
    if (/[\u0000-\u001f\u007f]/.test(value)) return { error: `${label} contains invalid characters.` };
    if (value.length > maximum) return { error: `${label} must be ${maximum} characters or fewer.` };
    values[field] = value;
  }

  return { departmentKey, subject, title, ...values };
}

function withPaperDepartmentKey(row) {
  return {
    ...row,
    department_key: canonicalDepartmentKey(row?.branch) || null,
  };
}

function cleanText(value) {
  return String(value || "").trim();
}

function lookupText(value) {
  return normalize(value).replace(/\s+/g, " ");
}

function scoreNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return Number.isInteger(number)
    ? String(number)
    : String(number.toFixed(2)).replace(/\.?0+$/, "");
}

function formatMarks(marksObtained, marksTotal, fallback = "") {
  if (scoreNumber(marksObtained) !== null && scoreNumber(marksTotal) !== null) {
    return `${formatScore(marksObtained)} / ${formatScore(marksTotal)}`;
  }
  return cleanText(fallback);
}

function readMarksPayload(body) {
  let marksObtained = scoreNumber(body.marksObtained ?? body.marks_obtained);
  let marksTotal = scoreNumber(body.marksTotal ?? body.marks_total);

  if (marksObtained === null || marksTotal === null) {
    const legacyMarks = cleanText(body.marks);
    const match = legacyMarks.match(/^([0-9]+(?:\.[0-9]+)?)\s*(?:\/|of)\s*([0-9]+(?:\.[0-9]+)?)$/i);
    if (match) {
      marksObtained = scoreNumber(match[1]);
      marksTotal = scoreNumber(match[2]);
    }
  }

  if (marksObtained === null || marksTotal === null) {
    return { error: "Enter numeric marks obtained and total marks." };
  }
  if (marksTotal <= 0) {
    return { error: "Total marks must be greater than 0." };
  }
  if (marksObtained < 0 || marksObtained > marksTotal) {
    return { error: "Marks obtained must be between 0 and total marks." };
  }

  return {
    marksObtained,
    marksTotal,
  };
}

function auditFields(req, userKey, emailKey) {
  const user = req.auth?.user;
  return {
    [userKey]: user?.id || null,
    [emailKey]: user?.email || null,
  };
}

async function signedFileUrl(filePath) {
  const cleanPath = cleanText(filePath);
  if (!cleanPath) return "";

  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(cleanPath, SIGNED_URL_TTL_SECONDS);

  if (error) throw error;
  return data?.signedUrl || "";
}

async function attachSignedFileUrls(rows) {
  return Promise.all(
    (rows || []).map(async (row) => {
      const { file_path: filePath, ...publicRow } = row;
      return {
        ...publicRow,
        file_url: await signedFileUrl(filePath),
        file_url_expires_in: SIGNED_URL_TTL_SECONDS,
      };
    })
  );
}

function resultSummary(row) {
  return {
    ...row,
    marks: formatMarks(row?.marks_obtained, row?.marks_total),
  };
}

const SUBJECT_KEY_ALIASES = new Map([
  ["basic-electrical", "basic-electrical-engineering"],
  ["bee", "basic-electrical-engineering"],
  ["basic-electronics", "basic-electronics-engineering"],
  ["bxe", "basic-electronics-engineering"],
  ["chemistry", "engineering-chemistry"],
  ["graphics", "engineering-graphics"],
  ["mathematics-i", "engineering-mathematics-i"],
  ["maths-i", "engineering-mathematics-i"],
  ["mathematics-1", "engineering-mathematics-i"],
  ["maths-1", "engineering-mathematics-i"],
  ["mathematics-ii", "engineering-mathematics-ii"],
  ["maths-ii", "engineering-mathematics-ii"],
  ["mathematics-2", "engineering-mathematics-ii"],
  ["maths-2", "engineering-mathematics-ii"],
  ["mathematics-iii", "engineering-mathematics-iii"],
  ["maths-iii", "engineering-mathematics-iii"],
  ["mathematics-3", "engineering-mathematics-iii"],
  ["maths-3", "engineering-mathematics-iii"],
  ["mechanics", "engineering-mechanics"],
  ["physics", "engineering-physics"],
  ["discrete-maths", "discrete-mathematics"],
  ["digital-logic", "digital-electronics-logic-design"],
  ["oops", "object-oriented-programming"],
  ["oop", "object-oriented-programming"],
  ["principles-of-communication", "principles-of-communication-systems"],
  ["software-engg", "software-engineering"],
  ["python-lang", "programming-problem-solving"],
  ["dsa", "data-structures-algorithms"],
]);

const DEPARTMENT_KEY_ALIASES = new Map([
  ["fy", "fy"],
  ["fe", "fy"],
  ["first-year", "fy"],
  ["first-year-engineering", "fy"],
  ["ce", "ce"],
  ["computer", "ce"],
  ["computer-engineering", "ce"],
  ["se-computer-engineering", "ce"],
  ["it", "it"],
  ["it-engineering", "it"],
  ["information-technology", "it"],
  ["information-technology-engineering", "it"],
  ["se-it-engineering", "it"],
  ["adis", "adis"],
  ["aids", "adis"],
  ["a-ds", "adis"],
  ["ai-ds", "adis"],
  ["ai-and-ds", "adis"],
  ["a-ds-engineering", "adis"],
  ["aids-engineering", "adis"],
  ["artificial-intelligence-and-data-science", "adis"],
  ["artificial-intelligence-data-science", "adis"],
  ["se-a-ds-engineering", "adis"],
  ["se-ai-ds-engineering", "adis"],
  ["se-aids-engineering", "adis"],
  ["etc", "etc"],
  ["entc", "etc"],
  ["e-tc", "etc"],
  ["e-and-tc", "etc"],
  ["e-tc-engineering", "etc"],
  ["electronics-and-telecommunication", "etc"],
  ["electronics-and-telecommunication-engineering", "etc"],
  ["se-entc-engineering", "etc"],
  ["se-e-tc-engineering", "etc"],
  ["civil", "civil"],
  ["civil-engineering", "civil"],
  ["se-civil-engineering", "civil"],
]);

const DEPARTMENT_BRANCH_VARIANTS = new Map([
  ["fy", ["fy", "First Year", "FE", "first-year"]],
  ["ce", ["ce", "Computer", "Computer Engineering", "SE: Computer Engineering"]],
  ["it", ["it", "IT", "IT Engineering", "SE: IT Engineering"]],
  ["adis", ["adis", "AIDS", "AIDS Engineering", "SE: AIDS Engineering"]],
  ["etc", ["etc", "ENTC", "E & TC", "E & TC Engineering", "SE: E & TC Engineering"]],
  ["civil", ["civil", "Civil", "Civil Engineering", "SE: Civil Engineering"]],
]);

const readinessCache = {
  expiresAt: 0,
  pending: null,
  result: null,
};

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, error: new Error("Dependency check timed out.") }),
      timeoutMs
    );
    timer.unref?.();
  });

  return Promise.race([
    Promise.resolve(promise)
      .then((value) => ({ ok: true, value }))
      .catch((error) => ({ ok: false, error })),
    timeout,
  ]).finally(() => clearTimeout(timer));
}

async function checkSupabaseDependencies(client = supabaseAdmin, bucketName = STORAGE_BUCKET) {
  if (!client) throw new Error("Supabase client is unavailable.");

  const requiredColumns = {
    papers: "id,title,subject,subject_key,file_path",
    notes: "id,title,subject,subject_key,file_path",
    results:
      "id,student_name,student_email,roll_no,roll_key,subject,subject_key,test_name,test_key,marks_obtained,marks_total",
  };

  const tableChecks = Object.entries(requiredColumns).map(async ([table, columns]) => {
    const { error } = await client.from(table).select(columns).limit(1);
    if (error) throw error;
  });
  const bucketCheck = (async () => {
    const { data, error } = await client.storage.getBucket(bucketName);
    if (error) throw error;
    const mimeTypes = Array.isArray(data?.allowed_mime_types) ? data.allowed_mime_types : [];
    if (
      data?.public !== false ||
      Number(data?.file_size_limit) !== 25 * 1024 * 1024 ||
      mimeTypes.length !== 1 ||
      mimeTypes[0] !== "application/pdf"
    ) {
      const bucketError = new Error("Storage bucket policy does not match the production requirements.");
      bucketError.code = "STORAGE_POLICY_MISMATCH";
      throw bucketError;
    }
  })();

  const result = await withTimeout(Promise.all([...tableChecks, bucketCheck]), 5000);
  if (!result.ok) throw result.error;
}

async function getSupabaseReadiness() {
  const now = Date.now();
  if (readinessCache.result && readinessCache.expiresAt > now) return readinessCache.result;
  if (readinessCache.pending) return readinessCache.pending;

  readinessCache.pending = checkSupabaseDependencies()
    .then(() => ({ ready: true, error: null }))
    .catch((error) => ({ ready: false, error }))
    .then((result) => {
      readinessCache.result = result;
      readinessCache.expiresAt = Date.now() + (result.ready ? 30_000 : 10_000);
      readinessCache.pending = null;
      return result;
    });
  return readinessCache.pending;
}

app.get("/api/health", (req, res) => {
  const configurationErrors = getConfigurationErrors();
  const ready = configurationErrors.length === 0 && supabaseReady;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "degraded",
    ready,
    environment: isProduction ? "production" : "development",
    dependencies: {
      supabase: supabaseReady ? "configured" : "unavailable",
    },
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/readiness", async (req, res) => {
  const configurationErrors = getConfigurationErrors();
  if (configurationErrors.length || !supabaseReady) {
    res.status(503).json({
      status: "degraded",
      ready: false,
      dependencies: { supabase: "unavailable" },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const readiness = await getSupabaseReadiness();
  if (!readiness.ready) logOperationalError(req, "supabase_readiness", readiness.error);
  res.status(readiness.ready ? 200 : 503).json({
    status: readiness.ready ? "ok" : "degraded",
    ready: readiness.ready,
    dependencies: { supabase: readiness.ready ? "reachable" : "unavailable" },
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/auth/me", requireSupabase, requireApiAuth, (req, res) => {
  res.json({
    user: {
      id: req.auth.user.id,
      email: req.auth.user.email,
      role: req.auth.role,
      name:
        req.auth.user.user_metadata?.full_name ||
        req.auth.user.user_metadata?.first_name ||
        req.auth.user.email,
    },
  });
});

app.post("/api/auth/signup", requireSupabase, async (req, res) => {
  const email = normalize(req.body.email);
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");
  const firstName = cleanText(req.body.firstName);
  const lastName = cleanText(req.body.lastName);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ message: "Enter a valid email address." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ message: "Password must be at least 8 characters." });
    return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({ message: "Passwords do not match." });
    return;
  }

  const { data, error } = await supabaseAnon.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`.trim(),
      },
    },
  });

  if (error) {
    sendProviderFailure(
      req,
      res,
      "auth_signup",
      error,
      "Account creation could not be completed. Check the details and try again.",
      400
    );
    return;
  }

  if (!data?.user) {
    sendProviderFailure(
      req,
      res,
      "auth_signup_response",
      new Error("Authentication provider returned an incomplete account response."),
      "Account creation could not be completed. Try again later."
    );
    return;
  }

  if (data?.session) {
    if (!setAuthCookie(res, data.session)) {
      sendProviderFailure(
        req,
        res,
        "auth_signup_session",
        new Error("Authentication provider returned an invalid session."),
        "Account created, but sign-in could not be completed. Please log in."
      );
      return;
    }
    res.status(201).json({
      message: "Account created. You are signed in.",
      role: "student",
      redirectUrl: "/index.html",
    });
    return;
  }

  res.status(201).json({
    message: "Account created. Confirm your email, then log in.",
    needsEmailConfirmation: true,
  });
});

app.post("/api/auth/login", requireSupabase, async (req, res) => {
  const email = normalize(req.body.email);
  const password = String(req.body.password || "");

  const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
  if (error) {
    if (isEmailNotConfirmed(error)) {
      res.status(403).json({ message: "Confirm your email before logging in. Check your inbox for the confirmation link." });
      return;
    }
    res.status(401).json({ message: "Invalid email or password." });
    return;
  }

  if (!data?.user || !setAuthCookie(res, data?.session)) {
    clearAuthCookie(res);
    sendProviderFailure(
      req,
      res,
      "auth_login_session",
      new Error("Authentication provider returned an invalid session."),
      "Sign-in could not be completed. Try again later."
    );
    return;
  }
  const role = getUserRole(data.user);
  res.json({
    message: `Welcome back, ${data.user.user_metadata?.first_name || role}.`,
    role,
    redirectUrl: role === "admin" ? "/admin.html" : "/index.html",
  });
});

app.post("/api/auth/admin-login", requireSupabase, async (req, res) => {
  const email = normalize(req.body.email);
  const password = String(req.body.password || "");

  const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
  if (error) {
    clearAuthCookie(res);
    if (isEmailNotConfirmed(error)) {
      res.status(403).json({ message: "Confirm this admin email before logging in." });
      return;
    }
    res.status(401).json({ message: "Invalid admin email or password." });
    return;
  }

  if (!data?.user) {
    clearAuthCookie(res);
    sendProviderFailure(
      req,
      res,
      "auth_admin_login_response",
      new Error("Authentication provider returned an incomplete account response."),
      "Admin sign-in could not be completed. Try again later."
    );
    return;
  }

  if (getUserRole(data.user) !== "admin") {
    clearAuthCookie(res);
    res.status(403).json({ message: "This account does not have admin access." });
    return;
  }

  if (!setAuthCookie(res, data?.session)) {
    clearAuthCookie(res);
    sendProviderFailure(
      req,
      res,
      "auth_admin_login_session",
      new Error("Authentication provider returned an invalid session."),
      "Admin sign-in could not be completed. Try again later."
    );
    return;
  }
  res.json({ message: "Admin login successful.", role: "admin", redirectUrl: "/admin.html" });
});

app.post("/api/auth/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ message: "Logged out.", redirectUrl: "/login.html" });
});

app.post("/api/auth/forgot", requireSupabase, async (req, res) => {
  const email = normalize(req.body.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ message: "Enter a valid email address." });
    return;
  }

  const options = PASSWORD_RESET_REDIRECT_URL ? { redirectTo: PASSWORD_RESET_REDIRECT_URL } : undefined;
  const { error } = await supabaseAnon.auth.resetPasswordForEmail(email, options);
  if (error) {
    sendProviderFailure(
      req,
      res,
      "auth_password_reset_request",
      error,
      "Password reset request could not be completed. Try again later."
    );
    return;
  }

  res.json({ message: "Password reset email requested. Check your inbox." });
});

app.post("/api/auth/reset-password", requireSupabase, async (req, res) => {
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");
  const code = cleanText(req.body.code);
  const accessToken = cleanText(req.body.accessToken);

  if (password.length < 8) {
    res.status(400).json({ message: "Password must be at least 8 characters." });
    return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({ message: "Passwords do not match." });
    return;
  }

  let user = null;

  if (code) {
    const { data, error } = await supabaseAnon.auth.exchangeCodeForSession(code);
    if (error || !data?.user) {
      res.status(400).json({ message: "Reset link is invalid or expired. Request a new reset email." });
      return;
    }
    user = data.user;
  } else if (accessToken) {
    const { data, error } = await supabaseAnon.auth.getUser(accessToken);
    if (error || !data?.user) {
      res.status(400).json({ message: "Reset link is invalid or expired. Request a new reset email." });
      return;
    }
    user = data.user;
  } else {
    res.status(400).json({ message: "Open this page from the password recovery email link." });
    return;
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, { password });
  if (error) {
    sendProviderFailure(
      req,
      res,
      "auth_password_update",
      error,
      "Password update could not be completed. Request a new reset link."
    );
    return;
  }

  clearAuthCookie(res);
  res.json({ message: "Password updated. You can log in now.", redirectUrl: "/login.html" });
});

app.get("/api/papers", requireSupabase, requireApiAuth, async (req, res) => {
  const departmentFilter = readDepartmentFilter(req.query);
  if (departmentFilter.error) {
    res.status(400).json({ message: departmentFilter.error });
    return;
  }

  let query = supabaseAdmin
    .from("papers")
    .select("id,title,subject,subject_key,branch,academic_year,semester,exam_session,file_path,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (departmentFilter.key) {
    query = query.in("branch", departmentFilter.branches);
  }

  const requestedSubject = cleanText(req.query.subjectKey) || cleanText(req.query.subject);
  const requestedSubjectKeys = subjectKeyVariants(requestedSubject);
  if (requestedSubjectKeys.length === 1) {
    query = query.eq("subject_key", requestedSubjectKeys[0]);
  } else if (requestedSubjectKeys.length > 1) {
    query = query.in("subject_key", requestedSubjectKeys);
  }

  const { data, error } = await query;
  if (error) {
    sendProviderFailure(req, res, "papers_list", error, "Papers are temporarily unavailable.");
    return;
  }

  try {
    const papers = await attachSignedFileUrls(data);
    res.json({ papers: papers.map(withPaperDepartmentKey) });
  } catch (err) {
    sendProviderFailure(req, res, "papers_sign_urls", err, "Papers are temporarily unavailable.");
  }
});

app.get("/api/notes", requireSupabase, requireApiAuth, async (req, res) => {
  let query = supabaseAdmin
    .from("notes")
    .select("id,title,subject,subject_key,branch,academic_year,semester,unit,file_path,created_at,updated_at")
    .order("created_at", { ascending: false });

  const requestedSubject = cleanText(req.query.subjectKey) || cleanText(req.query.subject);
  const requestedSubjectKeys = subjectKeyVariants(requestedSubject);
  if (requestedSubjectKeys.length === 1) {
    query = query.eq("subject_key", requestedSubjectKeys[0]);
  } else if (requestedSubjectKeys.length > 1) {
    query = query.in("subject_key", requestedSubjectKeys);
  }

  const { data, error } = await query;
  if (error) {
    sendProviderFailure(req, res, "notes_list", error, "Notes are temporarily unavailable.");
    return;
  }

  try {
    res.json({ notes: await attachSignedFileUrls(data) });
  } catch (err) {
    sendProviderFailure(req, res, "notes_sign_urls", err, "Notes are temporarily unavailable.");
  }
});

app.post(
  "/api/admin/papers",
  requireSupabase,
  requireAdmin,
  upload.single("pdf"),
  requirePdfSignature,
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: "Upload a PDF file." });
      return;
    }

    const metadata = normalizePaperUploadMetadata(req.body, req.file.originalname);
    if (metadata.error) {
      res.status(400).json({ message: metadata.error });
      return;
    }

    const { departmentKey, subject, title, academicYear, semester, examSession } = metadata;
    const titleKey = slugify(title.slice(0, -4)) || "paper";
    const filePath = `${departmentKey}/${Date.now()}-${randomUUID()}-${titleKey}.pdf`;

    let data;
    try {
      const { error: uploadError } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, req.file.buffer, {
          contentType: "application/pdf",
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        sendProviderFailure(req, res, "paper_storage_upload", uploadError, "Paper upload failed.");
        return;
      }

      const insertResult = await supabaseAdmin
        .from("papers")
        .insert({
          title,
          subject,
          subject_key: subjectKey(subject),
          branch: departmentKey,
          academic_year: academicYear,
          semester,
          exam_session: examSession,
          file_path: filePath,
          ...auditFields(req, "uploaded_by", "uploaded_by_email"),
        })
        .select()
        .single();

      if (insertResult.error) {
        await rollbackStoredFile(req, filePath);
        sendProviderFailure(
          req,
          res,
          "paper_database_insert",
          insertResult.error,
          "Paper upload could not be saved."
        );
        return;
      }
      data = insertResult.data;
    } catch (error) {
      await rollbackStoredFile(req, filePath);
      sendProviderFailure(req, res, "paper_upload", error, "Paper upload failed.");
      return;
    }

    try {
      const [paper] = await attachSignedFileUrls([data]);
      res.status(201).json({ message: "Paper uploaded.", paper: withPaperDepartmentKey(paper) });
    } catch (error) {
      logOperationalError(req, "paper_sign_url", error);
      const paper = { ...data };
      delete paper.file_path;
      res.status(201).json({
        message: "Paper uploaded. Its secure link is temporarily unavailable.",
        paper: withPaperDepartmentKey({ ...paper, file_url: "" }),
      });
    }
  }
);

app.post(
  "/api/admin/notes",
  requireSupabase,
  requireAdmin,
  upload.single("pdf"),
  requirePdfSignature,
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: "Upload a notes PDF file." });
      return;
    }

    const subject = cleanText(req.body.subject);
    const title = cleanText(req.body.title) || req.file.originalname;
    const branch = cleanText(req.body.branch);
    const academicYear = cleanText(req.body.academicYear);
    const semester = cleanText(req.body.semester);
    const unit = cleanText(req.body.unit);

    if (!subject) {
      res.status(400).json({ message: "Subject is required." });
      return;
    }

    const folder = `notes/${slugify(branch || "general")}`;
    const fileName = `${Date.now()}-${slugify(req.file.originalname)}`;
    const filePath = `${folder}/${fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`}`;

    let data;
    try {
      const { error: uploadError } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, req.file.buffer, {
          contentType: "application/pdf",
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        sendProviderFailure(req, res, "notes_storage_upload", uploadError, "Notes upload failed.");
        return;
      }

      const insertResult = await supabaseAdmin
        .from("notes")
        .insert({
          title,
          subject,
          subject_key: subjectKey(subject),
          branch,
          academic_year: academicYear,
          semester,
          unit,
          file_path: filePath,
          ...auditFields(req, "uploaded_by", "uploaded_by_email"),
        })
        .select()
        .single();

      if (insertResult.error) {
        await rollbackStoredFile(req, filePath);
        sendProviderFailure(
          req,
          res,
          "notes_database_insert",
          insertResult.error,
          "Notes upload could not be saved."
        );
        return;
      }
      data = insertResult.data;
    } catch (error) {
      await rollbackStoredFile(req, filePath);
      sendProviderFailure(req, res, "notes_upload", error, "Notes upload failed.");
      return;
    }

    try {
      const [note] = await attachSignedFileUrls([data]);
      res.status(201).json({ message: "Notes uploaded.", note });
    } catch (error) {
      logOperationalError(req, "notes_sign_url", error);
      const note = { ...data };
      delete note.file_path;
      res.status(201).json({
        message: "Notes uploaded. Its secure link is temporarily unavailable.",
        note: { ...note, file_url: "" },
      });
    }
  }
);

app.get("/api/admin/results", requireSupabase, requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("results")
    .select("id,student_name,student_email,roll_no,subject,test_name,marks_obtained,marks_total,created_by_email,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    sendProviderFailure(req, res, "admin_results_list", error, "Results are temporarily unavailable.");
    return;
  }

  res.json({ results: data.map(resultSummary) });
});

app.post("/api/admin/results", requireSupabase, requireAdmin, async (req, res) => {
  const studentName = cleanText(req.body.studentName);
  const studentEmail = normalize(req.body.studentEmail ?? req.body.student_email);
  const rollNo = cleanText(req.body.rollNo);
  const subject = cleanText(req.body.subject);
  const testName = cleanText(req.body.testName);
  const marks = readMarksPayload(req.body);

  if (!studentName || !studentEmail || !rollNo || !subject || !testName) {
    res.status(400).json({ message: "Student name, email, roll no, subject, and test name are required." });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentEmail)) {
    res.status(400).json({ message: "Enter a valid student email." });
    return;
  }
  if (marks.error) {
    res.status(400).json({ message: marks.error });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("results")
    .insert({
      student_name: studentName,
      student_email: studentEmail,
      roll_no: rollNo,
      roll_key: lookupText(rollNo),
      subject,
      subject_key: subjectKey(subject),
      test_name: testName,
      test_key: slugify(testName),
      marks_obtained: marks.marksObtained,
      marks_total: marks.marksTotal,
      ...auditFields(req, "created_by", "created_by_email"),
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      res.status(409).json({
        message: "A result already exists for this student, roll no, subject, and test name.",
      });
      return;
    }
    sendProviderFailure(req, res, "admin_result_insert", error, "The result could not be saved.");
    return;
  }

  res.status(201).json({ message: "Result added.", result: resultSummary(data) });
});

app.get("/api/results/options", requireSupabase, requireApiAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("results")
    .select("subject,test_name")
    .eq("student_email", normalize(req.auth.user.email))
    .order("subject", { ascending: true })
    .limit(500);

  if (error) {
    sendProviderFailure(req, res, "result_options", error, "Result options are temporarily unavailable.");
    return;
  }

  const subjects = [...new Set(data.map((row) => cleanText(row.subject)).filter(Boolean))];
  const tests = [...new Set(data.map((row) => cleanText(row.test_name)).filter(Boolean))];

  res.json({ subjects, tests });
});

app.post("/api/results", requireSupabase, requireApiAuth, async (req, res) => {
  const studentName = cleanText(req.body.name);
  const rollNo = cleanText(req.body.roll);
  const subject = cleanText(req.body.subject);
  const testName = cleanText(req.body.test);

  if (!studentName || !rollNo || !subject || !testName) {
    res.status(400).json({ message: "Student name, roll no, subject, and test name are required." });
    return;
  }

  let query = supabaseAdmin
    .from("results")
    .select("student_name,roll_no,subject,test_name,marks_obtained,marks_total")
    .eq("student_email", normalize(req.auth.user.email))
    .eq("roll_key", lookupText(rollNo))
    .eq("test_key", slugify(testName))
    .limit(1);

  const requestedSubjectKeys = subjectKeyVariants(subject);
  if (requestedSubjectKeys.length === 1) {
    query = query.eq("subject_key", requestedSubjectKeys[0]);
  } else if (requestedSubjectKeys.length > 1) {
    query = query.in("subject_key", requestedSubjectKeys);
  }

  const { data, error } = await query;

  if (error) {
    sendProviderFailure(req, res, "result_lookup", error, "The result lookup is temporarily unavailable.");
    return;
  }

  const inputName = lookupText(studentName);
  const result = data.find((row) => lookupText(row.student_name) === inputName);

  if (!result) {
    res.status(404).json({ message: "Result not found. Please check Name / Roll No / Subject / Test." });
    return;
  }

  res.json({
    name: result.student_name,
    rollNo: result.roll_no,
    subject: result.subject,
    test: result.test_name,
    marks: formatMarks(result.marks_obtained, result.marks_total),
    marksObtained: result.marks_obtained,
    marksTotal: result.marks_total,
  });
});

app.use("/data", (req, res) => res.sendStatus(403));
app.use("/node_modules", (req, res) => res.sendStatus(403));
app.use(["/server.js", "/package.json", "/package-lock.json", "/server.err.log", "/server.out.log"], (req, res) =>
  res.sendStatus(404)
);
app.use(
  "/Assets",
  express.static(path.join(ROOT, "Assets"), {
    immutable: isProduction,
    maxAge: isProduction ? "30d" : 0,
  })
);
app.use(
  "/papers",
  (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  },
  requireSupabase,
  requireApiAuth,
  express.static(path.join(ROOT, "papers"), {
    etag: false,
    lastModified: false,
    maxAge: 0,
    setHeaders(res) {
      res.setHeader("Cache-Control", "private, no-store");
    },
  })
);
app.get(["/", "/index.html"], requirePageAuth(), (req, res) =>
  res.sendFile(path.join(ROOT, "index.html"))
);
app.get(["/Notes.html", "/Papers.html", "/Lectures.html", "/About.html", "/result.html"], requirePageAuth(), (req, res) =>
  res.sendFile(path.join(ROOT, req.path))
);
app.get("/admin.html", requirePageAuth("admin"), (req, res) =>
  res.sendFile(path.join(ROOT, "admin.html"))
);
app.get("/auth.html", (req, res) => res.redirect(308, "/signup.html"));
app.get("/:fileName", (req, res, next) => {
  const fileName = path.basename(req.params.fileName);
  if (fileName !== req.params.fileName || blockedRootFiles.test(fileName)) {
    res.sendStatus(404);
    return;
  }
  if (!publicPages.has(fileName) && !publicAssets.has(fileName)) {
    next();
    return;
  }
  res.sendFile(path.join(ROOT, fileName));
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ message: "API route not found." });
    return;
  }
  res
    .status(404)
    .type("html")
    .send(
      "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Page not found</title></head><body><main><h1>Page not found</h1><p>The requested page does not exist.</p><a href=\"/\">Return home</a></main></body></html>"
    );
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err.code === "CORS_ORIGIN_DENIED") {
    res.status(403).json({ message: "Origin is not allowed." });
    return;
  }
  if (err.code === "INVALID_PDF_TYPE") {
    res.status(400).json({ message: "Only PDF files are allowed." });
    return;
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "PDF files must be 25 MB or smaller."
        : "The upload could not be accepted.";
    res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ message });
    return;
  }
  if (err.type === "entity.parse.failed") {
    res.status(400).json({ message: "Request body contains invalid JSON." });
    return;
  }

  logOperationalError(req, "unhandled_request_error", err);
  if (req.path.startsWith("/api/")) {
    res.status(500).json({ message: "Unexpected server error." });
    return;
  }
  res
    .status(500)
    .type("html")
    .send(
      "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Server error</title></head><body><main><h1>Something went wrong</h1><p>Please try again later.</p><a href=\"/\">Return home</a></main></body></html>"
    );
});

function startServer({ port = PORT } = {}) {
  const configurationErrors = getConfigurationErrors();
  if (isProduction && configurationErrors.length) {
    throw new Error(`Invalid production configuration:\n- ${configurationErrors.join("\n- ")}`);
  }

  if (!isProduction && configurationErrors.length) {
    for (const error of configurationErrors) console.warn(`Configuration warning: ${error}`);
  }

  const server = app.listen(port, () => {
    const address = server.address();
    const listeningPort = typeof address === "object" && address ? address.port : port;
    console.log(`Enlighten running at http://localhost:${listeningPort}`);
  });
  return server;
}

if (require.main === module) startServer();

module.exports = {
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
  startServer,
  subjectKeyVariants,
  withPaperDepartmentKey,
};
