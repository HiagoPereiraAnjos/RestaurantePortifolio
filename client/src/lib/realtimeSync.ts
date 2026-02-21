import { useStore } from "@/store/useStore";
import type { CartItem, Category, Comanda, MenuItem, Order, OrderItem } from "@/lib/types";

// Frontend-only "real time" sync.
// Without a backend we can't sync multiple devices, but we CAN keep every page and
// every tab/window in sync instantly on the same device/browser.
//
// Mechanisms:
// 1) BroadcastChannel (instant cross-tab)
// 2) storage event (cross-tab fallback)
// 3) lightweight polling (safety net)

const PERSIST_KEY = "restaurant-pos-storage";
const SYNC_KEY = "restaurant-pos-sync-ts";
const CHANNEL = "restaurant-pos-sync";

type PersistedShape = {
  menuItems?: MenuItem[];
  categories?: Category[];
  comandas?: Comanda[];
  orders?: Order[];
  orderItems?: OrderItem[];
  cartsByComanda?: Record<number, CartItem[]>;
  activeComandaId?: number | null;
};

function readPersistedState(): PersistedShape | null {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const state = (parsed?.state ?? null) as PersistedShape | null;
    if (!state || typeof state !== "object") return null;

    // Only return the serializable data keys (never replace actions).
    const picked: PersistedShape = {
      menuItems: Array.isArray(state.menuItems) ? state.menuItems : undefined,
      categories: Array.isArray(state.categories) ? state.categories : undefined,
      comandas: Array.isArray(state.comandas) ? state.comandas : undefined,
      orders: Array.isArray(state.orders) ? state.orders : undefined,
      orderItems: Array.isArray(state.orderItems) ? state.orderItems : undefined,
      cartsByComanda: state.cartsByComanda && typeof state.cartsByComanda === "object" ? state.cartsByComanda : undefined,
      activeComandaId:
        typeof state.activeComandaId === "number" || state.activeComandaId === null
          ? state.activeComandaId
          : undefined,
    };

    return picked;
  } catch {
    return null;
  }
}

let initialized = false;

export function initRealtimeSync() {
  if (initialized) return;
  initialized = true;

  let lastAppliedTs = Number(localStorage.getItem(SYNC_KEY) ?? "0") || 0;
  let lastEmittedTs = 0;
  let debounceTimer: number | null = null;

  const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;

  const emitSync = () => {
    const ts = Date.now();
    lastEmittedTs = ts;
    try {
      localStorage.setItem(SYNC_KEY, String(ts));
    } catch {
      // ignore
    }
    try {
      bc?.postMessage({ ts });
    } catch {
      // ignore
    }
  };

  // When local state changes, broadcast a sync signal (debounced).
  // This keeps other tabs/pages updated instantly.
  useStore.subscribe(() => {
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => emitSync(), 120);
  });

  const applyIfNew = (ts: number) => {
    if (!ts || ts <= lastAppliedTs) return;
    // Prevent feedback loop where we re-apply our own emission.
    if (ts === lastEmittedTs) return;
    const persisted = readPersistedState();
    if (!persisted) return;
    lastAppliedTs = ts;
    useStore.setState(persisted as any, false);
  };

  // BroadcastChannel listener
  if (bc) {
    bc.onmessage = (ev) => {
      const ts = Number((ev as any)?.data?.ts ?? 0);
      applyIfNew(ts);
    };
  }

  // storage event listener (fires in other tabs when localStorage changes)
  window.addEventListener("storage", (e) => {
    if (e.key === SYNC_KEY) {
      const ts = Number(e.newValue ?? "0");
      applyIfNew(ts);
      return;
    }
    if (e.key === PERSIST_KEY) {
      // Some browsers may not update SYNC_KEY reliably; treat persist changes as a signal too.
      const ts = Number(localStorage.getItem(SYNC_KEY) ?? "0") || Date.now();
      applyIfNew(ts);
    }
  });

  // Polling safety net (keeps it working even if BroadcastChannel is blocked)
  window.setInterval(() => {
    const ts = Number(localStorage.getItem(SYNC_KEY) ?? "0") || 0;
    applyIfNew(ts);
  }, 1000);
}
