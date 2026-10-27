/** Phnom Penh is UTC+7 all year (no daylight saving), so a fixed offset is exact. */
export const PP_OFFSET_MS = 7 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** Shifted so the UTC fields read as Phnom Penh wall-clock time. */
const local = (ms: number) => new Date(ms + PP_OFFSET_MS);

/** "2026-10-27": the Phnom Penh date of `ms`. */
export const dayKey = (ms: number): string => local(ms).toISOString().slice(0, 10);

/** Epoch ms of 00:00 Phnom Penh on the day of `ms`. */
export const startOfDay = (ms: number): number => Math.floor((ms + PP_OFFSET_MS) / DAY_MS) * DAY_MS - PP_OFFSET_MS;

/** 0-23, Phnom Penh. */
export const hourOf = (ms: number): number => local(ms).getUTCHours();

/** 0 Sunday ... 6 Saturday, Phnom Penh. */
export const weekday = (ms: number): number => local(ms).getUTCDay();

/** The café opens at 07:00 and closes at 21:00, Phnom Penh. */
export const OPEN_HOUR = 7;
export const CLOSE_HOUR = 21;

/** Epoch ms of 07:00 Phnom Penh starting the trading day (07:00 to 07:00 next day) that contains `ms`. */
export const tradingDayStart = (ms: number): number => startOfDay(ms - OPEN_HOUR * HOUR_MS) + OPEN_HOUR * HOUR_MS;

/** True before opening (00:00-06:59) and after closing (21:00-23:59), Phnom Penh. */
export const isClosed = (ms: number): boolean => hourOf(ms) < OPEN_HOUR || hourOf(ms) >= CLOSE_HOUR;
