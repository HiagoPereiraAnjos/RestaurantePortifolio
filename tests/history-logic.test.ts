import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHistoryRows,
  filterHistoryRows,
  resolveReceiptPresentation,
} from "../client/src/pages/history.logic.ts";
import type { Comanda, Order, OrderItem } from "../client/src/lib/types.ts";

function sampleData() {
  const comandas: Comanda[] = [
    { id: 1, number: 101, status: "available", total: 0 },
    { id: 2, number: 102, status: "available", total: 0 },
  ];

  const orders: Order[] = [
    {
      id: 10,
      comandaId: 1,
      status: "closed",
      createdAt: "2026-02-01T10:00:00.000Z",
      closedAt: "2026-02-01T11:00:00.000Z",
      receiptId: "R-AAA",
      paymentMethod: "pix",
    },
    {
      id: 11,
      comandaId: 1,
      status: "closed",
      createdAt: "2026-02-01T10:05:00.000Z",
      closedAt: "2026-02-01T11:00:00.000Z",
      receiptId: "R-AAA",
      paymentMethod: "pix",
    },
    {
      id: 12,
      comandaId: 2,
      status: "closed",
      createdAt: "2026-02-02T12:00:00.000Z",
      closedAt: "2026-02-02T12:30:00.000Z",
      receiptId: "R-BBB",
      paymentMethod: "dinheiro",
    },
  ];

  const orderItems: OrderItem[] = [
    { id: 1, orderId: 10, menuItemId: 1, name: "A", price: 1000, quantity: 1, category: "x", status: "delivered" },
    { id: 2, orderId: 11, menuItemId: 2, name: "B", price: 500, quantity: 2, category: "x", status: "delivered" },
    { id: 3, orderId: 12, menuItemId: 3, name: "C", price: 700, quantity: 1, category: "x", status: "delivered" },
  ];

  return { comandas, orders, orderItems };
}

test("buildHistoryRows: groups by receiptId and totals items", () => {
  const { comandas, orders, orderItems } = sampleData();
  const rows = buildHistoryRows(orders, orderItems, comandas);

  assert.equal(rows.length, 2);
  const rA = rows.find((r) => r.receiptId === "R-AAA");
  assert.ok(rA);
  assert.equal(rA.orderIds.length, 2);
  assert.equal(rA.itemsCount, 3);
  assert.equal(rA.total, 2000);
});

test("filterHistoryRows: applies text + date range filters", () => {
  const { comandas, orders, orderItems } = sampleData();
  const rows = buildHistoryRows(orders, orderItems, comandas);

  const onlyB = filterHistoryRows(rows, "R-BBB", "", "");
  assert.equal(onlyB.length, 1);
  assert.equal(onlyB[0].receiptId, "R-BBB");

  const byDate = filterHistoryRows(rows, "", "2026-02-02", "2026-02-02");
  assert.equal(byDate.length, 1);
  assert.equal(byDate[0].receiptId, "R-BBB");
});

test("resolveReceiptPresentation: falls back to order paymentMethod when backend load fails and no payments", () => {
  const { comandas, orders, orderItems } = sampleData();
  const rows = buildHistoryRows(orders, orderItems, comandas);
  const selectedRow = rows.find((r) => r.receiptId === "R-BBB");
  assert.ok(selectedRow);

  const resolved = resolveReceiptPresentation({
    selectedRow,
    backendMode: "api",
    orders,
    apiPayments: [],
    localPayments: [],
    paymentsLoadState: "failed",
  });

  assert.equal(resolved.paymentMethod, "dinheiro");
  assert.match(resolved.notice ?? "", /fallback/i);
});
