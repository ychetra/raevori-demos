import { expect, test, type Browser, type Page } from "@playwright/test";

// These tests drive a laptop board and a phone together, so they run once (in the desktop project).
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "multi-device test runs once"));

async function boardAndPhone(browser: Browser) {
  const board = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await board.goto("/queue");
  const take = board.getByRole("link", { name: "Take one here" }).last();
  await expect(take).toHaveAttribute("href", /\/queue\/ticket\?room=[\w-]+$/);
  const ticketUrl = (await take.getAttribute("href"))!;
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await phoneCtx.newPage();
  await phone.goto(ticketUrl);
  return { board, phone, phoneCtx };
}

async function takeRepair(phone: Page) {
  await phone.getByRole("radio", { name: /Repair/ }).click();
  await phone.getByRole("button", { name: "Take a number" }).click();
  const number = phone.locator("[data-number]");
  await expect(number).toHaveText(/\S+/);
  return (await number.textContent())!.trim();
}

async function autoCallOff(board: Page) {
  const sw = board.getByRole("switch", { name: /Auto-call/ });
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
}

/** The board's Next list shows only 4, and 4 seeded people wait: call one first so a new number is 4th and visible. */
async function makeRoom(board: Page) {
  await autoCallOff(board);
  const waiting = board.locator("[data-next] [data-ticket]");
  await expect(waiting).toHaveCount(4);
  await board.getByRole("button", { name: "Counter 1", exact: true }).click();
  await expect(waiting).toHaveCount(3);
}

/** Click "Counter 1" until the phone's ticket is called (4 seeded people are ahead). */
async function callUntilMine(board: Page, phone: Page) {
  const counter1 = board.getByRole("button", { name: "Counter 1", exact: true });
  const overlay = phone.locator("[data-called-overlay]");
  for (let i = 0; i < 8 && !(await overlay.isVisible()); i++) {
    await expect(counter1).toBeEnabled();
    await counter1.click();
    await expect(counter1).toBeEnabled();
    await phone.waitForTimeout(400);
  }
}

test("a phone takes a number, shows on the board live, gets called and dismisses", async ({ browser }) => {
  const { board, phone } = await boardAndPhone(browser);
  await makeRoom(board);
  const takenAt = Date.now();
  const number = await takeRepair(phone);
  await expect(board.locator(`[data-next] [data-ticket="${number}"]`)).toBeVisible({ timeout: 1000 });
  expect(Date.now() - takenAt).toBeLessThan(1000 + 1500); // includes the take request itself

  await callUntilMine(board, phone);
  const overlay = phone.getByRole("alertdialog");
  await expect(overlay).toContainText("It's your turn · Counter 1");
  await overlay.getByRole("button", { name: "I'm on my way" }).click();
  await expect(overlay).toHaveCount(0);
  await expect(phone.getByRole("heading", { level: 1 })).toHaveText("Your turn · Counter 1");
});

test("reloading the phone keeps the same ticket", async ({ browser }) => {
  const { phone } = await boardAndPhone(browser);
  const number = await takeRepair(phone);
  await phone.reload();
  await expect(phone.locator("[data-number]")).toHaveText(number);
});

test("leaving the queue releases the number on the board", async ({ browser }) => {
  const { board, phone } = await boardAndPhone(browser);
  await makeRoom(board);
  const number = await takeRepair(phone);
  const mine = board.locator(`[data-next] [data-ticket="${number}"]`);
  await expect(mine).toBeVisible();
  await phone.getByRole("button", { name: "Leave the queue", exact: true }).click();
  await phone.getByRole("button", { name: "Yes, leave" }).click();
  await expect(phone.getByRole("heading", { level: 1 })).toHaveText("You left the queue");
  await expect(mine).toHaveCount(0);
});

test("an unknown room shows the closed screen", async ({ page }) => {
  await page.goto("/queue/ticket?room=nope");
  await expect(page.getByText("This queue has closed")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start a new demo" })).toHaveAttribute("href", "/queue");
});

test("a phone that drops offline catches up when it reconnects", async ({ browser }) => {
  const { board, phone, phoneCtx } = await boardAndPhone(browser);
  const number = await takeRepair(phone);
  await autoCallOff(board);
  await phoneCtx.setOffline(true);
  const counter1 = board.getByRole("button", { name: "Counter 1", exact: true });
  for (let i = 0; i < 8; i++) {
    if ((await board.locator('[data-counter="1"]').getAttribute("data-serving")) === number) break;
    await expect(counter1).toBeEnabled();
    await counter1.click();
    await expect(counter1).toBeEnabled();
    await board.waitForTimeout(300);
  }
  await expect(board.locator('[data-counter="1"]')).toHaveAttribute("data-serving", number);
  await phone.waitForTimeout(3000);
  await phoneCtx.setOffline(false);
  await expect(phone.getByRole("alertdialog")).toContainText("It's your turn", { timeout: 15_000 });
});

test("no sideways scroll at 360 px in Khmer", async ({ browser }) => {
  const { board, phone } = await boardAndPhone(browser);
  for (const page of [board, phone]) {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.getByRole("button", { name: "ខ្មែរ" }).first().click();
    await expect(page.locator('[lang="km"]').first()).toBeAttached();
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(sw).toBeLessThanOrEqual(cw);
  }
});
