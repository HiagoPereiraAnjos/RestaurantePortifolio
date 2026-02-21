
import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===

export const menuItems = pgTable("menu_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(), // porcoes, bebidas, buffet_vontade, buffet_kg, marmita
  price: integer("price").notNull(), // stored in cents
  description: text("description"),
  // Can be a URL or a base64 data URL (the frontend supports both).
  image: text("image"),
  available: boolean("available").default(true).notNull(),
});

export const categories = pgTable("categories", {
  id: text("id").primaryKey(), // stable id, e.g. "porcoes"
  label: text("label").notNull(),
  sendToKitchen: boolean("send_to_kitchen").default(false).notNull(),
});

export const comandas = pgTable("comandas", {
  id: serial("id").primaryKey(),
  number: integer("number").notNull().unique(),
  status: text("status").notNull().default("available"), // available, occupied
  total: integer("total").default(0).notNull(), // stored in cents
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  // Real FK to comandas.id (internal identifier). comanda.number remains the physical number.
  comandaId: integer("comanda_id").notNull().references(() => comandas.id),
  status: text("status").notNull().default("open"), // open, preparing, ready, closed
  // Use timestamptz (timestamp with time zone) to preserve the exact instant.
  // This prevents the classic "3 hours behind" bug when a tz-naive timestamp
  // is parsed as UTC.
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  receiptId: text("receipt_id"),
  paymentMethod: text("payment_method"),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  menuItemId: integer("menu_item_id").notNull(),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  quantity: integer("quantity").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("pending"), // pending, preparing, ready, delivered, canceled
});


export const receiptPayments = pgTable("receipt_payments", {
  id: serial("id").primaryKey(),
  receiptId: text("receipt_id").notNull(),
  method: text("method").notNull(), // dinheiro, pix, debito, credito, vale, outros...
  amountCents: integer("amount_cents").notNull(), // stored in cents
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Immutable-ish receipt header persisted in DB (source of truth for reprint/history).
export const receipts = pgTable("receipts", {
  id: serial("id").primaryKey(),
  receiptId: text("receipt_id").notNull().unique(),
  comandaId: integer("comanda_id").references(() => comandas.id),
  comandaNumber: integer("comanda_number"),
  closedAt: timestamp("closed_at", { withTimezone: true }).defaultNow().notNull(),
  totalCents: integer("total_cents").default(0).notNull(),
  paymentMethod: text("payment_method"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Admin users (JWT auth)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// === SCHEMAS ===

export const insertMenuItemSchema = createInsertSchema(menuItems).omit({ id: true });
export const insertComandaSchema = createInsertSchema(comandas).omit({ id: true });
export const insertCategorySchema = createInsertSchema(categories);
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
// closedAt/receiptId are set by the system when finalizing a comanda
export const insertOrderFinalizeSchema = z.object({
  receiptId: z.string().min(1),
  paymentMethod: z.string().min(1).optional(),
});
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });


export const insertReceiptPaymentSchema = createInsertSchema(receiptPayments).omit({ id: true, createdAt: true });
export const insertReceiptSchema = createInsertSchema(receipts).omit({ id: true, createdAt: true, updatedAt: true });
export const receiptPaymentsUpsertSchema = z.object({
  payments: z.array(z.object({
    method: z.string().min(1),
    amountCents: z.number().int().nonnegative(),
  })),
});

export const insertUserSchema = z.object({
  username: z.string().min(1),
  passwordHash: z.string().min(1),
});

// === TYPES ===

export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = z.infer<typeof insertMenuItemSchema>;

export type Comanda = typeof comandas.$inferSelect;
export type InsertComanda = z.infer<typeof insertComandaSchema>;

export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

export type OrderItem = typeof orderItems.$inferSelect;

export type ReceiptPaymentRow = typeof receiptPayments.$inferSelect;
export type InsertReceiptPayment = z.infer<typeof insertReceiptPaymentSchema>;
export type ReceiptRow = typeof receipts.$inferSelect;
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;

export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;

export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// Helper type for frontend state
export type CartItem = OrderItem & { tempId?: string };
