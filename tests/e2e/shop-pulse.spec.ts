import { expect, test, type Page } from "@playwright/test";

// Viewports and clocks are set per test, so each runs once (in the desktop project).
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once"));

/** Phnom Penh is UTC+7 all year. */
const phnomPenh = (hhmm: string) => new Date(`2026-10-28T${hhmm}:00+07:00`);

async function openDashboard(page: Page) {
  await page.goto("/shop-pulse");
  const menu = page.locator("[data-menu-url]");
  await expect(menu).toBeVisible();
  const room = new URL((await menu.getAttribute("data-menu-url"))!).searchParams.get("room");
  expect(room).toMatch(/^[\w-]{16,}$/);
  return room!;
}

const ordersValue = (page: Page) => page.locator('[data-kpi="orders"] p').nth(1);

test("an order posted to the room shows in the live feed and the Orders tile within 1 s", async ({ page }) => {
  const room = await openDashboard(page);
  const feed = page.locator("[data-live-feed]");
  await expect(feed.getByRole("heading", { name: "Live orders" })).toBeVisible();
  const before = Number(await ordersValue(page).textContent());

  const res = await page.request.post(`/api/rooms/${room}/orders`, {
    data: { table: 9, lines: [{ itemId: "americano", qty: 3, options: {} }] },
  });
  expect(res.status()).toBe(201);
  const postedAt = Date.now();
  const order = await res.json();

  await expect(feed.locator(`[data-sale="${order.id}"]`)).toContainText("Table 9", { timeout: 1000 });
  await expect(ordersValue(page)).toHaveText(String(before + 1), { timeout: 1000 });
  expect(Date.now() - postedAt).toBeLessThan(1000 + 300); // 1 s budget plus polling slack
});

test("Sales by hour shows a tooltip on hover and on keyboard", async ({ page }) => {
  await page.clock.setFixedTime(phnomPenh("14:32"));
  await openDashboard(page);
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Sales by hour" }) });
  const chart = section.getByRole("img");
  const tip = section.locator("[data-chart-tip]");

  // At 14:32 the morning hours have bars; hover the third one.
  const box = (await chart.boundingBox())!;
  const bars = section.locator("svg path[fill='var(--accent)']");
  expect(await bars.count()).toBeGreaterThan(3);
  const bar = (await bars.nth(2).boundingBox())!;
  await page.mouse.move(bar.x + bar.width / 2, Math.max(box.y + 5, bar.y + bar.height / 2));
  await expect(tip).toBeVisible();
  await expect(tip).toContainText(/\d{2}:00–\d{2}:00/);
  await expect(tip).toContainText("Today");

  await page.mouse.move(0, 0);
  await expect(tip).toHaveCount(0);

  // Keyboard: focus the chart, arrows pick the current hour first.
  await chart.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tip).toContainText("14:00–15:00");
  await page.keyboard.press("ArrowLeft");
  await expect(tip).toContainText("13:00–14:00");
  await chart.blur();
  await expect(tip).toHaveCount(0);
});

test("no sideways scroll at 360 px in Khmer", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.clock.setFixedTime(phnomPenh("14:32"));
  await openDashboard(page);
  await page.getByRole("button", { name: "ខ្មែរ" }).click();
  await expect(page.locator("[data-live-feed] h2")).toHaveText("ការកម្មង់ផ្ទាល់");
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
});

test("after midnight the header says closed until 7:00", async ({ page }) => {
  await page.clock.setFixedTime(phnomPenh("00:45"));
  await openDashboard(page);
  await expect(page.locator("[data-closed]")).toHaveText("Closed · opens 7:00");
});
