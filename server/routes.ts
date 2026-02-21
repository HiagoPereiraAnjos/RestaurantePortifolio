
import type { Express, Request } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  insertMenuItemSchema,
  insertCategorySchema,
  insertComandaSchema,
  insertOrderSchema,
  insertOrderItemSchema,
  insertOrderFinalizeSchema,
  receiptPaymentsUpsertSchema,
} from "@shared/schema";
import { z } from "zod";
import { requireAuth, signToken, verifyPassword, hashPasswordForUserInput, getAuthSecurityConfig } from "./auth";
import { broadcast, getRealtimeInfo } from "./realtime";
import { nowIsoUtc, serializeDatesForApi } from "@shared/datetime";

type LoginBody = { username?: string; password?: string };

const MAX_ORDER_ITEMS = 200;
const MAX_ORDER_ITEM_QTY = 200;
const MAX_ORDER_ITEM_PRICE_CENTS = 2_000_000;
const MAX_RECEIPT_PAYMENTS = 20;
const MAX_RECEIPT_PAYMENT_CENTS = 5_000_000;
const RECEIPT_ID_REGEX = /^[A-Za-z0-9._:-]{1,120}$/;
const CATEGORY_ID_REGEX = /^[a-z0-9_:-]{1,64}$/i;
const SENSITIVE_LOG_KEYS = new Set([
  "token",
  "authorization",
  "password",
  "passwordhash",
  "currentpassword",
  "newpassword",
]);
const AUTH_RATE_LIMIT_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || "300000");
const AUTH_RATE_LIMIT_MAX_ATTEMPTS = Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS || "8");
const authRateLimitState = new Map<string, { count: number; windowStartMs: number }>();

function validationErrorFromZod(err: z.ZodError) {
  const first = err.issues[0];
  return {
    message: first?.message ?? "Validation error",
    field: first?.path?.length ? String(first.path[0]) : undefined,
  };
}

function parseIntParam(value: unknown): number | null {
  const parsed = z.coerce.number().int().positive().safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseReceiptIdParam(value: unknown): string | null {
  const receiptId = String(value ?? "").trim();
  if (!RECEIPT_ID_REGEX.test(receiptId)) return null;
  return receiptId;
}

function redactLogDetails(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.map((x) => redactLogDetails(x, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_LOG_KEYS.has(k.toLowerCase()) ? "[redacted]" : redactLogDetails(v, depth + 1);
    }
    return out;
  }
  return value;
}

function routeLog(req: Request | null, event: string, details: Record<string, unknown>, level: "info" | "warn" | "error" = "info") {
  const payload = {
    ts: new Date().toISOString(),
    level,
    source: "routes",
    event,
    requestId: req?.requestId ?? null,
    ...details,
  };
  try {
    const safe = JSON.stringify(redactLogDetails(payload));
    if (level === "error") {
      console.error(safe);
      return;
    }
    if (level === "warn") {
      console.warn(safe);
      return;
    }
    console.info(safe);
  } catch {
    console.info(
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        source: "routes",
        event,
        requestId: req?.requestId ?? null,
      }),
    );
  }
}

function authRateLimitKey(req: Request) {
  const ip = String(req.ip || req.header("x-forwarded-for") || "unknown");
  const user = String(req.body?.username ?? "").trim().toLowerCase();
  return `${ip}:${user || "-"}`;
}

function isAuthRateLimited(req: Request) {
  const now = Date.now();
  const key = authRateLimitKey(req);
  const prev = authRateLimitState.get(key);
  if (!prev || now - prev.windowStartMs > AUTH_RATE_LIMIT_WINDOW_MS) {
    authRateLimitState.set(key, { count: 1, windowStartMs: now });
    return false;
  }
  const nextCount = prev.count + 1;
  authRateLimitState.set(key, { count: nextCount, windowStartMs: prev.windowStartMs });
  return nextCount > AUTH_RATE_LIMIT_MAX_ATTEMPTS;
}

function sendApiJson(res: any, payload: unknown, status = 200) {
  return res.status(status).json(serializeDatesForApi(payload));
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Simple status endpoint (safe): helps verify realtime is wired without breaking anything.
  app.get("/api/realtime/status", (_req, res) => {
    return sendApiJson(res, getRealtimeInfo());
  });
  // === AUTH (JWT) ===
  app.post("/api/auth/login", async (req, res) => {
    if (isAuthRateLimited(req)) {
      routeLog(req, "auth.login.rate_limited", { ip: req.ip }, "warn");
      return res.status(429).json({ message: "Too many attempts. Try again later." });
    }

    const body = (req.body ?? {}) as LoginBody;
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    if (!username || !password) {
      routeLog(req, "auth.login.invalid_payload", { hasUsername: Boolean(username) }, "warn");
      return res.status(400).json({ message: "Username and password required" });
    }

    const found = await db.select().from(users).where(eq(users.username, username));
    if (found.length === 0) {
      routeLog(req, "auth.login.denied", { username }, "warn");
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const user = found[0];
    if (!verifyPassword(password, user.passwordHash)) {
      routeLog(req, "auth.login.denied", { username }, "warn");
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken(username);
    routeLog(req, "auth.login.success", { username });
    return sendApiJson(res, { token, user: { username } });
  });

  // Re-auth: confirm password again and mint a fresh token (used when changing admin tabs)
  app.post("/api/auth/reauth", async (req, res) => {
    const body = (req.body ?? {}) as LoginBody;
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (!username || !password) {
      routeLog(req, "auth.reauth.invalid_payload", { hasUsername: Boolean(username) }, "warn");
      return res.status(400).json({ message: "Username and password required" });
    }
    const found = await db.select().from(users).where(eq(users.username, username));
    if (found.length === 0) {
      routeLog(req, "auth.reauth.denied", { username }, "warn");
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const user = found[0];
    if (!verifyPassword(password, user.passwordHash)) {
      routeLog(req, "auth.reauth.denied", { username }, "warn");
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = signToken(username);
    routeLog(req, "auth.reauth.success", { username });
    return sendApiJson(res, { token, user: { username } });
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    const username = String((req as any).user?.sub ?? "");
    const currentPassword = String(req.body?.currentPassword ?? "");
    const newPassword = String(req.body?.newPassword ?? "");

    if (!username) return res.status(401).json({ message: "Unauthorized" });
    if (!currentPassword || !newPassword) {
      routeLog(req, "auth.change_password.invalid_payload", { username }, "warn");
      return res.status(400).json({ message: "currentPassword and newPassword required" });
    }
    let nextPasswordHash = "";
    try {
      nextPasswordHash = hashPasswordForUserInput(newPassword);
    } catch (err: any) {
      return res.status(400).json({ message: String(err?.message ?? "Invalid password") });
    }

    const found = await db.select().from(users).where(eq(users.username, username));
    if (found.length === 0) return res.status(404).json({ message: "User not found" });
    const user = found[0];
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return res.status(401).json({ message: "Current password invalid" });
    }

    await db
      .update(users)
      .set({ passwordHash: nextPasswordHash })
      .where(eq(users.username, username));

    routeLog(req, "auth.change_password.success", { username });
    return sendApiJson(res, { message: "Password updated" });
  });

  app.get("/api/auth/security-config", requireAuth, (req, res) => {
    const cfg = getAuthSecurityConfig();
    routeLog(req, "auth.security_config.read", { username: String((req as any).user?.sub ?? "") });
    return sendApiJson(res, cfg);
  });

  // Backend preparation: these routes are the contract the frontend will call
  // when VITE_BACKEND_MODE=api. The frontend remains offline/localStorage by default.

  // Snapshot endpoint to simplify first sync.
  app.get(api.state.snapshot.path, async (_req, res) => {
    const [menuItems, categories, comandas, orders, orderItems] = await Promise.all([
      storage.getMenuItems(),
      storage.getCategories(),
      storage.getComandas(),
      storage.getOrders(),
      storage.getOrderItems(),
    ]);
    return sendApiJson(res, {
      menuItems,
      categories,
      comandas,
      orders,
      orderItems,
      serverTime: nowIsoUtc(),
    });
  });
  
  app.get(api.menuItems.list.path, async (_req, res) => {
    const items = await storage.getMenuItems();
    return sendApiJson(res, items);
  });


  // === MENU ITEMS (Admin) ===
  app.post(api.menuItems.create.path, requireAuth, async (req, res) => {
    const parsed = insertMenuItemSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(validationErrorFromZod(parsed.error));
    }
    const created = await storage.createMenuItem(parsed.data);
    broadcast({ type: "menu.created", payload: created });
    return sendApiJson(res, created, 201);
  });

  app.put(api.menuItems.update.path, requireAuth, async (req, res) => {
    const id = parseIntParam(req.params.id);
    if (id === null) {
      return res.status(404).json({ message: "Not found" });
    }
    const parsed = insertMenuItemSchema.partial().safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(validationErrorFromZod(parsed.error));
    }
    const updated = await storage.updateMenuItem(id, parsed.data);
    if (!updated) return res.status(404).json({ message: "Not found" });
    broadcast({ type: "menu.updated", payload: updated });
    return sendApiJson(res, updated);
  });

  app.delete(api.menuItems.delete.path, requireAuth, async (req, res) => {
    const id = parseIntParam(req.params.id);
    if (id === null) {
      return res.status(404).json({ message: "Not found" });
    }
    const ok = await storage.deleteMenuItem(id);
    if (!ok) return res.status(404).json({ message: "Not found" });
    broadcast({ type: "menu.deleted", payload: { id } });
    return res.status(204).end();
  });

app.get(api.categories.list.path, async (_req, res) => {
    const items = await storage.getCategories();
    return sendApiJson(res, items);
  });

  app.put(api.categories.upsert.path, requireAuth, async (req, res) => {
  const id = String(req.params.id ?? "").trim();
  if (!CATEGORY_ID_REGEX.test(id)) {
    return res.status(400).json({ message: "Invalid category id" });
  }
  const parsed = insertCategorySchema.partial().safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(validationErrorFromZod(parsed.error));
  }
  const updated = await storage.upsertCategory(id, parsed.data);
  broadcast({ type: "category.upserted", payload: updated });
  return sendApiJson(res, updated);
});

  app.delete(api.categories.delete.path, requireAuth, async (req, res) => {
  const id = String(req.params.id ?? "").trim();
  if (!CATEGORY_ID_REGEX.test(id)) {
    return res.status(400).json({ message: "Invalid category id" });
  }
  // Try to delete and return 404 if it doesn't exist
  const existing = await storage.getCategories();
  if (!existing.some((c) => c.id === id)) {
    return res.status(404).json({ message: "Not found" });
  }
  await storage.deleteCategory(id);
  broadcast({ type: "category.deleted", payload: { id } });
  return res.status(204).end();
});

  app.get(api.comandas.list.path, async (_req, res) => {
    const items = await storage.getComandas();
    return sendApiJson(res, items);
  });

  // === COMANDAS (Admin) ===
  app.post("/api/comandas", requireAuth, async (req, res) => {
    const parsed = insertComandaSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(validationErrorFromZod(parsed.error));
    }
    try {
      const created = await storage.createComanda(parsed.data);
      broadcast({ type: "comanda.created", payload: created });
      return sendApiJson(res, created, 201);
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg === "COMANDA_NUMBER_EXISTS") {
        return res.status(409).json({ message: "Comanda number already exists" });
      }
      return res.status(500).json({ message: "Internal error" });
    }
  });

  app.delete("/api/comandas/:id", requireAuth, async (req, res) => {
    const id = parseIntParam(req.params.id);
    if (id === null) return res.status(404).json({ message: "Not found" });

    try {
      const ok = await storage.deleteComanda(id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      broadcast({ type: "comanda.deleted", payload: { id } });
      return res.status(204).end();
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg === "COMANDA_NOT_DELETABLE") {
        return res.status(409).json({ message: "Comanda is not deletable (must be available with total 0)" });
      }
      if (msg === "COMANDA_HAS_ORDERS") {
        return res.status(409).json({ message: "Comanda has orders and cannot be removed" });
      }
      return res.status(500).json({ message: "Internal error" });
    }
  });


  // === COMANDAS (restricted) ===
  app.put(api.comandas.update.path, requireAuth, async (req, res) => {
    const id = parseIntParam(req.params.id);
    if (id === null) return res.status(404).json({ message: "Not found" });

    const parsed = insertComandaSchema.partial().safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(validationErrorFromZod(parsed.error));
    }

    const updated = await storage.updateComanda(id, parsed.data);
    if (!updated) return res.status(404).json({ message: "Not found" });
    broadcast({ type: "comanda.updated", payload: updated });
    return sendApiJson(res, updated);
  });

  app.get(api.orders.list.path, async (_req, res) => {
    const items = await storage.getOrders();
    return sendApiJson(res, items);
  });

  // History-friendly view: closed orders with items + totals + payment metadata.
  app.get("/api/orders/history", async (_req, res) => {
    const [ordersRows, orderItemsRows, comandasRows] = await Promise.all([
      storage.getOrders(),
      storage.getOrderItems(),
      storage.getComandas(),
    ]);

    const itemsByOrderId = new Map<number, typeof orderItemsRows>();
    for (const item of orderItemsRows) {
      const list = itemsByOrderId.get(item.orderId) ?? [];
      list.push(item);
      itemsByOrderId.set(item.orderId, list);
    }

    const comandaNumbersById = new Map<number, number>();
    for (const c of comandasRows) {
      comandaNumbersById.set(c.id, c.number);
    }

    const history = ordersRows
      .filter((o) => o.status === "closed")
      .map((o) => {
        const items = itemsByOrderId.get(o.id) ?? [];
        const total = items
          .filter((it) => it.status !== "canceled")
          .reduce((acc, it) => acc + it.price * it.quantity, 0);
        const comandaNumber = comandaNumbersById.get(o.comandaId) ?? o.comandaId;

        return {
          id: o.id,
          comandaNumber,
          items,
          total,
          createdAt: o.createdAt,
          closedAt: o.closedAt ?? null,
          paidAt: o.closedAt ?? null,
          paymentMethod: o.paymentMethod ?? null,
        };
      });

    return sendApiJson(res, history);
  });

  app.post(api.orders.create.path, async (req, res) => {
    const schema = insertOrderSchema.extend({ items: z.array(insertOrderItemSchema) });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(validationErrorFromZod(parsed.error));
    }

    const { items, ...order } = parsed.data;
    if (items.length === 0 || items.length > MAX_ORDER_ITEMS) {
      return res.status(400).json({ message: `items must have between 1 and ${MAX_ORDER_ITEMS}` });
    }
    for (const item of items) {
      if (item.quantity <= 0 || item.quantity > MAX_ORDER_ITEM_QTY) {
        return res.status(400).json({ message: `item quantity must be between 1 and ${MAX_ORDER_ITEM_QTY}` });
      }
      if (item.price < 0 || item.price > MAX_ORDER_ITEM_PRICE_CENTS) {
        return res.status(400).json({ message: `item price must be between 0 and ${MAX_ORDER_ITEM_PRICE_CENTS}` });
      }
    }
    try {
      const created = await storage.createOrder(order, items);
      routeLog(req, "order.created", {
        orderId: created.order.id,
        comandaId: created.order.comandaId,
        items: created.items.length,
      });
      broadcast({ type: "order.created", payload: created });
      return sendApiJson(res, created, 201);
    } catch (e: any) {
      if (e?.message === "COMANDA_NOT_FOUND") {
        routeLog(req, "order.create.failed", { reason: "COMANDA_NOT_FOUND", comandaId: order.comandaId }, "warn");
        return res.status(404).json({ message: "Not found" });
      }
      console.error("createOrder failed", e);
      return res.status(500).json({ message: "Internal error" });
    }
  });

  // === Order Items adjustments (Admin history edits) ===
  // Add an item to an existing order (works for open and closed orders).
  app.post("/api/orders/:id/items", requireAuth, async (req, res) => {
    const orderId = parseIntParam(req.params.id);
    if (orderId === null) return res.status(404).json({ message: "Not found" });

    // Accept the same shape as InsertOrderItem, but orderId comes from params.
    const schema = insertOrderItemSchema.omit({ orderId: true });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(validationErrorFromZod(parsed.error));
    }

    const created = await storage.createOrderItem(orderId, parsed.data);
    if (!created) return res.status(404).json({ message: "Not found" });
    broadcast({ type: "orderItem.created", payload: created });
    return sendApiJson(res, created, 201);
  });

  // Update quantity (and only quantity) of an existing order item.
  app.put("/api/order-items/:id", requireAuth, async (req, res) => {
    const id = parseIntParam(req.params.id);
    if (id === null) return res.status(404).json({ message: "Not found" });

    const schema = z.object({ quantity: z.number().int().min(0) });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(validationErrorFromZod(parsed.error));
    }

    if (parsed.data.quantity <= 0) {
      const ok = await storage.deleteOrderItem(id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      broadcast({ type: "orderItem.deleted", payload: { id } });
      return res.status(204).end();
    }

    const updated = await storage.updateOrderItem(id, { quantity: parsed.data.quantity } as any);
    if (!updated) return res.status(404).json({ message: "Not found" });
    broadcast({ type: "orderItem.updated", payload: updated });
    return sendApiJson(res, updated);
  });

  // Delete an order item.
  app.delete("/api/order-items/:id", requireAuth, async (req, res) => {
    const id = parseIntParam(req.params.id);
    if (id === null) return res.status(404).json({ message: "Not found" });
    const ok = await storage.deleteOrderItem(id);
    if (!ok) return res.status(404).json({ message: "Not found" });
    broadcast({ type: "orderItem.deleted", payload: { id } });
    return res.status(204).end();
  });

  app.post(api.orders.finalize.path, async (req, res) => {
    const id = parseIntParam(req.params.id);
    if (id === null) {
      return res.status(404).json({ message: "Not found" });
    }
    const parsed = insertOrderFinalizeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(validationErrorFromZod(parsed.error));
    }
    const receiptId = parseReceiptIdParam(parsed.data.receiptId);
    if (!receiptId) {
      return res.status(400).json({ message: "Invalid receiptId" });
    }
    if (parsed.data.paymentMethod && parsed.data.paymentMethod.length > 64) {
      return res.status(400).json({ message: "paymentMethod too long" });
    }

    const updated = await storage.finalizeOrder(id, receiptId, parsed.data.paymentMethod);
    if (!updated) return res.status(404).json({ message: "Not found" });
    routeLog(req, "order.finalized", { orderId: id, receiptId, hasPaymentMethod: Boolean(parsed.data.paymentMethod) });
    broadcast({ type: "order.finalized", payload: updated });
    return sendApiJson(res, updated);
  });


// === Receipts / Payments ===
app.get(api.receipts.get.path, async (req, res) => {
  const receiptId = parseReceiptIdParam(req.params.receiptId);
  if (!receiptId) return res.status(400).json({ message: "Invalid receiptId" });
  const row = await storage.getReceipt(receiptId);
  if (!row) return res.status(404).json({ message: "Not found" });
  return sendApiJson(res, row);
});

app.get(api.receipts.payments.list.path, async (req, res) => {
  const receiptId = parseReceiptIdParam(req.params.receiptId);
  if (!receiptId) return res.status(400).json({ message: "Invalid receiptId" });
  const rows = await storage.getReceiptPayments(receiptId);
  return sendApiJson(res, rows);
});

app.put(api.receipts.payments.upsert.path, async (req, res) => {
  const receiptId = parseReceiptIdParam(req.params.receiptId);
  if (!receiptId) return res.status(400).json({ message: "Invalid receiptId" });
  const parsed = receiptPaymentsUpsertSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(validationErrorFromZod(parsed.error));
  }
  if (parsed.data.payments.length > MAX_RECEIPT_PAYMENTS) {
    return res.status(400).json({ message: `Too many payments, max ${MAX_RECEIPT_PAYMENTS}` });
  }
  for (const payment of parsed.data.payments) {
    if (payment.amountCents > MAX_RECEIPT_PAYMENT_CENTS) {
      return res.status(400).json({ message: `amountCents too large, max ${MAX_RECEIPT_PAYMENT_CENTS}` });
    }
  }
  const rows = await storage.upsertReceiptPayments(receiptId, parsed.data.payments);
  routeLog(req, "receipt.payments.upserted", {
    receiptId,
    paymentsCount: rows.length,
    methods: Array.from(new Set(rows.map((r) => r.method))),
  });
  return sendApiJson(res, rows);
});

  return httpServer;
}

/*
RECEIPT DATA ENDPOINTS (history/receipt flows)
- GET /api/state -> snapshot for orders/orderItems/comandas (History uses store snapshot in API mode)
- GET /api/orders -> list orders (available)
- GET /api/orders/history -> closed orders with items/total/paymentMethod (history-friendly)
- POST /api/orders/:id/finalize -> used by Cashier to close orders
- GET/PUT /api/receipts/:receiptId/payments -> used for payment reprint
*/
