import test from "node:test";
import assert from "node:assert/strict";

test("pdf export: generates a non-empty PDF buffer", async () => {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(12);
  doc.text("Relatorio de Vendas", 14, 14);
  autoTable(doc, {
    head: [["Pedido", "Data", "Comanda", "Status", "Item", "Categoria", "Qtd", "Unit", "Total"]],
    body: [
      ["1", "02/02/2026 10:00:00", "12", "closed", "Batata", "porcoes", "1", "R$ 10.00", "R$ 10.00"],
      ["2", "02/02/2026 10:10:00", "13", "closed", "Suco", "bebidas", "2", "R$ 5.00", "R$ 10.00"],
    ],
    startY: 24,
    styles: { fontSize: 8 },
  });

  const buffer = doc.output("arraybuffer");
  assert.ok(buffer.byteLength > 500);
  const prefix = Buffer.from(buffer).subarray(0, 4).toString("ascii");
  assert.equal(prefix, "%PDF");
});
