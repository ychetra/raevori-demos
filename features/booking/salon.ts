import type { ServiceId, StylistId } from "./types";

/** Bopha Beauty opens 09:00-19:00 Phnom Penh time, every day. Names (EN/KM) live in km.ts. */
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 19;
export const SLOT_MINUTES = 30;
export const SLOT_MS = SLOT_MINUTES * 60_000;
/** How long a slot is held while the phone pays the deposit. */
export const HOLD_MS = 5 * 60_000;
/** Bookable days: today plus the next 6, Phnom Penh. */
export const BOOKING_DAYS = 7;

/** Deposit in dollars, the same for every service and kept on a no-show. */
export const DEPOSIT = 3;

/** `price` is in whole dollars; the rest after the deposit is paid at the salon. */
export type ServiceInfo = { id: ServiceId; minutes: number; price: number };

/** In menu order. */
export const SERVICES: ServiceInfo[] = [
  { id: "haircut", minutes: 30, price: 8 },
  { id: "wash", minutes: 30, price: 6 },
  { id: "colour", minutes: 90, price: 35 },
  { id: "manicure", minutes: 60, price: 12 },
  { id: "facial", minutes: 60, price: 20 },
];
export const SERVICE_IDS: ServiceId[] = SERVICES.map((s) => s.id);
export const SERVICE_BY_ID = Object.fromEntries(SERVICES.map((s) => [s.id, s])) as Record<ServiceId, ServiceInfo>;

/** Roster order: "Anyone" gets the first free stylist in this order, and the calendar shows them as columns. */
export const STYLISTS: StylistId[] = ["bopha", "dara", "srey-leak"];

export const durationMs = (service: ServiceId) => SERVICE_BY_ID[service].minutes * 60_000;

/** Dollars left to pay at the salon after the deposit (whole dollars, so no cents maths). */
export const balanceDue = (service: ServiceId) => SERVICE_BY_ID[service].price - DEPOSIT;
