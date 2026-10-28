import { hhmm } from "@/features/shop-pulse/ui/format";
import { DAY_MS, PP_OFFSET_MS, startOfDay } from "@/features/shop-pulse/time";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { T } from "../km";
import { balanceDue, BOOKING_DAYS, DEPOSIT } from "../salon";
import type { Booking } from "../types";

export { hhmm };

/** Whole dollars: 3 → "$3" (every Booking price is whole). */
export const dollars = (n: number) => `$${n}`;

/** Replaces `{key}` placeholders in a picked string. */
export function fill(t: Text, lang: Lang, values: Record<string, string | number> = {}): string {
  return pick(t, lang).replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

/** The default `{d}` (deposit) filler, plus any extra values. */
export const withDeposit = (t: Text, lang: Lang, values: Record<string, string | number> = {}) => fill(t, lang, { d: dollars(DEPOSIT), ...values });

const local = (ms: number) => new Date(ms + PP_OFFSET_MS);

/** "Wed 28 Oct" / "ពុធ 28 តុលា", Phnom Penh. */
export function dayLabel(ms: number, lang: Lang): string {
  const d = local(ms);
  return `${pick(T.weekdays[d.getUTCDay()], lang)} ${d.getUTCDate()} ${pick(T.months[d.getUTCMonth()], lang)}`;
}

/** Short weekday and day of month for the day strips, Phnom Penh. */
export function dayParts(ms: number, lang: Lang): { weekday: string; date: number } {
  const d = local(ms);
  return { weekday: pick(T.weekdays[d.getUTCDay()], lang), date: d.getUTCDate() };
}

/** Start of today plus the next 6 days (Phnom Penh midnights). */
export const bookingDays = (now: number): number[] => Array.from({ length: BOOKING_DAYS }, (_, i) => startOfDay(now) + i * DAY_MS);

/** 272_000 ms → "4:32"; never negative. */
export function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * What the calendar shows: everything but expired holds. A hold stays striped until the server says it expired
 * (open calendars sweep every few seconds), so a laptop with a wrong clock still shows it.
 */
export const shown = (bookings: Booking[]): Booking[] => bookings.filter((b) => b.status !== "expired");

/** The customer's first name for a calendar block. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

const icsTime = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** A one-event iCalendar file for a booking, built in the browser. Times are UTC, so every calendar app shows local time. */
export function bookingIcs(b: Booking, lang: Lang, now: number): string {
  const service = pick(T.services[b.service], lang);
  const description = `${pick(T.book.stylist, lang)}: ${pick(T.stylists[b.stylist], lang)}. ${fill(T.book.depositLine, lang, { d: dollars(DEPOSIT), x: dollars(balanceDue(b.service)) })}`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Raevori Studio//Booking demo//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${b.id}@demo.raevori.com`,
    `DTSTAMP:${icsTime(now)}`,
    `DTSTART:${icsTime(b.start)}`,
    `DTEND:${icsTime(b.end)}`,
    `SUMMARY:${icsText(fill(T.book.icsTitle, lang, { s: service }))}`,
    `LOCATION:${icsText(pick(T.salon, lang))}`,
    `DESCRIPTION:${icsText(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

