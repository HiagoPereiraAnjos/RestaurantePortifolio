import { Layout } from "@/components/layout/Layout";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { Users, CheckCircle2 } from "lucide-react";
import { useMemo } from "react";

export default function ComandasPage() {
  const { comandas, setActiveComanda } = useStore();
  const [_, setLocation] = useLocation();
  const sortedComandas = useMemo(
    () => [...comandas].sort((a, b) => a.number - b.number),
    [comandas],
  );

  const handleComandaClick = (id: number) => {
    setActiveComanda(id);
    setLocation("/");
  };

  const stats = {
    available: comandas.filter(c => c.status === 'available').length,
    occupied: comandas.filter(c => c.status === 'occupied').length,
  };

  return (
    <Layout>
      <div className="p-6 md:p-8 h-full flex flex-col overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Comandas</h1>
            <p className="text-muted-foreground">Visão geral do status das comandas</p>
          </div>

          <div className="flex gap-4">
            <StatBadge label="Livres" count={stats.available} color="emerald" icon={CheckCircle2} />
            <StatBadge label="Ocupadas" count={stats.occupied} color="blue" icon={Users} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {sortedComandas.map((comanda) => (
              <button
                key={comanda.id}
                onClick={() => handleComandaClick(comanda.id)}
                className={cn(
                  "aspect-square rounded-2xl flex flex-col items-center justify-center border-2 transition-all duration-300 relative group overflow-hidden shadow-sm hover:shadow-lg",
                  "hover:-translate-y-1",
                  // Livre deve ficar claramente verde.
                  comanda.status === 'available' && "bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-400",
                  comanda.status === 'occupied' && "bg-blue-50 border-blue-200 text-blue-600 hover:border-blue-400",
                )}
              >
                <div className={cn(
                  "absolute top-0 w-full h-1.5",
                  comanda.status === 'available' && "bg-emerald-500",
                  comanda.status === 'occupied' && "bg-blue-500",
                )} />
                
                <span className="text-4xl md:text-5xl font-display font-bold mb-2">
                  {comanda.number}
                </span>
                
                <span className="text-xs font-bold uppercase tracking-widest opacity-70 px-2 py-1 rounded-full bg-black/5">
                  {comanda.status === 'available' ? 'Livre' : 'Ocupada'}
                </span>

                {comanda.total > 0 && (
                  <div className="mt-3 font-mono font-medium text-sm text-foreground/80">
                    R$ {(comanda.total / 100).toFixed(2)}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function StatBadge({ label, count, color, icon: Icon }: any) {
  const colors = {
    emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    red: "bg-red-100 text-red-700 border-red-200",
  };

  return (
    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full border", colors[color as keyof typeof colors])}>
      <Icon className="h-4 w-4" />
      <span className="text-sm font-bold">{count} {label}</span>
    </div>
  );
}
