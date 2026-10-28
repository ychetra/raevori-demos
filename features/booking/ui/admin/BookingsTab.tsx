"use client";

import { useEffect, useMemo, useState } from "react";
import { btnDanger, btnPrimary, btnSecondary, card, chip, DownloadLink, input, Segments, Sheet } from "@/components/admin/parts";
import { startOfDay } from "@/features/shop-pulse/time";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { cancelBooking, exportUrl, moveBooking, type AdminFail } from "../../admin-api";
import { setBookingStatus } from "../../api";
import { fits, slotStarts } from "../../availability";
import { T } from "../../km";
import type { Booking, BookingStatus, SalonConfig, StylistId, VisitStatus } from "../../types";
import { bookingDays, dayLabel, dayParts, dayTimeLabel, dollars, fill, hhmm, stylistName } from "../format";

type Filter = "all" | "booked" | "arrived" | "noshow" | "cancelled";
const FILTERS: Filter[] = ["all", "booked", "arrived", "noshow", "cancelled"];
const CHANGEABLE: BookingStatus[] = ["held", "booked"];

type Props = { room: string; bookings: Booking[]; config: SalonConfig; lang: Lang; onFail: (f: AdminFail) => boolean };

/** A clock for "is this time still in the future", ticking every 30 s (null until mounted, so the server render matches). */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** True from lg up, where the detail is a side panel instead of a sheet. */
function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/** A day strip: today plus the next 6 days. */
function DayStrip({ days, index, onPick, lang, label }: { days: number[]; index: number; onPick: (i: number) => void; lang: Lang; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
      {days.map((d, i) => {
        const p = dayParts(d, lang);
        const on = i === index;
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(i)}
            className={`flex min-h-[52px] min-w-[44px] flex-1 flex-col items-center justify-center rounded-[12px] border px-1.5 transition-colors ${on ? "border-fg bg-fg text-white" : "border-line bg-surface hover:border-line-strong"}`}
          >
            <span className={`text-[11px] leading-tight whitespace-nowrap ${on ? "text-white/75" : "text-muted"}`}>{i === 0 ? pick(T.today, lang) : p.weekday}</span>
            <b className="text-[16px] leading-tight font-semibold tabular-nums">{p.date}</b>
          </button>
        );
      })}
    </div>
  );
}

/** Bookings by day and time, with status filters, detail, Move / Cancel / Arrived / No-show, and the Excel download. */
export function BookingsTab({ room, bookings, config, lang, onFail }: Props) {
  const t = (x: Text) => pick(x, lang);
  const now = useNow();
  const wide = useWide();
  const [dayIndex, setDayIndex] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const days = useMemo(() => (now === null ? [] : bookingDays(now)), [now === null ? null : startOfDay(now)]); // eslint-disable-line react-hooks/exhaustive-deps
  const day = days[dayIndex] ?? null;
  const ofDay = useMemo(
    () => (day === null ? [] : bookings.filter((b) => b.status !== "expired" && startOfDay(b.start) === day).sort((a, b) => a.start - b.start || a.stylist.localeCompare(b.stylist))),
    [bookings, day],
  );
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f, f === "all" ? ofDay.length : ofDay.filter((b) => b.status === f).length])) as Record<Filter, number>, [ofDay]);
  const shown = ofDay.filter((b) => filter === "all" || b.status === filter);
  const current = selected ? (bookings.find((b) => b.id === selected) ?? null) : null;

  /** After a move to another day, follow the booking there. */
  const follow = (b: Booking) => {
    const i = days.indexOf(startOfDay(b.start));
    if (i >= 0) setDayIndex(i);
  };

  const detail = current && now !== null && <Detail key={current.id} booking={current} room={room} config={config} bookings={bookings} days={days} now={now} lang={lang} onFail={onFail} onMoved={follow} inSheet={!wide} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="min-w-0">
        <div className="flex flex-col gap-3">
          {days.length ? <DayStrip days={days} index={dayIndex} onPick={setDayIndex} lang={lang} label={t(T.admin.day)} /> : <div className="h-[52px] animate-pulse rounded-[12px] bg-paper" aria-hidden="true" />}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="-mx-[18px] flex gap-1.5 overflow-x-auto px-[18px] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label={t(T.admin.tabs.bookings)}>
              {FILTERS.map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={chip(filter === f)}>
                  {t(f === "all" ? T.admin.all : T.admin.status[f])} <span className="tabular-nums opacity-70">{counts[f]}</span>
                </button>
              ))}
            </div>
            <DownloadLink href={exportUrl(room, lang)}>{t(T.admin.download)}</DownloadLink>
          </div>
        </div>

        {day !== null && <h3 className="mt-4 mb-1.5 px-1 text-[12.5px] font-semibold text-muted">{dayLabel(day, lang)}</h3>}
        {shown.length === 0 ? (
          <p className={`${card} p-5 text-center text-[13.5px] text-muted`}>{t(ofDay.length ? T.admin.noMatch : T.admin.noBookingsDay)}</p>
        ) : (
          <ul className={`${card} divide-y divide-line`}>
            {shown.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  data-admin-booking={b.id}
                  aria-current={wide && selected === b.id ? "true" : undefined}
                  onClick={() => setSelected(b.id)}
                  className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 px-3.5 py-3 text-left transition-colors first:rounded-t-[20px] last:rounded-b-[20px] hover:bg-paper/50 ${wide && selected === b.id ? "bg-paper/70" : ""}`}
                >
                  <span className="pt-px text-[12.5px] text-muted tabular-nums">
                    {hhmm(b.start)}
                    <span className="block">{hhmm(b.end)}</span>
                  </span>
                  <span className="min-w-0">
                    <b className={`block truncate text-[14px] font-semibold ${b.status === "cancelled" ? "text-muted line-through" : ""}`}>{b.name}</b>
                    <span className="block truncate text-[12.5px] text-muted">
                      {t(T.services[b.service])} · {stylistName(config, b.stylist, lang)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <b className="text-[14px] font-semibold tabular-nums">{dollars(b.price)}</b>
                    <StatusTag status={b.status} lang={lang} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {wide ? (
        <aside className={`${card} sticky top-4 p-4`} aria-label={current ? current.name : undefined}>
          {detail || <p className="py-8 text-center text-[13.5px] text-muted">{t(T.admin.pickBooking)}</p>}
        </aside>
      ) : (
        current && (
          <Sheet title={current.name} closeLabel={t(T.admin.close)} onClose={() => setSelected(null)}>
            {detail}
          </Sheet>
        )
      )}
    </div>
  );
}

function StatusTag({ status, lang }: { status: BookingStatus; lang: Lang }) {
  const strong = status === "booked";
  return (
    <span data-booking-status={status} className={`rounded-full border px-2 text-[11.5px] leading-[20px] whitespace-nowrap ${strong ? "border-fg font-semibold" : "border-line text-muted"}`}>
      {pick(T.admin.status[status], lang)}
    </span>
  );
}

/** The deposit line for a booking: paid, not paid yet, refunded or kept. */
function depositText(b: Booking, lang: Lang): string {
  const d = dollars(b.deposit);
  if (b.deposit === 0) return pick(T.admin.depositNone, lang);
  if (b.status === "held") return fill(T.admin.depositUnpaid, lang, { d });
  if (b.status === "cancelled") return b.at.booked === undefined ? fill(T.admin.depositUnpaid, lang, { d }) : fill(b.refund ? T.admin.depositRefunded : T.admin.depositKept, lang, { d });
  if (b.status === "noshow") return fill(T.admin.depositKept, lang, { d });
  return fill(T.admin.depositPaid, lang, { d });
}

type Mode = "view" | "move" | "cancel";

function Detail({
  booking: b,
  room,
  config,
  bookings,
  days,
  now,
  lang,
  onFail,
  onMoved,
  inSheet,
}: {
  booking: Booking;
  room: string;
  config: SalonConfig;
  bookings: Booking[];
  days: number[];
  now: number;
  lang: Lang;
  onFail: (f: AdminFail) => boolean;
  onMoved: (b: Booking) => void;
  inSheet: boolean;
}) {
  const t = (x: Text) => pick(x, lang);
  const [mode, setMode] = useState<Mode>("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Text | null>(null);
  const changeable = CHANGEABLE.includes(b.status);

  // Another admin tab (or the calendar) can close the booking while a panel is open.
  useEffect(() => {
    if (!changeable) setMode("view");
  }, [changeable]);

  const mark = async (status: VisitStatus) => {
    setBusy(true);
    setError(null);
    const r = await setBookingStatus(room, b.id, status);
    setBusy(false);
    if (!r) setError(T.admin.errFailed);
  };

  const rows: [Text, string][] = [
    [T.book.date, dayLabel(b.start, lang)],
    [T.book.time, `${hhmm(b.start)}–${hhmm(b.end)}`],
    [T.book.service, t(T.services[b.service])],
    [T.book.stylist, stylistName(config, b.stylist, lang)],
    [T.admin.price, dollars(b.price)],
    [T.admin.deposit, depositText(b, lang)],
  ];

  return (
    <div data-booking-detail={b.id}>
      {!inSheet && (
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-[17px] font-semibold tracking-[-0.02em] break-words">{b.name}</h3>
          <StatusTag status={b.status} lang={lang} />
        </div>
      )}
      {inSheet && <StatusTag status={b.status} lang={lang} />}

      <dl className="mt-3 flex flex-col gap-2 text-[13.5px]">
        {rows.map(([k, v]) => (
          <div key={k.en} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-muted">{t(k)}</dt>
            <dd className="text-right font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {(b.movedAt !== undefined || (b.status === "cancelled" && b.cancelReason)) && (
        <div className="mt-3 flex flex-col gap-1 border-t border-line pt-2.5 text-[13px]">
          {b.status === "cancelled" && b.cancelReason && (
            <p>
              <span className="text-muted">{t(T.admin.reason)}:</span> {b.cancelReason}
            </p>
          )}
          {b.movedAt !== undefined && <p data-moved className="text-muted">{fill(T.admin.movedAt, lang, { t: hhmm(b.movedAt) })}</p>}
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-[13px] font-medium text-khqr">{t(error)}</p>}

      {changeable && mode === "view" && (
        <div className="mt-4 flex flex-col gap-2">
          {b.status === "booked" && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => mark("arrived")} disabled={busy} className={btnPrimary}>{t(T.admin.markArrived)}</button>
              <button type="button" onClick={() => mark("noshow")} disabled={busy} className={btnSecondary}>{t(T.admin.markNoShow)}</button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setError(null); setMode("move"); }} disabled={busy} className={btnSecondary}>{t(T.admin.move)}</button>
            <button type="button" onClick={() => { setError(null); setMode("cancel"); }} disabled={busy} className={btnSecondary}>{t(T.admin.cancelBooking)}</button>
          </div>
        </div>
      )}
      {changeable && mode === "move" && (
        <MovePanel booking={b} room={room} config={config} bookings={bookings} days={days} now={now} lang={lang} onFail={onFail} onDone={(moved) => { setMode("view"); if (moved) onMoved(moved); }} />
      )}
      {changeable && mode === "cancel" && <CancelPanel booking={b} room={room} lang={lang} onFail={onFail} onDone={() => setMode("view")} />}
    </div>
  );
}

/** Pick a new day, stylist and free time for the booking (its own length; it never clashes with itself). */
function MovePanel({
  booking: b,
  room,
  config,
  bookings,
  days,
  now,
  lang,
  onFail,
  onDone,
}: {
  booking: Booking;
  room: string;
  config: SalonConfig;
  bookings: Booking[];
  days: number[];
  now: number;
  lang: Lang;
  onFail: (f: AdminFail) => boolean;
  onDone: (moved: Booking | null) => void;
}) {
  const t = (x: Text) => pick(x, lang);
  const [dayIndex, setDayIndex] = useState(() => Math.max(0, days.indexOf(startOfDay(b.start))));
  const [stylist, setStylist] = useState<StylistId>(() => (config.stylists.some((s) => s.id === b.stylist) ? b.stylist : (config.stylists[0]?.id ?? b.stylist)));
  const [start, setStart] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Text | null>(null);
  const day = days[dayIndex];
  const st = config.stylists.find((s) => s.id === stylist);
  const length = b.end - b.start;
  const times = useMemo(
    () => (st && day !== undefined ? slotStarts(day, config.settings).filter((s) => !(s === b.start && stylist === b.stylist) && fits(bookings, st, s, length, now, config.settings, b.id)) : []),
    [st, day, config.settings, bookings, length, now, b.id, b.start, b.stylist, stylist],
  );
  // A time someone else just took drops out of the list; so does the pick.
  useEffect(() => {
    if (start !== null && !times.includes(start)) setStart(null);
  }, [times, start]);

  const move = async () => {
    if (start === null) return;
    setBusy(true);
    setError(null);
    const r = await moveBooking(room, b.id, start, stylist === b.stylist ? undefined : stylist);
    setBusy(false);
    if (r.ok) return onDone(r.value);
    if (onFail(r)) return;
    setStart(null);
    setError(r.error === "taken" ? T.admin.errTaken : r.error === "bad_start" || r.error === "bad_stylist" ? T.admin.errBadTime : r.error === "wrong_state" ? T.admin.errWrongState : T.admin.errFailed);
  };

  return (
    <div data-move-panel className="mt-4 rounded-[14px] border border-line p-3">
      <p className="text-[13.5px] font-semibold">{t(T.admin.moveTitle)}</p>
      <p className="mt-0.5 text-[12.5px] text-muted">{t(T.admin.moveHint)}</p>
      <div className="mt-3">
        <DayStrip days={days} index={dayIndex} onPick={(i) => { setDayIndex(i); setStart(null); }} lang={lang} label={t(T.admin.day)} />
      </div>
      <div className="mt-3">
        <p className="mb-1.5 text-[12.5px] font-semibold text-muted">{t(T.book.stylist)}</p>
        <Segments value={stylist} onChange={(s) => { setStylist(s); setStart(null); }} label={t(T.book.stylist)} options={config.stylists.map((s) => ({ value: s.id, label: pick(s.name, lang) }))} />
      </div>
      <p className="mt-3 mb-1.5 text-[12.5px] font-semibold text-muted">{t(T.admin.freeTimes)}</p>
      {times.length === 0 ? (
        <p data-no-times className="rounded-[12px] border border-dashed border-line-strong px-3 py-3 text-center text-[13px] text-muted">{t(T.admin.noTimes)}</p>
      ) : (
        <div role="radiogroup" aria-label={t(T.admin.freeTimes)} className="grid grid-cols-4 gap-1.5">
          {times.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={start === s}
              data-move-time={hhmm(s)}
              onClick={() => setStart(s)}
              className={`min-h-10 rounded-[10px] border text-[13.5px] font-semibold tabular-nums transition-colors ${start === s ? "border-fg bg-fg text-white" : "border-line hover:border-line-strong"}`}
            >
              {hhmm(s)}
            </button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="mt-2.5 text-[13px] font-medium text-khqr">{t(error)}</p>}
      <div className="mt-3 flex flex-col gap-2">
        <button type="button" data-move-confirm onClick={move} disabled={busy || start === null} className={btnPrimary}>
          {start === null ? t(T.admin.pickTime) : fill(T.admin.moveTo, lang, { t: dayTimeLabel(start, lang) })}
        </button>
        <button type="button" onClick={() => onDone(null)} disabled={busy} className={btnSecondary}>{t(T.admin.keepTime)}</button>
      </div>
    </div>
  );
}

type Preset = "customerAsked" | "stylistAway" | "other";

/** A reason, and for a paid booking "Refund deposit" or "Keep deposit". */
function CancelPanel({ booking: b, room, lang, onFail, onDone }: { booking: Booking; room: string; lang: Lang; onFail: (f: AdminFail) => boolean; onDone: () => void }) {
  const t = (x: Text) => pick(x, lang);
  const [preset, setPreset] = useState<Preset>("customerAsked");
  const [other, setOther] = useState("");
  const [refund, setRefund] = useState<"refund" | "keep">("refund");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Text | null>(null);
  const paid = b.status === "booked" && b.deposit > 0;

  const cancel = async () => {
    const reason = preset === "other" ? other.trim() : t(T.admin[preset]);
    if (!reason) return setError(T.admin.errReason);
    setBusy(true);
    setError(null);
    const r = await cancelBooking(room, b.id, reason, paid && refund === "refund");
    setBusy(false);
    if (r.ok) return onDone();
    if (onFail(r)) return;
    setError(r.error === "wrong_state" ? T.admin.errWrongState : r.error === "invalid" ? T.admin.errReason : T.admin.errFailed);
  };

  return (
    <div data-cancel-panel className="mt-4 rounded-[14px] border border-line p-3">
      <p className="text-[13.5px] font-semibold">{t(T.admin.cancelWhy)}</p>
      <div className="mt-2.5">
        <Segments value={preset} onChange={setPreset} label={t(T.admin.reason)} options={(["customerAsked", "stylistAway", "other"] as const).map((p) => ({ value: p, label: t(p === "other" ? T.admin.otherReason : T.admin[p]) }))} />
      </div>
      {preset === "other" && <input autoFocus value={other} maxLength={120} onChange={(e) => setOther(e.target.value)} placeholder={t(T.admin.otherPlaceholder)} aria-label={t(T.admin.otherReason)} className={`${input} mt-2.5`} />}
      <p className="mt-3 mb-1.5 text-[12.5px] font-semibold text-muted">{t(T.admin.deposit)} · {dollars(b.deposit)}</p>
      {paid ? (
        <Segments value={refund} onChange={setRefund} label={t(T.admin.deposit)} options={[{ value: "refund", label: t(T.admin.refund) }, { value: "keep", label: t(T.admin.keepDeposit) }]} />
      ) : (
        <p className="text-[12.5px] text-muted">{b.deposit === 0 ? t(T.admin.depositNone) : t(T.admin.unpaidNote)}</p>
      )}
      {error && <p role="alert" className="mt-2.5 text-[13px] font-medium text-khqr">{t(error)}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={cancel} disabled={busy} className={btnDanger}>{t(T.admin.cancelBooking)}</button>
        <button type="button" onClick={onDone} disabled={busy} className={btnSecondary}>{t(T.admin.keepBooking)}</button>
      </div>
    </div>
  );
}
