import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { useStore } from "@/store/useStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, FileDown, Printer } from "lucide-react";
import { ReceiptPrintArea } from "@/components/receipt/ReceiptPrintArea";
import { apiFetch } from "@/api/http";
import { getBackendMode } from "@/api/config";
import { getReceiptPayments, saveReceiptPayments, type ReceiptPayment } from "@/lib/receiptPayments";
import { formatDateTimeBR, nowIsoUtc } from "@/utils/datetime";
import { buildHistoryWorkbook } from "@/utils/historyExport";
import { buildReceiptText } from "@/utils/receipt";
import {
  buildHistoryRows,
  filterHistoryRows,
  resolveReceiptPresentation,
  type PaymentsLoadState,
} from "@/pages/history.logic";
import * as XLSX from "xlsx";

function formatBRL(cents: number) {
  return `R$ ${(cents / 100).toFixed(2)}`;
}

export default function HistoryPage() {
  const { orders, orderItems, comandas } = useStore();
  const backendMode = getBackendMode();
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selectedReceiptKey, setSelectedReceiptKey] = useState<string | null>(null);
  const [printText, setPrintText] = useState<string>("");
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [paymentsByReceiptId, setPaymentsByReceiptId] = useState<Record<string, ReceiptPayment[]>>({});
  const [paymentsLoadByReceiptId, setPaymentsLoadByReceiptId] = useState<Record<string, PaymentsLoadState>>({});

  // Agrupa por receiptId (quando fechado). Se faltar receiptId, usa key do orderId.
  const rows = useMemo(() => buildHistoryRows(orders, orderItems, comandas), [orders, orderItems, comandas]);

  const filtered = useMemo(() => {
    return filterHistoryRows(rows, query, dateFrom, dateTo);
  }, [rows, query, dateFrom, dateTo]);

  const selected = useMemo(() => {
    if (!selectedReceiptKey) return null;
    const row = rows.find((r) => r.receiptKey === selectedReceiptKey);
    if (!row) return null;
    const items = orderItems.filter((i) => row.orderIds.includes(i.orderId) && i.status !== "canceled");
    return { row, items };
  }, [selectedReceiptKey, rows, orderItems]);

  const selectedReceiptId = useMemo(() => {
    if (!selected) return "";
    return String(selected.row.receiptId ?? "").trim();
  }, [selected]);

  const selectedReceiptData = useMemo(() => {
    if (!selected) return null;

    const receiptId = String(selected.row.receiptId ?? "").trim();
    const apiPayments = receiptId ? paymentsByReceiptId[receiptId] ?? [] : [];
    const localPayments = receiptId ? getReceiptPayments(receiptId) : [];
    const loadState = receiptId ? paymentsLoadByReceiptId[receiptId] : undefined;

    return resolveReceiptPresentation({
      selectedRow: selected.row,
      backendMode,
      orders,
      apiPayments,
      localPayments,
      paymentsLoadState: loadState,
    });
  }, [selected, paymentsByReceiptId, paymentsLoadByReceiptId, orders, backendMode]);

// Fetch payments from backend for cross-device reprint (when in API mode).
useEffect(() => {
  if (backendMode !== "api") return;
  if (!selectedReceiptId) return;
  const current = paymentsLoadByReceiptId[selectedReceiptId];
  if (current === "loading" || current === "loaded") return;

  let cancelled = false;
  setPaymentsLoadByReceiptId((prev) => ({ ...prev, [selectedReceiptId]: "loading" }));
  (async () => {
    try {
      const rows = await apiFetch<{ receiptId: string; method: string; amountCents: number }[]>(
        `/api/receipts/${encodeURIComponent(selectedReceiptId)}/payments`,
      );
      const mapped = (rows ?? [])
        .map((p) => ({ method: String(p.method), amountCents: Number(p.amountCents) }))
        .filter((p) => p.method && Number.isFinite(p.amountCents) && p.amountCents > 0);
      if (!cancelled) {
        saveReceiptPayments(selectedReceiptId, mapped);
        setPaymentsByReceiptId((prev) => ({ ...prev, [selectedReceiptId]: mapped }));
        setPaymentsLoadByReceiptId((prev) => ({ ...prev, [selectedReceiptId]: "loaded" }));
      }
    } catch {
      if (!cancelled) {
        setPaymentsLoadByReceiptId((prev) => ({ ...prev, [selectedReceiptId]: "failed" }));
      }
    }
  })();

  return () => {
    cancelled = true;
  };
}, [backendMode, selectedReceiptId, paymentsLoadByReceiptId]);

  const exportXlsx = () => {
    const wb = buildHistoryWorkbook({ rows: filtered, orders });
    const stamp = nowIsoUtc().slice(0, 10);
    XLSX.writeFile(wb, `historico_${stamp}.xlsx`);
  };

  const buildSelectedReceiptText = () => {
    if (!selected || !selectedReceiptData) return "";
    const total = selected.items.reduce((acc, it) => acc + it.price * it.quantity, 0);

    return buildReceiptText({
      comandaId: selected.row.comandaId,
      comandaNumber: selected.row.comandaNumber,
      closedAtISO: selected.row.closedAt,
      items: selected.items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
      totalCents: total,
      payments: selectedReceiptData.payments,
      paymentMethod: selectedReceiptData.paymentMethod,
      footerLines: [`Recibo: ${selectedReceiptData.displayReceiptId}`, `Comanda (ID): ${selected.row.comandaId}`],
    });
  };

  return (
    <Layout>
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold">Histórico</h1>
            <p className="text-muted-foreground">
              Pedidos fechados. Aqui você vê <strong>ID da Comanda</strong> e <strong>Número da Comanda</strong> (não confundir).
            </p>
          </div>

          <div className="relative w-full md:w-[320px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por recibo / ID da comanda / número..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-6">
          <div className="md:col-span-3">
            <Label>De</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <Label>Até</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="md:col-span-6 flex items-end justify-end gap-2">
            <Button variant="outline" onClick={exportXlsx} className="gap-2">
              <FileDown className="h-4 w-4" /> Exportar Excel
            </Button>
          </div>
        </div>

        <Card className="shadow-lg border-2 overflow-hidden">
          <CardHeader className="border-b bg-muted/10">
            <div className="flex items-center justify-between gap-4">
              <CardTitle>Pedidos Fechados</CardTitle>
              <Badge variant="secondary" className="font-mono">{filtered.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recibo</TableHead>
                    <TableHead>Comanda (ID)</TableHead>
                    <TableHead>Nº Comanda</TableHead>
                    <TableHead>Itens</TableHead>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        Nenhum pedido encontrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => (
                      <TableRow
                        key={r.receiptKey}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => {
                          setSelectedReceiptKey(r.receiptKey);
                          setReceiptDialogOpen(true);
                        }}
                      >
                        <TableCell className="font-mono font-semibold">
                          {r.receiptId ? r.receiptId : <span className="text-muted-foreground">(sem receiptId)</span>}
                        </TableCell>
                        <TableCell className="font-mono">{r.comandaId}</TableCell>
                        <TableCell className="font-bold">
                          {r.comandaNumber ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>{r.itemsCount}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTimeBR(r.closedAt)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">{formatBRL(r.total)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Reimpressão de recibo</DialogTitle>
              <DialogDescription className="sr-only">Pré-visualização do recibo para impressão térmica.</DialogDescription>
            </DialogHeader>

            {selected ? (
              <div className="rounded-md border bg-white p-3">
                {selectedReceiptData?.notice ? (
                  <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                    {selectedReceiptData.notice}
                  </div>
                ) : null}
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                  {buildSelectedReceiptText()}
                </pre>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Nenhum recibo selecionado.</div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setReceiptDialogOpen(false)}>
                Fechar
              </Button>
              <Button
                onClick={() => {
                  if (!selected) return;
                  const text = buildSelectedReceiptText();
                  setPrintText(text);
                  setReceiptDialogOpen(false);
                  setTimeout(() => window.print(), 50);
                }}
              >
                <Printer className="h-4 w-4 mr-2" /> Imprimir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ReceiptPrintArea title="Recibo" text={printText} className="print:block" />
      </div>
    </Layout>
  );
}

/*
RECEIPT MAP (History reprint)
- buildReceiptText(input) in client/src/utils/receipt.ts builds the receipt text.
  Uses: comandaId, comandaNumber, closedAtISO (prefers closedAt/paidAt/createdAt), items[{name, quantity, price}],
  totalCents, payments[{method, amountCents}], paymentMethod
  Payment labels via paymentLabel() in client/src/lib/receiptPayments.ts; method label mapping in client/src/utils/receipt.ts
- rows source: useStore() orders (status "closed"), orderItems, comandas
  closedAt uses o.closedAt ?? o.paidAt ?? o.createdAt; items filtered status != "canceled"
- payment source priority:
  1) API mode: GET /api/receipts/:receiptId/payments
  2) local fallback: getReceiptPayments(receiptId) (same device)
  3) final fallback: orders[].paymentMethod (only when no payments)
- payments source:
  API mode: GET /api/receipts/:receiptId/payments (server/routes.ts)
  fallback: getReceiptPayments(receiptId) localStorage
- orders source in API mode: store hydrated via GET /api/state (client/src/api/state.ts)
- print path: setPrintText(...) then window.print(); print area uses ReceiptPrintArea
*/





