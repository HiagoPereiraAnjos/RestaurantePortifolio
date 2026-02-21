import type { Comanda, Order, OrderItem } from "@/lib/types";
import type { ReceiptPayment } from "@/lib/receiptPayments";
import { FALLBACK_MESSAGES } from "@/lib/fallbackPolicy";
import { localDateBoundaryMs, toEpochMs } from "@/utils/datetime";

export type PaymentsLoadState = "loading" | "loaded" | "failed";

export type HistoryRow = {
  receiptKey: string;
  receiptId: string | null;
  orderIds: number[];
  comandaId: number;
  comandaNumber: number | null;
  closedAt: string;
  itemsCount: number;
  total: number;
};

export function buildHistoryRows(
  orders: Order[],
  orderItems: OrderItem[],
  comandas: Comanda[],
): HistoryRow[] {
  const closed = orders.filter((o) => o.status === "closed");
  const map = new Map<string, HistoryRow>();

  for (const o of closed) {
    const receiptKey = o.receiptId ? `R:${o.receiptId}` : `O:${o.id}`;
    const comanda = comandas.find((c) => c.id === o.comandaId);
    const items = orderItems.filter((i) => i.orderId === o.id && i.status !== "canceled");
    const total = items.reduce((acc, it) => acc + it.price * it.quantity, 0);
    const itemsCount = items.reduce((acc, it) => acc + it.quantity, 0);
    const closedAt = String(o.closedAt ?? o.paidAt ?? o.createdAt);

    const prev = map.get(receiptKey);
    if (!prev) {
      map.set(receiptKey, {
        receiptKey,
        receiptId: o.receiptId ?? null,
        orderIds: [o.id],
        comandaId: o.comandaId,
        comandaNumber: comanda?.number ?? null,
        closedAt,
        itemsCount,
        total,
      });
      continue;
    }

    map.set(receiptKey, {
      ...prev,
      orderIds: [...prev.orderIds, o.id],
      itemsCount: prev.itemsCount + itemsCount,
      total: prev.total + total,
      // keep latest date across grouped orders
      closedAt: (toEpochMs(closedAt) ?? 0) > (toEpochMs(prev.closedAt) ?? 0) ? closedAt : prev.closedAt,
    });
  }

  return [...map.values()].sort((a, b) => (toEpochMs(b.closedAt) ?? 0) - (toEpochMs(a.closedAt) ?? 0));
}

export function filterHistoryRows(
  rows: HistoryRow[],
  query: string,
  dateFrom: string,
  dateTo: string,
): HistoryRow[] {
  const q = query.trim().toLowerCase();
  const from = dateFrom ? localDateBoundaryMs(dateFrom, "start") : null;
  const to = dateTo ? localDateBoundaryMs(dateTo, "end") : null;

  return rows.filter((r) => {
    const dt = toEpochMs(r.closedAt) ?? 0;
    if (from !== null && dt < from) return false;
    if (to !== null && dt > to) return false;

    if (!q) return true;
    const parts = [
      r.receiptId ?? "",
      String(r.comandaId),
      r.comandaNumber === null ? "" : String(r.comandaNumber),
      r.orderIds.join(","),
    ];
    return parts.some((p) => p.toLowerCase().includes(q));
  });
}

export function resolveReceiptPresentation(args: {
  selectedRow: HistoryRow;
  backendMode: string;
  orders: Order[];
  apiPayments: ReceiptPayment[];
  localPayments: ReceiptPayment[];
  paymentsLoadState?: PaymentsLoadState;
}) {
  const { selectedRow, backendMode, orders, apiPayments, localPayments, paymentsLoadState } = args;
  const receiptId = String(selectedRow.receiptId ?? "").trim();
  const displayReceiptId = receiptId || String(selectedRow.orderIds[0]);

  const shouldUseLocalCache = backendMode !== "api" || paymentsLoadState === "failed";
  const payments = shouldUseLocalCache
    ? (apiPayments.length > 0 ? apiPayments : localPayments)
    : apiPayments;

  const paymentMethods = orders
    .filter((o) => selectedRow.orderIds.includes(o.id))
    .map((o) => String(o.paymentMethod ?? "").trim())
    .filter(Boolean);
  const uniquePaymentMethods = Array.from(new Set(paymentMethods));
  const allowOrderFallback = backendMode !== "api" || !receiptId || paymentsLoadState === "failed" || paymentsLoadState === "loaded";
  const paymentMethod = allowOrderFallback && payments.length === 0 && uniquePaymentMethods.length === 1
    ? uniquePaymentMethods[0]
    : undefined;

  let notice: string | null = null;
  if (backendMode === "api" && !receiptId) {
    notice = FALLBACK_MESSAGES.historyMissingReceiptId;
  }
  if (backendMode === "api" && receiptId && paymentsLoadState === "failed") {
    notice = payments.length > 0
      ? FALLBACK_MESSAGES.historyPaymentsCache
      : FALLBACK_MESSAGES.historyOrderMethodFallback;
  }

  return {
    receiptId,
    displayReceiptId,
    payments,
    paymentMethod,
    notice,
  };
}
