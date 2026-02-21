import { Category, Comanda, Order, OrderItem } from "@/lib/types";

/**
 * Domain helpers (Phase 6)
 *
 * Centraliza regras e seletores para evitar duplicação entre páginas e store.
 */

export const KITCHEN_STATUSES = ["pending", "preparing", "ready"] as const;
export const KITCHEN_BLOCKING_STATUSES = ["pending", "preparing"] as const;

export function isKitchenCategory(categories: Category[], categoryId: string) {
  const cat = categories.find((c) => c.id === categoryId);
  // Backward compatibility: older persisted states may not have sendToKitchen.
  const flag = (cat as any)?.sendToKitchen;
  if (typeof flag === "boolean") return flag;
  return categoryId === "porcoes";
}

export function isKitchenItem(item: Pick<OrderItem, "category" | "status">, categories: Category[]) {
  return isKitchenCategory(categories, item.category) && (KITCHEN_STATUSES as readonly string[]).includes(item.status);
}

export function isKitchenBlocking(item: Pick<OrderItem, "category" | "status">, categories: Category[]) {
  return isKitchenCategory(categories, item.category) && (KITCHEN_BLOCKING_STATUSES as readonly string[]).includes(item.status);
}

export function getOpenOrdersForComanda(orders: Order[], comandaId: number) {
  return orders.filter((o) => o.comandaId === comandaId && o.status !== "closed");
}

export function getItemsForComanda(orderItems: OrderItem[], orders: Order[], comandaId: number) {
  const comandaOrders = getOpenOrdersForComanda(orders, comandaId);
  const orderIds = new Set(comandaOrders.map((o) => o.id));
  return orderItems.filter((i) => orderIds.has(i.orderId));
}

export function hasBlockingKitchenItems(orderItems: OrderItem[], orders: Order[], categories: Category[], comandaId: number) {
  const items = getItemsForComanda(orderItems, orders, comandaId);
  return items.some((it) => isKitchenBlocking(it, categories));
}

export function countKitchenStatuses(items: OrderItem[]) {
  return {
    pending: items.filter((i) => i.status === "pending").length,
    preparing: items.filter((i) => i.status === "preparing").length,
    ready: items.filter((i) => i.status === "ready").length,
  };
}

export function isComandaSelectable(comanda: Comanda) {
  // Regra do cliente: nao existe comanda suja.
  // Uma comanda pode ser selecionada tanto livre quanto ocupada.
  return comanda.status === "available" || comanda.status === "occupied";
}
