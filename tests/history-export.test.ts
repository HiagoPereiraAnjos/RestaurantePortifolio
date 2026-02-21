import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { buildHistoryWorkbook } from "../client/src/utils/historyExport.ts";
import type { Order } from "../client/src/lib/types.ts";
import type { HistoryRow } from "../client/src/pages/history.logic.ts";

test("history export: creates workbook with Historico/Resumo and TOTAL GERAL", () => {
  const rows: HistoryRow[] = [
    {
      receiptKey: "R:AAA",
      receiptId: "AAA",
      orderIds: [1],
      comandaId: 10,
      comandaNumber: 110,
      closedAt: "2026-02-02T12:00:00.000Z",
      itemsCount: 2,
      total: 2500,
    },
    {
      receiptKey: "R:BBB",
      receiptId: "BBB",
      orderIds: [2],
      comandaId: 11,
      comandaNumber: 111,
      closedAt: "2026-02-03T12:00:00.000Z",
      itemsCount: 1,
      total: 1000,
    },
  ];
  const orders: Order[] = [
    { id: 1, comandaId: 10, status: "closed", createdAt: "2026-02-02T12:00:00.000Z", paymentMethod: "pix" },
    { id: 2, comandaId: 11, status: "closed", createdAt: "2026-02-03T12:00:00.000Z", paymentMethod: "dinheiro" },
  ];

  const wb = buildHistoryWorkbook({ rows, orders });
  assert.deepEqual(wb.SheetNames, ["Historico", "Resumo"]);

  const ws = wb.Sheets.Historico!;
  assert.equal(ws["F4"]?.v, "TOTAL GERAL");
  assert.equal(ws["G4"]?.v, 35);

  const wsResumo = wb.Sheets.Resumo!;
  assert.equal(wsResumo["A1"]?.v, "Resumo do Histórico (filtro atual)");
  assert.equal(wsResumo["A4"]?.v, "Quantidade de recibos");
  assert.equal(wsResumo["B4"]?.v, 2);
});

test("history export: generated xlsx binary is readable", () => {
  const wb = buildHistoryWorkbook({
    rows: [
      {
        receiptKey: "R:X",
        receiptId: "X",
        orderIds: [1],
        comandaId: 1,
        comandaNumber: 1,
        closedAt: "2026-02-02T00:00:00.000Z",
        itemsCount: 1,
        total: 1000,
      },
    ],
    orders: [{ id: 1, comandaId: 1, status: "closed", createdAt: "2026-02-02T00:00:00.000Z", paymentMethod: "pix" }],
  });
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  assert.ok(buf.byteLength > 0);

  const reparsed = XLSX.read(buf, { type: "buffer" });
  assert.deepEqual(reparsed.SheetNames, ["Historico", "Resumo"]);
});
