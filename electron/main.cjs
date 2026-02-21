const { app, BrowserWindow, Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { randomBytes } = require("crypto");
const AutoLaunch = require("auto-launch");

const BASE_URL = "http://127.0.0.1:5000";
const HEALTH_URL = `${BASE_URL}/`;
const BACKEND_PORT = "5000";
const BACKEND_HOST = "0.0.0.0";
const DEFAULT_DATABASE_URL = "postgresql://postgres:1308@localhost:5432/restaurant";

let backendProc = null;
let isQuitting = false;
let mainWindow = null;
let tray = null;

// Ensure cache/user data go to a writable location (AppData), avoiding access errors.
const userDataDir = path.join(app.getPath("appData"), "Sistema Restaurante");
app.setPath("userData", userDataDir);
app.setPath("cache", path.join(userDataDir, "Cache"));

function resolveEntryPath() {
  if (process.argv.includes("--kitchen")) return "/cozinha";
  return "/caixa";
}

function appUrl() {
  return `${BASE_URL}${resolveEntryPath()}`;
}

function routeUrl(route) {
  return `${BASE_URL}${route}`;
}

function isDev() {
  // Packaged app must never run dev branch.
  return !app.isPackaged && process.env.NODE_ENV !== "production";
}

function appBasePath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar");
  }
  return path.resolve(__dirname, "..");
}

function backendEntryPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar.unpacked", "dist", "index.cjs");
  }
  return path.join(appBasePath(), "dist", "index.cjs");
}

function backendEnv() {
  const jwtSecret = String(process.env.JWT_SECRET || "").trim() || randomBytes(48).toString("base64");
  const databaseUrl = String(process.env.DATABASE_URL || "").trim() || DEFAULT_DATABASE_URL;

  return {
    ...process.env,
    PORT: BACKEND_PORT,
    HOST: BACKEND_HOST,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    NODE_ENV: "production",
    VITE_BACKEND_MODE: "api",
  };
}

function backendSpawnCommandAndArgs() {
  if (app.isPackaged) {
    // In packaged apps we cannot rely on a system-level `node` binary.
    // Reuse Electron runtime as Node via ELECTRON_RUN_AS_NODE.
    return {
      command: process.execPath,
      args: [backendEntryPath()],
      envPatch: { ELECTRON_RUN_AS_NODE: "1" },
    };
  }
  return {
    command: "node",
    args: [backendEntryPath()],
    envPatch: {},
  };
}

function safeSpawn(command, args, options) {
  try {
    return spawn(command, args, options);
  } catch (primaryErr) {
    // Windows fallback: execute via cmd to avoid occasional spawn EINVAL
    // when launching packaged runtime paths.
    if (process.platform === "win32") {
      const quoted = [command, ...args].map((x) => `"${x}"`).join(" ");
      return spawn("cmd.exe", ["/d", "/s", "/c", quoted], options);
    }
    throw primaryErr;
  }
}

function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const contents = fs.readFileSync(filePath, "utf8");
    const lines = contents.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {}
}

function primeEnvFromKnownLocations() {
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(path.dirname(process.execPath), ".env"),
    path.join(path.resolve(path.dirname(process.execPath), ".."), ".env"),
  ];
  for (const p of candidates) {
    loadEnvFile(p);
  }
}

function startBackend() {
  if (backendProc) return;
  primeEnvFromKnownLocations();

  if (isDev()) {
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    backendProc = safeSpawn(npmCmd, ["run", "dev:fullstack"], {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        PORT: BACKEND_PORT,
        HOST: BACKEND_HOST,
        NODE_ENV: "development",
        VITE_BACKEND_MODE: "api",
      },
      windowsHide: true,
      stdio: "pipe",
    });
    return;
  }

  const spawnSpec = backendSpawnCommandAndArgs();
  backendProc = safeSpawn(spawnSpec.command, spawnSpec.args, {
    cwd: app.isPackaged ? process.resourcesPath : path.resolve(__dirname, ".."),
    env: {
      ...backendEnv(),
      ...spawnSpec.envPatch,
    },
    windowsHide: true,
    stdio: "pipe",
  });

  backendProc.stdout.on("data", (chunk) => {
    console.log(`[backend] ${String(chunk).trim()}`);
  });
  backendProc.stderr.on("data", (chunk) => {
    console.error(`[backend:error] ${String(chunk).trim()}`);
  });
  backendProc.on("exit", (code, signal) => {
    console.error(`[backend] exited code=${code} signal=${signal}`);
  });
}

function stopBackend() {
  if (!backendProc) return;

  const proc = backendProc;
  backendProc = null;

  try {
    proc.kill("SIGTERM");
  } catch {}

  setTimeout(() => {
    try {
      if (!proc.killed) proc.kill("SIGKILL");
    } catch {}
  }, 1500);
}

async function waitForBackendReady() {
  const timeoutMs = 45000;
  const intervalMs = 350;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (backendProc && backendProc.exitCode !== null) {
      throw new Error("Backend process exited before becoming ready.");
    }
    try {
      const res = await fetch(HEALTH_URL, { method: "GET" });
      if (res.ok || res.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Timed out waiting for backend to become ready.");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadURL(appUrl());
}

function openRoute(route) {
  const target = routeUrl(route);
  if (!mainWindow) {
    createWindow();
  }
  mainWindow.show();
  mainWindow.focus();
  mainWindow.loadURL(target);
}

function trayIconPath() {
  // Reuse existing app asset as tray icon.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar", "client", "public", "favicon.png");
  }
  return path.resolve(__dirname, "..", "client", "public", "favicon.png");
}

function createTray() {
  if (tray) return;

  const icon = nativeImage.createFromPath(trayIconPath());
  tray = new Tray(icon);
  tray.setToolTip("Sistema Restaurante");

  const contextMenu = Menu.buildFromTemplate([
    { label: "Abrir Caixa", click: () => openRoute("/caixa") },
    { label: "Abrir Cozinha", click: () => openRoute("/cozinha") },
    { type: "separator" },
    {
      label: "Reiniciar Servidor",
      click: async () => {
        try {
          stopBackend();
          startBackend();
          await waitForBackendReady();
          openRoute("/caixa");
        } catch (err) {
          console.error("[electron] restart backend failed:", err);
        }
      },
    },
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => openRoute("/caixa"));
}

async function enableAutoLaunch() {
  try {
    const launcher = new AutoLaunch({
      name: "Sistema Restaurante",
    });
    const enabled = await launcher.isEnabled();
    if (!enabled) await launcher.enable();
  } catch (err) {
    console.warn("[electron] auto-launch setup failed:", err);
  }
}

app.whenReady().then(async () => {
  try {
    await enableAutoLaunch();
    createTray();
    startBackend();
    await waitForBackendReady();
    if (!isQuitting) createWindow();
  } catch (err) {
    console.error("[electron] Failed to start backend:", err);
    app.quit();
    return;
  }

  app.on("activate", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      return;
    }
    createWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  stopBackend();
});

app.on("window-all-closed", () => {
  // Keep app alive in tray.
});
