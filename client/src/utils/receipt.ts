import { paymentLabel } from "@/lib/receiptPayments";
import { formatDateTimeBR } from "@/utils/datetime";

export type ReceiptItem = { name: string; quantity: number; price: number };
export type ReceiptPayment = { method: string; amountCents: number };

export type ReceiptInput = {
  comandaId: number;
  comandaNumber?: number | null;
  closedAtISO?: string | null;
  paidAtISO?: string | null;
  createdAtISO?: string | null;
  items: ReceiptItem[];
  totalCents?: number;
  payments?: ReceiptPayment[];
  paymentMethod?: string | null;
  footerLines?: string[];
};

const RECEIPT_LINE_WIDTH = 42;

const money = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

const repeat = (ch: string, n: number) => Array.from({ length: n }).map(() => ch).join("");

const center = (text: string, width: number) => {
  const t = text.trim();
  if (t.length >= width) return t.slice(0, width);
  const left = Math.floor((width - t.length) / 2);
  const right = width - t.length - left;
  return `${repeat(" ", left)}${t}${repeat(" ", right)}`;
};

const wrap = (text: string, width: number) => {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length <= width) line = next;
    else {
      if (line) out.push(line);
      if (w.length > width) {
        for (let i = 0; i < w.length; i += width) out.push(w.slice(i, i + width));
        line = "";
      } else {
        line = w;
      }
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: "PIX",
  cash: "Dinheiro",
  dinheiro: "Dinheiro",
  credit: "Crédito",
  credito: "Crédito",
  debit: "Débito",
  debito: "Débito",
  vale: "Vale/Refeição",
  outros: "Outros",
};

function labelPaymentMethod(method?: string | null): string {
  const key = String(method ?? "").trim().toLowerCase();
  if (!key) return "Não informado";
  return PAYMENT_METHOD_LABELS[key] ?? "Não informado";
}

function resolvePaymentMethodLabel(input: ReceiptInput): string {
  const direct = labelPaymentMethod(input.paymentMethod);
  if (direct !== "Não informado") return direct;

  const methods = (input.payments ?? [])
    .filter((p) => (p?.amountCents ?? 0) > 0)
    .map((p) => String(p.method ?? "").trim().toLowerCase())
    .filter(Boolean);

  const unique = Array.from(new Set(methods));
  if (unique.length === 1) return labelPaymentMethod(unique[0]);
  return "Não informado";
}

export function buildReceiptText(input: ReceiptInput): string {
  const L = RECEIPT_LINE_WIDTH;
  const sep = repeat("-", L);

  const dtValue = input.closedAtISO ?? input.paidAtISO ?? input.createdAtISO ?? "";
  const dtStr = dtValue ? formatDateTimeBR(dtValue) : "";

  const header = [
    center("RESTAURANTE VILLARES", L),
    "",
    center(`Comanda #${input.comandaNumber ?? input.comandaId}`, L),
    center(dtStr, L),
    "",
    sep,
  ];

  const lines: string[] = [];
  for (const it of input.items) {
    const totalItem = money(it.price * it.quantity);
    const leftPrefix = `${it.quantity}x `;
    const descWidth = L - 1 - 10; // 1 space + 10 for price
    const wrapped = wrap(`${leftPrefix}${it.name}`, descWidth);

    wrapped.forEach((w, idx) => {
      const left = w.padEnd(descWidth, " ");
      if (idx === 0) {
        const right = totalItem.padStart(10, " ");
        lines.push(`${left} ${right}`);
      } else {
        lines.push(`${left} ${repeat(" ", 11)}`.slice(0, L));
      }
    });
  }

  const totalCents = Number.isFinite(input.totalCents)
    ? Number(input.totalCents)
    : input.items.reduce((acc, it) => acc + it.price * it.quantity, 0);

  const totalLine = (() => {
    const left = "TOTAL".padEnd(L - 10 - 1, " ");
    const right = money(totalCents).padStart(10, " ");
    return `${left} ${right}`;
  })();

  const paymentLines = (() => {
    const parts = (input.payments ?? []).filter((p) => (p?.amountCents ?? 0) > 0);
    if (!parts.length) return [] as string[];
    const labeled = parts.map((p) => `${paymentLabel(p.method)}: ${money(p.amountCents)}`);
    return [parts.length === 1 ? `Pagamento: ${labeled[0]}` : `Pagamentos: ${labeled.join(", ")}`];
  })();

  const footerLines = input.footerLines ?? [];

  // Evita duplicar informação quando já temos linhas detalhadas de pagamento.
  // Ex.: "Forma de pagamento: PIX" + "Pagamento: PIX (...)".
  const paymentMethodLine = paymentLines.length
    ? null
    : `Forma de pagamento: ${resolvePaymentMethodLabel(input)}`;

  const footer = [
    sep,
    "",
    totalLine,
    "",
    ...(paymentMethodLine ? [paymentMethodLine] : []),
    ...(paymentLines.length ? ["", ...paymentLines, ""] : [""]),
    ...footerLines,
    ...(footerLines.length ? [""] : []),
    center("Obrigado pela preferência!", L),
  ];

  return [...header, ...lines, "", ...footer].join("\n");
}
