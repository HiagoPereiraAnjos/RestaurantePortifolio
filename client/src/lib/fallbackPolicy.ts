import { allowApiLocalFallback, getBackendMode } from "@/api/config";

export const FALLBACK_MESSAGES = {
  apiWriteBlocked:
    "Backend indisponivel no modo API. A operacao foi bloqueada para evitar divergencia entre dispositivo e banco.",
  historyPaymentsCache:
    "Nao foi possivel carregar pagamentos do backend. Usando pagamentos em cache deste dispositivo.",
  historyOrderMethodFallback:
    "Nao foi possivel carregar pagamentos do backend. Usando forma de pagamento do pedido como fallback.",
  historyMissingReceiptId:
    "Este fechamento nao possui receiptId. Usando fallback de forma de pagamento do pedido.",
  cashierFinalizeBlocked:
    "Nao foi possivel finalizar no backend. Nenhuma mudanca local foi aplicada para evitar inconsistencias.",
  cashierNoOpenOrdersApi:
    "Nenhum pedido aberto foi encontrado para esta comanda no modo API. Atualize os dados e tente novamente.",
  cashierFinalizeOfflineFallback:
    "Backend indisponivel. Finalizacao aplicada localmente por contingencia.",
  cashierPaymentsCache:
    "Pagamentos nao puderam ser salvos no backend. Reimpressao em outros dispositivos pode nao refletir este fechamento.",
} as const;

export function canUseApiLocalFallback() {
  return getBackendMode() !== "api" || allowApiLocalFallback();
}
