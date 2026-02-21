import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import POSPage from "@/pages/POS";
import ComandasPage from "@/pages/Comandas";
import KitchenPage from "@/pages/Kitchen";
import CashierPage from "@/pages/Cashier";
import AdminPage from "@/pages/Admin";
import { BackendBootstrap } from "@/components/backend/BackendBootstrap";

function Router() {
  return (
    <Switch>
      <Route path="/" component={POSPage} />
      <Route path="/comandas" component={ComandasPage} />
      <Route path="/cozinha" component={KitchenPage} />
      <Route path="/caixa" component={CashierPage} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BackendBootstrap />
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
