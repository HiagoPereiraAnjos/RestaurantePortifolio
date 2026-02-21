import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "node:http";
import { registerRoutes } from "../server/routes.ts";

const hasDatabase = Boolean(process.env.DATABASE_URL);

async function startApi() {
  const app = express();
  const server = createServer(app);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Failed to bind test server");
  const base = `http://127.0.0.1:${address.port}`;
  return { server, base };
}

async function stopApi(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function makeOrderFixture(tag: string) {
  const [{ db }, schema, orm] = await Promise.all([
    import("../server/db.ts"),
    import("../shared/schema.ts"),
    import("drizzle-orm"),
  ]);
  const { comandas, orders, orderItems, receiptPayments, receipts } = schema;
  const { eq } = orm;
  const number = Number(`${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`);
  const receiptId = `HTTP-${tag}-${Date.now().toString(36).toUpperCase()}`;

  const [comanda] = await db.insert(comandas).values({ number, status: "available", total: 0 }).returning();
  const [order] = await db.insert(orders).values({ comandaId: comanda.id, status: "open" }).returning();
  await db.insert(orderItems).values({
    orderId: order.id,
    menuItemId: 1,
    name: "Teste",
    price: 1234,
    quantity: 2,
    category: "lanches",
    status: "delivered",
  });

  const cleanup = async () => {
    await db.delete(receiptPayments).where(eq(receiptPayments.receiptId, receiptId));
    await db.delete(receipts).where(eq(receipts.receiptId, receiptId));
    await db.delete(orderItems).where(eq(orderItems.orderId, order.id));
    await db.delete(orders).where(eq(orders.id, order.id));
    await db.delete(comandas).where(eq(comandas.id, comanda.id));
  };

  return { orderId: order.id, receiptId, cleanup };
}

test("http integration: critical routes basic guards", { skip: !hasDatabase }, async () => {
  const { server, base } = await startApi();
  try {
    const realtime = await fetch(`${base}/api/realtime/status`);
    assert.equal(realtime.status, 200);

    const loginBad = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(loginBad.status, 400);

    const invalidReceipt = await fetch(`${base}/api/receipts/${encodeURIComponent("bad id!")}/payments`);
    assert.equal(invalidReceipt.status, 400);

    const protectedMenu = await fetch(`${base}/api/menu-items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X", category: "outros", price: 100 }),
    });
    assert.equal(protectedMenu.status, 401);

    let lastStatus = 0;
    for (let i = 0; i < 9; i++) {
      const badLogin = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "wrong-pass" }),
      });
      lastStatus = badLogin.status;
    }
    assert.equal(lastStatus, 429);
  } finally {
    await stopApi(server);
  }
});

test("http integration: finalize order then read receipt/payments endpoints", { skip: !hasDatabase }, async () => {
  const fixture = await makeOrderFixture("finalize");
  const { server, base } = await startApi();
  try {
    const finalize = await fetch(`${base}/api/orders/${fixture.orderId}/finalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ receiptId: fixture.receiptId, paymentMethod: "pix" }),
    });
    assert.equal(finalize.status, 200);

    const receipt = await fetch(`${base}/api/receipts/${encodeURIComponent(fixture.receiptId)}`);
    assert.equal(receipt.status, 200);
    const receiptJson = (await receipt.json()) as { receiptId: string; paymentMethod: string | null; totalCents: number };
    assert.equal(receiptJson.receiptId, fixture.receiptId);
    assert.equal(receiptJson.paymentMethod, "pix");
    assert.equal(receiptJson.totalCents, 2468);

    const payments = await fetch(`${base}/api/receipts/${encodeURIComponent(fixture.receiptId)}/payments`);
    assert.equal(payments.status, 200);
    const paymentsJson = (await payments.json()) as unknown[];
    assert.equal(paymentsJson.length, 0);
  } finally {
    await stopApi(server);
    await fixture.cleanup();
  }
});
