const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const { minify } = require("html-minifier-terser");
const { validateProject } = require("./validate-build");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const assetRoot = path.join(dist, "Assets");

function topLevelFiles(extension) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === extension)
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function copyDirectory(source, destination, predicate = () => true) {
  if (!fs.existsSync(source)) return;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath, predicate);
    } else if (predicate(sourcePath)) {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function collectBuildInputs() {
  const files = fs
    .readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        ([".css", ".html", ".js", ".json"].includes(path.extname(entry.name).toLowerCase()) ||
          entry.name === ".env.example")
    )
    .map((entry) => path.join(root, entry.name));

  const collect = (directory, predicate) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(fullPath, predicate);
      else if (predicate(fullPath)) files.push(fullPath);
    }
  };

  collect(path.join(root, "Assets"), (file) => path.extname(file).toLowerCase() === ".webp");
  collect(path.join(root, "papers"), (file) => path.extname(file).toLowerCase() === ".pdf");
  files.push(path.join(root, "scripts", "build.js"), path.join(root, "scripts", "start.js"));
  return [...new Set(files)].sort((left, right) => left.localeCompare(right));
}

function localScriptSources(html, htmlFile) {
  const sources = [];
  const scriptPattern = /<script\b([^>]*)\bsrc\s*=\s*(["'])([^"']+)\2([^>]*)>\s*<\/script\s*>/gi;
  let match;

  while ((match = scriptPattern.exec(html))) {
    const source = match[3].trim();
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(source)) continue;

    const cleanSource = source.split(/[?#]/, 1)[0].replace(/^\//, "");
    if (path.extname(cleanSource).toLowerCase() !== ".js") continue;

    const absoluteSource = path.resolve(root, path.dirname(htmlFile), cleanSource);
    if (!absoluteSource.startsWith(`${root}${path.sep}`) || !fs.existsSync(absoluteSource)) {
      throw new Error(`${htmlFile} references a missing browser script: ${source}`);
    }
    sources.push({ source, absoluteSource, tag: match[0] });
  }

  return sources;
}

async function bundlePageScripts(html, htmlFile) {
  const scripts = localScriptSources(html, htmlFile);
  if (!scripts.length) return html;

  const pageName = path.basename(htmlFile, path.extname(htmlFile));
  const bundleName = `${pageName}.bundle.js`;
  const bundlePath = path.join(assetRoot, "js", bundleName);
  const imports = scripts
    .map(({ absoluteSource }) => {
      const sourcePath = path.relative(root, absoluteSource).replace(/\\/g, "/");
      return `import ${JSON.stringify(`./${sourcePath}`)};`;
    })
    .join("\n");

  fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
  await esbuild.build({
    stdin: {
      contents: imports,
      loader: "js",
      resolveDir: root,
      sourcefile: `${pageName}.entry.js`,
    },
    bundle: true,
    charset: "utf8",
    format: "iife",
    legalComments: "none",
    minify: true,
    outfile: bundlePath,
    platform: "browser",
    sourcemap: false,
    target: ["es2020"],
  });

  let inserted = false;
  const localTags = new Set(scripts.map(({ tag }) => tag));
  return html.replace(/<script\b[^>]*\bsrc\s*=\s*(["'])[^"']+\1[^>]*>\s*<\/script\s*>/gi, (tag) => {
    if (!localTags.has(tag)) return tag;
    if (inserted) return "";
    inserted = true;
    return `<script src="Assets/js/${bundleName}" defer></script>`;
  });
}

async function buildHtml() {
  const htmlFiles = topLevelFiles(".html");
  for (const file of htmlFiles) {
    const sourceHtml = fs.readFileSync(path.join(root, file), "utf8");
    const bundledHtml = await bundlePageScripts(sourceHtml, file);
    const output = await minify(bundledHtml, {
      collapseBooleanAttributes: true,
      collapseWhitespace: true,
      keepClosingSlash: false,
      minifyCSS: true,
      minifyJS: false,
      removeComments: true,
      removeEmptyAttributes: false,
      removeOptionalTags: false,
      removeRedundantAttributes: true,
      sortAttributes: true,
      sortClassName: false,
      useShortDoctype: true,
    });
    fs.writeFileSync(path.join(dist, file), `${output}\n`, "utf8");
  }
  return htmlFiles.length;
}

async function buildCss() {
  const cssFiles = topLevelFiles(".css");
  for (const file of cssFiles) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    const { code } = await esbuild.transform(source, {
      charset: "utf8",
      legalComments: "none",
      loader: "css",
      minify: true,
      sourcefile: file,
      target: ["es2020"],
    });
    fs.writeFileSync(path.join(dist, file), code, "utf8");
  }
  return cssFiles.length;
}

function copyRuntimeFiles() {
  for (const file of ["server.js", "package-lock.json", ".env.example"]) {
    fs.copyFileSync(path.join(root, file), path.join(dist, file));
  }

  const packageManifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  packageManifest.scripts = { start: "node scripts/start.js" };
  fs.writeFileSync(
    path.join(dist, "package.json"),
    `${JSON.stringify(packageManifest, null, 2)}\n`,
    "utf8"
  );

  const runtimeScripts = path.join(dist, "scripts");
  fs.mkdirSync(runtimeScripts, { recursive: true });
  fs.copyFileSync(path.join(root, "scripts", "start.js"), path.join(runtimeScripts, "start.js"));

  copyDirectory(path.join(root, "Assets"), assetRoot, (file) => path.extname(file).toLowerCase() === ".webp");
  copyDirectory(path.join(root, "papers"), path.join(dist, "papers"), (file) => path.extname(file).toLowerCase() === ".pdf");
}

function createManifest() {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (entry.name === "build-manifest.json") continue;
      const contents = fs.readFileSync(fullPath);
      files.push({
        path: path.relative(dist, fullPath).replace(/\\/g, "/"),
        bytes: contents.length,
        sha256: crypto.createHash("sha256").update(contents).digest("hex"),
      });
    }
  };

  const sourceFiles = collectBuildInputs().map((file) => {
    const contents = fs.readFileSync(file);
    return {
      path: path.relative(root, file).replace(/\\/g, "/"),
      bytes: contents.length,
      sha256: crypto.createHash("sha256").update(contents).digest("hex"),
    };
  });

  visit(dist);
  fs.writeFileSync(
    path.join(dist, "build-manifest.json"),
    `${JSON.stringify({ schemaVersion: 2, sourceFiles, files }, null, 2)}\n`,
    "utf8",
  );
}

function cleanDist() {
  if (path.dirname(dist) !== root || path.basename(dist) !== "dist") {
    throw new Error("Refusing to clean an unexpected build directory.");
  }
  fs.rmSync(dist, { force: true, recursive: true });
  fs.mkdirSync(dist, { recursive: true });
}

async function main() {
  validateProject({ directory: root, mode: "source" });
  cleanDist();

  copyRuntimeFiles();
  const [htmlCount, cssCount] = await Promise.all([buildHtml(), buildCss()]);
  createManifest();
  validateProject({ directory: dist, mode: "dist", sourceDirectory: root });

  const bundleCount = fs.existsSync(path.join(assetRoot, "js"))
    ? fs.readdirSync(path.join(assetRoot, "js")).filter((file) => file.endsWith(".js")).length
    : 0;
  console.log(`Production build complete: ${htmlCount} HTML, ${cssCount} CSS, ${bundleCount} browser bundles.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
