import { useState, useMemo } from "react";
import { useStore } from "@/store/useStore";
import { MenuItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function MenuGrid() {
  const { menuItems, categories, addToCart, activeComandaId, comandas } = useStore();
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  // Buffet por kg: valor informado manualmente sempre que adicionar.
  const [kgDialogOpen, setKgDialogOpen] = useState(false);
  const [kgItem, setKgItem] = useState<MenuItem | null>(null);
  const [kgValue, setKgValue] = useState<string>("");

  const handleAddToCart = (item: MenuItem) => {
    if (!item.available) {
      toast({
        title: "Item indisponível",
        description: "Este item está desativado no cardápio.",
        variant: "destructive",
      });
      return;
    }
    if (!activeComandaId) {
      toast({
        title: "Selecione uma comanda",
        description: "Escolha uma comanda antes de adicionar itens.",
        variant: "destructive",
      });
      return;
    }
    const comanda = comandas.find(c => c.id === activeComandaId);
    if (!comanda) return;

    // Buffet por kg: pedir o valor manualmente a cada lançamento.
    if (item.category === 'buffet_kg') {
      setKgItem(item);
      setKgValue("");
      setKgDialogOpen(true);
      return;
    }
    addToCart(item);
    toast({
      title: "Item adicionado",
      description: `${item.name} foi adicionado ao carrinho.`,
      duration: 1500,
    });
  };

  const confirmKg = () => {
    if (!kgItem) return;
    // Aceita "12,34" ou "12.34"
    const raw = kgValue.trim().replace(/\./g, "").replace(/,/g, ".");
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      toast({
        title: "Valor inválido",
        description: "Informe um valor maior que zero (ex: 24,90).",
        variant: "destructive",
      });
      return;
    }
    const cents = Math.round(n * 100);
    addToCart(kgItem, { overridePriceCents: cents });
    toast({
      title: "Item adicionado",
      description: `${kgItem.name} foi adicionado ao carrinho.`,
      duration: 1500,
    });
    setKgDialogOpen(false);
    setKgItem(null);
    setKgValue("");
  };

  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      // Admin can deactivate items; deactivated items must not appear in the POS.
      if (!item.available) return false;
      const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
      const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [menuItems, activeCategory, search]);

  return (
    <div className="flex flex-col h-full bg-muted/30">
      {/* Dialog: Buffet por kg */}
      <Dialog open={kgDialogOpen} onOpenChange={(open) => {
        setKgDialogOpen(open);
        if (!open) {
          setKgItem(null);
          setKgValue("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buffet por kg</DialogTitle>
            <DialogDescription>
              Informe o valor cobrado para este prato (R$). Esse valor será registrado nesse lançamento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-sm font-medium">Valor (R$)</label>
            <Input
              inputMode="decimal"
              placeholder="Ex: 24,90"
              value={kgValue}
              onChange={(e) => setKgValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmKg();
              }}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setKgDialogOpen(false)}>Cancelar</Button>
            <Button onClick={confirmKg}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Header & Search */}
      <div className="p-4 bg-card border-b sticky top-0 z-10 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar item..." 
            className="pl-9 bg-muted/50 border-none shadow-sm focus-visible:ring-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex space-x-2 pb-1">
            {[{ id: 'all', label: 'Todos' }, ...categories].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border",
                  activeCategory === cat.id
                    ? "bg-foreground text-background border-foreground shadow-md"
                    : "bg-background text-muted-foreground border-border hover:border-foreground/20 hover:text-foreground"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>
      </div>

      {/* Grid */}
      <ScrollArea className="flex-1 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 pb-20 lg:pb-4">
          {filteredItems.map((item) => (
            <MenuItemCard key={item.id} item={item} onAdd={() => handleAddToCart(item)} />
          ))}
          {filteredItems.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground opacity-50">
              <Search className="h-12 w-12 mb-2" />
              <p>Nenhum item encontrado</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function MenuItemCard({ item, onAdd }: { item: MenuItem; onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-card border hover:border-primary/50 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 active:scale-95 text-left h-full"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-muted relative">
        {item.image ? (
          <>
            {/* Descriptive comment for Unsplash fallback */}
            {/* Food item image */}
            <img 
              src={item.image} 
              alt={item.name} 
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          </>
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-muted/50">
            <span className="text-4xl font-display text-muted-foreground/20">
              {item.name.charAt(0)}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
          <span className="text-white font-medium text-sm">Adicionar +</span>
        </div>
      </div>
      
      <div className="p-4 flex flex-col flex-1 gap-1">
        <h3 className="font-display font-bold text-base leading-tight group-hover:text-primary transition-colors">
          {item.name}
        </h3>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2 flex-1">
          {item.description}
        </p>
        <div className="flex items-center justify-between mt-auto">
          <span className="font-mono font-bold text-lg text-foreground">
            {item.category === 'buffet_kg'
              ? "Preço variável"
              : `R$ ${(item.price / 100).toFixed(2)}`}
          </span>
        </div>
      </div>
    </button>
  );
}
