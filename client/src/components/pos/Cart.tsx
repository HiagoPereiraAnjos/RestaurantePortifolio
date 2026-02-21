import { useStore } from "@/store/useStore";
import { Trash2, ShoppingBasket, ChevronRight, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { isKitchenCategory } from "@/lib/domain";

export function Cart() {
  return (
    <>
      {/* Desktop Cart - Always visible on right */}
      <div className="hidden lg:flex w-[400px] h-full flex-col bg-card border-l z-40">
        <CartContent />
      </div>

      {/* Mobile/Tablet Cart - Sheet */}
      <div className="lg:hidden fixed bottom-20 right-4 z-50">
        <CartSheet />
      </div>
    </>
  );
}

function CartSheet() {
  const { cartsByComanda, activeComandaId } = useStore();
  const [isOpen, setIsOpen] = useState(false);

  const cart = activeComandaId ? (cartsByComanda[activeComandaId] ?? []) : [];
  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button size="lg" className="rounded-full h-14 w-14 shadow-xl shadow-primary/30 relative">
          <ShoppingBasket className="h-6 w-6" />
          {totalItems > 0 && (
            <span className="absolute -top-1 -right-1 bg-destructive text-white text-[10px] font-bold h-5 w-5 rounded-full flex items-center justify-center border-2 border-background">
              {totalItems}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[85vh] p-0 rounded-t-[2rem]">
        <CartContent onClose={() => setIsOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function CartContent({ onClose }: { onClose?: () => void }) {
  const {
    cartsByComanda,
    activeComandaId,
    comandas,
    orders,
    orderItems,
    categories,
    submitOrder,
    removeFromCart,
    incrementInCart,
    decrementFromCart,
  } = useStore();
  const { toast } = useToast();

  const activeComanda = comandas.find(c => c.id === activeComandaId);
  const cart = activeComandaId ? (cartsByComanda[activeComandaId] ?? []) : [];
  const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const launchedItems = (() => {
    // Só mostramos "itens lançados" quando a comanda selecionada está OCUPADA.
    // Isso evita exibir itens antigos de pedidos já fechados quando a comanda volta a ficar livre.
    if (!activeComandaId) return [] as Array<{ name: string; qty: number; status: string }>; 
    if (!activeComanda || activeComanda.status !== 'occupied') return [] as Array<{ name: string; qty: number; status: string }>; 

    // Também ignoramos pedidos já fechados (status = 'closed').
    const orderIds = orders
      .filter(o => o.comandaId === activeComandaId && o.status === 'open')
      .map(o => o.id);
    const its = orderItems.filter(oi => orderIds.includes(oi.orderId));
    const map = new Map<string, { name: string; qty: number; status: string }>();
    for (const it of its) {
      // Importante: itens com o mesmo nome podem ter preços diferentes (ex: Buffet por kg).
      // Por isso, incluímos o preço na chave para não misturar lançamentos diferentes.
      const key = `${it.name}__${it.status}__${it.price}`;
      map.set(key, {
        name: it.name,
        qty: (map.get(key)?.qty ?? 0) + it.quantity,
        status: it.status,
      });
    }
    const arr = [...map.values()];
    const order = { pending: 0, preparing: 1, ready: 2, delivered: 3 } as const;
    return arr.sort((a, b) => (order[a.status as keyof typeof order] ?? 99) - (order[b.status as keyof typeof order] ?? 99));
  })();

  const handleSubmit = () => {
    if (!activeComandaId) {
      toast({
        title: "Selecione uma comanda",
        description: "Você precisa selecionar uma comanda antes de enviar o pedido.",
        variant: "destructive"
      });
      return;
    }

    // Regra do cliente: nao existe comanda suja.

    const hasKitchenItems = cart.some(i => isKitchenCategory(categories, i.category));
    const hasNonKitchenItems = cart.some(i => !isKitchenCategory(categories, i.category));
    submitOrder();
    toast({
      title: hasKitchenItems
        ? (hasNonKitchenItems ? "Pedido registrado e itens enviados à cozinha" : "Itens enviados à cozinha")
        : "Pedido registrado",
      description: `Itens adicionados à comanda #${activeComanda?.number}`,
      className: "bg-emerald-500 text-white border-none",
    });
    onClose?.();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-muted/10">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display font-bold text-xl">Pedido Atual</h2>
          {activeComanda && (
            <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-bold border border-primary/20">
              Comanda #{activeComanda.number}
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {cart.length === 0 ? "Carrinho vazio" : `${cart.length} itens no carrinho`}
        </p>
      </div>

      <ScrollArea className="flex-1 px-6 py-4">
        {/* Itens já lançados na comanda (quando ela está ocupada) */}
        {activeComandaId && launchedItems.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-muted-foreground">Itens lançados</h3>
              <span className="text-xs text-muted-foreground">(comanda ocupada)</span>
            </div>
            <div className="space-y-2">
              {launchedItems.map((li) => (
                <div key={`${li.name}-${li.status}`} className="flex items-center justify-between p-2 rounded-xl bg-muted/30 border">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{li.name}</div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      {li.status === 'pending'
                        ? 'Pendente'
                        : li.status === 'preparing'
                          ? 'Preparando'
                          : li.status === 'ready'
                            ? 'Pronto'
                            : li.status === 'delivered'
                              ? 'Entregue'
                              : 'Cancelado'}
                    </div>
                  </div>
                  <div className="font-mono font-bold">{li.qty}x</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/50 border-2 border-dashed border-muted-foreground/10 rounded-xl mt-4">
            <ShoppingBasket className="h-12 w-12 mb-2" />
            <p>Adicione itens do menu</p>
          </div>
        ) : (
          <div className="space-y-4">
            {cart.map((item) => (
              <div key={item.tempId} className="flex gap-4 p-3 rounded-xl bg-card border shadow-sm group">
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-medium text-sm truncate pr-2">{item.name}</h4>
                    <span className="font-mono text-sm font-bold">R$ {(item.price * item.quantity / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{item.quantity}x R$ {(item.price / 100).toFixed(2)}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => decrementFromCart(item.tempId)}
                        className="p-1.5 rounded-md border hover:bg-muted transition-colors"
                        aria-label="Diminuir"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => incrementInCart(item.tempId)}
                        className="p-1.5 rounded-md border hover:bg-muted transition-colors"
                        aria-label="Aumentar"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => removeFromCart(item.tempId)}
                        className="text-destructive/60 hover:text-destructive p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
                        aria-label="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="p-6 border-t bg-card mt-auto">
        <div className="flex justify-between items-end mb-6">
          <span className="text-muted-foreground">Total</span>
          <span className="text-3xl font-display font-bold text-foreground">
            R$ {(total / 100).toFixed(2)}
          </span>
        </div>
        
        <Button 
          className="w-full h-14 text-lg font-bold rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all"
          disabled={cart.length === 0 || !activeComandaId}
          onClick={handleSubmit}
        >
          Enviar Pedido
          <ChevronRight className="ml-2 h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
