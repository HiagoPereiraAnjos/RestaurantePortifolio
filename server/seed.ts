import { db } from "./db";
import { categories, comandas, menuItems, users } from "@shared/schema";
import { hashPassword, hashPasswordForUserInput } from "./auth";

// Safe idempotent seed: only inserts defaults if tables are empty.
export async function ensureSeed() {
  // Admin user
  const existingUsers = await db.select().from(users);
  if (existingUsers.length === 0) {
    const bootstrapPassword = String(process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "admin");
    const passwordHash = process.env.NODE_ENV === "production"
      ? hashPasswordForUserInput(bootstrapPassword)
      : hashPassword(bootstrapPassword);
    await db.insert(users).values({
      username: "admin",
      passwordHash,
    });
  }

  // Categories
  const existingCategories = await db.select().from(categories);
  if (existingCategories.length === 0) {
    await db.insert(categories).values([
      { id: "porcoes", label: "Porções", sendToKitchen: true },
      { id: "bebidas", label: "Bebidas", sendToKitchen: false },
      { id: "buffet_vontade", label: "Buffet à vontade", sendToKitchen: false },
      { id: "buffet_kg", label: "Buffet por kg", sendToKitchen: false },
      { id: "marmita", label: "Marmita", sendToKitchen: false },
    ]);
  }

  // Comandas 1..60
  const existingComandas = await db.select().from(comandas);
  if (existingComandas.length === 0) {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      number: i + 1,
      status: "available" as const,
      total: 0,
    }));
    await db.insert(comandas).values(rows);
  }

  // Minimal menu items (only if empty) - user can edit in Admin
  const existingItems = await db.select().from(menuItems);
  if (existingItems.length === 0) {
    await db.insert(menuItems).values([
      { name: "Buffet à vontade", category: "buffet_vontade", price: 3500, description: "Preço fixo" },
      { name: "Buffet por kg", category: "buffet_kg", price: 0, description: "Preço variável" },
      { name: "Suco", category: "bebidas", price: 800, description: "Bebida" },
      { name: "Porção de batata", category: "porcoes", price: 2500, description: "Vai para a cozinha" },
    ]);
  }
}
