import { expect, test, type Browser, type Page } from "@playwright/test";

// Board, admin and phone together, so these run once (in the desktop project).
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "multi-device test runs once"));

/** A fresh board (auto-call paused), its owner admin logged in with the PIN the board shows, and a phone on the ticket page. */
async function setup(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const board = await ctx.newPage();
  await board.goto("/queue");
  const take = board.getByRole("link", { name: "Take one here" }).last();
  await expect(take).toHaveAttribute("href", /\/queue\/ticket\?room=[\w-]+$/);
  const sw = board.getByRole("switch", { name: /Auto-call/ });
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");

  const adminLink = board.getByRole("link", { name: "Owner admin →" });
  await expect(adminLink).toHaveAttribute("href", /\/queue\/admin\?room=[\w-]+$/);
  const pin = (await board.locator("[data-admin-pin]").textContent())!.trim();
  expect(pin).toMatch(/^\d{4}$/);

  const admin = await ctx.newPage();
  await admin.goto((await adminLink.getAttribute("href"))!);
  await expect(admin.getByRole("heading", { name: "Enter the staff PIN" })).toBeVisible();
  await admin.keyboard.type(pin);
  await expect(admin.getByRole("tab", { name: "Today" })).toBeVisible();

  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto((await take.getAttribute("href"))!);
  await expect(phone.getByRole("radio", { name: /Repair/ })).toBeVisible();
  return { board, admin, phone, pin };
}

async function saveCounters(admin: Page) {
  await admin.getByRole("button", { name: "Save", exact: true }).click();
  await expect(admin.getByRole("status")).toHaveText("Saved");
}

test("hiding a service takes it off the phone within a second, and a new service shows up", async ({ browser }) => {
  const { admin, phone } = await setup(browser);
  await admin.getByRole("tab", { name: "Services" }).click();
  const pickupRow = admin.locator('[data-admin-service="pickup"]');
  const started = Date.now();
  await pickupRow.getByRole("switch", { name: "Hide" }).click();
  await expect(phone.getByRole("radio", { name: /Pick up/ })).toHaveCount(0, { timeout: 1000 });
  expect(Date.now() - started).toBeLessThan(1000 + 500);

  // A taken letter is refused on its field.
  await admin.getByRole("button", { name: "Add service" }).click();
  const sheet = admin.getByRole("dialog");
  await sheet.getByLabel("Name (English)").fill("Screen protector");
  await sheet.getByLabel("Letter").fill("R");
  await sheet.getByRole("button", { name: "Add service" }).click();
  await expect(sheet.getByText("Another service already uses this letter.")).toBeVisible();
  await sheet.getByLabel("Letter").fill("S");
  await sheet.getByRole("button", { name: "Add service" }).click();
  await expect(sheet).toHaveCount(0);

  await phone.getByRole("radio", { name: /Screen protector/ }).click();
  await phone.getByRole("button", { name: "Take a number" }).click();
  await expect(phone.locator("[data-number]")).toHaveText("S-001");
});

test("a phone holding a service the owner just hid is told to pick another", async ({ browser }) => {
  const { admin, phone } = await setup(browser);
  // Freeze the phone on the queue as it is now: its live stream replays this snapshot, so it never hears of the hide.
  const room = new URL(phone.url()).searchParams.get("room")!;
  const snapshot = { type: "snapshot", ...(await (await phone.request.get(`/api/queues/${room}`)).json()) };
  await phone.route("**/events", (r) => r.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" }, body: `data: ${JSON.stringify(snapshot)}\n\n` }));
  await phone.reload();

  await admin.getByRole("tab", { name: "Services" }).click();
  await admin.locator('[data-admin-service="payment"]').getByRole("switch", { name: "Hide" }).click();
  await expect(admin.locator('[data-admin-service="payment"]').getByText("Hidden")).toBeVisible();

  await phone.getByRole("radio", { name: /Payment/ }).click();
  await phone.getByRole("button", { name: "Take a number" }).click();
  await expect(phone.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("This service just closed, pick another.");
  await expect(phone.getByRole("radio", { name: /Payment/ })).toHaveAttribute("aria-checked", "false");
});

test("closing counter 2 stops the board calling it, and counters 3-4 show on the board", async ({ browser }) => {
  const { board, admin } = await setup(browser);
  await admin.getByRole("tab", { name: "Counters" }).click();
  await admin.getByRole("button", { name: "Add counter" }).click();
  await admin.locator('[data-admin-counter="2"]').getByRole("switch").click();
  await saveCounters(admin);

  await expect(board.locator('[data-counter="3"]')).toBeVisible();
  await expect(board.locator('[data-counter="2"]')).toHaveAttribute("data-closed", "");
  await expect(board.locator('[data-counter="2"]')).toContainText("Closed");
  await expect(board.locator("[data-call-next] button")).toHaveText(["Counter 1", "Counter 3"]);

  // Its customer was finished when it closed, and calling every open counter never reaches it.
  for (const name of ["Counter 1", "Counter 3", "Counter 1"]) {
    const b = board.getByRole("button", { name, exact: true });
    await expect(b).toBeEnabled();
    await b.click();
  }
  await expect(board.locator('[data-counter="3"]')).not.toHaveAttribute("data-serving", "");
  await expect(board.locator('[data-counter="2"]')).toHaveAttribute("data-serving", "");
});

test("a renamed counter is what the phone's your-turn screen says", async ({ browser }) => {
  const { board, admin, phone } = await setup(browser);
  await admin.getByRole("tab", { name: "Counters" }).click();
  await admin.getByLabel("Name (English)").first().fill("Window B");
  await saveCounters(admin);
  const callB = board.getByRole("button", { name: "Window B", exact: true });
  await expect(callB).toBeVisible();

  await phone.getByRole("radio", { name: /Repair/ }).click();
  await phone.getByRole("button", { name: "Take a number" }).click();
  const overlay = phone.locator("[data-called-overlay]");
  for (let i = 0; i < 8 && !(await overlay.isVisible()); i++) {
    await expect(callB).toBeEnabled();
    await callB.click();
    await expect(callB).toBeEnabled();
    await phone.waitForTimeout(400);
  }
  await expect(phone.getByRole("alertdialog")).toContainText("It's your turn · Window B");
});

test("today's stats, the ticket list and the CSV export", async ({ browser }) => {
  const { board, admin } = await setup(browser);
  await expect(admin.locator('[data-stat="served"]')).toContainText("0");
  await board.getByRole("button", { name: "Counter 1", exact: true }).click();
  await expect(admin.locator('[data-stat="served"]')).toContainText("1");
  await expect(admin.locator("[data-admin-ticket]").first()).toBeVisible();
  const [download] = await Promise.all([admin.waitForEvent("download"), admin.getByRole("link", { name: "Download tickets (Excel)" }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
});

test("settings rename the shop on the board and the phone, and auto-call off disables the board switch", async ({ browser }) => {
  const { board, admin, phone } = await setup(browser);
  await admin.getByRole("tab", { name: "Settings" }).click();
  await admin.getByLabel("Shop name").fill("Dara Mobile");
  await admin.getByRole("radio", { name: "Off" }).click();
  await admin.getByRole("button", { name: "Save", exact: true }).click();
  await expect(board.locator("[data-shop-name]")).toHaveText("Dara Mobile");
  await expect(phone.locator("[data-shop-name]")).toHaveText("Dara Mobile");
  await expect(board.getByRole("switch", { name: /Auto-call/ })).toBeDisabled();

  await admin.getByRole("button", { name: "Reset demo queue" }).click();
  await admin.getByRole("button", { name: "Yes, reset" }).click();
  await expect(board.locator("[data-shop-name]")).toHaveText("Sokha Phone Repair");
});

test("a wrong PIN is refused, and logging out asks for the PIN again", async ({ browser }) => {
  const { admin, pin } = await setup(browser);
  await admin.getByRole("button", { name: "Log out" }).last().click();
  await expect(admin.getByRole("heading", { name: "Enter the staff PIN" })).toBeVisible();
  await admin.reload();
  await expect(admin.getByRole("heading", { name: "Enter the staff PIN" })).toBeVisible();
  await admin.keyboard.type(pin === "0000" ? "1111" : "0000");
  await expect(admin.locator("[data-pin-boxes] + p")).toHaveText("Wrong PIN. Try again.");
  await admin.keyboard.type(pin);
  await expect(admin.getByRole("tab", { name: "Today" })).toBeVisible();
});
