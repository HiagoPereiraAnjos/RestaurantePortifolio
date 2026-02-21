import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { useStore } from "@/store/useStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Search, Pencil, FileDown, BarChart3, Tags, History, Minus, Printer, KeyRound, Hash, ClipboardList } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { ReceiptPrintArea } from "@/components/receipt/ReceiptPrintArea";
import { Category, MenuItem, Order, OrderItem } from "@/lib/types";
import { getBackendMode } from "@/api/config";
import { apiFetch } from "@/api/http";
import { buildReceiptText } from "@/utils/receipt";
import { formatDateTimeBR } from "@/utils/datetime";
import { getReceiptPayments, saveReceiptPayments, type ReceiptPayment } from "@/lib/receiptPayments";
import { isKitchenBlocking } from "@/lib/domain";

/**
 * ADMIN (frontend-only)
 * - Dashboard "tempo real": KPIs recalculados e atualizados automaticamente a cada poucos segundos
 * - Categorias CRUD (salva no localStorage via Zustand persist)
 * - Relatórios com filtros + exportação PDF e Excel
 */
export default function AdminPage() {
  const backendMode = getBackendMode();
  const {
    menuItems,
    categories,
    orders,
    orderItems,
    comandas,
    addComandaAdmin,
    deleteComandaAdmin,
    deleteMenuItem,
    toggleMenuItemAvailability,
    updateOrderItemQuantity,
    addOrderItemToOrder,
  } = useStore();

  const [tab, setTab] = useState("dashboard");

  const [newComandaNumber, setNewComandaNumber] = useState<string>("");
  const [comandaSearch, setComandaSearch] = useState<string>("");

  const filteredAdminComandas = useMemo(() => {
    const q = (comandaSearch || "").trim().toLowerCase();
    const list = [...comandas].sort((a, b) => a.number - b.number);
    if (!q) return list;
    return list.filter((c) => {
      return (
        String(c.number).includes(q) ||
        String(c.status).toLowerCase().includes(q) ||
        (q === "livre" && c.status === "available") ||
        (q === "ocupada" && c.status === "occupied")
      );
    });
  }, [comandas, comandaSearch]);

  const { toast } = useToast();

  // --- Admin Auth ---
  // Solicita senha apenas ao ENTRAR no /admin.
  // Ao sair do /admin e voltar (ex.: ir para Caixa/PDV e retornar), pede senha novamente.
  const ADMIN_USER_KEY = "bb_admin_username";
  const ADMIN_PASS_KEY = "bb_admin_password";
  const ADMIN_SESSION_KEY = "bb_admin_session_active";

  const getAdminUsername = () => localStorage.getItem(ADMIN_USER_KEY) || "admin";
  const getAdminPassword = () => localStorage.getItem(ADMIN_PASS_KEY) || "admin";
  const hasAdminSession = () => localStorage.getItem(ADMIN_SESSION_KEY) === "1";
  const startAdminSession = () => localStorage.setItem(ADMIN_SESSION_KEY, "1");
  const clearAdminSession = () => {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    // Em modo API, forçamos novo login ao reentrar no Admin.
    localStorage.removeItem("bb_admin_token");
  };

  const ensureAdminDefaults = () => {
    if (!localStorage.getItem(ADMIN_USER_KEY)) localStorage.setItem(ADMIN_USER_KEY, "admin");
    if (!localStorage.getItem(ADMIN_PASS_KEY)) localStorage.setItem(ADMIN_PASS_KEY, "admin");
  };

  const [authOpen, setAuthOpen] = useState(!hasAdminSession());
  const [loginUser, setLoginUser] = useState<string>("admin");
  const [loginPass, setLoginPass] = useState<string>("");

  const [currentPass, setCurrentPass] = useState<string>("");
  const [newPass, setNewPass] = useState<string>("");
  const [newPass2, setNewPass2] = useState<string>("");


    const doAuth = () => {
    const u = (loginUser || "").trim();
    const p = loginPass;

    if (backendMode === "api") {
      (async () => {
        try {
          const resp = await apiFetch<{ token: string; user: { username: string } }>("/api/auth/reauth", {
            method: "POST",
            body: { username: u, password: p },
          });

          localStorage.setItem("bb_admin_token", resp.token);
          localStorage.setItem(ADMIN_USER_KEY, u || resp.user.username);

          startAdminSession();
          setAuthOpen(false);
        } catch (e) {
          toast({ title: "Login inválido", description: "Usuário ou senha incorretos.", variant: "destructive" });
        }
      })();
      return;
    }

    if (u !== getAdminUsername() || p !== getAdminPassword()) {
      toast({ title: "Login inválido", description: "Usuário ou senha incorretos.", variant: "destructive" });
      return;
    }

    startAdminSession();
    setAuthOpen(false);
  };

  const changePassword = () => {
    if (backendMode === "api") {
      (async () => {
        try {
          await apiFetch("/api/auth/change-password", {
            method: "POST",
            body: { currentPassword: currentPass, newPassword: newPass },
          });
          setCurrentPass("");
          setNewPass("");
          setNewPass2("");
          toast({ title: "Senha atualizada", description: "A nova senha já está valendo no backend." });
        } catch (e: any) {
          toast({ title: "Falha ao atualizar", description: "Verifique a senha atual e tente novamente.", variant: "destructive" });
        }
      })();
      return;
    }

    if (currentPass !== getAdminPassword()) {
      toast({ title: "Senha atual incorreta", description: "Digite a senha atual para alterar.", variant: "destructive" });
      return;
    }
    if (!newPass || newPass.length < 4) {
      toast({ title: "Nova senha inválida", description: "Use uma senha com pelo menos 4 caracteres.", variant: "destructive" });
      return;
    }
    if (newPass !== newPass2) {
      toast({ title: "Confirmação não confere", description: "As senhas não são iguais.", variant: "destructive" });
      return;
    }
    localStorage.setItem(ADMIN_PASS_KEY, newPass);
    setCurrentPass("");
    setNewPass("");
    setNewPass2("");
    toast({ title: "Senha atualizada", description: "A nova senha já está valendo (será solicitada ao reentrar no Admin)." });
  };

    useEffect(() => {
    ensureAdminDefaults();
    setLoginUser(getAdminUsername());
    setLoginPass("");

    // Exige senha apenas ao entrar no /admin (se ainda não houver sessão ativa).
    if (!hasAdminSession()) setAuthOpen(true);

    // Ao sair do /admin, encerra a sessão para exigir senha quando voltar.
    return () => {
      clearAdminSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [dateFrom, setDateFrom] = useState<string>(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    return start.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    const end = new Date();
    return end.toISOString().slice(0, 10);
  });

  const dateRange = useMemo(() => {
    const start = new Date(dateFrom + "T00:00:00");
    const end = new Date(dateTo + "T23:59:59.999");
    return { start, end };
  }, [dateFrom, dateTo]);


  // "Tempo real" (frontend only): força rerender periódico para atualizar KPIs.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 3000);
    return () => clearInterval(id);
  }, []);

  const kpis = useMemo(() => {
    const openOrders = orders.filter(o => o.status !== "closed");

    // Vendas fechadas no período selecionado (baseado em createdAt no horário local)
    const rangeSalesCents = orders
      .filter(o => o.status === "closed")
      .filter(o => {
        const d = new Date(o.createdAt);
        return d >= dateRange.start && d <= dateRange.end;
      })
      .reduce((acc, o) => {
        const its = orderItems.filter(oi => oi.orderId === o.id);
        // Ignora itens cancelados para não somar no total
        return acc + its.filter(i => i.status !== "canceled").reduce((a, i) => a + i.price * i.quantity, 0);
      }, 0);

    const openOrderIds = new Set(openOrders.map((o) => o.id));
    const kitchenQueue = orderItems.filter((oi) => openOrderIds.has(oi.orderId) && isKitchenBlocking(oi, categories)).length;
    const openComandas = comandas.filter(c => c.status === "occupied").length;
    return { openOrders: openOrders.length, rangeSalesCents, kitchenQueue, openComandas };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, orderItems, comandas, tick, dateRange]);


  return (
    <Layout>
      <Dialog
        open={authOpen}
        onOpenChange={(o) => {
          // Não permite fechar sem autenticar (reabre imediatamente)
          if (!o) setAuthOpen(true);
        }}
      >
        <DialogContent className="max-w-md" onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            doAuth();
          }
        }}>
          <DialogHeader>
            <DialogTitle>Login da Administração</DialogTitle>
            <DialogDescription>
              Para acessar a aba selecionada, informe usuário e senha.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Usuário</Label>
              <Input value={loginUser} onChange={(e) => setLoginUser(e.target.value)} placeholder="admin" />
            </div>
            <div className="grid gap-2">
              <Label>Senha</Label>
              <Input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} placeholder="••••" />
              <p className="text-xs text-muted-foreground">
                Padrão: usuário <b>admin</b> e senha <b>admin</b> (você pode alterar em Segurança).
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button onClick={doAuth}>Entrar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Layout usa overflow-hidden no container principal; então aqui garantimos rolagem dentro do Admin */}
      <div className="h-full w-full overflow-y-auto">
        <div className="p-6 md:p-8 max-w-7xl mx-auto w-full pb-24">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold">Administração</h1>
            <p className="text-muted-foreground">Dashboard, cardápio, categorias e relatórios</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full flex flex-wrap justify-start gap-2 h-auto p-2 rounded-2xl">
            <TabsTrigger value="dashboard" className="rounded-xl gap-2">
              <BarChart3 className="h-4 w-4" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="produtos" className="rounded-xl gap-2">
              <Pencil className="h-4 w-4" /> Produtos
            </TabsTrigger>
            <TabsTrigger value="categorias" className="rounded-xl gap-2">
              <Tags className="h-4 w-4" /> Categorias
            </TabsTrigger>
            <TabsTrigger value="comandas" className="rounded-xl gap-2">
              <ClipboardList className="h-4 w-4" /> Comandas
            </TabsTrigger>
            <TabsTrigger value="relatorios" className="rounded-xl gap-2">
              <FileDown className="h-4 w-4" /> Relatórios
            </TabsTrigger>
            <TabsTrigger value="historico" className="rounded-xl gap-2">
              <History className="h-4 w-4" /> Histórico
            </TabsTrigger>
            <TabsTrigger value="seguranca" className="rounded-xl gap-2">
              <KeyRound className="h-4 w-4" /> Segurança
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <AdminDashboard
              kpis={kpis}
              categories={categories}
              orders={orders}
              orderItems={orderItems}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
            />
          </TabsContent>

          <TabsContent value="produtos" className="mt-6">
            <ProductsPanel
              menuItems={menuItems}
              categories={categories}
              onDelete={(id) => {
                if (confirm("Tem certeza que deseja excluir?")) {
                  deleteMenuItem(id);
                  toast({ title: "Produto removido" });
                }
              }}
              onToggle={(id, current) => {
                toggleMenuItemAvailability(id);
                toast({
                  title: current ? "Item desativado" : "Item ativado",
                  description: current
                    ? "O item não aparecerá no PDV."
                    : "O item voltou a aparecer no PDV.",
                });
              }}
            />
          </TabsContent>

          <TabsContent value="categorias" className="mt-6">
            <CategoriesPanel />
          </TabsContent>

          <TabsContent value="relatorios" className="mt-6">
            <ReportsPanel />
          </TabsContent>

          
          <TabsContent value="comandas" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Comandas</CardTitle>
                <CardDescription>
                  Adicione ou remova comandas quando necessário. Para remover, a comanda precisa estar <b>livre</b>, com <b>total 0</b> e <b>sem pedidos</b>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="newComandaNumber">Número da comanda</Label>
                    <Input
                      id="newComandaNumber"
                      inputMode="numeric"
                      placeholder="Ex: 61"
                      value={newComandaNumber}
                      onChange={(e) => setNewComandaNumber(e.target.value)}
                      className="w-48"
                    />
                  </div>
                  <Button
                    className="gap-2 w-full sm:w-auto"
                    onClick={() => {
                      const n = Number(newComandaNumber);
                      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
                        toast({ title: "Número inválido", description: "Informe um número inteiro maior que zero." });
                        return;
                      }
                      addComandaAdmin(n);
                      setNewComandaNumber("");
                      toast({ title: "Comanda adicionada", description: `Comanda ${n} adicionada.` });
                    }}
                  >
                    <Plus className="h-4 w-4" /> Adicionar
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 opacity-60" />
                  <Input
                    placeholder="Buscar por número ou status..."
                    value={comandaSearch}
                    onChange={(e) => setComandaSearch(e.target.value)}
                  />
                </div>

                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">Número</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAdminComandas.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">#{c.number}</TableCell>
                          <TableCell>
                            <span className={c.status === "available" ? "text-emerald-600" : "text-amber-600"}>
                              {c.status === "available" ? "Livre" : "Ocupada"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {(c.total / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              className="gap-2"
                              disabled={
                                c.status !== "available" ||
                                (c.total ?? 0) > 0 ||
                                orders.some((o) => o.comandaId === c.id)
                              }
                              onClick={() => {
                                deleteComandaAdmin(c.id);
                                toast({ title: "Comanda removida", description: `Comanda ${c.number} removida.` });
                              }}
                            >
                              <Trash2 className="h-4 w-4" /> Remover
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredAdminComandas.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                            Nenhuma comanda encontrada.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

<TabsContent value="historico" className="mt-6">
            <AdminHistoryPanel
              menuItems={menuItems}
              categories={categories}
              orders={orders}
              orderItems={orderItems}
              comandas={comandas}
              onSetQty={(orderItemId, qty) => updateOrderItemQuantity(orderItemId, qty)}
              onAddItem={(orderId, menuItemId, opts) => addOrderItemToOrder(orderId, menuItemId, opts)}
            />
          </TabsContent>

          <TabsContent value="seguranca" className="mt-6">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle>Segurança</CardTitle>
                <CardDescription>
                  Altere a senha do painel administrativo. A nova senha será solicitada sempre que você mudar de aba.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-w-md grid gap-4">
                  <div className="grid gap-2">
                    <Label>Usuário</Label>
                    <Input value={getAdminUsername()} disabled />
                    <p className="text-xs text-muted-foreground">
                      O usuário é fixo (admin). Apenas a senha pode ser alterada.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label>Senha atual</Label>
                    <Input type="password" value={currentPass} onChange={(e) => setCurrentPass(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Nova senha</Label>
                    <Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Confirmar nova senha</Label>
                    <Input type="password" value={newPass2} onChange={(e) => setNewPass2(e.target.value)} />
                  </div>
                  <div className="flex items-center justify-end">
                    <Button onClick={changePassword}>Salvar senha</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </div>
      </div>
    </Layout>
  );
}

function formatBRL(cents: number) {
  return `R$ ${(cents / 100).toFixed(2)}`;
}

function formatBRLFromReais(reais: number) {
  // Usado em gráficos onde o dado já está em reais (não em centavos)
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(reais);
  } catch {
    return `R$ ${Number(reais).toFixed(2)}`;
  }
}

// (Reimpressão) Usa o mesmo gerador do Caixa/Histórico, garantindo:
// - Hora correta (timezone America/Sao_Paulo)
// - Forma de pagamento (1 ou múltiplas partes)
// - Layout térmico 80mm (~42 colunas)

function AdminHistoryPanel({
  menuItems,
  categories,
  orders,
  orderItems,
  comandas,
  onSetQty,
  onAddItem,
}: {
  menuItems: MenuItem[];
  categories: Category[];
  orders: Order[];
  orderItems: OrderItem[];
  comandas: { id: number; number: number; status?: "available" | "occupied"; total?: number }[];
  onSetQty: (orderItemId: number, qty: number) => void;
  onAddItem: (orderId: number, menuItemId: number, opts?: { quantity?: number; overridePriceCents?: number; displayName?: string }) => void;
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"closed" | "open">("closed");
  const [selectedReceiptKey, setSelectedReceiptKey] = useState<string | null>(null);
  const [printText, setPrintText] = useState<string>("");
  const [paymentsByReceiptId, setPaymentsByReceiptId] = useState<Record<string, ReceiptPayment[]>>({});

  const [addMenuItemId, setAddMenuItemId] = useState<number | null>(null);
  const [addQty, setAddQty] = useState<number>(1);
  const [addPriceStr, setAddPriceStr] = useState<string>("");

  const rows = useMemo(() => {
    const filteredByStatus = orders.filter(o => (view === "closed" ? o.status === "closed" : o.status !== "closed"));

    // Agrupa por receiptId (quando fechado). Se ainda estiver aberto, usamos um key derivado do orderId.
    const map = new Map<string, {
      receiptKey: string;
      displayId: string;
      orderIds: number[];
      comandaId: number;
      comandaNumber: number | null;
      createdAt: string;
      status: Order['status'];
      itemsCount: number;
      total: number;
    }>();

    for (const o of filteredByStatus) {
      const receiptKey = o.receiptId ? `R:${o.receiptId}` : `O:${o.id}`;
      const displayId = o.receiptId ?? String(o.id);
      const comanda = comandas.find(c => c.id === o.comandaId);
      const items = orderItems.filter(i => i.orderId === o.id);
      const total = items.reduce((acc, it) => acc + it.price * it.quantity, 0);
      const itemsCount = items.reduce((acc, it) => acc + it.quantity, 0);

      const prev = map.get(receiptKey);
      if (!prev) {
        map.set(receiptKey, {
          receiptKey,
          displayId,
          orderIds: [o.id],
          comandaId: o.comandaId,
          comandaNumber: comanda?.number ?? null,
          createdAt: o.createdAt,
          status: o.status,
          itemsCount,
          total,
        });
      } else {
        map.set(receiptKey, {
          ...prev,
          orderIds: [...prev.orderIds, o.id],
          createdAt: new Date(o.createdAt) > new Date(prev.createdAt) ? o.createdAt : prev.createdAt,
          // Em caso de múltiplos pedidos antigos, somamos os itens no mesmo recibo
          itemsCount: prev.itemsCount + itemsCount,
          total: prev.total + total,
        });
      }
    }

    return [...map.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, orderItems, comandas, view]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const parts = [String(r.displayId), String(r.comandaId), r.comandaNumber === null ? "" : String(r.comandaNumber)];
      return parts.some((p) => p.toLowerCase().includes(q));
    });
  }, [rows, query]);

  const selected = useMemo(() => {
    if (!selectedReceiptKey) return null;
    const row = rows.find(r => r.receiptKey === selectedReceiptKey);
    if (!row) return null;
    const firstOrder = orders.find(o => o.id === row.orderIds[0]);
    if (!firstOrder) return null;
    const comanda = comandas.find(c => c.id === firstOrder.comandaId);
    const items = orderItems.filter(i => row.orderIds.includes(i.orderId));
    const total = items
      .filter((it) => it.status !== 'canceled')
      .reduce((acc, it) => acc + it.price * it.quantity, 0);
    return { row, firstOrder, comandaNumber: comanda?.number ?? null, items, total };
  }, [selectedReceiptKey, rows, orders, comandas, orderItems]);

  // Fetch payments from backend for cross-device reprint (when in API mode).
  useEffect(() => {
    if (getBackendMode() !== "api") return;
    if (!selected) return;
    const rid = selected.row.displayId;
    if (!rid) return;
    if (paymentsByReceiptId[rid]) return;

    let cancelled = false;
    (async () => {
      try {
        const rows = await apiFetch<{ receiptId: string; method: string; amountCents: number }[]>(
          `/api/receipts/${encodeURIComponent(rid)}/payments`,
        );
        const mapped = (rows ?? [])
          .map((p) => ({ method: String(p.method), amountCents: Number(p.amountCents) }))
          .filter((p) => p.method && Number.isFinite(p.amountCents) && p.amountCents > 0);
        if (!cancelled) {
          setPaymentsByReceiptId((prev) => ({ ...prev, [rid]: mapped }));
          // Keep local fallback in sync.
          saveReceiptPayments(rid, mapped);
        }
      } catch {
        // ignore; fallback will use localStorage
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected, paymentsByReceiptId]);

  const buildSelectedReceiptText = () => {
    if (!selected) return "";
    const rid = selected.row.displayId;
    const items = selected.items
      .filter((i) => i.status !== "canceled")
      .map((i) => ({ name: i.name, quantity: i.quantity, price: i.price }));
    const totalCents = items.reduce((acc, it) => acc + it.price * it.quantity, 0);

    const payments = paymentsByReceiptId[rid] ?? getReceiptPayments(rid);
    const paymentMethods = orders
      .filter((o) => selected.row.orderIds.includes(o.id))
      .map((o) => String(o.paymentMethod ?? "").trim())
      .filter(Boolean);
    const uniquePaymentMethods = Array.from(new Set(paymentMethods));
    const paymentMethod = uniquePaymentMethods.length === 1 ? uniquePaymentMethods[0] : undefined;

    return buildReceiptText({
      comandaId: selected.firstOrder.comandaId,
      comandaNumber: selected.comandaNumber,
      createdAtISO: selected.row.createdAt,
      closedAtISO: selected.firstOrder.closedAt ?? selected.firstOrder.paidAt ?? undefined,
      items,
      totalCents,
      payments,
      paymentMethod,
      footerLines: [`Recibo: ${rid}`, `Comanda (ID): ${selected.firstOrder.comandaId}`],
    });
  };

  const canEdit = true;

  const selectedMenuItem = useMemo(() => {
    if (!addMenuItemId) return null;
    return menuItems.find((m) => m.id === addMenuItemId) ?? null;
  }, [addMenuItemId, menuItems]);

  const kitchenLabelByCategory = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.id, c.label);
    return map;
  }, [categories]);

  const printReceiptFromSelected = () => {
    if (!selected) return;
    const text = buildSelectedReceiptText();
    // In-page print to avoid popup blockers
    setPrintText(text);
    setTimeout(() => window.print(), 50);
  };

  return (
    <>
      <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold">Histórico</h2>
          <p className="text-muted-foreground">
            Clique em um pedido para ver detalhes. Você pode <strong>ajustar itens direto no modal</strong> e reimprimir o recibo.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <Tabs value={view} onValueChange={(v) => setView(v as any)} className="w-full sm:w-auto">
            <TabsList className="rounded-2xl">
              <TabsTrigger value="closed" className="rounded-xl">Fechados</TabsTrigger>
              <TabsTrigger value="open" className="rounded-xl">Abertos</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative w-full sm:w-[340px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por ID do pedido / ID da comanda / número..."
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <Card className="shadow-lg border-2 overflow-hidden">
        <CardHeader className="border-b bg-muted/10">
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Pedidos</CardTitle>
            <div className="text-sm text-muted-foreground font-mono">{filtered.length}</div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido (ID)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Comanda (ID)</TableHead>
                  <TableHead>Nº Comanda</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Nenhum pedido encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow
                      key={r.receiptKey}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setSelectedReceiptKey(r.receiptKey)}
                    >
                      <TableCell className="font-mono font-semibold">#{r.displayId}</TableCell>
                      <TableCell>
                        <span
                          className={
                            r.status === "closed"
                              ? "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                              : "inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                          }
                        >
                          {r.status === "closed" ? "Fechado" : "Aberto"}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono">{r.comandaId}</TableCell>
                      <TableCell className="font-bold">
                        {r.comandaNumber ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>{r.itemsCount}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTimeBR(r.createdAt)}</TableCell>
                      <TableCell className="text-right font-mono font-bold">{formatBRL(r.total)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedReceiptKey} onOpenChange={(o) => !o && setSelectedReceiptKey(null)}>
        {/* Scroll interno para não estourar a viewport */}
        <DialogContent className="max-w-3xl rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Comanda {selected ? <span className="font-mono">#{selected.row.displayId}</span> : ""}
            </DialogTitle>
            <DialogDescription className="sr-only">Detalhes e ações da comanda selecionada.</DialogDescription>
          </DialogHeader>

          {!selected ? (
            <div className="text-muted-foreground">Carregando…</div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  <div>
                    <strong>Comanda (ID interno):</strong> <span className="font-mono">{selected.firstOrder.comandaId}</span>
                    {" "}
                    <span className="mx-1">·</span>
                    <strong>Nº:</strong> {selected.comandaNumber ?? "—"}
                  </div>
                  <div>
                    <strong>Data:</strong> {formatDateTimeBR(selected.row.createdAt)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selected.firstOrder.status === "closed" ? (
                    <Button onClick={printReceiptFromSelected} variant="outline" className="rounded-xl gap-2">
                      <Printer className="h-4 w-4" /> Reimprimir recibo
                    </Button>
                  ) : null}

                  <span
                    className={
                      selected.firstOrder.status === "closed"
                        ? "inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
                        : "inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
                    }
                  >
                    {selected.firstOrder.status === "closed" ? "Fechado" : "Aberto"}
                  </span>
                </div>
              </div>

              <Card className="rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Itens</CardTitle>
                  <CardDescription>
                    Ajuste quantidades, remova ou adicione itens diretamente aqui.
                    Em pedidos fechados, isso atualiza o histórico e os insights do Admin.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {/* Adicionar item */}
                  <div className="p-3 rounded-xl border bg-muted/10 space-y-3">
                    <div className="font-semibold">Adicionar item</div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                      <div className="md:col-span-6">
                        <Label>Item</Label>
                        <Select
                          value={addMenuItemId ? String(addMenuItemId) : ""}
                          onValueChange={(v) => {
                            const id = Number(v);
                            setAddMenuItemId(Number.isFinite(id) ? id : null);
                            setAddQty(1);
                            setAddPriceStr("");
                          }}
                        >
                          <SelectTrigger className="rounded-xl">
                            <SelectValue placeholder="Selecione um produto" />
                          </SelectTrigger>
                          <SelectContent>
                            {menuItems
                              .filter((m) => m.available)
                              .map((m) => (
                                <SelectItem key={m.id} value={String(m.id)}>
                                  {m.name} <span className="text-muted-foreground">· {kitchenLabelByCategory.get(m.category) ?? m.category}</span>
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="md:col-span-2">
                        <Label>Qtd</Label>
                        <Input
                          type="number"
                          min={1}
                          value={String(addQty)}
                          onChange={(e) => setAddQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                          className="rounded-xl"
                        />
                      </div>

                      <div className="md:col-span-4">
                        <Label>Preço (opcional)</Label>
                        <Input
                          placeholder={selectedMenuItem?.category === 'buffet_kg' ? "Obrigatório p/ buffet kg" : "Ex: 24,90"}
                          value={addPriceStr}
                          onChange={(e) => setAddPriceStr(e.target.value)}
                          className="rounded-xl"
                        />
                        <div className="text-xs text-muted-foreground mt-1">
                          {selectedMenuItem?.category === 'buffet_kg'
                            ? "Buffet por kg pede valor manual em cada lançamento."
                            : "Deixe vazio para usar o preço do cadastro."}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        className="rounded-xl"
                        disabled={!selectedMenuItem}
                        onClick={() => {
                          if (!selectedMenuItem || !selected) return;
                          let overridePriceCents: number | undefined = undefined;

                          const raw = addPriceStr.trim();
                          if (raw) {
                            const n = Number(raw.replace(',', '.'));
                            if (!Number.isFinite(n) || n < 0) {
                              toast({ title: "Preço inválido", description: "Informe um valor válido (ex: 24,90).", variant: "destructive" });
                              return;
                            }
                            overridePriceCents = Math.round(n * 100);
                          } else if (selectedMenuItem.category === 'buffet_kg') {
                            toast({ title: "Informe o preço", description: "Buffet por kg exige preço manual a cada lançamento.", variant: "destructive" });
                            return;
                          }

                          // Add to the first order of the receipt group.
                          onAddItem(selected.row.orderIds[0], selectedMenuItem.id, {
                            quantity: addQty,
                            overridePriceCents,
                            displayName: selectedMenuItem.name,
                          });

                          setAddMenuItemId(null);
                          setAddQty(1);
                          setAddPriceStr("");
                          toast({ title: "Item adicionado", description: "O histórico e os totais foram atualizados." });
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" /> Adicionar
                      </Button>
                    </div>
                  </div>

                  {selected.items.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Nenhum item neste pedido.</div>
                  ) : (
                    selected.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{it.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {formatBRL(it.price)} · ID item: {it.id}
                          </div>
                          {it.status === 'canceled' ? (
                            <div className="text-xs text-red-600 font-semibold">Cancelado</div>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="rounded-xl"
                            disabled={!canEdit}
                            onClick={() => onSetQty(it.id, Math.max(0, it.quantity - 1))}
                            title="Diminuir"
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <div className="w-10 text-center font-mono font-bold">{it.quantity}</div>
                          <Button
                            variant="outline"
                            size="icon"
                            className="rounded-xl"
                            disabled={!canEdit}
                            onClick={() => onSetQty(it.id, it.quantity + 1)}
                            title="Aumentar"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="rounded-xl"
                            disabled={!canEdit}
                            onClick={() => onSetQty(it.id, 0)}
                            title="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <div className="text-sm text-muted-foreground">Total do pedido</div>
                    <div className="font-mono font-bold text-lg">{formatBRL(selected.total)}</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>

      {/* Área exclusiva para impressão (sem popup) */}
      <ReceiptPrintArea title="Recibo" text={printText} className="print:block" />
    </>
  );
}

function StatCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-muted-foreground font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-display font-bold">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{hint}</div>
      </CardContent>
    </Card>
  );
}

function AdminDashboard({
  kpis,
  categories,
  orders,
  orderItems,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: {
  kpis: { openOrders: number; rangeSalesCents: number; kitchenQueue: number; openComandas: number };
  categories: Category[];
  orders: Order[];
  orderItems: OrderItem[];
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
}) {
  const byItem = useMemo(() => {
    const start = new Date(dateFrom + "T00:00:00");
    const end = new Date(dateTo + "T23:59:59.999");
    const closedOrders = orders
      .filter(o => o.status === "closed")
      .filter(o => {
        const d = new Date(o.createdAt);
        return d >= start && d <= end;
      });
    const map = new Map<number, { name: string; qty: number; category: string }>();

    for (const o of closedOrders) {
      const its = orderItems
        .filter(oi => oi.orderId === o.id)
        .filter(i => i.status !== "canceled");

      for (const i of its) {
        const prev = map.get(i.menuItemId);
        if (!prev) {
          map.set(i.menuItemId, { name: i.name, qty: i.quantity, category: i.category });
        } else {
          prev.qty += i.quantity;
        }
      }
    }

    return [...map.entries()]
      .map(([id, v]) => ({
        id,
        name: v.name,
        qty: v.qty,
        categoryLabel: categories.find(c => c.id === v.category)?.label ?? v.category,
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);
  }, [orders, orderItems, categories, dateFrom, dateTo]);



  const salesByDay = useMemo(() => {
    // Dias no período selecionado (limitado a 31 dias para manter o gráfico legível)
    const start = new Date(dateFrom + "T00:00:00");
    const end = new Date(dateTo + "T23:59:59.999");

    const days: { key: string; day: string; sales: number }[] = [];
    const cursor = new Date(start);
    while (cursor <= end && days.length < 31) {
      const key = cursor.toLocaleDateString("pt-BR");
      days.push({ key, day: key, sales: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    const closedOrders = orders
      .filter(o => o.status === "closed")
      .filter(o => {
        const d = new Date(o.createdAt);
        return d >= start && d <= end;
      });

    for (const o of closedOrders) {
      const dayKey = new Date(o.createdAt).toLocaleDateString("pt-BR");
      const idx = days.findIndex(d => d.key === dayKey);
      if (idx === -1) continue;

      const its = orderItems
        .filter(oi => oi.orderId === o.id)
        .filter(i => i.status !== "canceled");

      const totalCents = its.reduce((a, i) => a + i.price * i.quantity, 0);
      days[idx].sales += totalCents / 100;
    }

    return days;
  }, [orders, orderItems, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Período dos insights</CardTitle>
          <CardDescription>Escolha a data inicial e final para calcular vendas e ranking (apenas pedidos fechados).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-4 md:items-end">
          <div className="grid gap-2">
            <Label htmlFor="insights-from">De</Label>
            <Input
              id="insights-from"
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="w-full md:w-52"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="insights-to">Até</Label>
            <Input
              id="insights-to"
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="w-full md:w-52"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const d = new Date();
                const iso = d.toISOString().slice(0, 10);
                onDateFromChange(iso);
                onDateToChange(iso);
              }}
            >
              Hoje
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const end = new Date();
                const start = new Date(end);
                start.setDate(end.getDate() - 6);
                onDateFromChange(start.toISOString().slice(0, 10));
                onDateToChange(end.toISOString().slice(0, 10));
              }}
            >
              Últimos 7 dias
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Comandas abertas"
          value={String(kpis.openComandas)}
          hint="Em uso agora"
        />
        <StatCard
          title="Pedidos em andamento"
          value={String(kpis.openOrders)}
          hint="Não fechados"
        />
        <StatCard
          title="Fila da cozinha"
          value={String(kpis.kitchenQueue)}
          hint="Pendente/Preparando"
        />
        <StatCard
          title="Vendas (período)"
          value={formatBRL(kpis.rangeSalesCents)}
          hint={`Fechadas de ${new Date(dateFrom + "T00:00:00").toLocaleDateString("pt-BR")} até ${new Date(dateTo + "T00:00:00").toLocaleDateString("pt-BR")}`}
        />
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle className="text-base">Vendas por dia (período)</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesByDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: any) => {
                    const n = Number(v);
                    return Number.isFinite(n) ? formatBRLFromReais(n) : String(v);
                  }}
                />
                <Tooltip
                  formatter={(value: any, name: any) => {
                    if (name === "sales") return [formatBRLFromReais(Number(value)), "Vendas"];
                    return [value, name];
                  }}
                  labelFormatter={(label) => `Dia: ${label}`}
                />
                <Bar dataKey="sales" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Baseado apenas em pedidos com status <span className="font-mono">closed</span>.
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle className="text-base">Top itens vendidos (vendas fechadas)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byItem.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground">
                    Sem vendas fechadas ainda.
                  </TableCell>
                </TableRow>
              ) : (
                byItem.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{row.name}</span>
                        <span className="text-xs text-muted-foreground">{row.categoryLabel}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">{row.qty}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        * "Tempo real" aqui é calculado no próprio navegador (sem backend): os KPIs se atualizam conforme você lança pedidos.
      </div>
    </div>
  );
}

function ProductsPanel({
  menuItems,
  categories,
  onDelete,
  onToggle,
}: {
  menuItems: MenuItem[];
  categories: Category[];
  onDelete: (id: number) => void;
  onToggle: (id: number, current: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const filteredItems = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return menuItems;
    return menuItems.filter(i => i.name.toLowerCase().includes(s));
  }, [menuItems, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto..."
            className="pl-9 bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="mr-2 h-4 w-4" /> Novo Produto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Adicionar Novo Produto</DialogTitle>
            <DialogDescription className="sr-only">Formulário para cadastrar um novo produto.</DialogDescription>
            </DialogHeader>
            <AddProductForm categories={categories} onClose={() => setIsAddOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle>Produtos Cadastrados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <span className="capitalize px-2 py-1 rounded-full bg-muted text-xs font-bold">
                      {categories.find(c => c.id === item.category)?.label ?? item.category}
                    </span>
                  </TableCell>
                  <TableCell>R$ {(item.price / 100).toFixed(2)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Switch checked={item.available} onCheckedChange={() => onToggle(item.id, item.available)} />
                      <span className="text-xs font-medium text-muted-foreground">
                        {item.available ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Dialog open={editingId === item.id} onOpenChange={(open) => setEditingId(open ? item.id : null)}>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar produto"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Editar Produto</DialogTitle>
            <DialogDescription className="sr-only">Formulário para editar o produto selecionado.</DialogDescription>
                        </DialogHeader>
                        <EditProductForm
                          categories={categories}
                          itemId={item.id}
                          onClose={() => setEditingId(null)}
                        />
                      </DialogContent>
                    </Dialog>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive/80"
                      onClick={() => onDelete(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function AddProductForm({
  categories,
  onClose,
}: {
  categories: Category[];
  onClose: () => void;
}) {
  const { addMenuItem } = useStore();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    category: categories?.[0]?.id ?? "outros",
    price: "",
    description: "",
    image: "",
  });

const handleImageFile = (file: File | null) => {
  if (!file) return;
  if (!file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === "string" ? reader.result : "";
    setFormData((prev) => ({ ...prev, image: result }));
  };
  reader.readAsDataURL(file);
};
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addMenuItem({
      name: formData.name.trim(),
      category: formData.category,
      price: Math.round(parseFloat(formData.price) * 100),
      description: formData.description.trim() ? formData.description.trim() : null,
      available: true,
      image: formData.image.trim() ? formData.image.trim() : undefined,
    });
    toast({ title: "Produto adicionado com sucesso!" });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome do Produto</Label>
        <Input
          id="name"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category">Categoria</Label>
          <Select value={formData.category} onValueChange={(val) => setFormData({ ...formData, category: val })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="price">Preço (R$)</Label>
          <Input
            id="price"
            type="number"
            step="0.01"
            required
            placeholder="0.00"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Input
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>

<div className="space-y-2">
  <Label htmlFor="imageUrl">Imagem (link) ou arquivo</Label>
  <Input
    id="imageUrl"
    type="url"
    placeholder="https://..."
    value={formData.image}
    onChange={(e) => setFormData({ ...formData, image: e.target.value })}
  />
  <div className="flex flex-col sm:flex-row gap-2">
    <Input
      type="file"
      accept="image/*"
      onChange={(e) => handleImageFile(e.target.files?.[0] ?? null)}
    />
    {formData.image ? (
      <Button
        type="button"
        variant="outline"
        onClick={() => setFormData({ ...formData, image: "" })}
      >
        Remover imagem
      </Button>
    ) : null}
  </div>
  {formData.image ? (
    <div className="mt-2 rounded-xl overflow-hidden border bg-muted/10">
      <img src={formData.image} alt="Prévia" className="w-full h-40 object-cover" />
    </div>
  ) : null}
</div>
      <div className="pt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit">Salvar Produto</Button>
      </div>
    </form>
  );
}

function EditProductForm({
  categories,
  itemId,
  onClose,
}: {
  categories: Category[];
  itemId: number;
  onClose: () => void;
}) {
  const { menuItems, updateMenuItem } = useStore();
  const { toast } = useToast();
  const item = menuItems.find((i) => i.id === itemId);

  const [formData, setFormData] = useState(() => ({
    name: item?.name ?? "",
    category: item?.category ?? (categories?.[0]?.id ?? "outros"),
    price: item ? (item.price / 100).toFixed(2) : "",
    description: item?.description ?? "",
    image: item?.image ?? "",
  }));
const handleImageFile = (file: File | null) => {
  if (!file) return;
  if (!file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === "string" ? reader.result : "";
    setFormData((prev) => ({ ...prev, image: result }));
  };
  reader.readAsDataURL(file);
};

  if (!item) {
    return <div className="pt-4 text-sm text-muted-foreground">Produto não encontrado.</div>;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(formData.price);
    if (Number.isNaN(parsed) || parsed < 0) {
      toast({
        title: "Preço inválido",
        description: "Informe um valor válido (ex: 12.50).",
        variant: "destructive",
      });
      return;
    }

    updateMenuItem(itemId, {
      name: formData.name.trim(),
      category: formData.category,
      price: Math.round(parsed * 100),
      description: formData.description?.trim() ? formData.description.trim() : null,
      image: formData.image.trim() ? formData.image.trim() : undefined,
    });

    toast({ title: "Produto atualizado" });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label htmlFor="edit_name">Nome do Produto</Label>
        <Input
          id="edit_name"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="edit_category">Categoria</Label>
          <Select value={formData.category} onValueChange={(val) => setFormData({ ...formData, category: val })}>
            <SelectTrigger id="edit_category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit_price">Preço (R$)</Label>
          <Input
            id="edit_price"
            type="number"
            step="0.01"
            required
            placeholder="0.00"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit_description">Descrição</Label>
        <Input
          id="edit_description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>


      

      <div className="space-y-2">
        <Label htmlFor="edit_imageUrl">Imagem (link) ou arquivo</Label>
        <Input
          id="edit_imageUrl"
          type="url"
          placeholder="https://..."
          value={formData.image}
          onChange={(e) => setFormData({ ...formData, image: e.target.value })}
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => handleImageFile(e.target.files?.[0] ?? null)}
          />
          {formData.image ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setFormData({ ...formData, image: "" })}
            >
              Remover imagem
            </Button>
          ) : null}
        </div>
        {formData.image ? (
          <div className="mt-2 rounded-xl overflow-hidden border bg-muted/10">
            <img src={formData.image} alt="Prévia" className="w-full h-40 object-cover" />
          </div>
        ) : null}
      </div>

      <div className="pt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit">Salvar Alterações</Button>
      </div>
    </form>
  );
}

function CategoriesPanel() {
  const { categories, addCategory, updateCategory, deleteCategory, menuItems } = useStore();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [newCat, setNewCat] = useState({ id: "", label: "", sendToKitchen: false });

  const usedCount = (id: string) => menuItems.filter(mi => mi.category === id).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Crie/edite categorias do cardápio. Tudo fica salvo localmente.
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="mr-2 h-4 w-4" /> Nova Categoria
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova Categoria</DialogTitle>
            <DialogDescription className="sr-only">Formulário para criar uma nova categoria.</DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4 pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                const id = newCat.id.trim().toLowerCase();
                const label = newCat.label.trim();
                if (!id) {
                  toast({ title: "ID obrigatório", variant: "destructive" });
                  return;
                }
                addCategory({ id, label: label || id, sendToKitchen: !!newCat.sendToKitchen });
                toast({ title: "Categoria criada" });
                setNewCat({ id: "", label: "", sendToKitchen: false });
                setIsOpen(false);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="cat_id">ID (sem espaços)</Label>
                <Input
                  id="cat_id"
                  placeholder="ex: pratos"
                  value={newCat.id}
                  onChange={(e) => setNewCat({ ...newCat, id: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat_label">Nome</Label>
                <Input
                  id="cat_label"
                  placeholder="ex: Pratos"
                  value={newCat.label}
                  onChange={(e) => setNewCat({ ...newCat, label: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-3 rounded-xl border p-3">
                <Checkbox
                  id="cat_kitchen"
                  checked={!!newCat.sendToKitchen}
                  onCheckedChange={(v) => setNewCat({ ...newCat, sendToKitchen: v === true })}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="cat_kitchen">Enviar itens para a cozinha</Label>
                  <div className="text-xs text-muted-foreground">
                    Se marcado, itens dessa categoria entram na fila da Cozinha.
                  </div>
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Salvar</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle>Categorias</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Cozinha</TableHead>
                <TableHead>Usada em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-mono text-xs">{cat.id}</TableCell>
                  <TableCell className="font-medium">
                    {editing === cat.id ? (
                      <Input
                        value={cat.label}
                        onChange={(e) => updateCategory(cat.id, { label: e.target.value })}
                      />
                    ) : (
                      cat.label
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!!cat.sendToKitchen}
                        onCheckedChange={(v) => updateCategory(cat.id, { sendToKitchen: v })}
                        aria-label="Enviar itens para cozinha"
                      />
                      <span className="text-xs text-muted-foreground">
                        {cat.sendToKitchen ? "Sim" : "Não"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{usedCount(cat.id)} itens</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={editing === cat.id ? "Finalizar edição" : "Editar categoria"}
                      title={editing === cat.id ? "OK" : "Editar"}
                      onClick={() => {
                        setEditing(editing === cat.id ? null : cat.id);
                        toast({ title: editing === cat.id ? "Edição finalizada" : "Editando" });
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive/80"
                      aria-label="Excluir categoria"
                      title="Excluir"
                      onClick={() => {
                        if (cat.id === "outros") {
                          toast({
                            title: "Categoria protegida",
                            description: "A categoria 'outros' é usada como fallback e não pode ser removida.",
                            variant: "destructive",
                          });
                          return;
                        }
                        const count = usedCount(cat.id);
                        const msg = count > 0
                          ? `Existem ${count} itens nessa categoria. Eles serão movidos para 'outros'. Deseja continuar?`
                          : "Deseja remover essa categoria?";
                        if (!confirm(msg)) return;
                        deleteCategory(cat.id);
                        toast({ title: "Categoria removida" });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportsPanel() {
  const { orders, orderItems, comandas, categories } = useStore();
  const { toast } = useToast();

  const [status, setStatus] = useState<"all" | "open" | "closed">("all");
  const [category, setCategory] = useState<string>("all");
  const [comandaNumber, setComandaNumber] = useState<string>("");
  const [itemQuery, setItemQuery] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const filtered = useMemo(() => {
    const fromDate = from ? new Date(from + "T00:00:00") : null;
    const toDate = to ? new Date(to + "T23:59:59") : null;
    const comandaFilter = comandaNumber.trim() ? Number(comandaNumber) : null;
    const itemFilter = itemQuery.trim().toLowerCase();

    const ordersFiltered = orders.filter(o => {
      if (status === "closed" && o.status !== "closed") return false;
      if (status === "open" && o.status === "closed") return false;
      const created = new Date(o.createdAt);
      if (fromDate && created < fromDate) return false;
      if (toDate && created > toDate) return false;
      if (comandaFilter) {
        const cmd = comandas.find(c => c.id === o.comandaId);
        if (!cmd || cmd.number !== comandaFilter) return false;
      }
      return true;
    });

    const rows: Array<{
      orderId: number;
      createdAt: string;
      comandaId: number;
      comandaNumber: number;
      status: string;
      item: string;
      category: string;
      qty: number;
      unitCents: number;
      totalCents: number;
    }> = [];

    for (const o of ordersFiltered) {
      const cmd = comandas.find(c => c.id === o.comandaId);
      const cmdNumber = cmd?.number ?? o.comandaId;
      const its = orderItems.filter(oi => oi.orderId === o.id);
      for (const it of its) {
        if (category !== "all" && it.category !== category) continue;
        const itemName = String(it.name ?? "");
        if (itemFilter && !itemName.toLowerCase().includes(itemFilter)) continue;
        rows.push({
          orderId: o.id,
          createdAt: o.createdAt,
          comandaId: o.comandaId,
          comandaNumber: cmdNumber,
          status: o.status,
          item: itemName,
          category: categories.find(c => c.id === it.category)?.label ?? it.category,
          qty: it.quantity,
          unitCents: it.price,
          totalCents: it.price * it.quantity,
        });
      }
    }

    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, orderItems, comandas, categories, status, category, comandaNumber, itemQuery, from, to]);

  const totals = useMemo(() => {
    const totalCents = filtered.reduce((acc, r) => acc + r.totalCents, 0);
    const totalQty = filtered.reduce((acc, r) => acc + r.qty, 0);
    return { totalCents, totalQty, rows: filtered.length };
  }, [filtered]);

  const exportExcel = async () => {
    try {
      const xlsx = await import("xlsx");
      const wb = xlsx.utils.book_new();

      const data = filtered.map(r => ({
        Pedido_ID: r.orderId,
        Data: formatDateTimeBR(r.createdAt),
        Comanda_ID: r.comandaId,
        Comanda_Numero: r.comandaNumber,
        Status: r.status,
        Item: r.item,
        Categoria: r.category,
        Quantidade: r.qty,
        Unitario: Number((r.unitCents / 100).toFixed(2)),
        Total: Number((r.totalCents / 100).toFixed(2)),
      }));

      const ws = xlsx.utils.json_to_sheet(data);

      // Add a summary at the end (with formulas so Excel always calculates the totals).
      const range = ws["!ref"] ? xlsx.utils.decode_range(ws["!ref"]) : null;
      const lastRow0 = range ? range.e.r : data.length; // 0-based
      const startSummaryRow0 = lastRow0 + 2;
      const firstDataRow = 2;
      const lastDataRow = Math.max(firstDataRow, lastRow0 + 1);

      xlsx.utils.sheet_add_aoa(
        ws,
        [
          [""],
          ["RESUMO"],
          ["Linhas", { t: "n", v: totals.rows }],
          ["Itens (qtd)", { t: "n", f: `SUM(H${firstDataRow}:H${lastDataRow})` }],
          ["Total (R$)", { t: "n", f: `SUM(J${firstDataRow}:J${lastDataRow})` }],
        ],
        { origin: { r: startSummaryRow0, c: 0 } }
      );

      xlsx.utils.book_append_sheet(wb, ws, "Relatorio");
      xlsx.writeFile(wb, `relatorio_${Date.now()}.xlsx`);
      toast({ title: "Excel exportado" });
    } catch (e) {
      toast({
        title: "Falha ao exportar Excel",
        description: "Verifique se as dependências foram instaladas (xlsx).",
        variant: "destructive",
      });
    }
  };

  const exportPDF = async () => {
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(12);
      doc.text("Relatório de Vendas", 14, 14);
      doc.setFontSize(9);
      doc.text(`Linhas: ${totals.rows}  |  Total: R$ ${(totals.totalCents / 100).toFixed(2)}`, 14, 20);

      const head = [["Pedido", "Data", "Comanda#", "Status", "Item", "Categoria", "Qtd", "Unit", "Total"]];
      const body = filtered.slice(0, 800).map(r => [
        String(r.orderId),
        formatDateTimeBR(r.createdAt),
        String(r.comandaNumber),
        r.status,
        r.item,
        r.category,
        String(r.qty),
        `R$ ${(r.unitCents / 100).toFixed(2)}`,
        `R$ ${(r.totalCents / 100).toFixed(2)}`,
      ]);

      autoTable(doc, {
        head,
        body,
        startY: 24,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 41, 59] },
      });

      doc.save(`relatorio_${Date.now()}.pdf`);
      toast({ title: "PDF exportado" });
    } catch (e) {
      toast({
        title: "Falha ao exportar PDF",
        description: "Verifique se as dependências foram instaladas (jspdf, jspdf-autotable).",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="open">Abertos</SelectItem>
                  <SelectItem value="closed">Fechados</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Nº da Comanda</Label>
              <Input value={comandaNumber} onChange={(e) => setComandaNumber(e.target.value)} placeholder="ex: 12" />
            </div>

            <div className="space-y-2">
              <Label>Buscar item</Label>
              <Input
                value={itemQuery}
                onChange={(e) => setItemQuery(e.target.value)}
                placeholder="ex: picanha, coca..."
              />
            </div>

            <div className="space-y-2">
              <Label>De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-6">
            <div className="text-sm text-muted-foreground">
              Linhas: <span className="font-bold text-foreground">{totals.rows}</span> · Total: <span className="font-bold text-foreground">R$ {(totals.totalCents / 100).toFixed(2)}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportPDF} className="gap-2">
                <FileDown className="h-4 w-4" /> Exportar PDF
              </Button>
              <Button onClick={exportExcel} className="gap-2">
                <FileDown className="h-4 w-4" /> Exportar Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle>Prévia</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Comanda#</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 50).map(r => (
                <TableRow key={`${r.orderId}-${r.item}-${r.createdAt}`}
                  >
                  <TableCell className="font-mono text-xs">{r.orderId}</TableCell>
                  <TableCell className="text-sm">{formatDateTimeBR(r.createdAt)}</TableCell>
                  <TableCell className="font-bold">{r.comandaNumber}</TableCell>
                  <TableCell className="text-sm">{r.status}</TableCell>
                  <TableCell className="font-medium">{r.item}</TableCell>
                  <TableCell className="text-sm">{r.category}</TableCell>
                  <TableCell className="text-right font-mono">{r.qty}</TableCell>
                  <TableCell className="text-right font-mono font-bold">R$ {(r.totalCents / 100).toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    Nenhum resultado para os filtros atuais.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Observação: exportação PDF/Excel funciona no frontend, mas requer instalar as dependências adicionadas no package.json.
      </div>
    </div>
  );
}

/*
RECEIPT MAP (Admin history panel reprint)
- buildSelectedReceiptText() uses buildReceiptText() (same as Caixa/Histórico), so:
  - hora sempre em America/Sao_Paulo
  - forma de pagamento / splits (via /api/receipts/:id/payments + fallback localStorage)
  - layout térmico 80mm (~42 colunas)
- data source: useStore() orders + orderItems + comandas; rows built in AdminHistoryPanel
- print path: setPrintText(...) then window.print()
*/
