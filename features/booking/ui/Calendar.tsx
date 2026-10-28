"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { LangToggle } from "@/components/shared/LangToggle";
import { Qr } from "@/components/shared/Qr";
import { startOfDay } from "@/features/shop-pulse/time";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { createBookingRoom, CreateBookingError, setBookingStatus } from "../api";
import { workingHours } from "../availability";
import { T } from "../km";
import { readPin, savePin } from "../pin";
import { SLOT_MS } from "../salon";
import type { Booking, SalonConfig, Stylist, VisitStatus } from "../types";
import { useBooking } from "../useBooking";
import { dayToFollow, gridRange } from "./days";
import { bookingDays, dayLabel, dayParts, fill, firstName, hhmm, shown, withDeposit } from "./format";

/** Height of one half-hour row in px. */
const ROW = 36;
const MINUTE_MS = 60_000;
const FLASH_MS = 3000;
/** Room above the first hour label so it isn't clipped. */
const PAD = 8;

/** The laptop view: QR to book on the left, the salon's live calendar (with staff Arrived / No-show) on the right. */
export function Calendar() {
  const router = useRouter();
  const params = useSearchParams();
  const room = params.get("room");
  const { bookings, config, status } = useBooking(room);
  const [pin, setPin] = useState<string | null>(null);
  useEffect(() => setPin(room ? readPin(room) : null), [room]);
  const [lang, setLang] = useState<Lang>("en");
  const [origin, setOrigin] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [createError, setCreateError] = useState<Text | null>(null);
  const t = (x: Text) => pick(x, lang);
  const km = lang === "km";

  useEffect(() => {
    setOrigin(window.location.origin);
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const start = () => {
    setCreateError(null);
    createBookingRoom()
      .then(({ id, pin }) => {
        savePin(id, pin);
        router.replace(`/booking?room=${id}`);
      })
      .catch((e) => setCreateError(e instanceof CreateBookingError && e.status === 429 ? T.board.tooMany : T.board.createFailed));
  };
  useEffect(() => {
    if (!room) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const bookUrl = room && origin ? `${origin}/booking/book?room=${room}` : "";
  const live = status === "live" && !!room && now !== null;
  const flash = useNewBookings(bookings, status === "live");
  const days = now === null ? [] : bookingDays(now);
  const day = days[dayIndex] ?? null;
  // Cancelled bookings leave the calendar: their time is free again.
  const visible = useMemo(() => (now === null || day === null ? [] : shown(bookings).filter((b) => b.status !== "cancelled" && startOfDay(b.start) === day)), [bookings, now, day]);

  // A new hold or payment for a day that isn't shown switches the calendar to that day (most evenings that's tomorrow).
  // Keyed by room, so a new room's first snapshot ("Start a new demo") never counts as new bookings.
  const seenForDay = useRef<{ room: string | null; statuses: Map<string, Booking["status"]> } | null>(null);
  useEffect(() => {
    if (status !== "live") return;
    const before = seenForDay.current?.room === room ? seenForDay.current.statuses : null;
    seenForDay.current = { room, statuses: new Map(bookings.map((b) => [b.id, b.status])) };
    if (now === null) return;
    const i = dayToFollow(before, bookings, bookingDays(now), day);
    if (i !== null) setDayIndex(i);
    // Only a change in the bookings moves the calendar, not the clock or the staff's own day pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, status]);
  // A booking the owner moved to another day takes the calendar there too.
  useEffect(() => {
    if (!flash.moved || now === null) return;
    const i = bookingDays(now).indexOf(startOfDay(flash.moved.start));
    if (i >= 0 && i !== dayIndex) setDayIndex(i);
    // Only a new move counts, not the clock or the staff's own day pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash.moved]);
  const latest = flash.ids.size ? bookings.find((b) => flash.ids.has(b.id)) : undefined;
  const salonName = config.settings.name;
  const link = "underline underline-offset-2 hover:text-accent";

  return (
    <main lang={lang} className="mx-auto grid max-w-[1240px] gap-[22px] p-[18px] sm:p-[22px] lg:grid-cols-[330px_minmax(0,1fr)]">
      <section className="flex min-w-0 flex-col gap-3.5">
        <div>
          <p className="text-[12px] font-semibold text-accent">{t(T.board.eyebrow)}</p>
          <h1 className={`mt-1.5 text-[clamp(26px,3vw,30px)] font-semibold ${km ? "leading-[1.35] tracking-normal" : "leading-[1.05] tracking-[-0.04em]"}`}>{t(T.board.headline)}</h1>
          <p className="mt-2.5 text-[14px] text-muted">{fill(T.board.intro, lang, { n: salonName })}</p>
        </div>
        <div className="rounded-[20px] border border-line bg-surface p-[18px] text-center">
          <div className="mx-auto grid aspect-square w-[180px] place-items-center">
            {bookUrl ? (
              <a href={bookUrl} target="_blank" rel="noopener" data-book-url={bookUrl} aria-label={t(T.board.bookHere)}>
                <Qr value={bookUrl} label={t(T.board.qrLabel)} className="w-[180px]" />
              </a>
            ) : (
              <div className={`size-full rounded-xl bg-paper ${createError ? "" : "animate-pulse"}`} />
            )}
          </div>
          <p className="mt-3 font-semibold">{t(T.board.scan)}</p>
          <p className="mt-0.5 text-[13px] text-muted">{t(T.board.scanSub)}</p>
          <p className="mt-3 border-t border-line pt-2.5 text-[13px]">
            {t(T.board.noPhone)}{" "}
            <a href={bookUrl || undefined} target="_blank" rel="noopener" className={link}>
              {t(T.board.bookHere)}
            </a>
          </p>
          {room && (
            <p data-owner-admin className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-line pt-2.5 text-[13px]">
              <a href={`/booking/admin?room=${room}`} target="_blank" rel="noopener" className="font-semibold underline underline-offset-2 hover:text-accent">
                {t(T.calendar.ownerAdmin)} →
              </a>
              {pin && (
                <span className="text-muted">
                  {t(T.calendar.pin)} <b data-admin-pin className="font-semibold tracking-[0.12em] text-fg tabular-nums">{pin}</b>
                </span>
              )}
            </p>
          )}
        </div>
        <ol className="flex flex-col gap-2 text-[13.5px]">
          {T.board.steps.map((s, i) => (
            <li key={s.en} className="flex items-center gap-2.5">
              <b className="grid size-[22px] shrink-0 place-items-center rounded-[7px] bg-fg text-[11px] text-white">{i + 1}</b>
              {withDeposit(s, lang, config.settings.deposit)}
            </li>
          ))}
        </ol>
      </section>

      <section aria-label={t(T.board.calendarLabel)} className="min-w-0 rounded-[20px] bg-ink p-[18px] text-ink-fg sm:p-[22px]">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 data-salon-name className="text-[16px] font-semibold">{status === "live" ? salonName : " "}</h2>
            <p className="text-[12px] text-ink-muted tabular-nums">
              {day !== null && now !== null ? `${dayLabel(day, lang)}${dayIndex === 0 ? ` · ${hhmm(now)}` : ""}` : " "}
            </p>
          </div>
          <LangToggle lang={lang} onChange={setLang} tone="glass" />
        </div>

        {createError ? (
          <div role="alert" className="grid min-h-[300px] place-items-center px-4 text-center">
            <p className="max-w-[36ch] text-[15px]">{t(createError)}</p>
          </div>
        ) : status === "closed" ? (
          <div className="grid min-h-[300px] place-items-center text-center">
            <div>
              <p className="text-[18px] font-semibold">{t(T.board.closedTitle)}</p>
              <p className="mt-1 text-[13px] text-ink-muted">{t(T.board.closedBody)}</p>
              <button type="button" onClick={start} className="mt-4 min-h-11 rounded-[12px] bg-ink-accent px-5 text-[14px] font-semibold text-ink">
                {t(T.board.startNew)}
              </button>
            </div>
          </div>
        ) : !live || day === null ? (
          <CalendarSkeleton />
        ) : (
          <>
            <p aria-live="polite" className="sr-only">
              {latest ? `${t(T.board.newBooking)}: ${firstName(latest.name)}, ${t(T.services[latest.service])}, ${dayLabel(latest.start, lang)} ${hhmm(latest.start)}` : ""}
            </p>
            <div role="group" aria-label={t(T.board.days)} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {days.map((d, i) => {
                const p = dayParts(d, lang);
                const on = i === dayIndex;
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDayIndex(i)}
                    className={`flex min-h-12 min-w-[52px] flex-1 flex-col items-center justify-center rounded-[12px] border px-1.5 py-1 transition-colors ${
                      on ? "border-ink-fg bg-ink-fg text-ink" : "border-ink-line text-ink-fg hover:border-ink-muted"
                    }`}
                  >
                    <span className={`text-[11px] leading-tight whitespace-nowrap ${on ? "text-ink/70" : "text-ink-muted"}`}>{i === 0 ? t(T.today) : p.weekday}</span>
                    <b className="text-[16px] leading-tight font-semibold tabular-nums">{p.date}</b>
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 mb-3 text-[12px] text-ink-muted">{t(T.board.staffHint)}</p>
            <Grid room={room!} day={day} now={now!} bookings={visible} config={config} flash={flash.ids} lang={lang} />
          </>
        )}
      </section>
    </main>
  );
}

/** The calendar's columns for a day: the room's roster, plus any stylist with a booking that day who is no longer on it (after a reset). */
function columnsFor(config: SalonConfig, bookings: Booking[]): Stylist[] {
  const extra = [...new Set(bookings.map((b) => b.stylist))].filter((id) => !config.stylists.some((s) => s.id === id));
  return [...config.stylists, ...extra.map((id): Stylist => ({ id, name: { en: id, km: id }, daysOff: [], hours: null }))];
}

/**
 * One column per stylist (up to 5), half-hour rows over the salon's opening hours, stretched to cover every booking that
 * day (one made before the owner narrowed the hours stays, so staff can still mark it). A stylist's day off is a muted
 * column saying "Day off"; time outside their working hours (and so outside the salon's) is muted. Scrolls sideways
 * inside the card when the screen is narrow.
 */
function Grid({ room, day, now, bookings, config, flash, lang }: { room: string; day: number; now: number; bookings: Booking[]; config: SalonConfig; flash: Set<string>; lang: Lang }) {
  const t = (x: Text) => pick(x, lang);
  const { settings } = config;
  // The grid's top and bottom: the opening hours, or wider when a booking lies outside them.
  const { from: open, to: close } = gridRange(day, settings, bookings);
  const rows = Math.max(1, (close - open) / SLOT_MS);
  const height = rows * ROW;
  const y = (ms: number) => ((ms - open) / SLOT_MS) * ROW;
  const [menu, setMenu] = useState<string | null>(null);
  const nowTop = now >= open && now <= close ? y(now) : null;
  const columns = columnsFor(config, bookings);
  const cols = { gridTemplateColumns: `44px repeat(${columns.length}, minmax(0, 1fr))` };
  // Hour labels on the whole hours inside the grid.
  const firstHour = Math.ceil((open - day) / (60 * MINUTE_MS));
  const lastHour = Math.floor((close - day) / (60 * MINUTE_MS));

  useEffect(() => setMenu(null), [day]);

  return (
    <div data-calendar className="-mx-1 overflow-x-auto px-1">
      <div style={{ minWidth: 44 + columns.length * 145 }}>
        <div className="grid border-b border-ink-line pb-2" style={cols}>
          <span />
          {columns.map((s) => (
            <p key={s.id} data-stylist-name={s.id} className="truncate px-1.5 text-[13px] font-semibold">
              {pick(s.name, lang)}
            </p>
          ))}
        </div>
        <div className="relative grid" style={{ ...cols, paddingTop: PAD, paddingBottom: PAD }}>
          <div className="relative" style={{ height }} aria-hidden="true">
            {Array.from({ length: Math.max(0, lastHour - firstHour + 1) }, (_, i) => (
              <span key={i} className="absolute left-0 -translate-y-1/2 text-[10.5px] text-ink-muted tabular-nums" style={{ top: y(day + (firstHour + i) * 60 * MINUTE_MS) }}>
                {String(firstHour + i).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {columns.map((s, ci) => {
            const works = workingHours(s, day, settings);
            // Never filtered by hours: the grid already covers every booking that day.
            const mine = bookings.filter((b) => b.stylist === s.id);
            return (
              <div
                key={s.id}
                data-stylist={s.id}
                data-day-off={works ? undefined : ""}
                className="relative border-l border-ink-line"
                style={{
                  height,
                  backgroundImage: `repeating-linear-gradient(to bottom, var(--ink-line) 0 1px, transparent 1px ${ROW * 2}px), repeating-linear-gradient(to bottom, transparent 0 ${ROW}px, rgba(37,44,38,0.5) ${ROW}px ${ROW + 1}px, transparent ${ROW + 1}px ${ROW * 2}px)`,
                }}
              >
                {works ? (
                  <>
                    {works.from > open && <div aria-hidden="true" className="absolute inset-x-0 top-0 bg-ink-line/55" style={{ height: y(works.from) }} />}
                    {works.to < close && <div aria-hidden="true" className="absolute inset-x-0 bottom-0 bg-ink-line/55" style={{ top: y(works.to) }} />}
                  </>
                ) : (
                  <div className="absolute inset-0 grid place-items-start justify-center bg-ink-line/55 pt-6">
                    <span className="rounded-full border border-ink-line px-2.5 py-0.5 text-[12px] font-medium text-ink-muted">{t(T.calendar.dayOff)}</span>
                  </div>
                )}
                {mine.map((b) => {
                  const top = Math.max(0, y(b.start));
                  return <Block key={b.id} booking={b} top={top} height={Math.min(height, y(b.end)) - top} flash={flash.has(b.id)} lang={lang} open={menu === b.id} onOpen={() => setMenu(b.id)} />;
                })}
                {mine
                  .filter((b) => b.id === menu && b.status === "booked")
                  .map((b) => (
                    <StatusMenu key={b.id} room={room} booking={b} top={y(b.end)} rows={rows} lang={lang} alignRight={ci === columns.length - 1} onClose={() => setMenu(null)} />
                  ))}
              </div>
            );
          })}
          {nowTop !== null && (
            <div data-now-line aria-hidden="true" className="pointer-events-none absolute right-0 left-0 z-[5]" style={{ top: PAD + nowTop }}>
              <span className="absolute left-0 -translate-y-1/2 rounded-[4px] bg-ink-fg px-1 text-[10px] font-semibold text-ink tabular-nums">{hhmm(now)}</span>
              <span className="absolute right-0 left-[44px] h-px bg-ink-fg/80" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Block({ booking: b, top, height, flash, lang, open, onOpen }: { booking: Booking; top: number; height: number; flash: boolean; lang: Lang; open: boolean; onOpen: () => void }) {
  const t = (x: Text) => pick(x, lang);
  const first = `${firstName(b.name)} · ${t(T.services[b.service])}`;
  const second =
    b.status === "held"
      ? t(T.board.beingBooked)
      : b.status === "arrived"
        ? t(T.board.arrived)
        : b.status === "noshow"
          ? `${t(T.board.noShow)} · ${withDeposit(T.board.depositKept, lang, b.deposit)}`
          : t(T.board.depositPaid);
  const tone =
    b.status === "held"
      ? "border border-ink-line text-ink-fg"
      : b.status === "arrived"
        ? "border border-ink-line bg-ink-surface text-ink-muted"
        : b.status === "noshow"
          ? "border border-dashed border-ink-muted/60 text-ink-muted"
          : "bg-ink-accent text-ink";
  const style = {
    top: top + 1,
    height: height - 2,
    ...(b.status === "held" && { backgroundImage: "repeating-linear-gradient(135deg, rgba(168,196,143,0.24) 0 6px, transparent 6px 12px)" }),
  };
  const cls = `absolute right-1 left-1 flex flex-col overflow-hidden rounded-[8px] px-1.5 py-[2px] text-left text-[11px] leading-[1.35] ${tone} ${
    flash ? "z-[4] shadow-[0_0_0_3px_rgba(242,238,228,0.55)] animate-[ticket-in_.45s_var(--ease-out-expo)]" : ""
  } transition-shadow duration-700`;
  const body = (
    <>
      <span className="truncate">
        <b className="font-semibold">{firstName(b.name)}</b> · {t(T.services[b.service])}
      </span>
      <span className={`truncate ${b.status === "booked" ? "text-ink/75" : ""}`}>{second}</span>
    </>
  );
  const data = { "data-booking": b.id, "data-status": b.status, "data-flash": flash ? "" : undefined, title: `${hhmm(b.start)}–${hhmm(b.end)} · ${first} · ${second}` };

  if (b.status !== "booked") return <div {...data} className={cls} style={style}>{body}</div>;
  return (
    <button type="button" {...data} aria-haspopup="dialog" aria-expanded={open} aria-label={`${hhmm(b.start)} ${first}, ${second}`} onClick={onOpen} className={`${cls} hover:opacity-90`} style={style}>
      {body}
    </button>
  );
}

/** Small popover under a booked block: Arrived or No-show. Escape or a click outside closes it. */
function StatusMenu({ room, booking, top, rows, lang, alignRight, onClose }: { room: string; booking: Booking; top: number; rows: number; lang: Lang; alignRight: boolean; onClose: () => void }) {
  const t = (x: Text) => pick(x, lang);
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const above = top + 120 > rows * ROW;
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const onClose = () => close.current();
    ref.current?.querySelector<HTMLButtonElement>("button[data-mark]")?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const down = (e: PointerEvent) => {
      const target = e.target as Element;
      if (!ref.current?.contains(target) && !target.closest?.(`[data-booking="${booking.id}"]`)) onClose();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", down);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", down);
    };
  }, [booking.id]);

  const mark = async (status: VisitStatus) => {
    setBusy(true);
    setFailed(false);
    const r = await setBookingStatus(room, booking.id, status);
    setBusy(false);
    if (r) onClose();
    else setFailed(true);
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t(T.board.markAs)}
      data-status-menu
      className={`absolute z-10 w-[190px] rounded-[14px] bg-surface p-2.5 text-fg shadow-[0_14px_30px_-12px_rgba(0,0,0,0.6)] animate-[fade-in_.15s_ease-out] ${alignRight ? "right-1" : "left-1"}`}
      style={above ? { bottom: rows * ROW - top + ((booking.end - booking.start) / SLOT_MS) * ROW + 4 } : { top: top + 4 }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[12.5px] leading-snug">
          <b className="font-semibold">{firstName(booking.name)}</b> · {hhmm(booking.start)}
          <span className="block truncate text-muted">{t(T.services[booking.service])}</span>
        </p>
        <button type="button" onClick={onClose} aria-label={t(T.board.close)} className="-mt-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-paper">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button type="button" data-mark="arrived" disabled={busy} onClick={() => mark("arrived")} className="min-h-10 rounded-[10px] bg-fg px-2 text-[12.5px] font-semibold text-white disabled:opacity-50">
          {t(T.board.arrived)}
        </button>
        <button type="button" data-mark="noshow" disabled={busy} onClick={() => mark("noshow")} className="min-h-10 rounded-[10px] border border-line px-2 text-[12.5px] font-semibold hover:border-line-strong disabled:opacity-50">
          {t(T.board.noShow)}
        </button>
      </div>
      {failed && (
        <p role="alert" className="mt-1.5 text-[12px] text-muted">
          {t(T.board.markFailed)}
        </p>
      )}
    </div>
  );
}

/**
 * Bookings to highlight for FLASH_MS: those that just became paid ("booked") after the first snapshot, and those the
 * owner just moved. A new hold doesn't flash; its payment does. `moved` is the latest moved booking (a new object per move).
 */
function useNewBookings(bookings: Booking[], live: boolean): { ids: Set<string>; moved: Booking | null } {
  const seen = useRef<Map<string, Pick<Booking, "status" | "movedAt">> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [flash, setFlash] = useState<Set<string>>(() => new Set());
  const [moved, setMoved] = useState<Booking | null>(null);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (!live) return;
    const next = new Map(bookings.map((b) => [b.id, { status: b.status, movedAt: b.movedAt }]));
    const before = seen.current;
    seen.current = next;
    if (before === null) return;
    const paid = bookings.filter((b) => b.status === "booked" && before.get(b.id)?.status !== "booked");
    const shifted = bookings.filter((b) => b.movedAt !== undefined && b.status !== "cancelled" && before.has(b.id) && before.get(b.id)!.movedAt !== b.movedAt);
    const fresh = [...paid, ...shifted].map((b) => b.id);
    if (shifted.length) setMoved(shifted.at(-1)!);
    if (!fresh.length) return;
    setFlash((f) => new Set([...f, ...fresh]));
    timers.current.push(
      setTimeout(() => setFlash((f) => new Set([...f].filter((id) => !fresh.includes(id)))), FLASH_MS),
    );
  }, [bookings, live]);

  return useMemo(() => ({ ids: flash, moved }), [flash, moved]);
}

function CalendarSkeleton() {
  const block = (cls: string) => <div className={`rounded-[10px] bg-ink-surface ${cls}`} />;
  return (
    <div aria-hidden="true">
      <div className="flex gap-1.5">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex-1">
            {block("h-12")}
          </div>
        ))}
      </div>
      {block("mt-3 h-3 w-48")}
      <div className="mt-4 grid grid-cols-[44px_repeat(3,minmax(0,1fr))] gap-2">
        <span />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            {block("h-[70px]")}
            {block("h-[34px]")}
            {block("h-[106px]")}
            {block("h-[70px]")}
          </div>
        ))}
      </div>
    </div>
  );
}
