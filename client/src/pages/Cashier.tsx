import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { useStore } from "@/store/useStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DollarSign, Printer, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { hasBlockingKitchenItems, getItemsForComanda, getOpenOrdersForComanda } from "@/lib/domain";
import { getBackendMode } from "@/api/config";
import { apiFetch } from "@/api/http";
import { canUseApiLocalFallback, FALLBACK_MESSAGES } from "@/lib/fallbackPolicy";
import { saveReceiptPayments } from "@/lib/receiptPayments";
import { buildReceiptText } from "@/utils/receipt";
import { nowIsoUtc } from "@/utils/datetime";

type PaymentMethod = "dinheiro" | "pix" | "debito" | "credito" | "vale" | "outros";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "debito", label: "Cartão Débito" },
  { value: "credito", label: "Cartão Crédito" },
  { value: "vale", label: "Vale/Refeição" },
  { value: "outros", label: "Outros" },
];

export default function CashierPage() {
  const { comandas, orders, orderItems, categories, finalizeComanda, _syncFromBackend } = useStore();
  const [selectedComandaId, setSelectedComandaId] = useState<number | null>(null);
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  // Split payment state (Caixa)
  const [splitCount, setSplitCount] = useState<number>(1);
  const [payments, setPayments] = useState<{ method: PaymentMethod; amountCents: number }[]>([
    { method: "pix", amountCents: 0 },
  ]);
  const [receiptSnapshot, setReceiptSnapshot] = useState<null | {
    comandaId: number;
    receiptId: string;
    items: { id: number; name: string; quantity: number; price: number }[];
    totalCents: number;
    closedAtISO: string;
    splitCount: number;
    payments: { method: PaymentMethod; amountCents: number }[];
  }>(null);

  const { toast } = useToast();

  // Caixa foca em pagamentos para comandas ocupadas.
  const occupiedComandas = useMemo(
    () => comandas.filter((c) => c.status === "occupied").sort((a, b) => a.number - b.number),
    [comandas],
  );
  const selectedComanda = comandas.find(c => c.id === selectedComandaId);

  useEffect(() => {
    if (!checkoutDialogOpen) return;
    if (!selectedComanda) return;
    // Reset to a safe default every time the checkout dialog opens.
    const total = selectedComanda.total ?? 0;
    setSplitCount(1);
    setPayments([{ method: "pix", amountCents: total }]);
  }, [checkoutDialogOpen, selectedComanda]);

  // Get all items for this comanda
  const comandaItems = selectedComandaId ? getItemsForComanda(orderItems, orders, selectedComandaId) : [];
  
  // Only kitchen flow blocks closing: pending or preparing portions.
  const hasPendingItems = selectedComandaId ? hasBlockingKitchenItems(orderItems, orders, categories, selectedComandaId) : false;

  const backendMode = getBackendMode();

  const generateReceiptId = (comandaId: number) => {
    const ts = Date.now().toString(36).toUpperCase();
    return `CMD${comandaId}-${ts}`;
  };

  const receiptText = receiptSnapshot
  ? buildReceiptText({
      comandaId: receiptSnapshot.comandaId,
      closedAtISO: receiptSnapshot.closedAtISO,
      items: receiptSnapshot.items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
      totalCents: receiptSnapshot.totalCents,
      payments: receiptSnapshot.payments,
      footerLines: [`Recibo: ${receiptSnapshot.receiptId}`],
    })
  : "";

  const printReceipt = () => {
    // Impressão in-page (evita bloqueio de popup do navegador)
    // A área de impressão fica disponível apenas no modo print via classes Tailwind.
    window.print();
  };

  const handleCloseBill = () => {
    if (hasPendingItems) {
      toast({
        title: "Atenção",
        description: "Existem itens pendentes na cozinha para esta comanda.",
        variant: "destructive"
      });
      return;
    }
    setCheckoutDialogOpen(true);
  };

  const setPeopleSplit = (count: number) => {
    const c = Math.max(1, Math.min(10, Math.floor(count || 1)));
    setSplitCount(c);
    const total = selectedComanda?.total ?? 0;

    if (c === 1) {
      // Keep current method, just set total.
      setPayments((prev) => [{ method: prev?.[0]?.method ?? "pix", amountCents: total }]);
      return;
    }

    const base = Math.floor(total / c);
    const remainder = total - base * c;

    setPayments((prev) => {
      const next: { method: PaymentMethod; amountCents: number }[] = [];
      for (let i = 0; i < c; i++) {
        const method = prev?.[i]?.method ?? prev?.[0]?.method ?? "pix";
        const amount = base + (i < remainder ? 1 : 0);
        next.push({ method, amountCents: amount });
      }
      return next;
    });
  };

  const paymentsSum = payments.reduce((acc, p) => acc + (p.amountCents || 0), 0);
  const totalCentsForCheckout = selectedComanda?.total ?? 0;
  const totalMismatch = paymentsSum !== totalCentsForCheckout;

  const confirmPayment = async () => {
    if (!selectedComandaId) return;
    if (totalMismatch) {
      toast({
        title: "Pagamento inválido",
        description: "A soma das partes não bate com o total da comanda.",
        variant: "destructive",
      });
      return;
    }

    if (isConfirming) return;
    setIsConfirming(true);

    const itemsBeforeClose = getItemsForComanda(orderItems, orders, selectedComandaId);
    const paymentMethodForFinalize = (() => {
      const methods = (payments ?? [])
        .filter((p) => (p?.amountCents ?? 0) > 0)
        .map((p) => p.method);
      const unique = Array.from(new Set(methods));
      return unique.length === 1 ? unique[0] : undefined;
    })();

    let receiptId: string | false = false;
    try {
      if (backendMode === "api") {
        // API mode: finalize all open orders for this comanda on the server.
        let openOrders = getOpenOrdersForComanda(orders, selectedComandaId);

        // Fallback: some backends store orders.comandaId as comanda.number.
        if (openOrders.length === 0) {
          const comanda = comandas.find((c) => c.id === selectedComandaId);
          if (comanda) {
            openOrders = getOpenOrdersForComanda(orders, comanda.number as any);
          }
        }
        if (openOrders.length === 0) {
          toast({
            title: "Nao foi possivel finalizar",
            description: FALLBACK_MESSAGES.cashierNoOpenOrdersApi,
            variant: "destructive",
          });
          setIsConfirming(false);
          return;
        }
        receiptId = generateReceiptId(selectedComandaId);

        for (const o of openOrders) {
          await apiFetch(`/api/orders/${o.id}/finalize`, {
            method: "POST",
            body: { receiptId, paymentMethod: paymentMethodForFinalize },
          });
        }

        // Refresh local store from backend snapshot (authoritative).
        await _syncFromBackend();
      } else {
        // Offline/local mode.
        receiptId = finalizeComanda(selectedComandaId);
        if (!receiptId) {
          toast({
            title: "Atenção",
            description: "Existem itens pendentes na cozinha para esta comanda.",
            variant: "destructive",
          });
          setIsConfirming(false);
          return;
        }
      }
    } catch (e: any) {
      if (canUseApiLocalFallback()) {
        // Contingency fallback (opt-in when backend mode is api).
        receiptId = finalizeComanda(selectedComandaId);
        if (!receiptId) {
          toast({
            title: "Falha ao finalizar",
            description: "Não foi possível finalizar via backend, e existem itens pendentes.",
            variant: "destructive",
          });
          setIsConfirming(false);
          return;
        }
        toast({
          title: "Aviso",
          description: FALLBACK_MESSAGES.cashierFinalizeOfflineFallback,
        });
      } else {
        toast({
          title: "Falha ao finalizar",
          description: FALLBACK_MESSAGES.cashierFinalizeBlocked,
          variant: "destructive",
        });
        setIsConfirming(false);
        return;
      }
    }

    const snapshot = {
      comandaId: selectedComandaId,
      receiptId,
      items: itemsBeforeClose,
      totalCents: itemsBeforeClose
        .filter((i) => i.status !== "canceled")
        .reduce((acc, i) => acc + i.price * i.quantity, 0),
      closedAtISO: nowIsoUtc(),
      splitCount,
      payments: payments.map(p => ({ method: p.method, amountCents: p.amountCents })),
    };

    // Persist payments for later reprint (Histórico/Admin).
    if (typeof receiptId === "string") {
      saveReceiptPayments(receiptId, snapshot.payments);

      // When in API mode, also persist in the database for cross-device reprint.
      if (backendMode === "api") {
        try {
          await apiFetch(`/api/receipts/${encodeURIComponent(receiptId)}/payments`, {
            method: "PUT",
            body: { payments: snapshot.payments },
          });
        } catch {
          toast({
            title: "Aviso",
            description: FALLBACK_MESSAGES.cashierPaymentsCache,
          });
        }
      }
    }

    setReceiptSnapshot(snapshot);
    setReceiptDialogOpen(true);

    setCheckoutDialogOpen(false);
    setSelectedComandaId(null);
    toast({
      title: "Pagamento confirmado",
      description: "Comanda fechada e liberada (livre).",
      className: "bg-emerald-500 text-white"
    });

    setIsConfirming(false);
  };

  return (
    <Layout>
      <div className="flex flex-col lg:flex-row h-full bg-muted/20 overflow-hidden print:hidden">
        {/* Left List */}
        <div className={cn(
          "lg:w-80 border-r bg-card flex flex-col transition-all duration-300",
          selectedComandaId ? "hidden lg:flex" : "flex w-full"
        )}>
          <div className="p-4 border-b flex justify-between items-center">
            <h2 className="font-display font-bold text-xl">Comandas Abertas</h2>
          </div>
          <ScrollArea className="flex-1">
            <div className="divide-y">
              {occupiedComandas.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  Nenhuma comanda aberta
                </div>
              ) : (
                occupiedComandas.map(comanda => (
                  <button
                    key={comanda.id}
                    onClick={() => setSelectedComandaId(comanda.id)}
                    className={cn(
                      "w-full p-4 text-left hover:bg-muted/50 transition-colors flex justify-between items-center",
                      selectedComandaId === comanda.id && "bg-primary/5 border-l-4 border-primary"
                    )}
                  >
                    <div>
                      <span className="font-display font-bold text-lg">#{comanda.number}</span>
                      <div className="text-xs font-bold uppercase tracking-wider mt-1 text-blue-500">
                        Ocupada
                      </div>
                    </div>
                    <span className="font-mono font-medium text-lg">
                      R$ {(comanda.total / 100).toFixed(2)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right Detail */}
        <div className={cn(
          "flex-1 flex flex-col p-4 lg:p-6 overflow-hidden transition-all duration-300",
          !selectedComandaId ? "hidden lg:flex" : "flex w-full"
        )}>
          {selectedComanda ? (
            <div className="max-w-2xl mx-auto w-full h-full flex flex-col">
              <Button 
                variant="ghost" 
                className="lg:hidden self-start mb-4 pl-0"
                onClick={() => setSelectedComandaId(null)}
              >
                ← Voltar para lista
              </Button>
              <Card className="flex-1 flex flex-col shadow-lg border-2 overflow-hidden">
                <CardHeader className="bg-muted/30 border-b pb-4 lg:pb-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div>
                      <CardTitle className="text-2xl lg:text-3xl font-display mb-1">Comanda #{selectedComanda.number}</CardTitle>
                      <CardDescription>Resumo do consumo</CardDescription>
                    </div>
                    <div className="sm:text-right w-full sm:w-auto">
                      <div className="text-xs lg:text-sm text-muted-foreground mb-1">Total a Pagar</div>
                      <div className="text-3xl lg:text-4xl font-mono font-bold text-primary">
                        R$ {(selectedComanda.total / 100).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
                  <ScrollArea className="flex-1 p-4 lg:p-6">
                    <table className="w-full">
                      <thead className="text-xs text-muted-foreground uppercase tracking-wider text-left border-b">
                        <tr>
                          <th className="pb-2 font-medium">Qtd</th>
                          <th className="pb-2 font-medium">Item</th>
                          <th className="pb-2 font-medium text-right hidden sm:table-cell">Unit.</th>
                          <th className="pb-2 font-medium text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {comandaItems.map((item, idx) => (
                          <tr key={`${item.id}-${idx}`} className="text-sm">
                            <td className="py-3 w-10 lg:w-12 font-medium">{item.quantity}x</td>
                            <td className="py-3 pr-2">{item.name}</td>
                            <td className="py-3 text-right text-muted-foreground hidden sm:table-cell">{(item.price / 100).toFixed(2)}</td>
                            <td className="py-3 text-right font-medium">{(item.price * item.quantity / 100).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>

                  <div className="p-4 lg:p-6 border-t bg-muted/10 space-y-3 lg:space-y-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>R$ {(selectedComanda.total / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xl font-bold">
                      <span>Total</span>
                      <span>R$ {(selectedComanda.total / 100).toFixed(2)}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4 mt-4 lg:mt-6">
<Button 
                        className="h-12 bg-emerald-600 hover:bg-emerald-700 text-lg font-bold shadow-lg shadow-emerald-900/10 order-1 sm:order-2"
                        onClick={handleCloseBill}
                        disabled={hasPendingItems}
                      >
                        {hasPendingItems ? <Lock className="mr-2 h-4 w-4" /> : <DollarSign className="mr-2 h-4 w-4" />}
                        Fechar Conta
                      </Button>
                    </div>

                    {hasPendingItems ? (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        Bloqueado: existem porções na cozinha em <strong>pendente</strong> ou <strong>preparo</strong>.
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-50 p-4 text-center">
              <DollarSign className="h-12 lg:h-16 w-12 lg:w-16 mb-4" />
              <h2 className="text-lg lg:text-xl font-medium">Selecione uma comanda para pagamento</h2>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={checkoutDialogOpen} onOpenChange={setCheckoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Pagamento</AlertDialogTitle>
            <AlertDialogDescription>
              Isso irá fechar a comanda #{selectedComanda?.number} e liberá-la para uso.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="mt-2">
            <strong className="block text-foreground">
              Total: R$ {(selectedComanda ? selectedComanda.total / 100 : 0).toFixed(2)}
            </strong>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <Label>Dividir conta</Label>
                <div className="text-xs text-muted-foreground">Selecione o número de pessoas (1 a 10).</div>
              </div>
              <Input
                className="w-24"
                type="number"
                min={1}
                max={10}
                value={splitCount}
                onChange={(e) => setPeopleSplit(Number(e.target.value))}
              />
            </div>

            {splitCount === 1 ? (
              <div className="space-y-1">
                <Label>Forma de pagamento</Label>
                <Select
                  value={payments[0]?.method ?? "pix"}
                  onValueChange={(v) =>
                    setPayments([{ method: v as PaymentMethod, amountCents: totalCentsForCheckout }])
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">
                  Ajuste valores/forma se necessário. A soma deve bater com o total.
                </div>
                <div className="space-y-2">
                  {payments.map((p, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-2 text-sm font-medium">P{idx + 1}</div>
                      <div className="col-span-6">
                        <Select
                          value={p.method}
                          onValueChange={(v) =>
                            setPayments((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, method: v as PaymentMethod } : x))
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Forma" />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_METHODS.map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-4">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={(p.amountCents / 100).toFixed(2)}
                          onChange={(e) => {
                            const val = Number(String(e.target.value).replace(",", "."));
                            const cents = Number.isFinite(val) ? Math.round(val * 100) : 0;
                            setPayments((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, amountCents: cents } : x))
                            );
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {totalMismatch ? (
                  <div className="text-xs text-destructive">
                    A soma dos pagamentos (R$ {(paymentsSum / 100).toFixed(2)}) precisa ser igual ao total (R${" "}
                    {(totalCentsForCheckout / 100).toFixed(2)}).
                  </div>
                ) : null}
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPayment} className="bg-emerald-600 hover:bg-emerald-700">
              Confirmar Recebimento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recibo</DialogTitle>
            <DialogDescription className="sr-only">Pré-visualização do recibo de fechamento.</DialogDescription>
          </DialogHeader>

          {receiptSnapshot ? (
            <div className="rounded-md border bg-white p-3">
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                {receiptText}
              </pre>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Sem dados do recibo.</div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setReceiptDialogOpen(false)}
            >
              Não imprimir
            </Button>
            <Button
              onClick={() => {
                setReceiptDialogOpen(false);
                setTimeout(() => printReceipt(), 50);
              }}
            >
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Área exclusiva para impressão (térmica 80mm) */}
      <div id="print-receipt" className="hidden print:block">
        <pre className="whitespace-pre-wrap font-mono text-[12px] leading-[1.25]">
          {receiptText}
        </pre>
      </div>

    </Layout>
  );
}
/*
RECEIPT MAP (Cashier)
- buildReceiptText(input) in client/src/utils/receipt.ts builds the receipt text.
  Uses: comandaId, closedAtISO, items[{name, quantity, price}], totalCents, payments[{method, amountCents}],
  footerLines for custom id line; includes "Forma de pagamento" line with mapping in utils/receipt.ts
  Payment labels for split lines via paymentLabel() in client/src/lib/receiptPayments.ts
- receiptSnapshot created in confirmPayment() from:
  itemsBeforeClose (orders + orderItems), selectedComandaId, receiptId (generateReceiptId/finalizeComanda),
  closedAtISO = new Date().toISOString(), splitCount, payments
- print path: printReceipt() -> window.print(); print area is div#print-receipt using receiptText
*/



