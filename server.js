require("dotenv").config();

const cors = require("cors");
const express = require("express");
const multer = require("multer");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "papers";
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

const supabaseReady = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY);
const supabaseAnon = supabaseReady ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const supabaseAdmin = supabaseReady
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

const defaultOrigins = [
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
const allowedOrigins = new Set([...defaultOrigins, ...configuredOrigins]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Only PDF files are allowed."));
      return;
    }
    cb(null, true);
  },
});

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

function requireSupabase(req, res, next) {
  if (supabaseReady) {
    next();
    return;
  }

  res.status(503).json({
    message:
      "Supabase is not configured. Add SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to .env.",
  });
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function getAccessToken(req) {
  const authHeader = req.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return parseCookies(req).enlighten_access_token || "";
}

function getUserRole(user) {
  const metadataRole = user?.app_metadata?.role || user?.user_metadata?.role;
  if (metadataRole === "admin" || ADMIN_EMAILS.has(normalize(user?.email))) {
    return "admin";
  }
  return "student";
}

async function getRequestUser(req) {
  if (!supabaseReady) return null;
  const token = getAccessToken(req);
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;

  return {
    user: data.user,
    role: getUserRole(data.user),
  };
}

function clearAuthCookie(res) {
  res.setHeader(
    "Set-Cookie",
    "enlighten_access_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
  );
}

function setAuthCookie(res, session) {
  const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `enlighten_access_token=${session.access_token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${session.expires_in}${secureCookie}`
  );
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
  const providedKey = req.get("x-admin-key") || "";
  const legacyAdminKey = process.env.ADMIN_API_KEY || "";

  if (legacyAdminKey && providedKey === legacyAdminKey) {
    req.auth = { role: "admin", user: null };
    next();
    return;
  }

  const session = await getRequestUser(req);
  if (!session || session.role !== "admin") {
    res.status(401).json({ message: "Admin login required." });
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
  const rawKey = slugify(value);
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

function cleanText(value) {
  return String(value || "").trim();
}

function lookupText(value) {
  return normalize(value).replace(/\s+/g, " ");
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

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    supabaseConfigured: supabaseReady,
    storageBucket: STORAGE_BUCKET,
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
        role: "student",
      },
    },
  });

  if (error) {
    res.status(400).json({ message: error.message });
    return;
  }

  if (data.session) {
    setAuthCookie(res, data.session);
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

  setAuthCookie(res, data.session);
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

  if (getUserRole(data.user) !== "admin") {
    clearAuthCookie(res);
    res.status(403).json({ message: "This account is not configured as admin. Add the email to ADMIN_EMAILS and restart the server." });
    return;
  }

  setAuthCookie(res, data.session);
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
    res.status(400).json({ message: error.message });
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
    res.status(400).json({ message: error.message });
    return;
  }

  clearAuthCookie(res);
  res.json({ message: "Password updated. You can log in now.", redirectUrl: "/login.html" });
});

app.get("/api/papers", requireSupabase, requireApiAuth, async (req, res) => {
  let query = supabaseAdmin
    .from("papers")
    .select("id,title,subject,subject_key,branch,academic_year,semester,exam_session,file_url,created_at")
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
    res.status(500).json({ message: error.message });
    return;
  }

  res.json({ papers: data });
});

app.get("/api/notes", requireSupabase, requireApiAuth, async (req, res) => {
  let query = supabaseAdmin
    .from("notes")
    .select("id,title,subject,subject_key,branch,academic_year,semester,unit,file_url,created_at")
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
    res.status(500).json({ message: error.message });
    return;
  }

  res.json({ notes: data });
});

app.post(
  "/api/admin/papers",
  requireSupabase,
  requireAdmin,
  upload.single("pdf"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: "Upload a PDF file." });
      return;
    }

    const subject = cleanText(req.body.subject);
    const title = cleanText(req.body.title) || req.file.originalname;
    const branch = cleanText(req.body.branch);
    const academicYear = cleanText(req.body.academicYear);
    const semester = cleanText(req.body.semester);
    const examSession = cleanText(req.body.examSession);

    if (!subject) {
      res.status(400).json({ message: "Subject is required." });
      return;
    }

    const folder = slugify(branch || "general");
    const fileName = `${Date.now()}-${slugify(req.file.originalname)}`;
    const filePath = `${folder}/${fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, req.file.buffer, {
        contentType: "application/pdf",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      res.status(500).json({ message: uploadError.message });
      return;
    }

    const { data: publicData } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    const { data, error } = await supabaseAdmin
      .from("papers")
      .insert({
        title,
        subject,
        subject_key: subjectKey(subject),
        branch,
        academic_year: academicYear,
        semester,
        exam_session: examSession,
        file_path: filePath,
        file_url: publicData.publicUrl,
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ message: error.message });
      return;
    }

    res.status(201).json({ message: "Paper uploaded.", paper: data });
  }
);

app.post(
  "/api/admin/notes",
  requireSupabase,
  requireAdmin,
  upload.single("pdf"),
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

    const { error: uploadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, req.file.buffer, {
        contentType: "application/pdf",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      res.status(500).json({ message: uploadError.message });
      return;
    }

    const { data: publicData } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    const { data, error } = await supabaseAdmin
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
        file_url: publicData.publicUrl,
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ message: error.message });
      return;
    }

    res.status(201).json({ message: "Notes uploaded.", note: data });
  }
);

app.get("/api/admin/results", requireSupabase, requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("results")
    .select("id,student_name,roll_no,subject,test_name,marks,created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  res.json({ results: data });
});

app.post("/api/admin/results", requireSupabase, requireAdmin, async (req, res) => {
  const studentName = cleanText(req.body.studentName);
  const rollNo = cleanText(req.body.rollNo);
  const subject = cleanText(req.body.subject);
  const testName = cleanText(req.body.testName);
  const marks = cleanText(req.body.marks);

  if (!studentName || !rollNo || !subject || !testName || !marks) {
    res.status(400).json({ message: "Student name, roll no, subject, test name, and marks are required." });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("results")
    .insert({
      student_name: studentName,
      roll_no: rollNo,
      subject,
      test_name: testName,
      marks,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(201).json({ message: "Result added.", result: data });
});

app.get("/api/results/options", requireSupabase, requireApiAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("results")
    .select("subject,test_name")
    .order("subject", { ascending: true })
    .limit(500);

  if (error) {
    res.status(500).json({ message: error.message });
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

  const { data, error } = await supabaseAdmin
    .from("results")
    .select("student_name,roll_no,subject,test_name,marks")
    .eq("roll_no", rollNo)
    .limit(50);

  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  const inputName = lookupText(studentName);
  const inputSubjectKey = subjectKey(subject);
  const inputTestName = lookupText(testName);
  const matchingNameAndSubject = data.filter(
    (row) =>
      lookupText(row.student_name) === inputName &&
      subjectKey(row.subject) === inputSubjectKey
  );
  const result = matchingNameAndSubject.find((row) => lookupText(row.test_name) === inputTestName);

  if (!result) {
    const availableTests = [...new Set(matchingNameAndSubject.map((row) => cleanText(row.test_name)).filter(Boolean))];
    const suffix = availableTests.length
      ? ` Available test name${availableTests.length === 1 ? "" : "s"}: ${availableTests.join(", ")}.`
      : "";
    res.status(404).json({ message: `Result not found. Please check Name / Roll No / Subject / Test.${suffix}` });
    return;
  }

  res.json({
    name: result.student_name,
    rollNo: result.roll_no,
    subject: result.subject,
    test: result.test_name,
    marks: result.marks,
  });
});

app.use("/data", (req, res) => res.sendStatus(403));
app.use("/node_modules", (req, res) => res.sendStatus(403));
app.get(["/", "/index.html"], requirePageAuth(), (req, res) =>
  res.sendFile(path.join(ROOT, "index.html"))
);
app.get(["/Notes.html", "/Papers.html", "/Lectures.html", "/About.html", "/result.html"], requirePageAuth(), (req, res) =>
  res.sendFile(path.join(ROOT, req.path))
);
app.get("/admin.html", requirePageAuth("admin"), (req, res) =>
  res.sendFile(path.join(ROOT, "admin.html"))
);
app.use(express.static(ROOT, { dotfiles: "ignore" }));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message === "Only PDF files are allowed.") {
    res.status(400).json({ message: err.message });
    return;
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Enlighten running at http://localhost:${PORT}`);
  if (!supabaseReady) {
    console.log("Supabase env vars are missing. API routes will return setup guidance until .env is configured.");
  }
});
