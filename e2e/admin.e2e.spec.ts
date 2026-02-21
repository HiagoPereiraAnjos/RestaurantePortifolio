import { expect, test } from "@playwright/test";

async function adminLogin(page: import("@playwright/test").Page) {
  await page.goto("/admin");
  const dashboardTab = page.getByRole("tab", { name: "Dashboard" });
  if (await dashboardTab.isVisible()) return;

  await expect(page.getByText("Login da Administração")).toBeVisible();
  await page.locator('input[placeholder="admin"]').fill("admin");
  await page.locator('input[type="password"]').first().fill("admin");
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.getByRole("tab", { name: "Dashboard" })).toBeVisible();
}

test("admin login and reports exports (pdf/xlsx)", async ({ page }) => {
  await adminLogin(page);

  await page.getByRole("tab", { name: /Relatórios/i }).click();
  await expect(page.getByText("Filtros")).toBeVisible();

  const excelDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar Excel/i }).click();
  const excel = await excelDownload;
  expect(excel.suggestedFilename().toLowerCase()).toContain(".xlsx");

  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar PDF/i }).click();
  const pdf = await pdfDownload;
  expect(pdf.suggestedFilename().toLowerCase()).toContain(".pdf");
});

test("admin histórico shows finalized receipt with payment split", async ({ page, request, baseURL }) => {
  const comandaId = 1;
  const receiptId = `E2E-${Date.now().toString(36).toUpperCase()}`;

  const create = await request.post(`${baseURL}/api/orders`, {
    data: {
      comandaId,
      status: "open",
      items: [
        {
          orderId: 0,
          menuItemId: 1,
          name: "Item E2E",
          price: 1200,
          quantity: 2,
          category: "lanches",
          status: "delivered",
        },
      ],
    },
  });
  expect(create.ok()).toBeTruthy();
  const created = (await create.json()) as { order: { id: number } };

  const finalize = await request.post(`${baseURL}/api/orders/${created.order.id}/finalize`, {
    data: { receiptId, paymentMethod: "pix" },
  });
  expect(finalize.ok()).toBeTruthy();

  const split = await request.put(`${baseURL}/api/receipts/${encodeURIComponent(receiptId)}/payments`, {
    data: {
      payments: [
        { method: "pix", amountCents: 1000 },
        { method: "credito", amountCents: 1400 },
      ],
    },
  });
  expect(split.ok()).toBeTruthy();

  await adminLogin(page);
  await page.getByRole("tab", { name: /Histórico/i }).click();
  await expect(page.getByRole("heading", { name: "Histórico" })).toBeVisible();

  await page.getByPlaceholder(/Buscar por ID do pedido/i).fill(receiptId);
  await expect(page.getByText(receiptId)).toBeVisible();
});
