
import { db } from "./db";
import {
  menuItems,
  categories,
  comandas,
  orders,
  orderItems,
  receiptPayments,
  receipts,
  type MenuItem,
  type InsertMenuItem,
  type Category,
  type InsertCategory,
  type Comanda,
  type InsertComanda,
  type Order,
  type InsertOrder,
  type OrderItem,
  type InsertOrderItem,
  type ReceiptPaymentRow,
  type InsertReceiptPayment,
  type InsertReceipt,
  type ReceiptRow,
} from "@shared/schema";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { nowIsoUtc, toDateOrNull, toEpochMs } from "@shared/datetime";

export interface IStorage {
  // Menu
  getMenuItems(): Promise<MenuItem[]>;
  createMenuItem(item: InsertMenuItem): Promise<MenuItem>;
  updateMenuItem(id: number, patch: Partial<InsertMenuItem>): Promise<MenuItem | null>;
  deleteMenuItem(id: number): Promise<boolean>;

  // Categories
  getCategories(): Promise<Category[]>;
  upsertCategory(id: string, patch: Partial<InsertCategory>): Promise<Category>;
  deleteCategory(id: string): Promise<void>;
  
  // Comandas
  getComandas(): Promise<Comanda[]>;
  createComanda(data: InsertComanda): Promise<Comanda>;
  deleteComanda(id: number): Promise<boolean>;
  updateComanda(id: number, updates: Partial<InsertComanda>): Promise<Comanda | null>;

  // Orders
  getOrders(): Promise<Order[]>;
  getOrderItems(): Promise<OrderItem[]>;
  createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<{ order: Order; items: OrderItem[] }>;
  finalizeOrder(id: number, receiptId: string, paymentMethod?: string | null): Promise<Order | null>;
  updateOrderItem(id: number, patch: Partial<InsertOrderItem>): Promise<OrderItem | null>;
  createOrderItem(orderId: number, item: Omit<InsertOrderItem, 'orderId'>): Promise<OrderItem | null>;
  deleteOrderItem(id: number): Promise<boolean>;

  // Receipts / Payments
  getReceipt(receiptId: string): Promise<ReceiptRow | null>;
  getReceiptPayments(receiptId: string): Promise<ReceiptPaymentRow[]>;
  upsertReceiptPayments(receiptId: string, payments: { method: string; amountCents: number }[]): Promise<ReceiptPaymentRow[]>;
}

function sanitizeReceiptPaymentRow(row: ReceiptPaymentRow): ReceiptPaymentRow {
  return {
    ...row,
    method: String(row.method ?? "").trim().toLowerCase(),
    amountCents: Math.round(Number(row.amountCents ?? 0)),
  };
}

function sanitizeReceiptPaymentsInput(payments: { method: string; amountCents: number }[]) {
  return (payments ?? [])
    .map((p) => ({
      method: String(p?.method ?? "").trim().toLowerCase(),
      amountCents: Math.round(Number(p?.amountCents ?? 0)),
    }))
    .filter((p) => p.method && Number.isFinite(p.amountCents) && p.amountCents > 0);
}

async function upsertReceiptSnapshot(
  tx: any,
  receiptId: string,
  preferredPaymentMethod?: string | null,
) {
  const cleanReceiptId = String(receiptId ?? "").trim();
  if (!cleanReceiptId) return;

  const closedOrders: Order[] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.receiptId, cleanReceiptId), eq(orders.status, "closed")));

  let comandaId: number | null = null;
  let comandaNumber: number | null = null;
  let closedAt: Date = new Date(nowIsoUtc());
  let paymentMethod: string | null = null;
  let totalCents = 0;

  if (closedOrders.length > 0) {
    const orderIds: number[] = closedOrders.map((o: Order) => o.id);
    const items: OrderItem[] = await tx
      .select()
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds));

    totalCents = items
      .filter((it) => it.status !== "canceled")
      .reduce((acc: number, it: OrderItem) => acc + it.price * it.quantity, 0);

    comandaId = closedOrders[0].comandaId ?? null;
    const foundComanda = comandaId
      ? await tx.select().from(comandas).where(eq(comandas.id, comandaId))
      : [];
    comandaNumber = foundComanda[0]?.number ?? null;

    const initial = toDateOrNull(closedOrders[0].closedAt ?? closedOrders[0].createdAt) ?? new Date(nowIsoUtc());
    closedAt = closedOrders.reduce((latest: Date, order: Order) => {
      const ts = toDateOrNull(order.closedAt ?? order.createdAt) ?? latest;
      return (toEpochMs(ts) ?? 0) > (toEpochMs(latest) ?? 0) ? ts : latest;
    }, initial);

    const paymentMethods: string[] = closedOrders
      .map((o: Order) => String(o.paymentMethod ?? "").trim().toLowerCase())
      .filter(Boolean);
    const uniquePaymentMethods: string[] = Array.from(new Set(paymentMethods));
    paymentMethod = uniquePaymentMethods.length === 1 ? uniquePaymentMethods[0] : null;
  }

  const preferred = String(preferredPaymentMethod ?? "").trim().toLowerCase();
  const finalPaymentMethod = preferred || paymentMethod || null;

  const row: InsertReceipt = {
    receiptId: cleanReceiptId,
    comandaId,
    comandaNumber,
    closedAt,
    totalCents,
    paymentMethod: finalPaymentMethod,
  };

  await tx
    .insert(receipts)
    .values(row)
    .onConflictDoUpdate({
      target: receipts.receiptId,
      set: {
        comandaId: row.comandaId,
        comandaNumber: row.comandaNumber,
        closedAt: row.closedAt,
        totalCents: row.totalCents,
        paymentMethod: row.paymentMethod,
        updatedAt: new Date(nowIsoUtc()),
      },
    });
}

export class DatabaseStorage implements IStorage {
  async getMenuItems(): Promise<MenuItem[]> {
    return await db.select().from(menuItems);
  }

  async createMenuItem(item: InsertMenuItem): Promise<MenuItem> {
    const [newItem] = await db.insert(menuItems).values(item).returning();
    return newItem;
  }
async updateMenuItem(id: number, patch: Partial<InsertMenuItem>): Promise<MenuItem | null> {
  const existing = await db.select().from(menuItems).where(eq(menuItems.id, id));
  if (existing.length === 0) return null;

  const [updated] = await db
    .update(menuItems)
    .set(patch)
    .where(eq(menuItems.id, id))
    .returning();
  return updated;
}

async deleteMenuItem(id: number): Promise<boolean> {
  const existing = await db.select().from(menuItems).where(eq(menuItems.id, id));
  if (existing.length === 0) return false;
  await db.delete(menuItems).where(eq(menuItems.id, id));
  return true;
}


  async getCategories(): Promise<Category[]> {
    return await db.select().from(categories);
  }

  async upsertCategory(id: string, patch: Partial<InsertCategory>): Promise<Category> {
    // If the row exists, update; otherwise create.
    const existing = await db.select().from(categories).where(eq(categories.id, id));
    if (existing.length > 0) {
      const [updated] = await db
        .update(categories)
        .set(patch)
        .where(eq(categories.id, id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(categories)
      .values({ id, label: patch.label ?? id, sendToKitchen: patch.sendToKitchen ?? false })
      .returning();
    return created;
  }

  async deleteCategory(id: string): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }

  async getComandas(): Promise<Comanda[]> {
    // Keep a stable visual order in the UI (comanda physical number ascending).
    // Without explicit ORDER BY, Postgres may return updated rows later in the scan,
    // which makes a just-closed comanda "jump" to the end of the list.
    return await db.select().from(comandas).orderBy(asc(comandas.number));
  }

  async createComanda(data: InsertComanda): Promise<Comanda> {
    // Enforce unique number at app level (DB also has unique constraint)
    const existing = await db.select().from(comandas).where(eq(comandas.number, data.number));
    if (existing.length > 0) {
      throw new Error("COMANDA_NUMBER_EXISTS");
    }
    const [created] = await db.insert(comandas).values({
      number: data.number,
      status: data.status ?? "available",
      total: data.total ?? 0,
    }).returning();
    if (!created) throw new Error("Failed to create comanda");
    return created;
  }

  async deleteComanda(id: number): Promise<boolean> {
    const existing = await db.select().from(comandas).where(eq(comandas.id, id));
    if (existing.length === 0) return false;
    const com = existing[0];

    // Safety: do not delete if comanda is occupied or has any orders (to avoid orphaning)
    if (com.status !== "available" || (com.total ?? 0) > 0) {
      throw new Error("COMANDA_NOT_DELETABLE");
    }
    const related = await db.select({ id: orders.id }).from(orders).where(eq(orders.comandaId, com.id));
    if (related.length > 0) {
      throw new Error("COMANDA_HAS_ORDERS");
    }

    await db.delete(comandas).where(eq(comandas.id, id));
    return true;
  }


  async updateComanda(id: number, updates: Partial<InsertComanda>): Promise<Comanda | null> {
  const existing = await db.select().from(comandas).where(eq(comandas.id, id));
  if (existing.length === 0) return null;

  const [updated] = await db
    .update(comandas)
    .set(updates)
    .where(eq(comandas.id, id))
    .returning();
  return updated ?? null;
}

  async getOrders(): Promise<Order[]> {
    return await db.select().from(orders);
  }

  async getOrderItems(): Promise<OrderItem[]> {
    return await db.select().from(orderItems);
  }

  async createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<{ order: Order; items: OrderItem[] }> {
    // Business rules:
    // - comandaId references comandas.id (internal PK)
    // - creating an order should mark the comanda as occupied
    // - comanda.total should increase by the sum of non-canceled items
    // - everything should be atomic (transaction)
    return await db.transaction(async (tx) => {
      const requestedComandaId = Number(order.comandaId);
      let foundComanda = await tx
        .select()
        .from(comandas)
        .where(eq(comandas.id, requestedComandaId));

      // Temporary compatibility fallback: accept legacy clients still sending comanda.number.
      if (foundComanda.length === 0) {
        foundComanda = await tx
          .select()
          .from(comandas)
          .where(eq(comandas.number, requestedComandaId));
      }

      if (foundComanda.length === 0) {
        // Keep the storage layer explicit; routes will translate this to a 404.
        throw new Error("COMANDA_NOT_FOUND");
      }

      const comandaId = foundComanda[0].id;

      const [newOrder] = await tx
        .insert(orders)
        .values({
          ...order,
          comandaId,
          status: order.status ?? "open",
        })
        .returning();

      const insertedItems: OrderItem[] = items.length
        ? await tx
            .insert(orderItems)
            .values(
              items.map((it) => ({
                ...it,
                orderId: newOrder.id,
                status: (it as any).status ?? "pending",
              }))
            )
            .returning()
        : [];

      const deltaTotal = insertedItems.reduce((acc, it) => {
        const line = (it.status === "canceled" ? 0 : it.price * it.quantity);
        return acc + line;
      }, 0);

      // Mark occupied and update total.
      await tx
        .update(comandas)
        .set({
          status: "occupied",
          total: Math.max(0, foundComanda[0].total + deltaTotal),
        })
        .where(eq(comandas.id, comandaId));

      return { order: newOrder, items: insertedItems };
    });
  }

  async finalizeOrder(id: number, receiptId: string, paymentMethod?: string | null): Promise<Order | null> {
    // Business rules:
    // - finalize closes the order
    // - if no other open orders exist for that comanda, reset comanda to available and total=0
    return await db.transaction(async (tx) => {
      const found = await tx.select().from(orders).where(eq(orders.id, id));
      if (found.length === 0) return null;
      const order = found[0];

      const closedAtISO = nowIsoUtc();
      const nextPaymentMethod = (paymentMethod ?? "").trim();
      const [updated] = await tx
        .update(orders)
        .set({
          status: "closed",
          closedAt: new Date(closedAtISO),
          receiptId,
          ...(nextPaymentMethod ? { paymentMethod: nextPaymentMethod } : {}),
        })
        .where(eq(orders.id, id))
        .returning();

      // Any remaining non-closed orders for this comanda?
      const stillOpen = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.comandaId, order.comandaId), ne(orders.status, "closed")));

      if (stillOpen.length === 0) {
        // Reset comanda to available and clear the running total.
        await tx
          .update(comandas)
          .set({ status: "available", total: 0 })
          .where(eq(comandas.id, order.comandaId));
      }

      // Persist receipt header snapshot in DB (source of truth for history/reprint).
      await upsertReceiptSnapshot(tx, receiptId, nextPaymentMethod || null);

      return updated;
    });
  }

  async updateOrderItem(id: number, patch: Partial<InsertOrderItem>): Promise<OrderItem | null> {
    // Business rules:
    // - if quantity or status changes, keep comandas.total consistent (for non-closed orders)
    // - recompute a lightweight order status based on item statuses (if not closed)
    return await db.transaction(async (tx) => {
      const foundItems = await tx.select().from(orderItems).where(eq(orderItems.id, id));
      if (foundItems.length === 0) return null;
      const before = foundItems[0];

      const foundOrders = await tx.select().from(orders).where(eq(orders.id, before.orderId));
      if (foundOrders.length === 0) return null;
      const parentOrder = foundOrders[0];

      const nextQuantity = patch.quantity ?? before.quantity;
      const nextPrice = patch.price ?? before.price;
      const nextStatus = (patch.status as any) ?? before.status;

      const beforeLine = before.price * before.quantity;
      const afterLine = nextPrice * nextQuantity;

      const beforeEffective = before.status === "canceled" ? 0 : beforeLine;
      const afterEffective = nextStatus === "canceled" ? 0 : afterLine;
      const delta = afterEffective - beforeEffective;

      const [updated] = await tx
        .update(orderItems)
        .set({ ...patch, quantity: nextQuantity, price: nextPrice, status: nextStatus })
        .where(eq(orderItems.id, id))
        .returning();

      if (parentOrder.status !== "closed" && delta !== 0) {
        const comandaRows = await tx
          .select()
          .from(comandas)
          .where(eq(comandas.id, parentOrder.comandaId));
        if (comandaRows.length > 0) {
          await tx
            .update(comandas)
            .set({ total: Math.max(0, comandaRows[0].total + delta) })
            .where(eq(comandas.id, parentOrder.comandaId));
        }
      }

      // Derive order status from item statuses (lightweight).
      if (parentOrder.status !== "closed") {
        const allItems = await tx
          .select({ status: orderItems.status })
          .from(orderItems)
          .where(eq(orderItems.orderId, parentOrder.id));

        const statuses = allItems.map((x) => x.status);
        const hasPrep = statuses.some((s) => s === "pending" || s === "preparing");
        const hasReady = statuses.some((s) => s === "ready");

        const nextOrderStatus = hasPrep ? "preparing" : hasReady ? "ready" : "open";
        await tx
          .update(orders)
          .set({ status: nextOrderStatus })
          .where(eq(orders.id, parentOrder.id));
      }

      return updated;
    });
  }

  async createOrderItem(orderId: number, item: Omit<InsertOrderItem, 'orderId'>): Promise<OrderItem | null> {
    // Used to adjust open/closed orders (Admin history edits).
    // Rules:
    // - Must attach to an existing order.
    // - If the order is closed, force item status to delivered (no kitchen effects).
    // - If the order is not closed, update comandas.total accordingly.
    return await db.transaction(async (tx) => {
      const foundOrders = await tx.select().from(orders).where(eq(orders.id, orderId));
      if (foundOrders.length === 0) return null;
      const parentOrder = foundOrders[0];

      const cleanedQty = Math.max(1, Math.floor(Number((item as any).quantity ?? 1)));
      const cleanedPrice = Math.round(Number((item as any).price ?? 0));
      const cleanedStatus = String((item as any).status ?? 'pending');
      const nextStatus = parentOrder.status === 'closed' ? 'delivered' : cleanedStatus;

      const [created] = await tx
        .insert(orderItems)
        .values({
          ...item,
          orderId,
          quantity: cleanedQty,
          price: cleanedPrice,
          status: nextStatus,
        })
        .returning();

      if (!created) return null;

      if (parentOrder.status !== 'closed') {
        const delta = nextStatus === 'canceled' ? 0 : created.price * created.quantity;
        if (delta !== 0) {
          const comandaRows = await tx
            .select()
            .from(comandas)
            .where(eq(comandas.id, parentOrder.comandaId));
          if (comandaRows.length > 0) {
            await tx
              .update(comandas)
              .set({ total: Math.max(0, comandaRows[0].total + delta), status: 'occupied' })
              .where(eq(comandas.id, parentOrder.comandaId));
          }
        }
      }

      return created;
    });
  }

  async deleteOrderItem(id: number): Promise<boolean> {
    // Rules:
    // - If parent order is open, decrement comandas.total accordingly (non-canceled only).
    // - If parent order is closed, delete only (history edit).
    return await db.transaction(async (tx) => {
      const foundItems = await tx.select().from(orderItems).where(eq(orderItems.id, id));
      if (foundItems.length === 0) return false;
      const item = foundItems[0];

      const foundOrders = await tx.select().from(orders).where(eq(orders.id, item.orderId));
      if (foundOrders.length === 0) {
        await tx.delete(orderItems).where(eq(orderItems.id, id));
        return true;
      }
      const parentOrder = foundOrders[0];

      const delta = item.status === 'canceled' ? 0 : item.price * item.quantity;
      await tx.delete(orderItems).where(eq(orderItems.id, id));

      if (parentOrder.status !== 'closed' && delta !== 0) {
        const comandaRows = await tx
          .select()
          .from(comandas)
          .where(eq(comandas.id, parentOrder.comandaId));
        if (comandaRows.length > 0) {
          await tx
            .update(comandas)
            .set({ total: Math.max(0, comandaRows[0].total - delta) })
            .where(eq(comandas.id, parentOrder.comandaId));
        }
      }

      return true;
    });
  }


// === Receipts / Payments ===
async getReceipt(receiptId: string): Promise<ReceiptRow | null> {
  const rid = String(receiptId ?? "").trim();
  if (!rid) return null;
  const found = await db.select().from(receipts).where(eq(receipts.receiptId, rid));
  return found[0] ?? null;
}

async getReceiptPayments(receiptId: string): Promise<ReceiptPaymentRow[]> {
  if (!receiptId) return [];
  const rows = await db
    .select()
    .from(receiptPayments)
    .where(eq(receiptPayments.receiptId, receiptId))
    .orderBy(asc(receiptPayments.id));
  return rows.map(sanitizeReceiptPaymentRow);
}

async upsertReceiptPayments(
  receiptId: string,
  payments: { method: string; amountCents: number }[],
): Promise<ReceiptPaymentRow[]> {
  if (!receiptId) return [];
  const cleaned = sanitizeReceiptPaymentsInput(payments);

  return await db.transaction(async (tx) => {
    await tx.delete(receiptPayments).where(eq(receiptPayments.receiptId, receiptId));
    if (cleaned.length === 0) {
      await upsertReceiptSnapshot(tx, receiptId, null);
      return [];
    }
    const rows: InsertReceiptPayment[] = cleaned.map((p) => ({
      receiptId,
      method: p.method,
      amountCents: p.amountCents,
    }));
    await tx.insert(receiptPayments).values(rows).returning();
    const saved = await tx
      .select()
      .from(receiptPayments)
      .where(eq(receiptPayments.receiptId, receiptId))
      .orderBy(asc(receiptPayments.id));
    const methods: string[] = Array.from(
      new Set(saved.map((p: ReceiptPaymentRow) => String(p.method ?? "").trim().toLowerCase()).filter(Boolean)),
    );
    await upsertReceiptSnapshot(tx, receiptId, methods.length === 1 ? methods[0] : null);
    return saved.map(sanitizeReceiptPaymentRow);
  });
}
}

export const storage = new DatabaseStorage();
