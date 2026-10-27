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
