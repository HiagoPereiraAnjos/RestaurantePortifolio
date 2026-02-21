/**
 * Minimal .env loader for local development.
 *
 * We avoid adding dependencies (like dotenv) to keep the project stable.
 * This runs as a side-effect import before other server modules.
 */

import fs from "fs";
import path from "path";

function parseEnvFile(contents: string) {
  const lines = contents.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Don't override existing env vars
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

try {
  const root = process.cwd();
  const envPath = path.join(root, ".env");
  if (fs.existsSync(envPath)) {
    const contents = fs.readFileSync(envPath, "utf8");
    parseEnvFile(contents);
  }
} catch {
  // Ignore env load errors; server will throw if required vars are missing.
}
