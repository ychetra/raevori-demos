import { expect, test, type Browser } from "@playwright/test";

// These tests drive a laptop and a phone together, so they run once (in the desktop project).
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "multi-device test runs once"));

async function kitchenAndPhone(browser: Browser) {
  const desk = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await desk.goto("/table-order");
  const menuUrl = await desk.locator("[data-menu-url]").getAttribute("data-menu-url");
  expect(menuUrl).toMatch(/\/table-order\/menu\?room=[\w-]{16,}&table=4$/);
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await phoneCtx.newPage();
  await phone.goto(menuUrl!);
  return { desk, phone, phoneCtx };
}

test("phone order lands on the kitchen screen live, and status flows back", async ({ browser }) => {
  const { desk, phone } = await kitchenAndPhone(browser);

  await phone.getByRole("button", { name: "ខ្មែរ" }).click();
  await phone.getByText("ឡាតេទឹកកក").click();
  const sheet = phone.getByRole("dialog");
  await sheet.getByRole("radio", { name: /ធំ/ }).click();
  await sheet.getByRole("radio", { name: "តិច" }).click();
  await sheet.getByRole("button", { name: "+" }).click();
  await sheet.getByRole("button", { name: /បន្ថែម ·/ }).click();
  await phone.getByRole("button", { name: "នំ", exact: true }).click();
  await phone.getByText("នំក្រូសង់ប៊ឺ").click();
  await phone.getByRole("dialog").getByRole("button", { name: /បន្ថែម ·/ }).click();
  await phone.getByRole("button", { name: /មើលកន្ត្រក/ }).click();
  await expect(phone.getByText("$7.50").first()).toBeVisible();
  await phone.getByRole("button", { name: /បង់តាម KHQR/ }).click();

  const paidAt = Date.now();
  await phone.getByRole("button", { name: "សាកល្បងបង់ប្រាក់" }).click();
  const ticket = desk.locator('article[data-status="new"]', { hasText: "Table 4" });
  await expect(ticket).toBeVisible({ timeout: 5000 });
  expect(Date.now() - paidAt).toBeLessThan(1000 + 500); // 1 s budget plus Playwright polling slack
  await expect(ticket).toContainText("2× Iced latte");
  await expect(ticket).toContainText("Large · Less ice");
  await expect(ticket).toContainText("$7.50");

  await ticket.getByRole("button", { name: "Start preparing" }).click();
  await expect(phone.locator('[data-status="preparing"]')).toBeVisible();
  await desk.locator('article[data-status="preparing"]', { hasText: "Table 4" }).getByRole("button", { name: "Mark ready" }).click();
  await expect(phone.locator('[data-status="ready"]')).toBeVisible();
  await expect(phone.getByRole("heading", { level: 1 })).toHaveText("រួចរាល់! សូមមកយកនៅបញ្ជរ។");
});

test("an unknown room shows the closed screen", async ({ page }) => {
  await page.goto("/table-order/menu?room=doesnotexist&table=4");
  await expect(page.getByText("This demo table has closed")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start a new demo" })).toHaveAttribute("href", "/table-order");
});

test("a phone that drops offline catches up when it reconnects", async ({ browser }) => {
  const { desk, phone, phoneCtx } = await kitchenAndPhone(browser);
  await phone.getByText("Iced latte").click();
  await phone.getByRole("dialog").getByRole("button", { name: /Add ·/ }).click();
  await phone.getByRole("button", { name: /View cart/ }).click();
  await phone.getByRole("button", { name: /Pay with KHQR/ }).click();
  await phone.getByRole("button", { name: "Simulate payment" }).click();
  await expect(phone.locator('[data-status="new"]')).toBeVisible();

  await phoneCtx.setOffline(true);
  const ticket = desk.locator("article", { hasText: "Table 4" });
  await ticket.getByRole("button", { name: "Start preparing" }).click();
  await desk.locator('article[data-status="preparing"]', { hasText: "Table 4" }).getByRole("button", { name: "Mark ready" }).click();
  await phone.waitForTimeout(3000);
  await phoneCtx.setOffline(false);
  await expect(phone.locator('[data-status="ready"]')).toBeVisible({ timeout: 15_000 });
});
