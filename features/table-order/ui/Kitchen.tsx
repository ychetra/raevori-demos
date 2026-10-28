"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Qr } from "@/components/shared/Qr";
import { pick, type Text } from "@/lib/i18n";
import { usd } from "@/lib/money";
import { advanceOrder, createRoom, CreateRoomError } from "../api";
import { ageLabel, optionSummary } from "../format";
import { T } from "../km";
import { readPin, savePin } from "../pin";
import type { Order, OrderStatus } from "../types";
import { useRoom } from "../useRoom";

const TABLE = 4;
const COLUMNS: { status: OrderStatus; title: string }[] = [
  { status: "new", title: "NEW" },
  { status: "preparing", title: "PREPARING" },
  { status: "ready", title: "READY" },
];

const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Phnom_Penh", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** The laptop view: QR to the phone menu on the left, the live kitchen board on the right. */
export function Kitchen() {
  const router = useRouter();
  const params = useSearchParams();
  const room = params.get("room");
  const { orders, settings, status } = useRoom(room);
  const [pin, setPin] = useState<string | null>(null);
  useEffect(() => setPin(room ? readPin(room) : null), [room]);
  const cancelNote = useCancelNote(orders, status === "live");
  const [now, setNow] = useState<number | null>(null);
  const [origin, setOrigin] = useState("");
  const [createError, setCreateError] = useState<Text | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const start = () => {
    setCreateError(null);
    createRoom()
      .then(({ id, pin }) => {
        savePin(id, pin);
        router.replace(`/table-order?room=${id}`);
      })
      .catch((e) => setCreateError(e instanceof CreateRoomError && e.status === 429 ? T.ui.tooMany : T.ui.createFailed));
  };
  useEffect(() => {
    if (!room) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const menuUrl = room && origin ? `${origin}/table-order/menu?room=${room}&table=${TABLE}` : "";
  const byStatus = useMemo(() => {
    const sorted = [...orders].sort((a, b) => (b.at.new ?? 0) - (a.at.new ?? 0));
    return Object.fromEntries(COLUMNS.map((c) => [c.status, sorted.filter((o) => o.status === c.status)])) as Record<OrderStatus, Order[]>;
  }, [orders]);
  const parts = now ? Object.fromEntries(clock.formatToParts(now).map((p) => [p.type, p.value])) : null;

  return (
    <main className="mx-auto grid max-w-[1240px] gap-[22px] p-[18px] sm:p-[22px] lg:grid-cols-[330px_1fr]">
      <section className="flex flex-col gap-3.5">
        <div>
          <p className="text-[12px] font-semibold text-accent">Table Order demo</p>
          <h1 className="mt-1.5 text-[clamp(26px,3vw,30px)] leading-[1.05] font-semibold tracking-[-0.04em]">Order from your phone. Watch it land in the kitchen.</h1>
        </div>
        <div className="rounded-[20px] border border-line bg-surface p-[18px] text-center">
          <div data-qr-slot className="mx-auto grid aspect-square w-[180px] place-items-center">
            {menuUrl ? (
              <a href={menuUrl} target="_blank" rel="noopener" data-menu-url={menuUrl} aria-label="Open the phone menu">
                <Qr value={menuUrl} label={`QR code to order from table ${TABLE}`} className="w-[180px]" />
              </a>
            ) : (
              <div className={`grid size-full place-items-center rounded-xl bg-paper p-4 text-[13px] text-muted ${createError ? "" : "animate-pulse"}`}>
                {createError && pick(createError, "en")}
              </div>
            )}
          </div>
          <p className="mt-3 font-semibold">Scan to order from Table {TABLE}</p>
          <p className="mt-0.5 text-[13px] text-muted">Camera app or any QR scanner</p>
          <p className="mt-3 border-t border-line pt-2.5 text-[13px]">
            No phone handy?{" "}
            <a href={menuUrl || undefined} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-accent">Open the menu here</a>
          </p>
          {room && (
            <p data-owner-admin className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-line pt-2.5 text-[13px]">
              <a href={`/table-order/admin?room=${room}`} target="_blank" rel="noopener" className="font-semibold underline underline-offset-2 hover:text-accent">
                Owner admin →
              </a>
              {pin && (
                <span className="text-muted">
                  PIN <b data-admin-pin className="font-semibold tracking-[0.12em] text-fg tabular-nums">{pin}</b>
                </span>
              )}
            </p>
          )}
        </div>
        <ol className="flex flex-col gap-2 text-[13.5px]">
          {["Scan and pick a drink", "Pay with KHQR (demo, no money moves)", "Your ticket appears here instantly"].map((s, i) => (
            <li key={s} className="flex items-center gap-2.5">
              <b className="grid size-[22px] shrink-0 place-items-center rounded-[7px] bg-fg text-[11px] text-white">{i + 1}</b>
              {s}
            </li>
          ))}
        </ol>
        {room && (
          <a href={`/shop-pulse?room=${room}`} className="text-[13px] text-muted underline-offset-2 hover:text-fg hover:underline">
            See today&apos;s sales in Shop Pulse →
          </a>
        )}
      </section>

      <section aria-label="Kitchen board" className="min-h-[460px] rounded-[20px] bg-ink p-[18px] text-ink-fg">
        <div className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold">{settings.name} · Kitchen</h2>
            <p className="text-[12px] text-ink-muted">{parts ? `${parts.weekday} ${parts.day} ${parts.month} · ${parts.hour}:${parts.minute}` : " "}</p>
          </div>
          <div className="flex gap-[18px] text-[12px] text-ink-muted">
            <span>Today <b className="text-ink-fg">{12 + orders.filter((o) => o.status !== "cancelled").length} orders</b></span>
            <span>Avg wait <b className="text-ink-fg">4m</b></span>
          </div>
        </div>

        {cancelNote && (
          <p role="status" data-cancel-note className="mb-3 rounded-[12px] border border-ink-line bg-ink-surface px-3 py-2 text-[13px] animate-[fade-in_.2s_ease-out]">
            {cancelNote}
          </p>
        )}
        {createError ? (
          <div role="alert" className="grid min-h-[340px] place-items-center px-4 text-center">
            <p className="max-w-[36ch] text-[15px]">{pick(createError, "en")}</p>
          </div>
        ) : status === "closed" ? (
          <div className="grid min-h-[340px] place-items-center text-center">
            <div>
              <p className="text-[18px] font-semibold">This demo table has closed</p>
              <p className="mt-1 text-[13px] text-ink-muted">Demo tables close after two quiet hours.</p>
              <button type="button" onClick={start} className="mt-4 min-h-11 rounded-[12px] bg-ink-accent px-5 text-[14px] font-semibold text-ink">Start a new demo</button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {COLUMNS.map((c) => (
              <div key={c.status} className="flex flex-col gap-2.5">
                <div className="flex justify-between text-[12px] text-ink-muted">
                  <span>{c.title}</span>
                  <b className="text-ink-fg">{byStatus[c.status].length}</b>
                </div>
                {byStatus[c.status].map((o) => (
                  <Ticket key={o.id} order={o} now={now} room={room!} />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const NOTE_MS = 6000;

/** "Table 4's order was cancelled", for a few seconds after a board order is cancelled in the admin. Quiet on the first snapshot. */
function useCancelNote(orders: Order[], live: boolean): string | null {
  const seen = useRef<Map<string, OrderStatus> | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!live) return;
    const prev = seen.current;
    seen.current = new Map(orders.map((o) => [o.id, o.status]));
    if (!prev) return;
    const gone = orders.find((o) => o.status === "cancelled" && prev.get(o.id) !== undefined && prev.get(o.id) !== "cancelled");
    if (!gone) return;
    setNote(pick(T.ui.cancelledNote, "en").replace("{n}", String(gone.table)));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), NOTE_MS);
  }, [orders, live]);
  return note;
}

function Ticket({ order, now, room }: { order: Order; now: number | null; room: string }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => setBusy(false), [order.status]);
  const age = now ? ageLabel(now - (order.at.new ?? now)) : "";
  const isNew = order.status === "new";
  const ready = order.status === "ready";
  const advance = () => {
    setBusy(true);
    advanceOrder(room, order.id).catch(() => setBusy(false));
  };

  return (
    <article
      data-order={order.id}
      data-status={order.status}
      className={`rounded-[14px] p-3 text-[13px] animate-[ticket-in_.45s_var(--ease-out-expo)] ${
        isNew ? "border-[1.5px] border-ink-accent bg-[#1d241e] shadow-[0_0_0_4px_rgba(168,196,143,0.12)]" : "border border-ink-line bg-ink-surface"
      } ${ready ? "opacity-75" : ""}`}
    >
      <div className="flex justify-between gap-2">
        <b className="text-[15px]">Table {order.table}</b>
        <span className={ready || age === "just now" ? "font-semibold text-ink-accent" : "text-ink-muted tabular-nums"}>{ready ? "Ready" : age}</span>
      </div>
      <ul className="mt-2 leading-[1.55]">
        {order.lines.map((l, i) => {
          const opts = optionSummary(l.options, "en");
          return (
            <li key={i}>
              {l.qty}× {l.name.en}
              {opts && <span className="block text-ink-muted">{opts}</span>}
            </li>
          );
        })}
      </ul>
      {!ready && (
        <>
          <div className="mt-2.5 flex justify-between text-[12px] text-ink-muted">
            <span>Paid · KHQR</span>
            <b className="text-ink-fg tabular-nums">{usd(order.total)}</b>
          </div>
          <button
            type="button"
            onClick={advance}
            disabled={busy}
            className={`mt-2.5 min-h-10 w-full rounded-[12px] text-[13px] font-semibold transition-opacity disabled:opacity-60 ${
              isNew ? "bg-ink-accent text-ink hover:opacity-90" : "border border-ink-line text-ink-fg hover:border-ink-muted"
            }`}
          >
            {isNew ? "Start preparing" : "Mark ready"}
          </button>
        </>
      )}
    </article>
  );
}
