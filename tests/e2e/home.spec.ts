import { expect, test, type Locator, type Page } from "@playwright/test";

test("home links to both demos and back to raevori.com", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Don't read about it. Try it on your phone.");
  await expect(page.getByRole("link", { name: /Table Order/ })).toHaveAttribute("href", "/table-order");
  await expect(page.getByRole("link", { name: /Shop Assistant/ })).toHaveAttribute("href", "/shop-assistant");
  await expect(page.getByRole("link", { name: "raevori.com →" })).toHaveAttribute("href", "https://raevori.com");
  await expect(page.getByRole("link", { name: "Talk to us →" })).toHaveAttribute("href", "https://raevori.com/#contact");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://demo.raevori.com");
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width);

  await page.getByRole("link", { name: /Table Order/ }).click();
  await expect(page).toHaveURL(/\/table-order/);
});

test("robots.txt and sitemap.xml", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const r = await robots.text();
  expect(r).toContain("Disallow: /api/");
  expect(r).toContain("Disallow: /dev/");
  expect(r).toContain("Sitemap: https://demo.raevori.com/sitemap.xml");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const s = await sitemap.text();
  for (const path of ["/", "/table-order", "/shop-assistant"]) expect(s).toContain(`<loc>https://demo.raevori.com${path}</loc>`);
});

test("og image renders", async ({ request }) => {
  const res = await request.get("/opengraph-image");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
});

test("a kitchen URL with a room is noindex, the plain one is indexable", async ({ page }) => {
  await page.goto("/table-order?room=whatever");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  const res = await page.request.get("/table-order");
  expect(await res.text()).not.toContain('name="robots"');
});

/** Press Tab until `target` has focus (fails after `max` presses). */
async function tabTo(page: Page, target: Locator, max = 40) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`could not Tab to ${target}`);
}

test("keyboard only: menu → item sheet → cart → pay", async ({ page, request }) => {
  const created = await request.post("/api/rooms");
  const { id } = await created.json();
  await page.goto(`/table-order/menu?room=${id}&table=4`);

  // Open an item; focus moves into the sheet and Escape closes it, returning focus to the item.
  const latte = page.getByRole("button", { name: /Iced latte/ });
  await tabTo(page, latte);
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(latte).toBeFocused();

  // Open again, pick Large with Space, add with Enter.
  await page.keyboard.press("Enter");
  await tabTo(page, sheet.getByRole("radio", { name: /Large/ }), 15);
  await page.keyboard.press("Space");
  await expect(sheet.getByRole("radio", { name: /Large/ })).toHaveAttribute("aria-checked", "true");
  const add = sheet.getByRole("button", { name: /Add ·/ });
  await tabTo(page, add, 15);
  await page.keyboard.press("Enter");
  await expect(sheet).toBeHidden();

  await tabTo(page, page.getByRole("button", { name: /View cart/ }));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("button", { name: /Pay with KHQR/ }), 15);
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("button", { name: "Simulate payment" }), 15);
  await page.keyboard.press("Space");
  await expect(page.locator('[data-status="new"]')).toBeVisible();
});
