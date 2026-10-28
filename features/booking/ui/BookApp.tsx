"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { KhqrCard } from "@/components/shared/KhqrCard";
import { LangToggle } from "@/components/shared/LangToggle";
import { PhoneFrame } from "@/components/shared/PhoneFrame";
import { startOfDay } from "@/features/shop-pulse/time";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { holdSlot, payHold } from "../api";
import { availability } from "../availability";
import { T } from "../km";
import { balanceDue, DEPOSIT, HOLD_MS, SERVICES, STYLISTS } from "../salon";
import type { Booking, ServiceId, StylistId } from "../types";
import { useBooking } from "../useBooking";
import { firstDayWithTimes } from "./days";
import { bookingDays, bookingIcs, dayLabel, dayParts, dollars, fill, hhmm, mmss, withDeposit } from "./format";

type Step = "service" | "stylist" | "time" | "details" | "pay" | "done";
const STEP_NUMBER: Partial<Record<Step, number>> = { service: 1, stylist: 2, time: 3, details: 4 };
const MAX_NAME = 40;
const MAX_PHONE = 20;

const storageKey = (room: string) => `raevori-booking:${room}`;

/**
 * The hold or booking made in this tab for `room`, so a reload keeps it, with the hold's deadline on this device's clock.
 * Storage can be missing or blocked: then nothing is remembered.
 */
type Mine = { booking: Booking; deadline: number | null };
function loadMine(room: string): Mine | null {
  try {
    const raw = sessionStorage.getItem(storageKey(room));
    return raw ? (JSON.parse(raw) as Mine) : null;
  } catch {
    return null;
  }
}
function saveMine(room: string, booking: Booking | null, deadline: number | null = null) {
  try {
    if (booking) sessionStorage.setItem(storageKey(room), JSON.stringify({ booking, deadline } satisfies Mine));
    else sessionStorage.removeItem(storageKey(room));
  } catch {
    // Private mode or blocked storage: the booking just won't survive a reload.
  }
}

/** The customer's phone: service → stylist → day and time → details → KHQR deposit → confirmation. */
export function BookApp() {
  const params = useSearchParams();
  const room = params.get("room");
  const live = useBooking(room);
  const [lang, setLang] = useState<Lang>("en");
  const [now, setNow] = useState<number | null>(null);
  const [step, setStep] = useState<Step>("service");
  const [service, setService] = useState<ServiceId | null>(null);
  const [stylist, setStylist] = useState<StylistId | "any">("any");
  const [dayIndex, setDayIndex] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [mine, setMine] = useState<Booking | null>(null);
  /** When the hold runs out, on this device's clock (the server's clock may differ). */
  const [deadline, setDeadline] = useState<number | null>(null);
  const [notice, setNotice] = useState<Text | null>(null);
  const [error, setError] = useState<Text | null>(null);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const t = (x: Text) => pick(x, lang);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Restore a hold or booking from this tab.
  const stored = useRef(false);
  useEffect(() => {
    const saved = room ? loadMine(room) : null;
    stored.current = !!saved;
    if (saved) {
      setMine(saved.booking);
      setDeadline(saved.deadline);
      setService(saved.booking.service);
      setStep(saved.booking.status === "held" ? "pay" : "done");
    }
  }, [room]);

  // The live copy wins over the stored one; a remembered booking the first snapshot doesn't know is stale.
  const current = mine && (live.bookings.find((b) => b.id === mine.id) ?? mine);
  useEffect(() => {
    if (!stored.current || live.status !== "live") return;
    stored.current = false;
    if (room && mine && !live.bookings.some((b) => b.id === mine.id)) {
      saveMine(room, null);
      setMine(null);
      setStep("service");
    }
  }, [room, mine, live.status, live.bookings]);

  /** Back to the times with a message (taken or run-out hold), keeping the service, stylist and day. */
  const backToTimes = (why: Text) => {
    if (room) saveMine(room, null);
    if (mine && now !== null) {
      setService(mine.service);
      const i = bookingDays(now).indexOf(startOfDay(mine.start));
      if (i >= 0) setDayIndex(i);
    }
    setMine(null);
    setNotice(why);
    setError(null);
    setStep("time");
  };

  // A hold that runs out while paying (by this device's countdown or by a live "expired" event).
  const holdLeft = current?.status === "held" && deadline !== null && now !== null ? Math.min(HOLD_MS, deadline - now) : null;
  useEffect(() => {
    if (step !== "pay" || !current) return;
    if (current.status === "expired" || (holdLeft !== null && holdLeft <= 0)) backToTimes(T.book.expired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, current?.status, now]);

  const days = now === null ? [] : bookingDays(now);
  const day = days[dayIndex] ?? null;
  // Trust the server for holds (it sends "expired" when one runs out), so a phone with a wrong clock still sees them as taken.
  const visible = useMemo(
    () => live.bookings.filter((b) => b.status !== "expired").map((b) => (b.status === "held" ? { ...b, holdUntil: Number.POSITIVE_INFINITY } : b)),
    [live.bookings],
  );
  const times = useMemo(
    () => (service && day !== null && now !== null && live.status === "live" ? availability(visible, service, stylist, day, now) : null),
    // Recompute on the minute, not every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, service, stylist, day, live.status, now === null ? null : Math.floor(now / 60_000)],
  );
  const [start, setStart] = useState<number | null>(null);

  const hold = async () => {
    if (!room || !service || start === null || !name.trim()) return;
    setBusy(true);
    setError(null);
    const r = await holdSlot(room, { service, stylist, start, name: name.trim(), ...(phone.trim() && { phone: phone.trim() }) });
    setBusy(false);
    if (r.ok) {
      const until = Date.now() + Math.max(0, (r.booking.holdUntil ?? 0) - (r.booking.at.held ?? r.booking.holdUntil ?? 0));
      saveMine(room, r.booking, until);
      setMine(r.booking);
      setDeadline(until);
      setNotice(null);
      setStep("pay");
    } else if (r.error === "taken") {
      setStart(null);
      backToTimes(T.book.taken);
    } else if (r.error === "not_found") setGone(true);
    else setError(r.error === "full" ? T.book.full : r.error === "invalid" ? T.book.invalid : T.book.failed);
  };

  const pay = async () => {
    if (!room || !mine) return;
    setBusy(true);
    setError(null);
    const r = await payHold(room, mine.id);
    setBusy(false);
    if (r.ok) {
      saveMine(room, r.booking);
      setMine(r.booking);
      setStep("done");
    } else if (r.error === "expired") backToTimes(T.book.expired);
    else if (r.error === "not_found") setGone(true);
    else setError(T.book.failed);
  };

  const again = () => {
    if (room) saveMine(room, null);
    setMine(null);
    setService(null);
    setStylist("any");
    setStart(null);
    setNotice(null);
    setError(null);
    setStep("service");
  };

  const closed = !room || gone || live.status === "closed";
  const view: Step | "closed" = closed ? "closed" : step;

  // When the screen changes the pressed button is gone: move focus to the new heading instead of <body>.
  const phoneRef = useRef<HTMLDivElement>(null);
  const shownView = useRef(view);
  useEffect(() => {
    if (shownView.current === view) return;
    shownView.current = view;
    const h = phoneRef.current?.querySelector<HTMLElement>("main h1");
    if (h) {
      h.tabIndex = -1;
      h.style.outline = "none";
      h.focus({ preventScroll: true });
    }
    phoneRef.current?.querySelector("[data-scroll]")?.scrollTo({ top: 0 });
  }, [view]);

  const go = (s: Step) => {
    setError(null);
    setStep(s);
  };
  /** The day strip opens on the first day with a free time for this service and stylist (in the evening, tomorrow). */
  const pickStylist = (s: StylistId | "any") => {
    setStylist(s);
    setStart(null);
    if (service && now !== null && live.status === "live") setDayIndex(firstDayWithTimes(visible, service, s, bookingDays(now), now));
    else setDayIndex(0);
    go("time");
  };
  const summary = [service && t(T.services[service]), stylist && (stylist === "any" ? t(T.anyone) : t(T.stylists[stylist])), start !== null && `${dayLabel(start, lang)} · ${hhmm(start)}`];

  return (
    <div ref={phoneRef} lang={lang} className="md:grid md:min-h-[calc(100dvh-36px)] md:place-items-center md:p-6">
      <PhoneFrame className="h-[calc(100dvh-36px)] md:h-[800px] md:max-h-[calc(100dvh-84px)] md:w-[400px]">
        <div data-scroll className={`flex h-full flex-col overflow-y-auto ${view === "pay" ? "bg-[#efe9e9]" : ""}`}>
          <header className="bg-gradient-to-br from-accent to-[#24311d] px-4 pt-4 pb-4 text-[#f4f1e8]">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-[16px] font-semibold tracking-[-0.02em]">{t(T.salon)}</p>
              <LangToggle lang={lang} onChange={setLang} tone="glass" />
            </div>
          </header>
          <main data-step={view} className="relative flex flex-1 flex-col px-4 pt-4 pb-5">
            {view === "closed" ? (
              <Closed lang={lang} />
            ) : view === "service" ? (
              <Shell lang={lang} step={step} title={t(T.book.pickService)}>
                <Choices>
                  {SERVICES.map((s) => (
                    <Choice key={s.id} on={service === s.id} onClick={() => (setService(s.id), setStart(null), go("stylist"))} title={t(T.services[s.id])} line={`${s.minutes} ${t(T.min)}`} right={dollars(s.price)} />
                  ))}
                </Choices>
              </Shell>
            ) : view === "stylist" ? (
              <Shell lang={lang} step={step} title={t(T.book.pickStylist)} onBack={() => go("service")} summary={summary.slice(0, 1)}>
                <Choices>
                  <Choice on={stylist === "any"} onClick={() => pickStylist("any")} title={t(T.anyone)} line={t(T.book.anyoneLine)} />
                  {STYLISTS.map((s) => (
                    <Choice key={s} on={stylist === s} onClick={() => pickStylist(s)} title={t(T.stylists[s])} />
                  ))}
                </Choices>
              </Shell>
            ) : view === "time" ? (
              <Shell lang={lang} step={step} title={t(T.book.pickTime)} onBack={() => go("stylist")} summary={summary.slice(0, 2)}>
                {notice && (
                  <p role="alert" data-notice className="mb-3 rounded-[12px] bg-paper px-3 py-2.5 text-[13px] font-medium">
                    {t(notice)}
                  </p>
                )}
                <div role="group" aria-label={t(T.book.date)} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
                  {days.map((d, i) => {
                    const p = dayParts(d, lang);
                    const on = i === dayIndex;
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => (setDayIndex(i), setStart(null))}
                        className={`flex min-h-[54px] min-w-[46px] flex-1 flex-col items-center justify-center rounded-[12px] border px-1 transition-colors ${on ? "border-fg bg-fg text-white" : "border-line hover:border-line-strong"}`}
                      >
                        <span className={`text-[11px] leading-tight whitespace-nowrap ${on ? "text-white/75" : "text-muted"}`}>{i === 0 ? t(T.today) : p.weekday}</span>
                        <b className="text-[17px] leading-tight font-semibold tabular-nums">{p.date}</b>
                      </button>
                    );
                  })}
                </div>
                <h2 className="mt-4 mb-2 text-[13px] font-semibold">{t(T.book.freeTimes)}</h2>
                {times === null ? (
                  <div aria-hidden="true" className="grid grid-cols-4 gap-2">
                    {Array.from({ length: 8 }, (_, i) => (
                      <div key={i} className="h-11 animate-pulse rounded-[12px] bg-paper" />
                    ))}
                  </div>
                ) : times.length === 0 ? (
                  <div data-no-times className="rounded-[14px] border border-dashed border-line-strong px-4 py-5 text-center">
                    <p className="text-[14px] font-semibold">{t(T.book.noTimes)}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted">{t(T.book.noTimesSub)}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {times.map((s) => (
                      <button
                        key={s}
                        type="button"
                        data-time={hhmm(s)}
                        onClick={() => (setStart(s), setNotice(null), go("details"))}
                        className={`min-h-11 rounded-[12px] border text-[14px] font-semibold tabular-nums transition-colors ${start === s ? "border-fg bg-fg text-white" : "border-line hover:border-line-strong"}`}
                      >
                        {hhmm(s)}
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-[12px] text-muted">{t(T.book.liveNote)}</p>
              </Shell>
            ) : view === "details" ? (
              <Shell lang={lang} step={step} title={t(T.book.details)} onBack={() => go("time")} summary={summary}>
                <form
                  className="flex flex-1 flex-col"
                  onSubmit={(e) => {
                    e.preventDefault();
                    hold();
                  }}
                >
                  <label className="block text-[13px] font-semibold" htmlFor="booking-name">
                    {t(T.book.name)}
                  </label>
                  <input
                    id="booking-name"
                    required
                    autoComplete="given-name"
                    maxLength={MAX_NAME}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5 min-h-12 w-full rounded-[12px] border border-line bg-surface px-3 text-[16px] outline-none focus:border-fg"
                  />
                  <label className="mt-4 block text-[13px] font-semibold" htmlFor="booking-phone">
                    {t(T.book.phone)}
                  </label>
                  <input
                    id="booking-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={MAX_PHONE}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1.5 min-h-12 w-full rounded-[12px] border border-line bg-surface px-3 text-[16px] outline-none focus:border-fg"
                  />
                  <p className="mt-1.5 text-[12px] text-muted">{t(T.book.phoneNote)}</p>
                  {error && (
                    <p role="alert" className="mt-3 rounded-[12px] bg-paper px-3 py-2.5 text-center text-[13px]">
                      {t(error)}
                    </p>
                  )}
                  <div className="mt-auto pt-5">
                    <button type="submit" disabled={busy || !name.trim() || start === null} className="min-h-[52px] w-full rounded-[14px] bg-khqr text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40">
                      {withDeposit(T.book.payDeposit, lang)}
                    </button>
                    <p className="mt-2 text-center text-[11.5px] text-muted">{t(T.book.payNote)}</p>
                  </div>
                </form>
              </Shell>
            ) : view === "pay" && current ? (
              <>
                <h1 className="text-[20px] leading-tight font-semibold tracking-[-0.02em]">{t(T.book.payTitle)}</h1>
                <p className="mt-1 text-[13px] text-muted">
                  {t(T.services[current.service])} · {t(T.stylists[current.stylist])} · {dayLabel(current.start, lang)} {hhmm(current.start)}
                </p>
                <p className="mt-3 flex items-baseline justify-between gap-3 rounded-[12px] bg-white px-3 py-2.5 text-[13px]">
                  <span>{t(T.book.heldFor)}</span>
                  <b data-countdown className="text-[17px] font-semibold tabular-nums" aria-live="off">
                    {holdLeft === null ? "5:00" : mmss(holdLeft)}
                  </b>
                </p>
                <div className="mt-4">
                  <KhqrCard amount={DEPOSIT} merchant={t(T.salon)} lang={lang} onPaid={pay} busy={busy} />
                </div>
                {error && (
                  <p role="alert" className="mt-3 rounded-[12px] bg-white px-3 py-2.5 text-center text-[13px] text-khqr">
                    {t(error)}
                  </p>
                )}
              </>
            ) : view === "done" && current ? (
              <Done booking={current} lang={lang} now={now ?? Date.now()} onAgain={again} />
            ) : null}
          </main>
        </div>
      </PhoneFrame>
    </div>
  );
}

function Shell({ lang, step, title, onBack, summary, children }: { lang: Lang; step: Step; title: string; onBack?: () => void; summary?: (string | false | null)[]; children: ReactNode }) {
  const parts = (summary ?? []).filter(Boolean);
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex min-h-10 items-center gap-1">
        {onBack && (
          <button type="button" onClick={onBack} aria-label={pick(T.book.back, lang)} className="-ml-2 grid size-10 place-items-center rounded-full hover:bg-paper">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
          </button>
        )}
        <p className="text-[12px] font-semibold text-accent">{fill(T.book.step, lang, { n: STEP_NUMBER[step] ?? 1 })}</p>
      </div>
      <h1 className="mt-1 text-[22px] leading-tight font-semibold tracking-[-0.03em]">{title}</h1>
      <p className="mt-1 min-h-[1.4em] text-[13px] text-muted">{parts.join(" · ")}</p>
      <div className="mt-3 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function Choices({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2.5">{children}</div>;
}

function Choice({ on, onClick, title, line, right }: { on: boolean; onClick: () => void; title: string; line?: string; right?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-h-[60px] items-center gap-3 rounded-[16px] border px-3.5 py-3 text-left transition-colors ${on ? "border-fg bg-surface shadow-[0_0_0_1px_var(--fg)]" : "border-line hover:border-line-strong"}`}
    >
      <span className="min-w-0 flex-1">
        <b className="block text-[15px] font-semibold">{title}</b>
        {line && <span className="block text-[13px] text-muted">{line}</span>}
      </span>
      {right && <b className="shrink-0 text-[15px] font-semibold tabular-nums">{right}</b>}
      <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
}

function Done({ booking: b, lang, now, onAgain }: { booking: Booking; lang: Lang; now: number; onAgain: () => void }) {
  const t = (x: Text) => pick(x, lang);
  const download = () => {
    const url = URL.createObjectURL(new Blob([bookingIcs(b, lang, now)], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "bopha-beauty-booking.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const rows: [Text, string][] = [
    [T.book.date, dayLabel(b.start, lang)],
    [T.book.time, `${hhmm(b.start)}–${hhmm(b.end)}`],
    [T.book.stylist, t(T.stylists[b.stylist])],
    [T.book.service, t(T.services[b.service])],
  ];
  return (
    <div data-booking-status={b.status} className="flex flex-1 flex-col">
      <span className="mb-3.5 grid size-[52px] place-items-center rounded-[16px] bg-accent">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      </span>
      <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.03em]">{t(T.book.doneTitle)}</h1>
      <dl className="mt-4 divide-y divide-line rounded-[16px] border border-line bg-surface px-3.5">
        {rows.map(([k, v]) => (
          <div key={k.en} className="flex items-baseline justify-between gap-3 py-2.5 text-[14px]">
            <dt className="text-muted">{t(k)}</dt>
            <dd className="text-right font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p data-deposit-line className="mt-3 text-[14px] font-medium">
        {fill(T.book.depositLine, lang, { d: dollars(b.deposit), x: dollars(balanceDue(b)) })}
      </p>
      <p className="mt-1 text-[13px] text-muted">{t(T.book.reminder)}</p>
      <div className="mt-auto flex flex-col gap-2 pt-6">
        <button type="button" onClick={download} className="min-h-[52px] rounded-[14px] bg-fg text-[15px] font-semibold text-white hover:opacity-90">
          {t(T.book.addToCalendar)}
        </button>
        <button type="button" onClick={onAgain} className="min-h-11 rounded-[14px] border border-line text-[13.5px] font-semibold hover:border-line-strong">
          {t(T.book.another)}
        </button>
      </div>
    </div>
  );
}

function Closed({ lang }: { lang: Lang }) {
  const t = (x: Text) => pick(x, lang);
  return (
    <div className="grid flex-1 place-items-center px-2 text-center">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em]">{t(T.book.closedTitle)}</h1>
        <p className="mt-2 text-[13.5px] text-muted">{t(T.book.closedBody)}</p>
        <a href="/booking" className="mt-5 inline-flex min-h-11 items-center rounded-[14px] bg-fg px-5 text-[14px] font-semibold text-white">
          {t(T.book.startNew)}
        </a>
      </div>
    </div>
  );
}

