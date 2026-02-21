import { useMemo } from "react";
import { useStore } from "@/store/useStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ComandaSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComandaSelector({ open, onOpenChange }: ComandaSelectorProps) {
  const { comandas, activeComandaId, setActiveComanda } = useStore();
  const sortedComandas = useMemo(
    () => [...comandas].sort((a, b) => a.number - b.number),
    [comandas],
  );

  const handleSelect = (id: number) => {
    setActiveComanda(id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display">Selecionar Comanda</DialogTitle>
            <DialogDescription className="sr-only">Escolha uma comanda para abrir ou continuar o atendimento.</DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3 mt-4">
          {sortedComandas.map((comanda) => (
            <button
              key={comanda.id}
              onClick={() => handleSelect(comanda.id)}
              className={cn(
                "aspect-square rounded-xl flex flex-col items-center justify-center border-2 transition-all duration-200",
                "hover:scale-105 active:scale-95",
                activeComandaId === comanda.id && "ring-4 ring-primary/20",
                comanda.status === 'available' && "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100",
                comanda.status === 'occupied' && "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
              )}
            >
              <span className="text-xl font-bold font-display">{comanda.number}</span>
              <span className="text-[10px] uppercase font-bold tracking-wider mt-1">
                {comanda.status === 'available' ? 'Livre' : 'Em uso'}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
