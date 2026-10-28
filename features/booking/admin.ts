import { PP_OFFSET_MS } from "@/features/shop-pulse/time";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { T } from "./km";
import { toMinutes } from "./salon";
import type { Booking, SalonConfig, SalonSettings, Service, Stylist, Weekday } from "./types";

/** Rules for the salon owner's admin: what a service edit, a stylist, the settings and a cancel may be, plus the CSV. Pure, so the phone can share them. */

/** A rejected admin input; `field` names the part that was wrong (the API answers 400 `{ error: "invalid", field }`). */
export class AdminError extends Error {
  constructor(readonly field: string) {
    super(`invalid ${field}`);
  }
}

/** Calendar columns: at most 5 stylists fit. */
export const MAX_STYLISTS = 5;
export const DURATIONS = [30, 60, 90, 120];
export const MAX_STYLIST_NAME = 20;

type Input = Record<string, unknown>;
const obj = (x: unknown, field: string): Input => {
  if (!x || typeof x !== "object" || Array.isArray(x)) throw new AdminError(field);
  return x as Input;
};
const str = (x: unknown, min: number, max: number, field: string): string => {
  const s = typeof x === "string" ? x.trim() : null;
  if (s === null || [...s].length < min || [...s].length > max) throw new AdminError(field);
  return s;
};
const text = (x: unknown, min: number, max: number, field: string): Text => {
  const t = obj(x, field);
  return { en: str(t.en, min, max, field), km: str(t.km, min, max, field) };
};
/** Dollars from `min` to `max` in 50-cent steps. */
const halves = (x: unknown, min: number, max: number, field: string): number => {
  if (typeof x !== "number" || !Number.isInteger(x * 2) || x < min || x > max) throw new AdminError(field);
  return x;
};

/** "HH:MM" on the hour or half hour; "24:00" is allowed as an end (open until midnight). */
const TIME = /^(?:(?:[01]\d|2[0-3]):(?:00|30)|24:00)$/;
const isTime = (x: unknown): x is string => typeof x === "string" && TIME.test(x);

/** `service` with the fields in `patch` changed: price $0.50-500 in 50-cent steps, minutes 30/60/90/120, hidden. `id` and unknown fields are ignored. */
export function editService(service: Service, patch: unknown): Service {
  const p = obj(patch, "service");
  const next: Service = { ...service };
  if (p.price !== undefined) next.price = halves(p.price, 0.5, 500, "price");
  if (p.minutes !== undefined) {
    if (!DURATIONS.includes(p.minutes as number)) throw new AdminError("minutes");
    next.minutes = p.minutes as number;
  }
  if (p.hidden !== undefined) {
    if (typeof p.hidden !== "boolean") throw new AdminError("hidden");
    if (p.hidden) next.hidden = true;
    else delete next.hidden;
  }
  return next;
}

/** Weekdays 0-6, each once, sorted. */
function daysOff(x: unknown): Weekday[] {
  if (!Array.isArray(x) || !x.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) throw new AdminError("daysOff");
  return [...new Set(x as Weekday[])].sort((a, b) => a - b);
}
function hours(x: unknown): Stylist["hours"] {
  const h = obj(x, "hours");
  if (!isTime(h.start) || !isTime(h.end) || h.start === "24:00" || toMinutes(h.start) >= toMinutes(h.end)) throw new AdminError("hours");
  return { start: h.start, end: h.end };
}

/** `stylist` with the fields in `patch` changed: name EN/KM 1-20 characters, days off, hours (start before end, on the hour or half hour). */
export function editStylist(stylist: Stylist, patch: unknown): Stylist {
  const p = obj(patch, "stylist");
  const next: Stylist = { ...stylist };
  if (p.name !== undefined) next.name = text(p.name, 1, MAX_STYLIST_NAME, "name");
  if (p.daysOff !== undefined) next.daysOff = daysOff(p.daysOff);
  if (p.hours !== undefined) next.hours = hours(p.hours);
  return next;
}

/** A new stylist with the server's `id`. The name is required; by default no days off and the salon's hours. */
export function newStylist(input: unknown, id: string, settings: SalonSettings): Stylist {
  const p = obj(input, "stylist");
  if (p.name === undefined) throw new AdminError("name");
  return editStylist({ id, name: { en: "", km: "" }, daysOff: [], hours: { start: settings.open, end: settings.close } }, p);
}

/** Validated settings: name 1-40 characters, open before close (both on the hour or half hour), deposit $0-10 in 50-cent steps. Unknown fields are dropped. */
export function parseSettings(input: unknown): SalonSettings {
  const p = obj(input, "settings");
  const name = str(p.name, 1, 40, "name");
  for (const f of ["open", "close"] as const) if (!isTime(p[f])) throw new AdminError(f);
  const open = p.open as string;
  const close = p.close as string;
  if (open === "24:00") throw new AdminError("open");
  if (toMinutes(open) >= toMinutes(close)) throw new AdminError("close");
  return { name, open, close, deposit: halves(p.deposit, 0, 10, "deposit") };
}

/** A cancel reason: 1-120 characters after trimming. */
export const parseReason = (x: unknown): string => str(x, 1, 120, "reason");
/** "Refund deposit" (true) or "keep deposit" (false); nothing else. */
export function parseRefund(x: unknown): boolean {
  if (typeof x !== "boolean") throw new AdminError("refund");
  return x;
}

const cell = (s: string | number) => {
  const v = String(s);
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
/** Customer-typed text could start a spreadsheet formula ("=HYPERLINK(...)"); a leading apostrophe keeps Excel reading it as text. */
const typed = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
const ppIso = (ms: number) => new Date(ms + PP_OFFSET_MS).toISOString();
const statusCell = (b: Booking) => (b.status !== "cancelled" ? b.status : b.refund ? "cancelled (refunded)" : "cancelled (deposit kept)");

/**
 * The room's bookings as CSV for Excel: a UTF-8 BOM (so Khmer opens correctly), CRLF lines, by start time, Phnom Penh date and time.
 * Expired holds are left out (they were never booked). The phone is included: only the logged-in owner gets this file.
 * Stylist and service names in `lang` (a stylist no longer on the roster shows its id); the header stays English.
 */
export function bookingsCsv(bookings: Booking[], salon: SalonConfig, lang: Lang): string {
  const rows = [["date", "time", "customer", "phone", "stylist", "service", "price", "deposit", "status"]];
  for (const b of bookings.filter((x) => x.status !== "expired").sort((a, z) => a.start - z.start)) {
    const at = ppIso(b.start);
    const stylist = salon.stylists.find((s) => s.id === b.stylist);
    rows.push([at.slice(0, 10), at.slice(11, 16), typed(b.name), typed(b.phone ?? ""), stylist ? pick(stylist.name, lang) : b.stylist, pick(T.services[b.service], lang), b.price.toFixed(2), b.deposit.toFixed(2), statusCell(b)]);
  }
  return `﻿${rows.map((r) => r.map(cell).join(",")).join("\r\n")}`;
}
