import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initRealtimeSync } from "./lib/realtimeSync";

// Keep all pages (Admin/PDV/Cozinha/Caixa) updated in real time across tabs/windows.
initRealtimeSync();

createRoot(document.getElementById("root")!).render(<App />);
