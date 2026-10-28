import { dayKey, DAY_MS, PP_OFFSET_MS, startOfDay } from "@/features/shop-pulse/time";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { T } from "./km";
import { PREFIX, SERVICES, type AutoCall, type Counter, type CounterConfig, type QueueConfig, type QueueSettings, type QueueStats, type ServiceConfig, type ServiceId, type Ticket } from "./types";

/** Rules for the owner's queue admin: what a service edit, a new service, the counters and the settings may be, plus the stats and the CSV. Pure, so the screens can share them. */

/** A rejected admin input; `field` names the part that was wrong (the API answers 400 `{ error: "invalid", field }`). */
export class AdminError extends Error {
  constructor(readonly field: string) {
    super(`invalid ${field}`);
  }
}

export const DEFAULT_SETTINGS: QueueSettings = { name: T.shop.en, autoCall: 20 };
/** Minutes per person for a new service, and for a ticket whose service is gone (a reset drops added services). */
export const DEFAULT_MINUTES = 3;
export const MAX_SERVICES = 6;
export const MAX_COUNTERS = 4;
const AUTO_CALLS: AutoCall[] = [0, 20, 60];

/** "Counter 2" in both languages. */
export const counterName = (n: number): Text => ({ en: `${T.counter.en} ${n}`, km: `${T.counter.km} ${n}` });

/** A fresh copy of the config every queue starts with: the three services, two open counters and the default settings. */
export function defaultConfig(): QueueConfig {
  return {
    services: SERVICES.map((id) => ({ id, name: { ...T.services[id] }, prefix: PREFIX[id], minutes: DEFAULT_MINUTES })),
    counters: [1, 2].map((n) => ({ id: n as Counter, name: counterName(n), open: true })),
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** The service's name, or its id when the queue no longer has it. */
export const serviceName = (services: ServiceConfig[], id: ServiceId): Text => services.find((s) => s.id === id)?.name ?? { en: id, km: id };

type Input = Record<string, unknown>;
const obj = (x: unknown, field: string): Input => {
  if (!x || typeof x !== "object" || Array.isArray(x)) throw new AdminError(field);
  return x as Input;
};
const str = (x: unknown, min: number, max: number, field: string): string => {
  const s = typeof x === "string" ? x.trim() : null;
  if (s === null || s.length < min || s.length > max) throw new AdminError(field);
  return s;
};
const text = (x: unknown, max: number, field: string): Text => {
  const t = obj(x, field);
  return { en: str(t.en, 1, max, field), km: str(t.km, 1, max, field) };
};
/** One letter A-Z; a lower-case letter is taken as its capital. */
const prefix = (x: unknown): string => {
  const p = typeof x === "string" ? x.trim().toUpperCase() : "";
  if (!/^[A-Z]$/.test(p)) throw new AdminError("prefix");
  return p;
};
const minutes = (x: unknown): number => {
  if (typeof x !== "number" || !Number.isInteger(x) || x < 1 || x > 30) throw new AdminError("minutes");
  return x;
};

/**
 * `service` with the fields in `patch` changed: name (1-40 characters in each language), prefix, minutes (1-30) and hidden.
 * Fields left out are kept; `id` and unknown fields are ignored. Whether the prefix is free is the store's check.
 */
export function editService(service: ServiceConfig, patch: unknown): ServiceConfig {
  const p = obj(patch, "service");
  const next: ServiceConfig = { ...service };
  if (p.name !== undefined) next.name = text(p.name, 40, "name");
  if (p.prefix !== undefined) next.prefix = prefix(p.prefix);
  if (p.minutes !== undefined) next.minutes = minutes(p.minutes);
  if (p.hidden !== undefined) {
    if (typeof p.hidden !== "boolean") throw new AdminError("hidden");
    if (p.hidden) next.hidden = true;
    else delete next.hidden;
  }
  return next;
}

/** A new service with the server's `id`. Name and prefix are required; minutes default to 3. */
export function newService(input: unknown, id: ServiceId): ServiceConfig {
  const p = obj(input, "service");
  if (p.name === undefined) throw new AdminError("name");
  if (p.prefix === undefined) throw new AdminError("prefix");
  return editService({ id, name: { en: "", km: "" }, prefix: "", minutes: DEFAULT_MINUTES }, p);
}

/** 1-4 counters, `[{ name?, open }]`, numbered by position. A name is 1-20 characters in each language; left out, it is "Counter N". */
export function parseCounters(input: unknown): CounterConfig[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_COUNTERS) throw new AdminError("counters");
  return input.map((x, i) => {
    const c = obj(x, "counters");
    if (typeof c.open !== "boolean") throw new AdminError("open");
    return { id: (i + 1) as Counter, name: c.name === undefined ? counterName(i + 1) : text(c.name, 20, "name"), open: c.open };
  });
}

/** Validated settings: shop name 1-40 characters, auto-call 0 (off), 20 or 60 seconds. Unknown fields are dropped. */
export function parseSettings(input: unknown): QueueSettings {
  const p = obj(input, "settings");
  const name = str(p.name, 1, 40, "name");
  if (!AUTO_CALLS.includes(p.autoCall as AutoCall)) throw new AdminError("autoCall");
  return { name, autoCall: p.autoCall as AutoCall };
}

/** Minutes from taking a number to being called, or null when it hasn't been called. */
const waitOf = (t: Ticket) => (t.at.called !== undefined && t.at.waiting !== undefined ? (t.at.called - t.at.waiting) / 60_000 : null);

/**
 * Today's numbers (Phnom Penh day of `now`) over the tickets taken today: served is the tickets done at a counter, left the ones
 * that left the queue; the waits (called minus taken, rounded to whole minutes) count everyone called, also those still at a counter.
 */
export function queueStats(tickets: Ticket[], now: number): QueueStats {
  const from = startOfDay(now);
  const today = tickets.filter((t) => t.at.waiting !== undefined && t.at.waiting >= from && t.at.waiting < from + DAY_MS);
  const waits = today.map(waitOf).filter((w): w is number => w !== null);
  return {
    day: dayKey(now),
    served: today.filter((t) => t.status === "done").length,
    left: today.filter((t) => t.status === "left").length,
    avgWait: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
    longestWait: waits.length ? Math.round(Math.max(...waits)) : null,
  };
}

const cell = (s: string | number) => {
  const v = String(s);
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
const ppIso = (ms: number) => new Date(ms + PP_OFFSET_MS).toISOString();
const hhmm = (ms: number | undefined) => (ms === undefined ? "" : ppIso(ms).slice(11, 16));

/**
 * The queue's tickets as CSV for Excel: a UTF-8 BOM (so Khmer opens correctly), CRLF lines, in take order, Phnom Penh date and times.
 * Service names in `lang`; the header stays English so the columns are the same in both languages. Blank cells for a ticket not called.
 */
export function ticketsCsv(tickets: Ticket[], services: ServiceConfig[], lang: Lang): string {
  const rows = [["date", "number", "service", "taken at", "called at", "counter", "wait (min)", "status"]];
  for (const t of [...tickets].sort((a, b) => (a.at.waiting ?? 0) - (b.at.waiting ?? 0))) {
    const wait = waitOf(t);
    rows.push([
      ppIso(t.at.waiting ?? 0).slice(0, 10),
      t.number,
      pick(serviceName(services, t.service), lang),
      hhmm(t.at.waiting),
      hhmm(t.at.called),
      t.counter ? String(t.counter) : "",
      wait === null ? "" : String(Math.round(wait)),
      t.status,
    ]);
  }
  return `﻿${rows.map((r) => r.map(cell).join(",")).join("\r\n")}`;
}
