import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Syntax-checks every .js file in the project. The npm "check" script used to
// list files by hand, which silently skipped most of the API (services,
// controllers, routes, repositories) — a broken file in those folders could
// still ship. This walks the tree instead, so new files are covered for free.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRECTORIES = new Set(["node_modules", ".git", ".vercel", "data", "logs", "dist", "build"]);

function collectJsFiles(directory, found = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      // Local deployment snapshots are intentionally kept for rollback, but
      // they are not source files. Skipping them keeps checks deterministic
      // and prevents validating the same large bundle several times.
      if (SKIP_DIRECTORIES.has(entry.name) || entry.name.startsWith(".vercel-deploy-fix-")) continue;
      collectJsFiles(fullPath, found);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      found.push(fullPath);
    }
  }

  return found;
}

const files = collectJsFiles(projectRoot).sort();
const failures = [];

for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (error) {
    const detail = error.stderr ? error.stderr.toString().trim() : error.message;
    failures.push({ file: path.relative(projectRoot, file), detail });
  }
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`\n✗ ${failure.file}\n${failure.detail}`);
  }
  console.error(`\n${failures.length} of ${files.length} file(s) failed the syntax check.`);
  process.exit(1);
}

console.log(`✓ Syntax check passed for ${files.length} JavaScript file(s).`);
