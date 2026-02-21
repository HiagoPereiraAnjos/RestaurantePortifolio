import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, ShoppingBasket, ChefHat, Wallet, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { href: "/", icon: ShoppingBasket, label: "PDV" },
  { href: "/comandas", icon: LayoutDashboard, label: "Comandas" },
  { href: "/cozinha", icon: ChefHat, label: "Cozinha" },
  { href: "/caixa", icon: Wallet, label: "Caixa" },
  { href: "/admin", icon: Settings, label: "Admin" },
];

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-20 flex-col items-center border-r bg-card py-6 shadow-sm z-50">
        <div className="mb-8 p-2 rounded-xl bg-primary/10">
          <ChefHat className="h-8 w-8 text-primary" />
        </div>
        
        <nav className="flex flex-1 flex-col gap-4 w-full px-2">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-xl p-3 transition-all duration-200",
                isActive 
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}>
                <item.icon className="h-6 w-6" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative flex flex-col h-full w-full">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t flex justify-around items-center px-2 z-50 pb-safe">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} className={cn(
              "flex flex-col items-center justify-center p-2 rounded-lg transition-colors",
              isActive ? "text-primary" : "text-muted-foreground"
            )}>
              <item.icon className={cn("h-6 w-6 mb-0.5", isActive && "fill-current/20")} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
