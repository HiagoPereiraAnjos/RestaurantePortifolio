export type ReceiptPayment = { method: string; amountCents: number };

const KEY_PREFIX = "receipt_payments:";

const LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão Débito",
  credito: "Cartão Crédito",
  vale: "Vale/Refeição",
  outros: "Outros",
};

export function paymentLabel(method: string) {
  return LABELS[method] ?? method;
}

export function saveReceiptPayments(receiptId: string, payments: ReceiptPayment[]) {
  if (!receiptId) return;
  try {
    localStorage.setItem(`${KEY_PREFIX}${receiptId}`, JSON.stringify(payments ?? []));
  } catch {
    // ignore
  }
}

export function getReceiptPayments(receiptId: string): ReceiptPayment[] {
  if (!receiptId) return [];
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${receiptId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p: any) => ({ method: String(p?.method ?? ""), amountCents: Number(p?.amountCents ?? 0) }))
      .filter((p) => p.method && Number.isFinite(p.amountCents) && p.amountCents > 0);
  } catch {
    return [];
  }
}
