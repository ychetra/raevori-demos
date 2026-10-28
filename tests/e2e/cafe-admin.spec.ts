import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";

// The admin, the kitchen and a phone work together, so these run once (in the desktop project).
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "multi-device test runs once"));

type Shop = { desk: Page; admin: Page; phone: Page; room: string; menuUrl: string };

/** A kitchen laptop (which shows the PIN), the owner's admin logged in with it, and a phone at table 4. */
async function shop(browser: Browser, { adminViewport = { width: 1280, height: 900 }, login = true } = {}): Promise<Shop & { pin: string }> {
  const desk = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await desk.goto("/table-order");
  const menuUrl = (await desk.locator("[data-menu-url]").getAttribute("data-menu-url"))!;
  const room = new URL(menuUrl, "http://x").searchParams.get("room")!;
  await expect(desk.getByRole("link", { name: "Owner admin →" })).toHaveAttribute("href", `/table-order/admin?room=${room}`);
  const pin = (await desk.locator("[data-admin-pin]").textContent())!.trim();
  expect(pin).toMatch(/^\d{4}$/);

  const admin = await (await browser.newContext({ viewport: adminViewport })).newPage();
  await admin.goto(`/table-order/admin?room=${room}`);
  if (login) await enterPin(admin, pin);

  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto(menuUrl);
  await expect(phone.locator('[data-menu-item="iced-latte"]')).toBeVisible();
  return { desk, admin, phone, room, menuUrl, pin };
}

async function enterPin(admin: Page, pin: string) {
  await expect(admin.getByRole("heading", { level: 1 })).toBeVisible();
  for (const d of pin) await admin.getByRole("button", { name: d, exact: true }).click();
  await expect(admin.getByRole("tab", { name: "Menu" })).toBeVisible();
}

/** Orders one Iced latte (default options) from the phone and waits for the status screen. */
async function orderLatte(phone: Page) {
  await phone.locator('[data-menu-item="iced-latte"] button').click();
  await phone.getByRole("dialog").getByRole("button", { name: /Add ·/ }).click();
  await phone.getByRole("button", { name: /View cart/ }).click();
  await phone.getByRole("button", { name: /Pay with KHQR/ }).click();
  await phone.getByRole("button", { name: "Simulate payment" }).click();
  await expect(phone.locator('[data-status="new"]')).toBeVisible();
}

test("an item marked Sold out in the admin is sold out on the phone within a second", async ({ browser }) => {
  const { admin, phone } = await shop(browser);
  const row = phone.locator('[data-menu-item="iced-latte"]');
  await expect(row).not.toHaveAttribute("data-sold-out");

  const at = Date.now();
  await admin.locator('[data-admin-item="iced-latte"]').getByRole("switch", { name: "Sold out" }).click();
  await expect(row).toHaveAttribute("data-sold-out", "true", { timeout: 5000 });
  expect(Date.now() - at).toBeLessThan(1000 + 500); // 1 s budget plus Playwright polling slack
  await expect(row).toContainText("Sold out");
  await expect(row.getByRole("button")).toBeDisabled();
  await expect(admin.locator('[data-admin-item="iced-latte"]').getByRole("switch")).toHaveAttribute("aria-checked", "true");
});

test("a price changed in the admin is shown on the phone and charged on the next order", async ({ browser }) => {
  const { admin, phone, desk } = await shop(browser);
  await expect(phone.locator('[data-menu-item="iced-latte"]')).toContainText("$2.25");

  await admin.locator('[data-admin-item="iced-latte"] button').first().click();
  const sheet = admin.getByRole("dialog", { name: "Edit item" });
  await sheet.getByRole("textbox", { name: "Price" }).fill("3.00");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  await expect(admin.locator('[data-admin-item="iced-latte"]')).toContainText("$3.00");

  await expect(phone.locator('[data-menu-item="iced-latte"]')).toContainText("$3.00");
  await orderLatte(phone);
  await expect(phone.locator('[data-status="new"]')).toContainText("$3.00");
  const ticket = desk.locator('article[data-status="new"]', { hasText: "Table 4" });
  await expect(ticket).toContainText("1× Iced latte");
  await expect(ticket).toContainText("$3.00");
});

test("an order cancelled in the admin shows cancelled on the phone and leaves the kitchen board", async ({ browser }) => {
  const { admin, phone, desk } = await shop(browser);
  await orderLatte(phone);
  const ticket = desk.locator("article[data-order]", { hasText: "Table 4" });
  await expect(ticket).toBeVisible();

  await admin.getByRole("tab", { name: "Orders" }).click();
  await admin.locator("[data-admin-order]", { hasText: "Table 4" }).click();
  const detail = admin.locator("[data-order-detail]");
  await detail.getByRole("button", { name: "Cancel order" }).click();
  await detail.getByRole("radio", { name: "Other" }).click();
  await detail.getByRole("textbox").fill("Machine broken");
  await detail.getByRole("button", { name: "Cancel order" }).click();
  await expect(detail.locator("[data-order-status]").first()).toHaveAttribute("data-order-status", "cancelled");
  await expect(detail).toContainText("Machine broken");

  await expect(phone.locator('[data-status="cancelled"]')).toBeVisible();
  await expect(phone.getByRole("heading", { level: 1 })).toHaveText("Order cancelled.");
  await expect(desk.locator("[data-cancel-note]")).toHaveText("Table 4's order was cancelled");
  await expect(ticket).toHaveCount(0);
});

test("Download orders (Excel) gives a CSV with a BOM, the header and the order", async ({ browser }) => {
  const { admin, phone } = await shop(browser);
  await orderLatte(phone);
  await admin.getByRole("tab", { name: "Orders" }).click();
  // The demo seeds two orders (tables 7 and 2); ours is the only one at table 4.
  const ours = admin.locator("[data-admin-order]", { hasText: "Table 4" });
  await expect(ours).toHaveCount(1);
  const orderId = await ours.getAttribute("data-admin-order");

  const [download] = await Promise.all([admin.waitForEvent("download"), admin.getByRole("link", { name: "Download orders (Excel)" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^orders-\d{4}-\d{2}-\d{2}\.csv$/);
  const bytes = await readFile((await download.path())!);
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const lines = bytes.subarray(3).toString("utf8").split("\r\n");
  expect(lines[0]).toBe("date,time,order no.,table,items,total USD,total KHR,payment,status");
  const row = lines.find((l) => l.includes(`,${orderId},4,`));
  expect(row).toBeDefined();
  expect(row).toContain("1× Iced latte");
  expect(row).toContain(",2.25,");
});

test("the sixth wrong PIN is refused with too many tries", async ({ browser }) => {
  const { admin, pin } = await shop(browser, { login: false });
  const wrong = pin === "0000" ? "1111" : "0000";
  const alert = admin.locator("section").getByRole("alert");
  for (let i = 1; i <= 6; i++) {
    const res = admin.waitForResponse((r) => r.url().endsWith("/admin/login") && r.request().method() === "POST");
    for (const d of wrong) await admin.getByRole("button", { name: d, exact: true }).click();
    const status = (await res).status();
    expect(status).toBe(i < 6 ? 401 : 429);
    await expect(alert).toHaveText(i < 6 ? "Wrong PIN. Try again." : "Too many tries, wait a few minutes.");
  }
});

test("opening hours that exclude now close the phone; Open all day opens it again", async ({ browser }) => {
  const { admin, phone } = await shop(browser);
  const ppHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Phnom_Penh", hour: "2-digit", hour12: false }).format(new Date()));
  // A window at least a few hours away from now, either way.
  const [open, close] = ppHour < 12 ? ["18:00", "20:00"] : ["02:00", "04:00"];

  await admin.getByRole("tab", { name: "Settings" }).click();
  const allDay = admin.getByRole("switch", { name: "Open all day" });
  await expect(allDay).toHaveAttribute("aria-checked", "true");
  await allDay.click();
  await admin.getByLabel("Opens").selectOption(open);
  await admin.getByLabel("Closes").selectOption(close);
  await admin.getByRole("button", { name: "Save" }).click();
  await expect(admin.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  await expect(phone.locator("[data-shop-closed]")).toContainText(`We're closed · Opens ${open}`, { ignoreCase: true });
  await phone.locator('[data-menu-item="iced-latte"] button').click();
  await expect(phone.getByRole("dialog").getByRole("button", { name: "We're closed" })).toBeDisabled();
  await phone.keyboard.press("Escape");
  await expect(phone.getByRole("dialog")).toBeHidden();

  await allDay.click();
  await admin.getByRole("button", { name: "Save" }).click();
  await expect(phone.locator("[data-shop-closed]")).toHaveCount(0);
  await orderLatte(phone);
});

test("at 360px in Khmer the admin has no horizontal scroll on Menu, Orders and Settings", async ({ browser }) => {
  const { admin, phone } = await shop(browser, { adminViewport: { width: 360, height: 780 } });
  await orderLatte(phone); // so Orders has a row to lay out
  await admin.getByRole("button", { name: "ខ្មែរ" }).first().click();
  await expect(admin.locator("main")).toHaveAttribute("lang", "km");
  const tabs = admin.getByRole("tab");
  for (let i = 0; i < 3; i++) {
    await tabs.nth(i).click();
    await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true");
    await expect(admin.getByRole("tabpanel").locator("> *").first()).toBeVisible();
    const over = await admin.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `tab ${i}`).toBeLessThanOrEqual(0);
  }
});

test("when something in between holds the live stream back (a tunnel or proxy), the admin and phone fall back to polling", async ({ browser }) => {
  const { admin, phone, pin } = await shop(browser, { login: false });
  // Never answering the events request is what a buffering proxy looks like to the browser: an open, silent stream.
  for (const page of [admin, phone]) {
    await page.route("**/events", () => {});
    await page.reload();
  }
  await enterPin(admin, pin);
  const item = admin.locator('[data-admin-item="iced-latte"]');
  await expect(item).toBeVisible({ timeout: 8000 });

  await item.getByRole("switch", { name: "Sold out" }).click();
  await expect(phone.locator('[data-menu-item="iced-latte"]')).toHaveAttribute("data-sold-out", "true", { timeout: 8000 });
});
