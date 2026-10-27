"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LangToggle } from "@/components/shared/LangToggle";
import { PhoneFrame } from "@/components/shared/PhoneFrame";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { leaveQueue, takeTicket } from "../api";
import { T } from "../km";
import { position, waitMinutes } from "../store";
import { PREFIX, SERVICES, type Service, type Ticket } from "../types";
import { useQueue } from "../useQueue";

const storageKey = (room: string) => `raevori-queue-ticket:${room}`;

/** The ticket taken in this tab for `room`, so a reload keeps it. Storage can be missing or blocked: then nothing is remembered. */
function loadTicket(room: string): Ticket | null {
  try {
    const raw = sessionStorage.getItem(storageKey(room));
    return raw ? (JSON.parse(raw) as Ticket) : null;
  } catch {
    return null;
  }
}
function saveTicket(room: string, ticket: Ticket | null) {
  try {
    if (ticket) sessionStorage.setItem(storageKey(room), JSON.stringify(ticket));
    else sessionStorage.removeItem(storageKey(room));
  } catch {
    // Private mode or blocked storage: the ticket just won't survive a reload.
  }
}

/** Progress step: 1 Waiting, 2 Almost (2 or fewer ahead), 3 Your turn, 4 Done. */
export function ticketStep(ticket: Ticket, ahead: number): 1 | 2 | 3 | 4 {
  if (ticket.status === "done" || ticket.status === "left") return 4;
  if (ticket.status === "called") return 3;
  return ahead <= 2 ? 2 : 1;
}

/** The customer's phone: pick a service → take a number → live ticket → called → done. */
export function TicketApp() {
  const params = useSearchParams();
  const room = params.get("room");
  const live = useQueue(room);
  const [lang, setLang] = useState<Lang>("en");
  const [loaded, setLoaded] = useState(false);
  const [mine, setMine] = useState<Ticket | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Text | null>(null);
  const t = (x: Text) => pick(x, lang);

  const stored = useRef(false);
  useEffect(() => {
    const saved = room ? loadTicket(room) : null;
    stored.current = !!saved;
    setMine(saved);
    setLoaded(true);
  }, [room]);

  // The live copy wins over the stored one. A remembered ticket the first snapshot doesn't know is stale: forget it.
  const ticket = mine && (live.tickets.find((x) => x.id === mine.id) ?? mine);
  useEffect(() => {
    if (!stored.current || live.status !== "live") return;
    stored.current = false;
    if (room && mine && !live.tickets.some((x) => x.id === mine.id)) {
      saveTicket(room, null);
      setMine(null);
    }
  }, [room, mine, live.status, live.tickets]);

  const take = async () => {
    if (!room || !service) return;
    setBusy(true);
    setError(null);
    const r = await takeTicket(room, service);
    setBusy(false);
    if (r.ok) {
      saveTicket(room, r.ticket);
      setMine(r.ticket);
    } else if (r.error !== "not_found") setError(r.error === "full" ? T.ticket.full : T.ticket.failed);
  };
  const reset = () => {
    if (room) saveTicket(room, null);
    setMine(null);
    setService(null);
  };

  const closed = !room || live.status === "closed";
  const view = closed ? "closed" : !loaded ? "loading" : !ticket ? "choose" : ticket.status === "done" || ticket.status === "left" ? "finished" : "ticket";

  // When the screen changes the pressed button is gone: move focus to the new heading instead of <body>.
  const phone = useRef<HTMLDivElement>(null);
  const shownView = useRef(view);
  useEffect(() => {
    if (shownView.current === view) return;
    shownView.current = view;
    const h = phone.current?.querySelector<HTMLElement>("main h1");
    if (h) {
      h.tabIndex = -1;
      h.style.outline = "none";
      h.focus({ preventScroll: true });
    }
  }, [view]);

  const waitingCount = live.tickets.filter((x) => x.status === "waiting").length;

  return (
    <div ref={phone} lang={lang} className="md:grid md:min-h-[calc(100dvh-36px)] md:place-items-center md:p-6">
      <PhoneFrame className="h-[calc(100dvh-36px)] md:h-[800px] md:max-h-[calc(100dvh-84px)] md:w-[400px]">
        <div className="flex h-full flex-col overflow-y-auto">
          <header className="bg-gradient-to-br from-accent to-[#24311d] px-4 pt-4 pb-4 text-[#f4f1e8]">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-[16px] font-semibold tracking-[-0.02em]">{t(T.shop)}</p>
              <LangToggle lang={lang} onChange={setLang} tone="glass" />
            </div>
          </header>
          <main className="relative flex flex-1 flex-col px-4 pt-5 pb-4">
            {view === "closed" ? (
              <Closed lang={lang} />
            ) : view === "loading" ? null : view === "choose" ? (
              <Choose lang={lang} service={service} onPick={setService} onTake={take} busy={busy} error={error} waiting={live.status === "live" ? waitingCount : null} />
            ) : view === "finished" ? (
              <Finished ticket={ticket!} lang={lang} onAgain={reset} />
            ) : (
              <TicketView ticket={ticket!} lang={lang} room={room!} ahead={live.status === "live" ? position(live.tickets, ticket!.id) : null} onLeft={(x) => setMine(x)} />
            )}
          </main>
        </div>
        {view === "ticket" && ticket!.status === "called" && <CalledOverlay ticket={ticket!} lang={lang} />}
      </PhoneFrame>
    </div>
  );
}

function Choose({
  lang,
  service,
  onPick,
  onTake,
  busy,
  error,
  waiting,
}: {
  lang: Lang;
  service: Service | null;
  onPick: (s: Service) => void;
  onTake: () => void;
  busy: boolean;
  error: Text | null;
  waiting: number | null;
}) {
  const t = (x: Text) => pick(x, lang);
  return (
    <>
      <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.03em]">{t(T.ticket.pickService)}</h1>
      <p className="mt-1 text-[13px] text-muted tabular-nums">
        {waiting === null ? " " : `${waiting} ${t(T.ticket.waitingNow)} · ${t(T.ticket.about)} ${waitMinutes(waiting)} ${t(T.board.min)}`}
      </p>
      <div role="radiogroup" aria-label={t(T.ticket.pickService)} className="mt-4 flex flex-col gap-2.5">
        {SERVICES.map((s) => {
          const on = service === s;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(s)}
              className={`flex items-center gap-3 rounded-[16px] border p-3 text-left transition-colors ${on ? "border-fg bg-surface shadow-[0_0_0_1px_var(--fg)]" : "border-line hover:border-line-strong"}`}
            >
              <span className={`grid size-11 shrink-0 place-items-center rounded-[12px] text-[17px] font-bold ${on ? "bg-fg text-white" : "bg-paper"}`}>{PREFIX[s]}</span>
              <span className="min-w-0">
                <b className="block text-[15px] font-semibold">{t(T.services[s])}</b>
                <span className="block text-[13px] text-muted">{t(T.serviceLines[s])}</span>
              </span>
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-[12px] bg-paper px-3 py-2.5 text-center text-[13px]">
          {t(error)}
        </p>
      )}
      <div className="mt-auto pt-5">
        <button
          type="button"
          onClick={onTake}
          disabled={!service || busy}
          className="min-h-[52px] w-full rounded-[14px] bg-fg text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {t(T.ticket.takeANumber)}
        </button>
        <p className="mt-2.5 text-center text-[11.5px] text-muted">{t(T.ticket.telegramNote)}</p>
      </div>
    </>
  );
}

function TicketView({ ticket, lang, room, ahead, onLeft }: { ticket: Ticket; lang: Lang; room: string; ahead: number | null; onLeft: (t: Ticket) => void }) {
  const t = (x: Text) => pick(x, lang);
  const [confirm, setConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const called = ticket.status === "called";
  const step = ticketStep(ticket, ahead ?? 99);
  const title = called ? `${t(T.ticket.yourTurn)} · ${t(T.counter)} ${ticket.counter}` : t(step === 2 ? T.ticket.almost : T.ticket.inQueue);

  const leave = async () => {
    setLeaving(true);
    setFailed(false);
    const r = await leaveQueue(room, ticket.id);
    setLeaving(false);
    if (r) {
      setConfirm(false);
      onLeft(r);
    } else setFailed(true);
  };

  return (
    <div data-ticket-status={ticket.status} className="flex flex-1 flex-col">
      <h1 aria-live="polite" className={`text-[22px] leading-tight font-semibold tracking-[-0.03em] ${called ? "text-accent" : ""}`}>
        {title}
      </h1>

      <div className="mt-4 rounded-[20px] bg-paper px-5 py-5 text-center">
        <p className="text-[12.5px] text-muted">{t(T.ticket.yourNumber)}</p>
        <p data-number className="mt-1 text-[64px] leading-none font-semibold tracking-[-0.05em] tabular-nums">
          {ticket.number}
        </p>
        <p className="mt-2 text-[14px] text-muted">{t(T.services[ticket.service])}</p>
      </div>

      {called ? (
        <p className="mt-3 text-center text-[15px] font-medium text-accent">{t(T.ticket.showNumber)}</p>
      ) : (
        <p data-ahead={ahead ?? ""} className="mt-3 text-center text-[17px] font-semibold tabular-nums">
          {ahead === null ? (
            " "
          ) : ahead === 0 ? (
            <>
              {t(T.ticket.youreNext)} <span className="font-normal text-muted">· {t(T.ticket.anyMinute)}</span>
            </>
          ) : (
            <>
              {ahead} {t(ahead === 1 ? T.ticket.personAhead : T.ticket.peopleAhead)}{" "}
              <span className="font-normal whitespace-nowrap text-muted">
                · {t(T.ticket.about)} {waitMinutes(ahead)} {t(T.board.min)}
              </span>
            </>
          )}
        </p>
      )}

      <Progress step={step} lang={lang} />
      {!called && <p className="mt-4 text-[13px] text-muted">{t(T.ticket.walkAway)}</p>}

      <div className="mt-auto pt-5">
        {confirm ? (
          <div className="rounded-[14px] border border-line p-3">
            <p className="text-[13.5px] font-semibold">{t(T.ticket.leaveConfirm)}</p>
            {failed && (
              <p role="alert" className="mt-1 text-[12.5px] text-muted">
                {t(T.ticket.leaveFailed)}
              </p>
            )}
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <button type="button" onClick={leave} disabled={leaving} className="min-h-11 rounded-[12px] bg-fg text-[13.5px] font-semibold text-white disabled:opacity-50">
                {t(T.ticket.leaveYes)}
              </button>
              <button type="button" onClick={() => setConfirm(false)} className="min-h-11 rounded-[12px] border border-line text-[13.5px] font-semibold hover:border-line-strong">
                {t(T.ticket.leaveNo)}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-center">
            <button type="button" onClick={() => setConfirm(true)} className="min-h-10 text-[13px] text-muted underline underline-offset-2 hover:text-fg">
              {t(T.ticket.leave)}
            </button>
          </p>
        )}
        <p className="mt-2 text-center text-[11.5px] text-muted">{t(T.ticket.telegramNote)}</p>
      </div>
    </div>
  );
}

function Progress({ step, lang }: { step: number; lang: Lang }) {
  return (
    <div className="mt-5">
      <div className="flex gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((s) => (
          <i key={s} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${s <= step ? "bg-accent" : "bg-line"}`} />
        ))}
      </div>
      <ol className="mt-1.5 grid grid-cols-4 gap-1.5 text-[11.5px]">
        {T.ticket.steps.map((s, i) => (
          <li key={s.en} aria-current={i + 1 === step ? "step" : undefined} className={i + 1 === step ? "font-semibold" : "text-muted"}>
            {pick(s, lang)}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Full-screen "It's your turn". Dismissed per call, so a recall shows it again. */
function CalledOverlay({ ticket, lang }: { ticket: Ticket; lang: Lang }) {
  const t = (x: Text) => pick(x, lang);
  const callKey = ticket.at.called ?? 0;
  const [dismissed, setDismissed] = useState<number | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const open = dismissed !== callKey;

  useEffect(() => {
    if (!open) return;
    button.current?.focus({ preventScroll: true });
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      // Some browsers refuse vibration without a recent tap.
    }
  }, [open, callKey]);

  if (!open) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="queue-called-title"
      data-called-overlay
      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-accent px-6 text-center text-white animate-[fade-in_.25s_ease-out]"
    >
      <h1 id="queue-called-title" className="text-[30px] leading-tight font-semibold tracking-[-0.03em]">
        {t(T.ticket.itsYourTurn)} · {t(T.counter)} {ticket.counter}
      </h1>
      <p className="mt-5 rounded-full bg-white/16 px-5 py-2 text-[34px] leading-none font-semibold tracking-[-0.03em] tabular-nums">{ticket.number}</p>
      <p className="mt-4 text-[14px] text-white/85">{t(T.ticket.showNumber)}</p>
      <button
        ref={button}
        type="button"
        onClick={() => setDismissed(callKey)}
        className="mt-8 min-h-[52px] w-full max-w-[300px] rounded-[14px] bg-white text-[15px] font-semibold text-fg hover:opacity-90"
      >
        {t(T.ticket.onMyWay)}
      </button>
    </div>
  );
}

function Finished({ ticket, lang, onAgain }: { ticket: Ticket; lang: Lang; onAgain: () => void }) {
  const t = (x: Text) => pick(x, lang);
  const done = ticket.status === "done";
  return (
    <div data-ticket-status={ticket.status} className="flex flex-1 flex-col">
      {done && (
        <span className="mb-3.5 grid size-[52px] place-items-center rounded-[16px] bg-accent">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </span>
      )}
      <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.03em]">{t(done ? T.ticket.doneTitle : T.ticket.leftTitle)}</h1>
      <p className="mt-1 text-[13.5px] text-muted">{t(done ? T.ticket.doneBody : T.ticket.leftBody)}</p>
      <p className="mt-4 text-[13px] text-muted tabular-nums">
        {ticket.number} · {t(T.services[ticket.service])}
        {done && ticket.counter && ` · ${t(T.counter)} ${ticket.counter}`}
      </p>
      {done && <Progress step={4} lang={lang} />}
      <button type="button" onClick={onAgain} className="mt-6 min-h-11 rounded-[14px] border border-line text-[13.5px] font-semibold hover:border-line-strong">
        {t(T.ticket.another)}
      </button>
    </div>
  );
}

function Closed({ lang }: { lang: Lang }) {
  const t = (x: Text) => pick(x, lang);
  return (
    <div className="grid flex-1 place-items-center px-2 text-center">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em]">{t(T.ticket.closedTitle)}</h1>
        <p className="mt-2 text-[13.5px] text-muted">{t(T.ticket.closedBody)}</p>
        <a href="/queue" className="mt-5 inline-flex min-h-11 items-center rounded-[14px] bg-fg px-5 text-[14px] font-semibold text-white">
          {t(T.ticket.startNew)}
        </a>
      </div>
    </div>
  );
}
