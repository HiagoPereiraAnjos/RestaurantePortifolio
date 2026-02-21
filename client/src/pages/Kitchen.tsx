import { Layout } from "@/components/layout/Layout";
import { useStore } from "@/store/useStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, History, RotateCcw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/pt-br";
import { countKitchenStatuses, getOpenOrdersForComanda, isKitchenItem, isKitchenCategory } from "@/lib/domain";
import { useMemo, useState } from "react";
import { toEpochMs } from "@/utils/datetime";

dayjs.extend(relativeTime);
dayjs.locale("pt-br");

type HistoryTab = "ready" | "canceled";

export default function KitchenPage() {
  const { orderItems, orders, comandas, categories, updateOrderItemStatus } = useStore();
  const [historyTab, setHistoryTab] = useState<HistoryTab>("ready");

  const kitchenItems = useMemo(() => orderItems.filter((it) => isKitchenCategory(categories, it.category)), [orderItems, categories]);

  const comandaGroups = useMemo(() => {
    return comandas
      .map((comanda) => {
        const openOrders = getOpenOrdersForComanda(orders, comanda.id)
          .sort((a, b) => (toEpochMs(a.createdAt) ?? 0) - (toEpochMs(b.createdAt) ?? 0));
        const openOrderIds = openOrders.map((o) => o.id);
        const items = kitchenItems.filter((i) => openOrderIds.includes(i.orderId));

        const pending = items.filter((i) => i.status === "pending");
        const preparing = items.filter((i) => i.status === "preparing");
        const ready = items.filter((i) => i.status === "ready" || i.status === "delivered");
        const canceled = items.filter((i) => i.status === "canceled");

        const oldest =
          [...pending, ...preparing]
            .map((i) => i.id) // fallback (we don't have timestamps)
            .sort((a, b) => a - b)[0] ?? null;

        const counts = countKitchenStatuses(items);

        return {
          comanda,
          items,
          pending,
          preparing,
          ready,
          canceled,
          oldestCreatedAt: oldest,
          counts,
        };
      })
      .filter((g) => g.items.length > 0)
      .sort((a, b) => {
        const ta = a.oldestCreatedAt ?? 0;
        const tb = b.oldestCreatedAt ?? 0;
        return ta - tb;
      });
  }, [comandas, orders, kitchenItems]);

  const queueGroups = useMemo(
    () => comandaGroups.filter((g) => g.pending.length > 0 || g.preparing.length > 0),
    [comandaGroups]
  );

  const readyHistory = useMemo(() => {
    const all = comandaGroups.flatMap((g) =>
      g.ready.map((item) => ({ comanda: g.comanda, item }))
    );
    return all.sort((a, b) => b.item.id - a.item.id);
  }, [comandaGroups]);

  const canceledHistory = useMemo(() => {
    const all = comandaGroups.flatMap((g) =>
      g.canceled.map((item) => ({ comanda: g.comanda, item }))
    );
    return all.sort((a, b) => b.item.id - a.item.id);
  }, [comandaGroups]);

  return (
    <Layout>
      <div className="h-full flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 py-4 lg:py-6">
            {/* Fila */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-bold">Fila da cozinha</h2>
              </div>
              <div className="text-sm text-muted-foreground">
                {queueGroups.length} comandas com itens
              </div>
            </div>

            {queueGroups.length === 0 ? (
              <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground flex flex-col items-center">
                <CheckCircle className="h-16 w-16 mb-4" />
                <h2 className="text-xl font-medium">Tudo limpo por aqui!</h2>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {queueGroups.map((group) => {
                  const waitTime = group.oldestCreatedAt ? dayjs(group.oldestCreatedAt).fromNow(true) : "";
                  return (
                    <Card key={group.comanda.id} className="border-2 shadow-lg relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1.5 bg-yellow-400 animate-pulse" />

                      <CardHeader className="bg-muted/30 pb-3 border-b">
                        <div className="flex justify-between items-start">
                          <CardTitle className="text-xl font-bold flex flex-col">
                            <span className="text-xs font-medium text-muted-foreground">Comanda</span>
                            <span>#{group.comanda.number}</span>
                          </CardTitle>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{waitTime}</span>
                            </div>
                            <div className="text-sm font-medium mt-1">
                              {group.counts.pending + group.counts.preparing} na fila
                            </div>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="p-0">
                        {/* Pendentes */}
                        {group.pending.length > 0 ? (
                          <div className="p-3 pb-2">
                            <div className="text-xs font-semibold text-muted-foreground">Pendente</div>
                          </div>
                        ) : null}

                        {group.pending.map((item) => (
                          <div key={item.id} className="p-3 lg:p-4 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                              <span className="font-bold text-base lg:text-lg leading-tight">
                                {item.quantity}x {item.name}
                              </span>
                            </div>

                            <div className="flex gap-2">
                              <Button
                                size="default"
                                className="flex-1 bg-blue-600 hover:bg-blue-700 h-10 lg:h-11 font-bold"
                                onClick={() => updateOrderItemStatus(item.id, "preparing")}
                              >
                                Preparar
                              </Button>
                              <Button
                                size="default"
                                variant="destructive"
                                className="h-10 lg:h-11 font-bold"
                                onClick={() => updateOrderItemStatus(item.id, "canceled")}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ))}

                        {/* Em preparo */}
                        {group.preparing.length > 0 ? (
                          <div className="p-3 pb-2 bg-blue-50/40">
                            <div className="text-xs font-semibold text-blue-700">Em preparo</div>
                          </div>
                        ) : null}

                        {group.preparing.map((item) => (
                          <div
                            key={item.id}
                            className={cn("p-3 lg:p-4 transition-colors", "bg-blue-50/30")}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className="font-bold text-base lg:text-lg leading-tight">
                                {item.quantity}x {item.name}
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-2 mt-2">
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-10 lg:h-11 w-10 lg:w-11 shrink-0 border-2"
                                onClick={() => updateOrderItemStatus(item.id, "pending")}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>

                              <Button
                                size="default"
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-10 lg:h-11 font-bold"
                                onClick={() => updateOrderItemStatus(item.id, "ready")}
                              >
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Pronto
                              </Button>

                              <Button
                                size="default"
                                variant="destructive"
                                className="h-10 lg:h-11 font-bold"
                                onClick={() => updateOrderItemStatus(item.id, "canceled")}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Histórico */}
            <div className="mt-4 lg:mt-6">
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <History className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-base lg:text-lg">Histórico</CardTitle>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={historyTab === "ready" ? "default" : "outline"}
                        onClick={() => setHistoryTab("ready")}
                      >
                        Prontos
                      </Button>
                      <Button
                        size="sm"
                        variant={historyTab === "canceled" ? "default" : "outline"}
                        onClick={() => setHistoryTab("canceled")}
                      >
                        Cancelados
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  {historyTab === "ready" ? (
                    readyHistory.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-6 text-center">
                        Nenhum item pronto ainda.
                      </div>
                    ) : (
                      <div className="flex flex-col divide-y">
                        {readyHistory.map(({ comanda, item }) => (
                          <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">
                                {item.quantity}x {item.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Comanda #{comanda.number}
                              </div>
                            </div>

                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => updateOrderItemStatus(item.id, "canceled")}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Cancelar
                            </Button>
                          </div>
                        ))}
                      </div>
                    )
                  ) : canceledHistory.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-6 text-center">
                      Nenhum item cancelado.
                    </div>
                  ) : (
                    <div className="flex flex-col divide-y">
                      {canceledHistory.map(({ comanda, item }) => (
                        <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">
                              {item.quantity}x {item.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Comanda #{comanda.number}
                            </div>
                          </div>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateOrderItemStatus(item.id, "preparing")}
                          >
                            Voltar para preparo
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
