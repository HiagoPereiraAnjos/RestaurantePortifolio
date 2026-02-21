import "./loadEnv";

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { randomUUID } from "crypto";
import { ensureSeed } from "./seed";
import { initRealtime } from "./realtime";
import { assertOrdersComandaForeignKey, assertTimezoneSafeSchema } from "./db";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

function logStructured(event: string, payload: Record<string, unknown>, source = "express", level: "info" | "warn" | "error" = "info") {
  const row = {
    ts: new Date().toISOString(),
    level,
    source,
    event,
    ...payload,
  };
  const line = JSON.stringify(redactForLogs(row));
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}

const SENSITIVE_KEYS = new Set([
  "token",
  "authorization",
  "password",
  "passwordhash",
  "currentpassword",
  "newpassword",
]);

function redactForLogs(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.map((item) => redactForLogs(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? "[redacted]" : redactForLogs(v, depth + 1);
    }
    return out;
  }
  return value;
}

function shouldLogResponseBody(path: string): boolean {
  if (path.startsWith("/api/auth/")) return false;
  return true;
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  const requestId = (req.header("x-request-id") || randomUUID()).slice(0, 128);
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const responsePreview = capturedJsonResponse && shouldLogResponseBody(path)
        ? (() => {
            const safeBody = JSON.stringify(redactForLogs(capturedJsonResponse));
            return safeBody.length > 800 ? `${safeBody.slice(0, 800)}...` : safeBody;
          })()
        : undefined;

      logStructured("http.request.complete", {
        requestId,
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: duration,
        responsePreview,
      });
    }
  });

  next();
});

(async () => {
  await assertTimezoneSafeSchema();
  await assertOrdersComandaForeignKey();

  // Optional bootstrap seed (enabled by default).
  // Set SEED_ON_STARTUP=false to create only tables/schema without default rows.
  const seedOnStartup = String(process.env.SEED_ON_STARTUP ?? "true").toLowerCase() !== "false";
  if (seedOnStartup) {
    await ensureSeed();
  }

  await registerRoutes(httpServer, app);

  // Realtime (WebSocket) is optional and best-effort; it won't affect existing HTTP routes.
  initRealtime(httpServer);

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    logStructured(
      "http.request.error",
      {
        requestId: req.requestId ?? null,
        method: req.method,
        path: req.path,
        status,
        message,
      },
      "express",
      "error",
    );

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  // On Windows, localhost is the safest default for dev tooling.
  // Keep HOST override so LAN access still works when requested.
  const defaultHost = process.platform === "win32" ? "127.0.0.1" : "0.0.0.0";
  const host = process.env.HOST || defaultHost;
  httpServer.listen({ port, host }, () => {
    log(`serving on http://${host}:${port}`);
  });
})();
