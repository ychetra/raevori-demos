import { T } from "./km";
import type { SalonConfig, SalonSettings, Service, ServiceId, Stylist, StylistId } from "./types";

/** Bopha Beauty opens 09:00-19:00 Phnom Penh time, every day, by default. Names (EN/KM) live in km.ts. Each room can change them in the admin. */
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 19;
export const SLOT_MINUTES = 30;
export const SLOT_MS = SLOT_MINUTES * 60_000;
/** How long a slot is held while the phone pays the deposit. */
export const HOLD_MS = 5 * 60_000;
/** Bookable days: today plus the next 6, Phnom Penh. */
export const BOOKING_DAYS = 7;

/** The default deposit in dollars, the same for every service and kept on a no-show. */
export const DEPOSIT = 3;

/** The default menu, in menu order. `price` is in dollars; the rest after the deposit is paid at the salon. */
export const SERVICES: Service[] = [
  { id: "haircut", minutes: 30, price: 8 },
  { id: "wash", minutes: 30, price: 6 },
  { id: "colour", minutes: 90, price: 35 },
  { id: "manicure", minutes: 60, price: 12 },
  { id: "facial", minutes: 60, price: 20 },
];
export const SERVICE_IDS: ServiceId[] = SERVICES.map((s) => s.id);
export const SERVICE_BY_ID = Object.fromEntries(SERVICES.map((s) => [s.id, s])) as Record<ServiceId, Service>;

/** The default roster order: "Anyone" gets the first free stylist in this order, and the calendar shows them as columns. */
export const STYLISTS: StylistId[] = ["bopha", "dara", "srey-leak"];

export const DEFAULT_SETTINGS: SalonSettings = { name: "Bopha Beauty", open: "09:00", close: "19:00", deposit: DEPOSIT };
/** The default stylists: every day, following the salon's hours (so widening the salon's hours widens theirs). */
export const DEFAULT_STYLISTS: Stylist[] = STYLISTS.map((id) => ({
  id,
  name: { ...T.stylists[id] },
  daysOff: [],
  hours: null,
}));

/** A fresh deep copy of the default salon, for a new or reset room: nothing in it is shared with the defaults or another room. */
export const defaultSalon = (): SalonConfig => structuredClone({ services: SERVICES, stylists: DEFAULT_STYLISTS, settings: DEFAULT_SETTINGS });
/** The default salon for pure helpers called without a room's config. Never changed. */
export const DEFAULT_SALON: SalonConfig = defaultSalon();

/** "07:30" → 450. "24:00" is 1440. */
export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** How long `service` takes in the salon's menu (default menu when no salon is given). */
export const durationMs = (service: ServiceId, salon: SalonConfig = DEFAULT_SALON) => (salon.services.find((s) => s.id === service)?.minutes ?? 0) * 60_000;

/** Dollars left to pay at the salon after the deposit, from the booking's own price and deposit; never below zero. */
export const balanceDue = (b: { price: number; deposit: number }) => Math.max(0, b.price - b.deposit);
