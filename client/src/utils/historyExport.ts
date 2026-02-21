import type { Order } from "@/lib/types";
import type { HistoryRow } from "@/pages/history.logic";
import { formatDateTimeBR, toDateOrNull, toEpochMs } from "@/utils/datetime";
import * as XLSX from "xlsx";

type HistoryExportInput = {
  rows: HistoryRow[];
  orders: Order[];
};

export function buildHistoryWorkbook(input: HistoryExportInput): XLSX.WorkBook {
  const { rows, orders } = input;
  const moneyFmt = '"R$" #,##0.00';
  const tableRows = rows.map((r) => ({
    recibo: r.receiptId ?? "(sem receiptId)",
    comandaId: r.comandaId,
    comandaNumero: r.comandaNumber ?? "",
    pedidos: r.orderIds.join(","),
    itens: r.itemsCount,
    dataHora: formatDateTimeBR(r.closedAt),
    total: r.total / 100,
    closedAtMs: toEpochMs(r.closedAt) ?? 0,
    orderIds: r.orderIds,
  }));
  const totalGeral = tableRows.reduce((acc, r) => acc + r.total, 0);

  const historicoAoa: (string | number)[][] = [
    ["Recibo", "Comanda ID", "Nº Comanda", "Pedidos", "Itens", "Data/Hora", "Total"],
    ...tableRows.map((r) => [r.recibo, r.comandaId, r.comandaNumero, r.pedidos, r.itens, r.dataHora, r.total]),
    ["", "", "", "", "", "TOTAL GERAL", totalGeral],
  ];
  const ws = XLSX.utils.aoa_to_sheet(historicoAoa);
  const firstDataRow = 1;
  const lastMoneyRow = tableRows.length + 1; // includes TOTAL GERAL row
  for (let row = firstDataRow; row <= lastMoneyRow; row++) {
    const cell = ws[XLSX.utils.encode_cell({ c: 6, r: row })];
    if (cell && typeof cell.v === "number") cell.z = moneyFmt;
  }
  ws["!cols"] = [
    { wch: 22 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 8 },
    { wch: 20 },
    { wch: 14 },
  ];

  const periodStartDate = tableRows.length ? toDateOrNull(Math.min(...tableRows.map((r) => r.closedAtMs))) : null;
  const periodEndDate = tableRows.length ? toDateOrNull(Math.max(...tableRows.map((r) => r.closedAtMs))) : null;
  const periodStart = periodStartDate ? periodStartDate.toLocaleString("pt-BR") : "-";
  const periodEnd = periodEndDate ? periodEndDate.toLocaleString("pt-BR") : "-";

  const totalByMethod = new Map<string, number>();
  for (const r of tableRows) {
    const methods = orders
      .filter((o) => r.orderIds.includes(o.id))
      .map((o) => String(o.paymentMethod ?? "").trim())
      .filter(Boolean);
    const uniq = Array.from(new Set(methods));
    const methodLabel = uniq.length === 1 ? uniq[0] : uniq.length > 1 ? "multiplos" : "nao informado";
    totalByMethod.set(methodLabel, (totalByMethod.get(methodLabel) ?? 0) + r.total);
  }

  const resumoAoa: (string | number)[][] = [
    ["Resumo do Histórico (filtro atual)"],
    ["Período (início)", periodStart],
    ["Período (fim)", periodEnd],
    ["Quantidade de recibos", tableRows.length],
    ["Total de itens", tableRows.reduce((acc, r) => acc + r.itens, 0)],
    ["Total geral", totalGeral],
    [],
    ["Total por forma de pagamento", ""],
    ["Forma", "Total"],
    ...Array.from(totalByMethod.entries()).map(([method, total]) => [method, total]),
  ];
  const wsResumo = XLSX.utils.aoa_to_sheet(resumoAoa);
  const resumoTotalCell = wsResumo[XLSX.utils.encode_cell({ c: 1, r: 5 })];
  if (resumoTotalCell && typeof resumoTotalCell.v === "number") resumoTotalCell.z = moneyFmt;
  const methodStartRow = 9;
  const methodEndRow = methodStartRow + totalByMethod.size - 1;
  for (let row = methodStartRow; row <= methodEndRow; row++) {
    const cell = wsResumo[XLSX.utils.encode_cell({ c: 1, r: row })];
    if (cell && typeof cell.v === "number") cell.z = moneyFmt;
  }
  wsResumo["!cols"] = [{ wch: 34 }, { wch: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Historico");
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");
  return wb;
}
