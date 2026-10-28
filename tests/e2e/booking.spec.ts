import { expect, test, type Browser, type Page } from "@playwright/test";

// These tests drive a laptop calendar and phones together, so they run once (in the desktop project).
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "multi-device test runs once"));

async function laptop(browser: Browser) {
  const board = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await board.goto("/booking");
  const qr = board.locator("[data-book-url]");
  await expect(qr).toHaveAttribute("data-book-url", /\/booking\/book\?room=[\w-]+$/);
  const bookUrl = (await qr.getAttribute("data-book-url"))!;
  await expect(board.locator("[data-calendar]")).toBeVisible();
  return { board, bookUrl };
}

async function phoneAt(browser: Browser, url: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await ctx.newPage();
  await phone.goto(url);
  return phone;
}

/** Haircut with Bopha, tomorrow (always has free times); picks and returns the first free time (hh:mm). */
async function pickTomorrow(phone: Page) {
  await phone.getByRole("button", { name: /Haircut/ }).click();
  await phone.getByRole("button", { name: /^Bopha/ }).click();
  await phone.getByRole("group", { name: "Date" }).getByRole("button").nth(1).click();
  const first = phone.locator("[data-time]").first();
  await expect(first).toBeVisible();
  const time = (await first.getAttribute("data-time"))!;
  await first.click();
  return time;
}

const submit = (phone: Page) => phone.locator('main form button[type="submit"]');

async function hold(phone: Page, name: string) {
  await phone.locator("#booking-name").fill(name);
  await submit(phone).click();
}

async function tomorrowOnBoard(board: Page) {
  const day = board.getByRole("group", { name: "Pick a day" }).getByRole("button").nth(1);
  await day.click();
  await expect(day).toHaveAttribute("aria-pressed", "true");
}

test("a phone books and pays, and the block shows on the laptop live", async ({ browser }) => {
  const { board, bookUrl } = await laptop(browser);
  await tomorrowOnBoard(board);
  const phone = await phoneAt(browser, bookUrl);
  await pickTomorrow(phone);
  await hold(phone, "Sokha");
  const pay = phone.getByRole("button", { name: "Simulate payment" });
  await expect(pay).toBeVisible();

  const paidAt = Date.now();
  await pay.click();
  const block = board.locator('[data-stylist="bopha"] [data-status="booked"]', { hasText: "Sokha" });
  await expect(block).toBeVisible({ timeout: 5000 });
  expect(Date.now() - paidAt).toBeLessThan(1000 + 500); // 1 s budget plus Playwright polling slack
  await expect(block).toContainText("Deposit paid");
  await expect(phone.locator("[data-deposit-line]")).toContainText("Deposit $3 paid");
});

test("two phones race for one slot: the second is told it's taken, and the held slot shows as being booked", async ({ browser }) => {
  const { board, bookUrl } = await laptop(browser);
  await tomorrowOnBoard(board);
  const a = await phoneAt(browser, bookUrl);
  const b = await phoneAt(browser, bookUrl);
  const timeA = await pickTomorrow(a);
  const timeB = await pickTomorrow(b);
  expect(timeB).toBe(timeA);
  await b.locator("#booking-name").fill("Vanna");

  await hold(a, "Sokha");
  await expect(a.getByRole("button", { name: "Simulate payment" })).toBeVisible();
  await expect(board.locator('[data-stylist="bopha"] [data-status="held"]', { hasText: "Sokha" })).toContainText("Being booked");

  await submit(b).click();
  await expect(b.locator("[data-notice]")).toContainText("Someone just booked that time");
  await expect(b.locator("[data-time]").first()).toBeVisible();
  await expect(b.locator(`[data-time="${timeA}"]`)).toHaveCount(0);
});

test("staff mark a paid booking as a no-show", async ({ browser }) => {
  const { board } = await laptop(browser);
  await tomorrowOnBoard(board);
  const block = board.locator('[data-calendar] button[data-status="booked"]').first();
  await expect(block).toContainText("Deposit paid");
  const id = (await block.getAttribute("data-booking"))!;
  await block.click();
  await board.getByRole("dialog").getByRole("button", { name: "No-show" }).click();
  await expect(board.locator(`[data-booking="${id}"]`)).toContainText("No-show · Deposit kept $3");
});

test("an unknown room shows the closed screen", async ({ page }) => {
  await page.goto("/booking/book?room=nope");
  await expect(page.getByText("This booking page has closed")).toBeVisible();
});

test("no sideways scroll at 360 px in Khmer", async ({ browser }) => {
  const { board, bookUrl } = await laptop(browser);
  const phone = await phoneAt(browser, bookUrl);
  for (const page of [board, phone]) {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.getByRole("button", { name: "ខ្មែរ" }).first().click();
    await expect(page.locator('[lang="km"]').first()).toBeAttached();
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(sw).toBeLessThanOrEqual(cw);
  }
});
