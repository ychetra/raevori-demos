import { expect, test, type Browser, type Page } from "@playwright/test";

// A laptop calendar, the owner's admin and a phone together, so these run once (in the desktop project).
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "multi-device test runs once"));

const DAY_MS = 24 * 60 * 60 * 1000;
const PP_MS = 7 * 60 * 60 * 1000;
/** Tomorrow's weekday in Phnom Penh, 0 Sunday … 6 Saturday. */
const tomorrowWeekday = () => new Date(Date.now() + PP_MS + DAY_MS).getUTCDay();

async function laptop(browser: Browser) {
  const board = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await board.goto("/booking");
  const qr = board.locator("[data-book-url]");
  await expect(qr).toHaveAttribute("data-book-url", /\/booking\/book\?room=[\w-]+$/);
  const bookUrl = (await qr.getAttribute("data-book-url"))!;
  const room = new URL(bookUrl).searchParams.get("room")!;
  const pin = (await board.locator("[data-admin-pin]").textContent())!;
  expect(pin).toMatch(/^\d{4}$/);
  await expect(board.locator("[data-owner-admin] a")).toHaveAttribute("href", `/booking/admin?room=${room}`);
  return { board, bookUrl, room, pin };
}

async function phoneAt(browser: Browser, url: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await ctx.newPage();
  await phone.goto(url);
  return phone;
}

async function admin(browser: Browser, room: string, pin: string) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`/booking/admin?room=${room}`);
  await expect(page.getByRole("heading", { name: "Enter the staff PIN" })).toBeVisible();
  await page.keyboard.type(pin);
  await expect(page.getByRole("tab", { name: "Bookings" })).toHaveAttribute("aria-selected", "true");
  return page;
}

/** Haircut with Bopha tomorrow, the first free time, paid. */
async function bookTomorrow(phone: Page, name: string) {
  await phone.getByRole("button", { name: /Haircut/ }).click();
  await phone.getByRole("button", { name: /^Bopha/ }).click();
  await phone.getByRole("group", { name: "Date" }).getByRole("button").nth(1).click();
  await phone.locator("[data-time]").first().click();
  await phone.locator("#booking-name").fill(name);
  await phone.locator('main form button[type="submit"]').click();
  await phone.getByRole("button", { name: "Simulate payment" }).click();
  await expect(phone.locator("[data-deposit-line]")).toContainText("Deposit $3 paid");
}

async function openBooking(page: Page, name: string) {
  await page.getByRole("group", { name: "Day" }).first().getByRole("button").nth(1).click();
  await page.locator("[data-admin-booking]", { hasText: name }).click();
  await expect(page.locator("[data-booking-detail]")).toContainText(name);
}

test("the admin moves a booking and the phone's confirmation follows within a second", async ({ browser }) => {
  const { board, bookUrl, room, pin } = await laptop(browser);
  const phone = await phoneAt(browser, bookUrl);
  await bookTomorrow(phone, "Xavi Mover");
  const page = await admin(browser, room, pin);
  await openBooking(page, "Xavi Mover");

  await page.getByRole("button", { name: "Move", exact: true }).click();
  const last = page.locator("[data-move-panel] [data-move-time]").last();
  const time = (await last.getAttribute("data-move-time"))!;
  await last.click();
  const movedAt = Date.now();
  await page.locator("[data-move-confirm]").click();
  await expect(phone.locator("[data-moved-line]")).toContainText(`Your booking moved to`, { timeout: 5000 });
  expect(Date.now() - movedAt).toBeLessThan(1000 + 500); // 1 s budget plus Playwright polling slack
  await expect(phone.locator("[data-moved-line]")).toContainText(time);
  await expect(phone.getByText(new RegExp(`^${time}–`))).toBeVisible();
  // The calendar shows it at the new time, highlighted.
  await expect(board.locator('[data-stylist="bopha"] [data-status="booked"]', { hasText: "Xavi" })).toHaveAttribute("title", new RegExp(`^${time}–`));
});

test("the admin cancels with a refund and the phone says so; the calendar drops it", async ({ browser }) => {
  const { board, bookUrl, room, pin } = await laptop(browser);
  const phone = await phoneAt(browser, bookUrl);
  await bookTomorrow(phone, "Yuri Cancel");
  const page = await admin(browser, room, pin);
  await openBooking(page, "Yuri Cancel");

  await page.getByRole("button", { name: "Cancel booking" }).click();
  const panel = page.locator("[data-cancel-panel]");
  await expect(panel.getByRole("radio", { name: "Refund deposit" })).toHaveAttribute("aria-checked", "true");
  await panel.getByRole("button", { name: "Cancel booking" }).click();
  await expect(phone.locator("[data-cancelled-line]")).toContainText("Cancelled · deposit refunded");
  await expect(phone.locator("[data-cancelled-line]")).toContainText("From the salon: Customer asked");
  await expect(page.locator("[data-booking-detail]")).toContainText("$3 refunded");
  await board.getByRole("group", { name: "Pick a day" }).getByRole("button").nth(1).click();
  await expect(board.locator("[data-booking]", { hasText: "Yuri" })).toHaveCount(0);
});

test("a day off stops the phone offering that stylist, and the calendar shows it", async ({ browser }) => {
  const { board, bookUrl, room, pin } = await laptop(browser);
  const page = await admin(browser, room, pin);
  await page.getByRole("tab", { name: "Staff" }).click();
  await page.locator('[data-admin-stylist="bopha"]').click();
  await page.locator(`[data-day-off="${tomorrowWeekday()}"]`).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.locator('[data-admin-stylist="bopha"]')).toContainText("Off:");

  const phone = await phoneAt(browser, bookUrl);
  await phone.getByRole("button", { name: /Haircut/ }).click();
  await phone.getByRole("button", { name: /^Bopha/ }).click();
  await phone.getByRole("group", { name: "Date" }).getByRole("button").nth(1).click();
  await expect(phone.locator("[data-no-times]")).toBeVisible();

  await board.getByRole("group", { name: "Pick a day" }).getByRole("button").nth(1).click();
  await expect(board.locator('[data-stylist="bopha"][data-day-off]')).toContainText("Day off");
});

test("an added stylist and new prices reach the phone and the calendar", async ({ browser }) => {
  const { board, bookUrl, room, pin } = await laptop(browser);
  const page = await admin(browser, room, pin);
  await page.getByRole("tab", { name: "Staff" }).click();
  await page.getByRole("button", { name: "Add stylist" }).click();
  await page.locator("#stylist-name-en").fill("Mony");
  await page.getByRole("dialog").getByRole("button", { name: "Add stylist" }).click();
  await expect(page.locator("[data-admin-stylist]", { hasText: "Mony" })).toBeVisible();
  await expect(board.locator("[data-stylist-name]", { hasText: "Mony" })).toBeVisible();

  await page.getByRole("tab", { name: "Services" }).click();
  await page.locator('[data-admin-service="haircut"]').click();
  await page.getByRole("button", { name: "Price: 50 cents more" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.locator('[data-admin-service="haircut"]')).toContainText("$8.50");

  const phone = await phoneAt(browser, bookUrl);
  await expect(phone.getByRole("button", { name: /Haircut/ })).toContainText("$8.50");
  await phone.getByRole("button", { name: /Haircut/ }).click();
  await expect(phone.getByRole("button", { name: /^Mony/ })).toBeVisible();
});

test("closing earlier keeps a paid booking after the new closing on the calendar, and staff can mark it No-show", async ({ browser }) => {
  const { board, bookUrl, room, pin } = await laptop(browser);
  // Tomorrow, a haircut with Anyone at the first free time from 17:00.
  const phone = await phoneAt(browser, bookUrl);
  await phone.getByRole("button", { name: /Haircut/ }).click();
  await phone.getByRole("button", { name: /^Anyone/ }).click();
  await phone.getByRole("group", { name: "Date" }).getByRole("button").nth(1).click();
  await expect(phone.locator("[data-time]").first()).toBeVisible();
  const times = await phone.locator("[data-time]").evaluateAll((els) => els.map((e) => e.getAttribute("data-time")!));
  const late = times.find((x) => x >= "17:00")!;
  expect(late).toBeTruthy();
  await phone.locator(`[data-time="${late}"]`).click();
  await phone.locator("#booking-name").fill("Zed Late");
  await phone.locator('main form button[type="submit"]').click();
  await phone.getByRole("button", { name: "Simulate payment" }).click();
  await expect(phone.locator("[data-deposit-line]")).toContainText("Deposit $3 paid");

  const page = await admin(browser, room, pin);
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.locator("#closes").selectOption("17:00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved");

  await board.getByRole("group", { name: "Pick a day" }).getByRole("button").nth(1).click();
  const block = board.locator("[data-booking]", { hasText: "Zed" });
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute("title", new RegExp(`^${late}–`));
  await block.click();
  await board.locator('[data-status-menu] [data-mark="noshow"]').click();
  await expect(block).toHaveAttribute("data-status", "noshow");
});

test("a wrong PIN is refused and logging out asks for the PIN again", async ({ browser }) => {
  const { room, pin } = await laptop(browser);
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/booking/admin?room=${room}`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("heading", { name: "Enter the staff PIN" })).toBeVisible();
  await page.keyboard.type(pin === "0000" ? "1111" : "0000");
  await expect(page.getByText("Wrong PIN. Try again.")).toBeVisible();
  await page.keyboard.type(pin);
  await expect(page.getByRole("tab", { name: "Bookings" })).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).first().click();
  await expect(page.getByRole("heading", { name: "Enter the staff PIN" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Enter the staff PIN" })).toBeVisible();
});
