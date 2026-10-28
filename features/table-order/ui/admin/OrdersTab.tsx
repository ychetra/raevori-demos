"use client";

import { useEffect, useMemo, useState } from "react";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { khr, usd } from "@/lib/money";
import { cancelOrder, exportUrl, markDone, type AdminFail } from "../../admin-api";
import { optionSummary } from "../../format";
import { T } from "../../km";
import type { Order, OrderStatus } from "../../types";
import { btnDanger, btnPrimary, btnSecondary, card, chip, DownloadLink, input, Sheet } from "@/components/admin/parts";
import { ppTime } from "./parts";

type Filter = "all" | OrderStatus;
const FILTERS: Filter[] = ["all", "new", "preparing", "ready", "done", "cancelled"];
const STEPS: OrderStatus[] = ["new", "preparing", "ready", "done", "cancelled"];
const OPEN: OrderStatus[] = ["new", "preparing", "ready"];

type Props = { room: string; orders: Order[]; lang: Lang; onFail: (f: AdminFail) => boolean };

const matches = (o: Order, q: string) => {
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  if (digits && /^\D*\d+\D*$/.test(q) && String(o.table) === digits) return true;
  const s = q.toLowerCase();
  return o.id.toLowerCase() === s || o.lines.some((l) => l.name.en.toLowerCase().includes(s) || l.name.km.includes(q));
};

/** Every order in the room, newest first, with filters, search, detail and the Done / Cancel actions. */
export function OrdersTab({ room, orders, lang, onFail }: Props) {
  const t = (x: Text) => pick(x, lang);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  // Detail shows as a side panel from lg, a sheet below that.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const sorted = useMemo(() => [...orders].sort((a, b) => (b.at.new ?? 0) - (a.at.new ?? 0)), [orders]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f, f === "all" ? orders.length : orders.filter((o) => o.status === f).length])) as Record<Filter, number>, [orders]);
  const q = query.trim();
  const shown = sorted.filter((o) => (filter === "all" || o.status === filter) && matches(o, q));
  const current = selected ? orders.find((o) => o.id === selected) ?? null : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="min-w-0">
        <div className="flex flex-col gap-3">
          <div className="-mx-[18px] flex gap-1.5 overflow-x-auto px-[18px] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label={t(T.admin.tabs.orders)}>
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={chip(filter === f)}
              >
                {t(f === "all" ? T.admin.all : T.admin.status[f])} <span className="tabular-nums opacity-70">{counts[f]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(T.admin.search)} aria-label={t(T.admin.search)} className={`${input} sm:flex-1`} />
            <DownloadLink href={exportUrl(room, lang)}>{t(T.admin.download)}</DownloadLink>
          </div>
        </div>

        {shown.length === 0 ? (
          <p className={`${card} mt-3 p-5 text-center text-[13.5px] text-muted`}>{t(orders.length ? T.admin.noOrders : T.admin.noOrdersYet)}</p>
        ) : (
          <ul className={`${card} mt-3 divide-y divide-line`}>
            {shown.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  data-admin-order={o.id}
                  aria-current={wide && selected === o.id ? "true" : undefined}
                  onClick={() => setSelected(o.id)}
                  className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 px-3.5 py-3 text-left transition-colors first:rounded-t-[20px] last:rounded-b-[20px] hover:bg-paper/50 ${wide && selected === o.id ? "bg-paper/70" : ""}`}
                >
                  <span className="pt-px text-[12.5px] text-muted tabular-nums">{ppTime(o.at.new ?? 0)}</span>
                  <span className="min-w-0">
                    <b className={`block text-[14px] font-semibold ${o.status === "cancelled" ? "text-muted line-through" : ""}`}>
                      {t(T.table)} {o.table} <span className="font-normal text-muted">· {o.id}</span>
                    </b>
                    <span className="block truncate text-[12.5px] text-muted">{o.lines.map((l) => `${l.qty}× ${t(l.name)}`).join(", ")}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <b className="text-[14px] font-semibold tabular-nums">{usd(o.total)}</b>
                    <StatusTag status={o.status} lang={lang} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {wide ? (
        <aside className={`${card} sticky top-4 p-4`} aria-label={current ? `${t(T.admin.tabs.orders)} ${current.id}` : undefined}>
          {current ? <Detail key={current.id} order={current} room={room} lang={lang} onFail={onFail} /> : <p className="py-8 text-center text-[13.5px] text-muted">{t(T.admin.pickOrder)}</p>}
        </aside>
      ) : (
        current && (
          <Sheet title={`${t(T.table)} ${current.table} · ${current.id}`} closeLabel={t(T.admin.close)} onClose={() => setSelected(null)}>
            <Detail key={current.id} order={current} room={room} lang={lang} onFail={onFail} inSheet />
          </Sheet>
        )
      )}
    </div>
  );
}

function StatusTag({ status, lang }: { status: OrderStatus; lang: Lang }) {
  const strong = status === "new";
  return (
    <span data-order-status={status} className={`rounded-full border px-2 text-[11.5px] leading-[20px] whitespace-nowrap ${strong ? "border-fg font-semibold" : "border-line text-muted"}`}>
      {pick(T.admin.status[status], lang)}
    </span>
  );
}

function Detail({ order, room, lang, onFail, inSheet = false }: { order: Order; room: string; lang: Lang; onFail: (f: AdminFail) => boolean; inSheet?: boolean }) {
  const t = (x: Text) => pick(x, lang);
  const [cancelling, setCancelling] = useState(false);
  const [preset, setPreset] = useState<"outOfStock" | "customerAsked" | "other">("outOfStock");
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Text | null>(null);
  const open = OPEN.includes(order.status);

  const done = async () => {
    setBusy(true);
    setError(null);
    const r = await markDone(room, order.id);
    setBusy(false);
    if (!r.ok && !onFail(r)) setError(r.error === "bad_status" ? T.admin.alreadyClosed : T.admin.errFailed);
  };
  const cancel = async () => {
    const reason = preset === "other" ? other.trim() : t(T.admin[preset]);
    if (!reason) return setError(T.admin.errReason);
    setBusy(true);
    setError(null);
    const r = await cancelOrder(room, order.id, reason);
    setBusy(false);
    if (r.ok) return setCancelling(false);
    if (onFail(r)) return;
    setError(r.error === "bad_status" ? T.admin.alreadyClosed : r.error === "invalid" ? T.admin.errReason : T.admin.errFailed);
  };

  return (
    <div data-order-detail={order.id}>
      {!inSheet && (
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[17px] font-semibold tracking-[-0.02em]">{t(T.table)} {order.table} · {order.id}</h3>
          <StatusTag status={order.status} lang={lang} />
        </div>
      )}
      {inSheet && <StatusTag status={order.status} lang={lang} />}

      <ul className="mt-3 flex flex-col gap-2.5">
        {order.lines.map((l, i) => {
          const opts = optionSummary(l.options, lang);
          return (
            <li key={i} className="flex items-start justify-between gap-3 text-[14px]">
              <span className="min-w-0">
                {l.qty}× {t(l.name)}
                {opts && <span className="block text-[12.5px] text-muted">{opts}</span>}
              </span>
              <span className="tabular-nums">{usd(l.unitPrice * l.qty)}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-start justify-between border-t border-line pt-2.5">
        <b className="text-[15px]">{t(T.ui.total)}</b>
        <span className="text-right">
          <b className="text-[15px] tabular-nums">{usd(order.total)}</b>
          <span className="block text-[11.5px] text-muted tabular-nums">{khr(order.total)}៛</span>
        </span>
      </div>
      <p className="mt-2 flex justify-between gap-3 text-[13px]">
        <span className="text-muted">{t(T.admin.payment)}</span>
        <span>{t(T.admin.paidKhqr)}</span>
      </p>

      <h4 className="mt-4 text-[12.5px] font-semibold text-muted">{t(T.admin.timeline)}</h4>
      <ol className="mt-1.5 flex flex-col gap-1.5 border-l-2 border-line pl-3 text-[13px]">
        {STEPS.filter((s) => order.at[s] !== undefined).map((s) => (
          <li key={s} className="grid grid-cols-[44px_minmax(0,1fr)] gap-2">
            <span className="text-muted tabular-nums">{ppTime(order.at[s]!)}</span>
            <span>
              {t(T.admin.step[s])}
              {s === "cancelled" && order.cancelReason && <span className="block text-muted">{t(T.admin.reason)}: {order.cancelReason}</span>}
            </span>
          </li>
        ))}
      </ol>

      {error && <p role="alert" className="mt-3 text-[13px] font-medium text-khqr">{t(error)}</p>}

      {open && !cancelling && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={done} disabled={busy} className={btnPrimary}>{t(T.admin.markDone)}</button>
          <button type="button" onClick={() => { setError(null); setCancelling(true); }} disabled={busy} className={btnSecondary}>{t(T.admin.cancelOrder)}</button>
        </div>
      )}
      {open && cancelling && (
        <div className="mt-4 rounded-[14px] border border-line p-3">
          <p className="text-[13.5px] font-semibold">{t(T.admin.cancelWhy)}</p>
          <div role="radiogroup" aria-label={t(T.admin.reason)} className="mt-2.5 flex flex-wrap gap-1.5">
            {(["outOfStock", "customerAsked", "other"] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={preset === p}
                onClick={() => setPreset(p)}
                className={`min-h-10 rounded-[10px] border px-3 text-[13.5px] transition-colors ${preset === p ? "border-fg bg-fg text-white" : "border-line hover:border-line-strong"}`}
              >
                {t(p === "other" ? T.admin.otherReason : T.admin[p])}
              </button>
            ))}
          </div>
          {preset === "other" && (
            <input autoFocus value={other} maxLength={120} onChange={(e) => setOther(e.target.value)} placeholder={t(T.admin.otherPlaceholder)} aria-label={t(T.admin.otherReason)} className={`${input} mt-2.5`} />
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={cancel} disabled={busy} className={btnDanger}>{t(T.admin.cancelOrder)}</button>
            <button type="button" onClick={() => setCancelling(false)} disabled={busy} className={btnSecondary}>{t(T.admin.keepOrder)}</button>
          </div>
        </div>
      )}
    </div>
  );
}
