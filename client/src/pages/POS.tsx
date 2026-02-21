import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { MenuGrid } from "@/components/pos/MenuGrid";
import { Cart } from "@/components/pos/Cart";
import { ComandaSelector } from "@/components/pos/ComandaSelector";
import { useStore } from "@/store/useStore";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function POSPage() {
  const { activeComandaId, comandas, cancelComandaOpening } = useStore();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const { toast } = useToast();
  
  const activeComanda = comandas.find(c => c.id === activeComandaId);
  const canCancelOpening = !!activeComanda && activeComanda.status === 'occupied' && activeComanda.total === 0;

  const handleCancelOpening = () => {
    if (!activeComanda) return;
    cancelComandaOpening(activeComanda.id);
    toast({
      title: "Abertura cancelada",
      description: `A comanda #${activeComanda.number} voltou para LIVRE.`,
      className: "bg-emerald-500 text-white border-none",
    });
  };

  return (
    <Layout>
      <div className="flex flex-col lg:flex-row h-full">
        {/* Main Content */}
        <div className="flex-1 flex flex-col h-full min-w-0">
          
          {/* Mobile Comanda Trigger */}
          <div className="lg:hidden p-4 border-b bg-card">
            <div className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full justify-between h-12 border-2"
                onClick={() => setSelectorOpen(true)}
              >
                <span className="font-bold">
                  {activeComanda 
                    ? `Comanda #${activeComanda.number} (${activeComanda.status === 'available' ? 'Livre' : 'Ocupada'})` 
                    : "Selecionar Comanda"}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>

              {canCancelOpening && (
                <Button
                  variant="destructive"
                  className="w-full h-11 rounded-xl"
                  onClick={handleCancelOpening}
                >
                  Cancelar abertura da comanda
                </Button>
              )}
            </div>
          </div>

          {/* Desktop Top Bar */}
          <div className="hidden lg:flex items-center justify-between p-4 border-b bg-card">
            <div>
              <h1 className="text-2xl font-display font-bold">Ponto de Venda</h1>
              <p className="text-muted-foreground text-sm">Selecione itens para adicionar ao pedido</p>
            </div>
            <div className="flex items-center gap-3">
              {canCancelOpening && (
                <Button
                  variant="destructive"
                  className="h-12 px-5 rounded-xl"
                  onClick={handleCancelOpening}
                >
                  Cancelar abertura
                </Button>
              )}
              <Button 
                onClick={() => setSelectorOpen(true)}
                variant="outline"
                className="h-12 px-6 border-2 border-primary/20 hover:border-primary/50 bg-primary/5 hover:bg-primary/10 text-primary font-bold rounded-xl transition-all"
              >
                {activeComanda 
                  ? <span className="flex items-center gap-2">Comanda <span className="text-xl">#{activeComanda.number}</span></span>
                  : "Selecionar Comanda"
                }
              </Button>
            </div>
          </div>

          <MenuGrid />
        </div>

        {/* Cart Sidebar */}
        <Cart />
      </div>

      <ComandaSelector open={selectorOpen} onOpenChange={setSelectorOpen} />
    </Layout>
  );
}
