import { z } from "zod";

// Re-defining locally to avoid dependency on shared folder for this pure frontend mock
// In a real fullstack app, import these from @shared/schema

export interface MenuItem {
  id: number;
  name: string;
  category: string; // porcoes, bebidas, buffet_vontade, buffet_kg, marmita, lanches, sobremesas
  price: number; // stored in cents
  description: string | null;
  available: boolean;
  image?: string; // Adding strictly for frontend visuals
}

export interface Category {
  /** Stable id used in data (ex: "porcoes"). */
  id: string;
  /** Human label shown in UI (ex: "Porções"). */
  label: string;
  /** If true, items in this category should be routed to Kitchen. */
  sendToKitchen: boolean;
}

export interface Comanda {
  id: number;
  number: number;
  // Regra do cliente: nao existe comanda suja.
  status: "available" | "occupied";
  total: number;
}

export interface Order {
  id: number;
  comandaId: number;
  status: "open" | "preparing" | "ready" | "closed";
  createdAt: string; // ISO string for JSON serialization
  closedAt?: string;
  paidAt?: string;
  paymentMethod?: string;
  /**
   * Receipt id generated when the comanda is finalized (closed).
   * This is the id that should appear in Histórico/recibo.
   */
  receiptId?: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: number;
  orderId: number;
  menuItemId: number;
  name: string;
  price: number;
  quantity: number;
  category: string;
  status: "pending" | "preparing" | "ready" | "delivered" | "canceled";
}

export type CartItem = Omit<OrderItem, "id" | "orderId" | "status"> & { 
  tempId: string;
};

/** Default categories used as a safe bootstrap for the purely-frontend mock. */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: "porcoes", label: "Porções", sendToKitchen: true },
  // Valor variável (informado manualmente no PDV)
  { id: "buffet_kg", label: "Buffet por kg", sendToKitchen: false },
  { id: "bebidas", label: "Bebidas", sendToKitchen: false },
  { id: "lanches", label: "Lanches", sendToKitchen: false },
  { id: "sobremesas", label: "Sobremesas", sendToKitchen: false },
  { id: "outros", label: "Outros", sendToKitchen: false },
];
