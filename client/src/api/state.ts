import { apiFetch } from "./http";
import type { MenuItem, Category, Comanda, Order, OrderItem } from "@/lib/types";

export type BackendStateSnapshot = {
  menuItems: MenuItem[];
  categories: Category[];
  comandas: Comanda[];
  orders: Order[];
  orderItems: OrderItem[];
  serverTime: string;
};

/**
 * Snapshot endpoint: makes initial migration from localStorage -> Postgres simpler.
 * When backend mode is enabled, the app can pull the whole state at once.
 */
export async function fetchStateSnapshot(): Promise<BackendStateSnapshot> {
  return await apiFetch<BackendStateSnapshot>("/api/state");
}
