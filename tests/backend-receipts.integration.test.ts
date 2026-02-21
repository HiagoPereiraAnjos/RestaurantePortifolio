import test from "node:test";
import assert from "node:assert/strict";

const hasDatabase = Boolean(process.env.DATABASE_URL);

async function setupOrderFixture(tag: string) {
  const [{ db }, { storage }, schema, orm] = await Promise.all([
    import("../server/db.ts"),
    import("../server/storage.ts"),
    import("../shared/schema.ts"),
    import("drizzle-orm"),
  ]);

  const { comandas, orders, orderItems, receiptPayments, receipts } = schema;
  const { eq, inArray } = orm;
  const number = Number(`${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`);
  const receiptId = `T-${tag}-${Date.now().toString(36).toUpperCase()}`;

  const [comanda] = await db
    .insert(comandas)
    .values({ number, status: "available", total: 0 })
    .returning();
  const [order] = await db
    .insert(orders)
    .values({ comandaId: comanda.id, status: "open" })
    .returning();

  await db.insert(orderItems).values({
    orderId: order.id,
    menuItemId: 1,
    name: `Item-${tag}`,
    price: 1000,
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

  return { db, storage, schema: { comandas, orders, orderItems, receiptPayments, receipts }, helpers: { eq, inArray }, comanda, order, receiptId, cleanup };
}

test("backend integration: finalize order with single payment method", { skip: !hasDatabase }, async () => {
  const fx = await setupOrderFixture("single");
  try {
    const updated = await fx.storage.finalizeOrder(fx.order.id, fx.receiptId, "pix");
    assert.ok(updated);
    assert.equal(updated?.status, "closed");
    assert.equal(updated?.paymentMethod, "pix");
    assert.ok(updated?.closedAt);

    const receipt = await fx.storage.getReceipt(fx.receiptId);
    assert.ok(receipt);
    assert.equal(receipt?.paymentMethod, "pix");
    assert.equal(receipt?.totalCents, 2000);
  } finally {
    await fx.cleanup();
  }
});

test("backend integration: split payment keeps receipt paymentMethod null", { skip: !hasDatabase }, async () => {
  const fx = await setupOrderFixture("split");
  try {
    await fx.storage.finalizeOrder(fx.order.id, fx.receiptId, null);
    const saved = await fx.storage.upsertReceiptPayments(fx.receiptId, [
      { method: "pix", amountCents: 1000 },
      { method: "credito", amountCents: 1000 },
    ]);

    assert.equal(saved.length, 2);
    const receipt = await fx.storage.getReceipt(fx.receiptId);
    assert.ok(receipt);
    assert.equal(receipt?.paymentMethod, null);
  } finally {
    await fx.cleanup();
  }
});

test("backend integration: receipt payments read fallback semantics", { skip: !hasDatabase }, async () => {
  const fx = await setupOrderFixture("fallback");
  try {
    await fx.storage.finalizeOrder(fx.order.id, fx.receiptId, "dinheiro");

    const payments = await fx.storage.getReceiptPayments(fx.receiptId);
    assert.equal(payments.length, 0);

    const receipt = await fx.storage.getReceipt(fx.receiptId);
    assert.ok(receipt);
    assert.equal(receipt?.paymentMethod, "dinheiro");
  } finally {
    await fx.cleanup();
  }
});

test("backend integration: timestamp consistency for order/receipt close instants", { skip: !hasDatabase }, async () => {
  const fx = await setupOrderFixture("tz");
  try {
    const before = Date.now();
    const updated = await fx.storage.finalizeOrder(fx.order.id, fx.receiptId, "pix");
    const after = Date.now();
    assert.ok(updated?.closedAt);

    const closedAtMs = new Date(updated!.closedAt as Date).getTime();
    assert.ok(closedAtMs >= before - 5_000 && closedAtMs <= after + 5_000);
    assert.match(new Date(updated!.closedAt as Date).toISOString(), /Z$/);

    const receipt = await fx.storage.getReceipt(fx.receiptId);
    assert.ok(receipt?.closedAt);
    assert.match(new Date(receipt!.closedAt as Date).toISOString(), /Z$/);
  } finally {
    await fx.cleanup();
  }
});
