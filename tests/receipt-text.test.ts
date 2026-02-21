import test from "node:test";
import assert from "node:assert/strict";
import { buildReceiptText } from "../client/src/utils/receipt.ts";

test("buildReceiptText: shows split payment lines when payments are present", () => {
  const text = buildReceiptText({
    comandaId: 7,
    comandaNumber: 12,
    closedAtISO: "2026-02-02T18:30:00.000Z",
    items: [{ name: "Batata", quantity: 2, price: 1500 }],
    payments: [
      { method: "pix", amountCents: 2000 },
      { method: "credito", amountCents: 1000 },
    ],
  });

  assert.match(text, /Pagamentos:/);
  assert.match(text, /PIX:\s*R\$\s*20\.00/);
  assert.match(text, /Cr[ée]dito:\s*R\$\s*10\.00/i);
  assert.doesNotMatch(text, /Forma de pagamento:/);
});

test("buildReceiptText: falls back to paymentMethod when payments list is empty", () => {
  const text = buildReceiptText({
    comandaId: 3,
    items: [{ name: "Suco", quantity: 1, price: 900 }],
    paymentMethod: "pix",
  });

  assert.match(text, /Forma de pagamento:\s*PIX/i);
});
