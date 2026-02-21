import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MenuItem, Comanda, Order, OrderItem, CartItem, Category } from "@/lib/types";
import { INITIAL_MENU_ITEMS, INITIAL_COMANDAS, INITIAL_CATEGORIES } from "@/mocks/data";
import { hasBlockingKitchenItems, isComandaSelectable, isKitchenCategory } from "@/lib/domain";
import { getBackendMode } from "@/api/config";
import { apiFetch } from "@/api/http";
import { fetchStateSnapshot } from "@/api/state";
import { canUseApiLocalFallback, FALLBACK_MESSAGES } from "@/lib/fallbackPolicy";
import { nowIsoUtc } from "@/utils/datetime";

function computeComandaTotalCents(
  comandaId: number,
  orders: Order[],
  orderItems: OrderItem[]
): number {
  const openOrderIds = new Set(
    orders
      .filter((o) => o.comandaId === comandaId && o.status !== "closed")
      .map((o) => o.id)
  );

  return orderItems
    .filter((oi) => openOrderIds.has(oi.orderId))
    // Item cancelado não deve somar no total.
    .filter((oi) => oi.status !== "canceled")
    .reduce((acc, it) => acc + it.price * it.quantity, 0);
}

function generateReceiptId(comandaId: number) {
  // Unique enough for local/offline: comanda + timestamp base36.
  const ts = Date.now().toString(36).toUpperCase();
  return `CMD${comandaId}-${ts}`;
}

interface StoreState {
  menuItems: MenuItem[];
  categories: Category[];
  comandas: Comanda[];
  orders: Order[];
  orderItems: OrderItem[];
  /** Cart items are kept per comanda for safe switching and persistence. */
  cartsByComanda: Record<number, CartItem[]>;
  activeComandaId: number | null;

  /** Internal: refresh state from backend snapshot (when VITE_BACKEND_MODE=api). */
  _syncFromBackend: () => Promise<void>;
  
  // Actions
  setActiveComanda: (id: number | null) => void;
  /**
   * Add an item to the active comanda cart.
   * For variable-price items (ex: buffet_kg), you may provide an overridePriceCents and optional displayName.
   */
  addToCart: (item: MenuItem, opts?: { overridePriceCents?: number; displayName?: string }) => void;
  decrementFromCart: (tempId: string) => void;
  incrementInCart: (tempId: string) => void;
  removeFromCart: (tempId: string) => void;
  clearCart: (comandaId?: number) => void;
  submitOrder: () => void;
  updateComandaStatus: (id: number, status: Comanda['status']) => void;
  updateOrderItemStatus: (id: number, status: OrderItem['status']) => void;
  addMenuItem: (item: Omit<MenuItem, "id">) => void;
  /** Update an existing menu item (admin edit). */
  updateMenuItem: (id: number, patch: Partial<Omit<MenuItem, "id">>) => void;
  /** Activate/deactivate an item. Deactivated items must not appear in the POS menu. */
  toggleMenuItemAvailability: (id: number) => void;
  deleteMenuItem: (id: number) => void;

  // Categories (admin)
  addCategory: (category: Category) => void;
  updateCategory: (id: string, patch: Partial<Omit<Category, "id">>) => void;
  deleteCategory: (id: string) => void;
  addComandaAdmin: (number: number) => void;
  deleteComandaAdmin: (id: number) => void;

  closeComanda: (id: number) => void;
  /**
   * Close a comanda only if there are no kitchen items pending/preparing.
   * Returns the generated receiptId if it closed; otherwise returns false.
   */
  finalizeComanda: (id: number) => string | false;

  /** Reopen a closed order (Admin > Histórico). */
  reopenOrder: (orderId: number) => void;
  /** Reopen a closed receipt (all orders with the same receiptId). */
  reopenReceipt: (receiptId: string) => void;

  /** Update quantity for an order item (Admin > Histórico). If quantity <= 0, it removes the item. */
  updateOrderItemQuantity: (orderItemId: number, quantity: number) => void;

  /**
   * Add a new item directly to an existing order (used in Admin > Histórico).
   * - If the order is already closed, the item is added as "delivered" (historical adjustment).
   * - If the order is open, the item follows the normal rules (kitchen vs non-kitchen).
   */
  addOrderItemToOrder: (
    orderId: number,
    menuItemId: number,
    opts?: { quantity?: number; overridePriceCents?: number; displayName?: string }
  ) => void;

  /**
   * Cancelar a abertura de uma comanda ocupada quando o total for 0.
   * Útil quando a comanda foi marcada como ocupada mas não houve consumo.
   */
  cancelComandaOpening: (comandaId: number) => void;

  /**
   * Backend preparation: allows hydrating the Zustand store from a backend snapshot
   * (Postgres) without removing offline/localStorage support.
   */
  hydrateFromBackendSnapshot: (snapshot: {
    menuItems: MenuItem[];
    categories: Category[];
    comandas: Comanda[];
    orders: Order[];
    orderItems: OrderItem[];
  }) => void;
}

function genReceiptId(comandaId: number) {
  // Unique, human-friendly-ish id.
  // Example: C12-ML3K0Z
  return `C${comandaId}-${Date.now().toString(36).toUpperCase()}`;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      menuItems: INITIAL_MENU_ITEMS,
      categories: INITIAL_CATEGORIES,
      comandas: INITIAL_COMANDAS,
      orders: [],
      orderItems: [],
      cartsByComanda: {},
      activeComandaId: null,

      setActiveComanda: (id) => set((state) => {
        if (id === null) return { activeComandaId: null };
        const target = state.comandas.find(c => c.id === id);
        if (!target || !isComandaSelectable(target)) return { activeComandaId: null };

        // When backend mode is enabled, comanda availability/occupied state is owned by the server.
        // Selecting a comanda should NOT locally flip its status (prevents mismatch between UI and DB).
        if (getBackendMode() === "api") {
          return { activeComandaId: id };
        }

        // Abertura de comanda: ao selecionar uma comanda livre, marcamos como ocupada
        // (total continua 0). Isso habilita a opção de "Cancelar abertura" quando não há consumo.
        const nextComandas = state.comandas.map((c) => {
          if (c.id !== id) return c;
          if (c.status === 'available') {
            return { ...c, status: 'occupied' as const };
          }
          return c;
        });

        return { activeComandaId: id, comandas: nextComandas };
      }),

      // Internal helper: refresh the whole state from the backend snapshot.
      // Silent by design: if backend is down, offline mode must keep working.
      // NOTE: does not clear carts/active selection.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _syncFromBackend: async () => {
        if (getBackendMode() !== "api") return;
        try {
          const snapshot = await fetchStateSnapshot();

          // Normalize order.comandaId:
          // Some backend versions store orders.comandaId as comanda.number (external number),
          // while the frontend expects comanda.id (internal PK). We map number -> id when needed.
          const numberToId = new Map<number, number>();
          snapshot.comandas.forEach((c) => {
            if (Number.isFinite(c.number) && Number.isFinite(c.id)) numberToId.set(c.number as any, c.id as any);
          });

          const normalizedOrders = snapshot.orders.map((o) => {
            const mapped = numberToId.get(o.comandaId as any);
            // If comandaId doesn't match any comanda.id but matches a comanda.number, remap it.
            const hasId = snapshot.comandas.some((c) => c.id === (o.comandaId as any));
            if (!hasId && mapped) return { ...o, comandaId: mapped };
            return o;
          });

          set((state) => ({
            menuItems: snapshot.menuItems,
            categories: snapshot.categories,
            comandas: snapshot.comandas,
            orders: normalizedOrders,
            orderItems: snapshot.orderItems,
            cartsByComanda: state.cartsByComanda,
            activeComandaId: state.activeComandaId,
          }));
        } catch {
          // ignore
        }
      },

      addToCart: (item, opts) => set((state) => {
        // Phase 2: cart is per comanda. Do not allow adding items without selecting a comanda.
        if (!state.activeComandaId) return state;

        const comanda = state.comandas.find(c => c.id === state.activeComandaId);
        // A comanda pode estar livre ou ocupada; em ambos os casos deve ser possível lançar itens.
        // (Alguns estados antigos no localStorage podem ter valores inesperados, então só exigimos existir.)
        if (!comanda) return state;

        const currentCart = state.cartsByComanda[state.activeComandaId] ?? [];

        const isVariablePrice = item.category === 'buffet_kg';
        const overridePriceCents = opts?.overridePriceCents;

        // Variable-price items must always create a NEW line in the cart.
        // Example: buffet por kg where the cashier types the price every time.
        if (isVariablePrice) {
          const price = typeof overridePriceCents === 'number' ? overridePriceCents : item.price;
          const name = (opts?.displayName ?? item.name).trim();
          const newLine: CartItem = {
            tempId: Math.random().toString(36).slice(2, 11),
            menuItemId: item.id,
            name,
            price,
            quantity: 1,
            category: item.category,
          };

          return {
            cartsByComanda: {
              ...state.cartsByComanda,
              [state.activeComandaId]: [...currentCart, newLine],
            },
          };
        }

        const existing = currentCart.find(i => i.menuItemId === item.id);
        const newCart: CartItem[] = existing
          ? currentCart.map(i => i.menuItemId === item.id ? { ...i, quantity: i.quantity + 1 } : i)
          : [...currentCart, {
              tempId: Math.random().toString(36).slice(2, 11),
              menuItemId: item.id,
              name: item.name,
              price: item.price,
              quantity: 1,
              category: item.category,
            }];

        return {
          cartsByComanda: {
            ...state.cartsByComanda,
            [state.activeComandaId]: newCart,
          }
        };
      }),

      incrementInCart: (tempId) => set((state) => {
        if (!state.activeComandaId) return state;
        const currentCart = state.cartsByComanda[state.activeComandaId] ?? [];
        const newCart = currentCart.map(i => i.tempId === tempId ? { ...i, quantity: i.quantity + 1 } : i);
        return {
          cartsByComanda: {
            ...state.cartsByComanda,
            [state.activeComandaId]: newCart,
          }
        };
      }),

      decrementFromCart: (tempId) => set((state) => {
        if (!state.activeComandaId) return state;
        const currentCart = state.cartsByComanda[state.activeComandaId] ?? [];
        const target = currentCart.find(i => i.tempId === tempId);
        if (!target) return state;
        const newCart = target.quantity <= 1
          ? currentCart.filter(i => i.tempId !== tempId)
          : currentCart.map(i => i.tempId === tempId ? { ...i, quantity: i.quantity - 1 } : i);

        return {
          cartsByComanda: {
            ...state.cartsByComanda,
            [state.activeComandaId]: newCart,
          }
        };
      }),

      removeFromCart: (tempId) => set((state) => {
        if (!state.activeComandaId) return state;
        const currentCart = state.cartsByComanda[state.activeComandaId] ?? [];
        return {
          cartsByComanda: {
            ...state.cartsByComanda,
            [state.activeComandaId]: currentCart.filter(item => item.tempId !== tempId),
          }
        };
      }),

      clearCart: (comandaId) => set((state) => {
        const targetId = typeof comandaId === 'number' ? comandaId : state.activeComandaId;
        if (!targetId) return state;
        return {
          cartsByComanda: {
            ...state.cartsByComanda,
            [targetId]: [],
          }
        };
      }),

      submitOrder: () => {
        const doLocal = () => {
          set((state) => {
            if (!state.activeComandaId) return state;
            const cart = state.cartsByComanda[state.activeComandaId] ?? [];
            if (cart.length === 0) return state;

            const comanda = state.comandas.find(c => c.id === state.activeComandaId);
            if (!comanda) return state;

            // Reutilizar o "pedido em aberto" da comanda, se existir, para que a comanda
            // tenha UM identificador lógico no histórico (receiptId na finalização).
            const existingOpen = [...state.orders]
              .filter(o => o.comandaId === state.activeComandaId && o.status !== 'closed')
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

            const orderId = existingOpen?.id ?? Date.now();
            const createdAt = existingOpen?.createdAt ?? nowIsoUtc();

            const newOrder: Order | null = existingOpen
              ? null
              : {
                  id: orderId,
                  comandaId: state.activeComandaId,
                  status: 'open',
                  createdAt,
                };

            const newOrderItems: OrderItem[] = cart.map((item, idx) => {
              const goesToKitchen = isKitchenCategory(state.categories, item.category);
              return {
                id: Date.now() + idx,
                orderId,
                menuItemId: item.menuItemId,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                category: item.category,
                // Items marked for kitchen start as pending. Others are delivered immediately.
                status: goesToKitchen ? 'pending' : 'delivered'
              };
            });

            const nextOrders = newOrder ? [...state.orders, newOrder] : state.orders;
            const nextOrderItems = [...state.orderItems, ...newOrderItems];
            const nextTotal = computeComandaTotalCents(state.activeComandaId, nextOrders, nextOrderItems);

            const updatedComandas = state.comandas.map(c =>
              c.id === state.activeComandaId
                ? { ...c, status: 'occupied' as const, total: nextTotal }
                : c
            );

            return {
              orders: nextOrders,
              orderItems: nextOrderItems,
              comandas: updatedComandas,
              cartsByComanda: {
                ...state.cartsByComanda,
                [state.activeComandaId]: [],
              }
            };
          });
        };

        if (getBackendMode() !== "api") {
          doLocal();
          return;
        }

        // Backend mode: try to create the order on the server.
        // If it fails (backend down), fall back to localStorage behavior.
        (async () => {
          const state = get();
          if (!state.activeComandaId) return;
          const cart = state.cartsByComanda[state.activeComandaId] ?? [];
          if (cart.length === 0) return;
          const comanda = state.comandas.find(c => c.id === state.activeComandaId);
          if (!comanda) return;

          const payload = {
            comandaId: comanda.id,
            status: "open",
            items: cart.map((item) => {
              const goesToKitchen = isKitchenCategory(state.categories, item.category);
              return {
                orderId: 0,
                menuItemId: item.menuItemId,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                category: item.category,
                status: goesToKitchen ? "pending" : "delivered",
              };
            }),
          };

          try {
            await apiFetch("/api/orders", { method: "POST", body: payload });
            // Clear cart only after server accepted it.
            set((s) => ({
              cartsByComanda: { ...s.cartsByComanda, [state.activeComandaId as number]: [] },
            }));
            // Pull fresh snapshot to avoid drift (totals/status/orders ids).
            const snapshot = await fetchStateSnapshot();
            set((s) => ({
              menuItems: snapshot.menuItems,
              categories: snapshot.categories,
              comandas: snapshot.comandas,
              orders: snapshot.orders,
              orderItems: snapshot.orderItems,
              cartsByComanda: s.cartsByComanda,
              activeComandaId: s.activeComandaId,
            }));
          } catch (e) {
            if (canUseApiLocalFallback()) {
              console.warn("Backend create order failed; applying local contingency fallback", e);
              doLocal();
              return;
            }
            console.warn(FALLBACK_MESSAGES.apiWriteBlocked, e);
          }
        })();
      },

      updateComandaStatus: (id, status) => set((state) => ({
        comandas: state.comandas.map(c => {
          if (c.id !== id) return c;

          // Regra do cliente: nao existe comanda suja.
          // Permitir alternar livre/ocupada.
          if (status === 'available') return { ...c, status, total: 0 };
          return { ...c, status };
        })
      })),

      updateOrderItemStatus: (id, status) => {
        // Optimistic update (keeps Kitchen UI snappy). In API mode we also persist.
        set((state) => {
          const target = state.orderItems.find((oi) => oi.id === id);
          if (!target) return state;

          const order = state.orders.find((o) => o.id === target.orderId);
          if (!order) {
            return {
              orderItems: state.orderItems.map((item) => (item.id === id ? { ...item, status } : item)),
            };
          }

          const comandaId = order.comandaId;
          const nextOrderItems = state.orderItems.map((item) => (item.id === id ? { ...item, status } : item));
          const total = computeComandaTotalCents(comandaId, state.orders, nextOrderItems);

          return {
            orderItems: nextOrderItems,
            comandas: state.comandas.map((c) => (c.id === comandaId ? { ...c, total } : c)),
          };
        });

        if (getBackendMode() !== "api") return;

        // Persist to backend (best-effort). If it fails, we keep offline behavior.
        (async () => {
          try {
            await apiFetch(`/api/order-items/${id}`, {
              method: "PUT",
              body: { status },
            });
            // Pull a fresh snapshot so Kitchen/Admin reflect the server truth.
            await get()._syncFromBackend();
          } catch (e) {
            // Silent failure: backend down or network issues. Offline mode must keep working.
            console.warn("Backend update order item failed; keeping local state", e);
          }
        })();
      },

      addMenuItem: (item) => {
        const tempId = Date.now();
        set((state) => ({
          menuItems: [...state.menuItems, { ...item, id: tempId } as any]
        }));

        if (getBackendMode() !== "api") return;

        (async () => {
          try {
            await apiFetch(`/api/menu-items`, {
              method: "POST",
              body: item,
            });
            await get()._syncFromBackend();
          } catch (e) {
            console.warn("Backend add menu item failed; keeping local state", e);
          }
        })();
      },

      updateMenuItem: (id, patch) => {
        set((state) => ({
          menuItems: state.menuItems.map(mi => mi.id === id ? { ...mi, ...patch } : mi)
        }));

        if (getBackendMode() !== "api") return;

        (async () => {
          try {
            await apiFetch(`/api/menu-items/${id}`, {
              method: "PUT",
              body: patch,
            });
            await get()._syncFromBackend();
          } catch (e) {
            console.warn("Backend update menu item failed; keeping local state", e);
          }
        })();
      },

      toggleMenuItemAvailability: (id) => {
        const nextAvailable = !get().menuItems.find((m) => m.id === id)?.available;
        set((state) => ({
          menuItems: state.menuItems.map(mi => mi.id === id ? { ...mi, available: !mi.available } : mi)
        }));

        if (getBackendMode() !== "api") return;

        (async () => {
          try {
            await apiFetch(`/api/menu-items/${id}`, {
              method: "PUT",
              body: { available: nextAvailable },
            });
            await get()._syncFromBackend();
          } catch (e) {
            console.warn("Backend toggle availability failed; keeping local state", e);
          }
        })();
      },

      deleteMenuItem: (id) => {
        set((state) => ({
          menuItems: state.menuItems.filter(item => item.id !== id)
        }));

        if (getBackendMode() !== "api") return;

        (async () => {
          try {
            await apiFetch(`/api/menu-items/${id}`, { method: "DELETE" });
            await get()._syncFromBackend();
          } catch (e) {
            console.warn("Backend delete menu item failed; keeping local state", e);
          }
        })();
      },

      addCategory: (category) => {
        set((state) => {
        const cleanId = category.id.trim().toLowerCase();
        if (!cleanId) return state;
        if (state.categories.some(c => c.id === cleanId)) return state;
        const sendToKitchen = typeof (category as any).sendToKitchen === 'boolean'
          ? (category as any).sendToKitchen
          : cleanId === 'porcoes';
        return {
          categories: [...state.categories, { id: cleanId, label: category.label.trim() || cleanId, sendToKitchen }]
        };
        });

        if (getBackendMode() !== "api") return;
        const cleanId = category.id.trim().toLowerCase();
        const sendToKitchen = typeof (category as any).sendToKitchen === 'boolean'
          ? (category as any).sendToKitchen
          : cleanId === 'porcoes';

        (async () => {
          try {
            await apiFetch(`/api/categories/${encodeURIComponent(cleanId)}`, {
              method: "PUT",
              body: { label: category.label.trim() || cleanId, sendToKitchen },
            });
            await get()._syncFromBackend();
          } catch (e) {
            console.warn("Backend add category failed; keeping local state", e);
          }
        })();
      },

      updateCategory: (id, patch) => {
        set((state) => ({
          categories: state.categories.map(c => c.id === id ? {
            ...c,
            ...patch,
            label: (patch.label ?? c.label).trim(),
            sendToKitchen: typeof (patch as any).sendToKitchen === 'boolean' ? (patch as any).sendToKitchen : (c as any).sendToKitchen ?? (c.id === 'porcoes'),
          } : c)
        }));

        if (getBackendMode() !== "api") return;

        const body: any = { ...patch };
        if (typeof body.label === "string") body.label = body.label.trim();
        (async () => {
          try {
            await apiFetch(`/api/categories/${encodeURIComponent(id)}`, {
              method: "PUT",
              body,
            });
            await get()._syncFromBackend();
          } catch (e) {
            console.warn("Backend update category failed; keeping local state", e);
          }
        })();
      },

      deleteCategory: (id) => {
        set((state) => {
        if (id === "outros") return state; // keep fallback
        const isUsed = state.menuItems.some((mi) => mi.category === id);
        return {
          categories: state.categories.filter((c) => c.id !== id),
          // Keep menu items consistent: move items from deleted category to 'outros'
          menuItems: isUsed
            ? state.menuItems.map((mi) => (mi.category === id ? { ...mi, category: "outros" } : mi))
            : state.menuItems,
        };
        });

        if (getBackendMode() !== "api") return;

        (async () => {
          try {
            await apiFetch(`/api/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
            await get()._syncFromBackend();
          } catch (e) {
            console.warn("Backend delete category failed; keeping local state", e);
          }
        })();
      },


      addComandaAdmin: (number: number) => {
        const n = Math.trunc(Number(number));
        if (!Number.isFinite(n) || n <= 0) return;

        // Optimistic local update
        set((state) => {
          if (state.comandas.some((c) => c.number === n)) return state;
          const nextId = (state.comandas.reduce((max, c) => Math.max(max, c.id), 0) || 0) + 1;
          const updated: Comanda[] = [...state.comandas, { id: nextId, number: n, status: "available", total: 0 }];
          updated.sort((a, b) => a.number - b.number);
          return { comandas: updated };
        });

        if (getBackendMode() !== "api") return;

        (async () => {
          try {
            await apiFetch("/api/comandas", { method: "POST", body: { number: n } });
            await get()._syncFromBackend();
          } catch (e) {
            console.warn("Backend create comanda failed; keeping local state", e);
            // Try to resync in case server rejected but local added.
            try { await get()._syncFromBackend(); } catch {}
          }
        })();
      },


      deleteComandaAdmin: (id: number) => {
        // Optimistic local removal (only if safe)
        const snapshot = get();
        const target = snapshot.comandas.find((c) => c.id === id);
        if (!target) return;

        const hasOrders = snapshot.orders.some((o) => o.comandaId === target.id);
        if (target.status !== "available" || (target.total ?? 0) > 0 || hasOrders) {
          console.warn("Comanda not deletable locally (must be available, total 0, and have no orders).");
          return;
        }

        set((state) => ({ comandas: state.comandas.filter((c) => c.id !== id) }));

        if (getBackendMode() !== "api") return;

        (async () => {
          try {
            await apiFetch(`/api/comandas/${id}`, { method: "DELETE" });
            await get()._syncFromBackend();
          } catch (e) {
            console.warn("Backend delete comanda failed; resyncing state", e);
            try { await get()._syncFromBackend(); } catch {}
          }
        })();
      },

      closeComanda: (id) => set((state) => {
              const receiptId = generateReceiptId(id);
              const ordersForComanda = state.orders.filter(o => o.comandaId === id);

              return ({
              // Regra do cliente: ao fechar, a comanda volta para livre imediatamente.
              comandas: state.comandas.map(c => c.id === id ? { ...c, status: 'available', total: 0 } : c),
              orders: state.orders.map(o => o.comandaId === id ? { ...o, status: 'closed', receiptId: o.receiptId ?? receiptId } : o),
              // When closing, mark any remaining items as delivered (including ready kitchen items).
              orderItems: state.orderItems.map(oi => {
                const isFromThisComanda = ordersForComanda.some(o => o.id === oi.orderId);
                if (!isFromThisComanda) return oi;
                return oi.status === 'delivered' ? oi : { ...oi, status: 'delivered' };
              }),
              activeComandaId: state.activeComandaId === id ? null : state.activeComandaId,
              cartsByComanda: state.activeComandaId === id
                ? { ...state.cartsByComanda, [id]: [] }
                : state.cartsByComanda,
            })
            }),



      finalizeComanda: (id) => {
        const state = get();
        if (hasBlockingKitchenItems(state.orderItems, state.orders, state.categories, id)) return false;
        const receiptId = generateReceiptId(id);

        // Close and stamp receiptId (same id for all orders from this comanda closed now).
        set((s) => {
          const ordersForComanda = s.orders.filter(o => o.comandaId === id);
          return {
            comandas: s.comandas.map(c => c.id === id ? { ...c, status: 'available', total: 0 } : c),
            orders: s.orders.map(o => o.comandaId === id ? { ...o, status: 'closed', receiptId: o.receiptId ?? receiptId } : o),
            orderItems: s.orderItems.map(oi => {
              const isFromThisComanda = ordersForComanda.some(o => o.id === oi.orderId);
              if (!isFromThisComanda) return oi;
              return oi.status === 'delivered' ? oi : { ...oi, status: 'delivered' };
            }),
            activeComandaId: s.activeComandaId === id ? null : s.activeComandaId,
            cartsByComanda: s.activeComandaId === id
              ? { ...s.cartsByComanda, [id]: [] }
              : s.cartsByComanda,
          };
        });
        return receiptId;
      },

      reopenOrder: (orderId) => set((state) => {
        const order = state.orders.find(o => o.id === orderId);
        if (!order) return state;

        const comandaId = order.comandaId;
        const nextOrders = state.orders.map(o => o.id === orderId ? { ...o, status: 'open' as const } : o);
        const total = computeComandaTotalCents(comandaId, nextOrders, state.orderItems);

        const nextComandas = state.comandas.map(c => c.id === comandaId
          ? { ...c, status: 'occupied' as const, total }
          : c
        );

        console.info(
          JSON.stringify({
            ts: nowIsoUtc(),
            level: "info",
            source: "store",
            event: "order.reopen",
            orderId,
            comandaId,
          }),
        );

        return {
          orders: nextOrders,
          comandas: nextComandas,
        };
      }),

      reopenReceipt: (receiptId) => set((state) => {
        if (!receiptId) return state;
        const receiptOrders = state.orders.filter(o => o.receiptId === receiptId);
        if (receiptOrders.length === 0) return state;

        const comandaId = receiptOrders[0].comandaId;
        const nextOrders = state.orders.map(o => o.receiptId === receiptId ? { ...o, status: 'open' as const } : o);
        const total = computeComandaTotalCents(comandaId, nextOrders, state.orderItems);

        const nextComandas = state.comandas.map(c => c.id === comandaId
          ? { ...c, status: 'occupied' as const, total }
          : c
        );

        console.info(
          JSON.stringify({
            ts: nowIsoUtc(),
            level: "info",
            source: "store",
            event: "receipt.reopen",
            receiptId,
            comandaId,
            orders: receiptOrders.length,
          }),
        );

        return { orders: nextOrders, comandas: nextComandas };
      }),

      updateOrderItemQuantity: (orderItemId, quantity) => {
        // Optimistic local update for snappy UI.
        set((state) => {
          const item = state.orderItems.find(oi => oi.id === orderItemId);
          if (!item) return state;

          const order = state.orders.find(o => o.id === item.orderId);
          if (!order) return state;
          const comandaId = order.comandaId;

          const nextOrderItems = quantity <= 0
            ? state.orderItems.filter(oi => oi.id !== orderItemId)
            : state.orderItems.map(oi => oi.id === orderItemId ? { ...oi, quantity } : oi);

          const openOrders = state.orders.filter(o => o.comandaId === comandaId && o.status !== 'closed');
          const total = computeComandaTotalCents(comandaId, state.orders, nextOrderItems);

          const hasAnyOpen = openOrders.length > 0;
          const nextComandas = state.comandas.map(c => {
            if (c.id !== comandaId) return c;
            // If there are still open orders, keep occupied; otherwise, free it.
            return hasAnyOpen ? { ...c, status: 'occupied' as const, total } : { ...c, status: 'available' as const, total: 0 };
          });

          return { orderItems: nextOrderItems, comandas: nextComandas };
        });

        if (getBackendMode() !== "api") return;

        (async () => {
          try {
            if (quantity <= 0) {
              await apiFetch(`/api/order-items/${orderItemId}`, { method: "DELETE" });
            } else {
              await apiFetch(`/api/order-items/${orderItemId}`, { method: "PUT", body: { quantity } });
            }
            await get()._syncFromBackend();
          } catch (e) {
            console.warn("Backend update order item quantity failed; keeping local state", e);
          }
        })();
      },

      addOrderItemToOrder: (orderId, menuItemId, opts) => {
        // Optimistic local update so the modal updates instantly.
        const tempId = -Math.abs(Date.now());
        set((state) => {
          const order = state.orders.find((o) => o.id === orderId);
          if (!order) return state;

          const mi = state.menuItems.find((m) => m.id === menuItemId);
          if (!mi) return state;

          const quantity = Math.max(1, Math.floor(opts?.quantity ?? 1));
          const price = typeof opts?.overridePriceCents === 'number' ? opts.overridePriceCents : mi.price;
          const name = (opts?.displayName ?? mi.name).trim() || mi.name;

          // If order is closed, we are adjusting historical data: it must not go to kitchen.
          const status: OrderItem['status'] = order.status === 'closed'
            ? 'delivered'
            : (isKitchenCategory(state.categories, mi.category) ? 'pending' : 'delivered');

          const newItem: OrderItem = {
            id: tempId,
            orderId: order.id,
            menuItemId: mi.id,
            name,
            price,
            quantity,
            category: mi.category,
            status,
          };

          const nextOrderItems = [...state.orderItems, newItem];

          // Update comanda totals only if this affects an open comanda.
          if (order.status === 'closed') {
            return { orderItems: nextOrderItems };
          }

          const comandaId = order.comandaId;
          const total = computeComandaTotalCents(comandaId, state.orders, nextOrderItems);
          const nextComandas = state.comandas.map((c) => c.id === comandaId ? { ...c, status: 'occupied' as const, total } : c);
          return { orderItems: nextOrderItems, comandas: nextComandas };
        });

        if (getBackendMode() !== "api") return;

        (async () => {
          try {
            // Persist and then sync. Server will generate the real item ID.
            const state = get();
            const mi = state.menuItems.find((m) => m.id === menuItemId);
            const order = state.orders.find((o) => o.id === orderId);
            if (!mi || !order) return;

            const quantity = Math.max(1, Math.floor(opts?.quantity ?? 1));
            const price = typeof opts?.overridePriceCents === 'number' ? opts.overridePriceCents : mi.price;
            const name = (opts?.displayName ?? mi.name).trim() || mi.name;
            const status: OrderItem['status'] = order.status === 'closed'
              ? 'delivered'
              : (isKitchenCategory(state.categories, mi.category) ? 'pending' : 'delivered');

            await apiFetch(`/api/orders/${orderId}/items`, {
              method: "POST",
              body: {
                menuItemId: mi.id,
                name,
                price,
                quantity,
                category: mi.category,
                status,
              },
            });

            await get()._syncFromBackend();
          } catch (e) {
            console.warn("Backend add order item failed; keeping local state", e);
          }
        })();
      },

      cancelComandaOpening: (comandaId) => set((state) => {
        const comanda = state.comandas.find(c => c.id === comandaId);
        if (!comanda) return state;

        // Só permitir se estiver ocupada e total 0 (sem consumo).
        if (comanda.status !== 'occupied') return state;
        if (typeof comanda.total !== 'number' || comanda.total !== 0) return state;

        const orderIds = state.orders
          .filter(o => o.comandaId === comandaId && o.status !== 'closed')
          .map(o => o.id);

        const nextOrders = state.orders.map(o =>
          o.comandaId === comandaId ? { ...o, status: 'closed' as const } : o
        );

        const nextOrderItems = state.orderItems.map(oi => {
          if (!orderIds.includes(oi.orderId)) return oi;
          // Ao cancelar a abertura, não deve ficar como entregue.
          return oi.status === 'canceled' ? oi : { ...oi, status: 'canceled' as const };
        });

        return {
          orders: nextOrders,
          orderItems: nextOrderItems,
          comandas: state.comandas.map(c => c.id === comandaId ? { ...c, status: 'available' as const, total: 0 } : c),
          cartsByComanda: { ...state.cartsByComanda, [comandaId]: [] },
          activeComandaId: state.activeComandaId === comandaId ? null : state.activeComandaId,
        };
      }),

      hydrateFromBackendSnapshot: (snapshot) => set((state) => {
        // Keep local-only UI state such as active comanda and carts.
        // If the backend doesn't support carts yet, we preserve current carts.
        return {
          menuItems: snapshot.menuItems,
          categories: snapshot.categories,
          comandas: snapshot.comandas,
          orders: snapshot.orders,
          orderItems: snapshot.orderItems,
          cartsByComanda: state.cartsByComanda,
          activeComandaId: state.activeComandaId,
        };
      }),
    }),
    {
      name: 'restaurant-pos-storage',
      version: 4,
      migrate: (persisted, version) => {
        // Ensure we always have a safe baseline shape.
        // This prevents hard-to-debug crashes when the persisted data is missing keys
        // or comes from an older format.
        const state = (persisted ?? {}) as Partial<StoreState>;

        const cartsByComanda = (state as any).cartsByComanda;
        const legacyCart = (state as any).cart;

        // Migrate legacy single cart (if exists) into the currently selected comanda cart.
        // This keeps existing users from "losing" the in-progress cart.
        const safeCartsByComanda: Record<number, CartItem[]> = typeof cartsByComanda === 'object' && cartsByComanda
          ? cartsByComanda
          : {};

        const activeId = (typeof state.activeComandaId === 'number') ? state.activeComandaId : null;
        if (activeId && Array.isArray(legacyCart) && legacyCart.length > 0) {
          safeCartsByComanda[activeId] = legacyCart;
        }

        // Migra o status antigo "dirty" para "available".
        const safeComandas = (Array.isArray(state.comandas) && state.comandas.length > 0 ? state.comandas : INITIAL_COMANDAS)
          .map((c: any) => ({
            ...c,
            status: c?.status === 'dirty' ? 'available' : (c?.status ?? 'available'),
            total: typeof c?.total === 'number' ? c.total : 0,
          }));

        const rawCategories = Array.isArray((state as any).categories) && (state as any).categories.length > 0
          ? (state as any).categories
          : INITIAL_CATEGORIES;

        const safeCategories = rawCategories.map((c: any) => ({
          id: String(c?.id ?? '').trim() || 'outros',
          label: String(c?.label ?? c?.id ?? '').trim() || String(c?.id ?? 'outros'),
          sendToKitchen: typeof c?.sendToKitchen === 'boolean' ? c.sendToKitchen : (String(c?.id ?? '').trim().toLowerCase() === 'porcoes'),
        }));

        // Ensure newly added default categories/items appear even for existing users with persisted data.
        const mergedCategories: Category[] = [...safeCategories];
        for (const def of INITIAL_CATEGORIES) {
          if (!mergedCategories.some((c) => c.id === def.id)) mergedCategories.push(def);
        }

        const baseMenuItems = Array.isArray(state.menuItems) && state.menuItems.length > 0 ? state.menuItems : [];
        const mergedMenuItems: MenuItem[] = [...baseMenuItems];
        for (const defItem of INITIAL_MENU_ITEMS) {
          if (!mergedMenuItems.some((it) => it.id === defItem.id)) mergedMenuItems.push(defItem);
        }


        return {
          menuItems: mergedMenuItems.length > 0 ? mergedMenuItems : INITIAL_MENU_ITEMS,
          categories: mergedCategories,
          comandas: safeComandas,
          orders: Array.isArray(state.orders) ? state.orders : [],
          orderItems: Array.isArray(state.orderItems) ? state.orderItems : [],
          cartsByComanda: safeCartsByComanda,
          activeComandaId: typeof state.activeComandaId === 'number' || state.activeComandaId === null ? state.activeComandaId : null,
        } as StoreState;
      },
    }
  )
);

