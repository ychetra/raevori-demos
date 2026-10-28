"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { KhqrCard } from "@/components/shared/KhqrCard";
import { LangToggle } from "@/components/shared/LangToggle";
import { PhoneFrame } from "@/components/shared/PhoneFrame";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { khr, usd } from "@/lib/money";
import { isOpen } from "../admin";
import { placeOrder, roomExists } from "../api";
import { optionSummary } from "../format";
import { T } from "../km";
import { priceOrder } from "../pricing";
import type { CartLine, Category, MenuItem, Order } from "../types";
import { useRoom } from "../useRoom";
import { ItemSheet } from "./ItemSheet";
import { artTile, MenuArt } from "./MenuArt";

type View = "menu" | "cart" | "pay" | "status";
const CATS: Category[] = ["coffee", "tea", "smoothie", "bakery"];
const sameLine = (a: CartLine, b: CartLine) => a.itemId === b.itemId && JSON.stringify(a.options) === JSON.stringify(b.options);

/** The customer's phone: menu → options → cart → KHQR → live status. */
export function CustomerApp() {
  const params = useSearchParams();
  const room = params.get("room");
  const table = Math.min(50, Math.max(1, Number.parseInt(params.get("table") ?? "4", 10) || 4));

  const [lang, setLang] = useState<Lang>("en");
  const [view, setView] = useState<View>("menu");
  const [cat, setCat] = useState<Category>("coffee");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [sheet, setSheet] = useState<MenuItem | null>(null);
  const [placed, setPlaced] = useState<Order | null>(null);
  const [error, setError] = useState<Text | null>(null);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(!room);
  // The server's word on the price: set when it answered price_changed, until the customer pays or changes the cart.
  const [newTotal, setNewTotal] = useState<number | null>(null);
  // Opening hours: worked out on the client (it needs the clock), and again whenever the server says closed.
  const [shut, setShut] = useState(false);

  useEffect(() => {
    if (room) roomExists(room).then((ok) => !ok && setClosed(true)).catch(() => {});
  }, [room]);

  // When the screen changes (menu → cart → pay → status) the button that was pressed is gone,
  // so move keyboard focus to the new screen's heading instead of dropping it on <body>.
  const phone = useRef<HTMLDivElement>(null);
  const shownView = useRef(view);
  useEffect(() => {
    if (shownView.current === view) return;
    shownView.current = view;
    const h = phone.current?.querySelector<HTMLElement>("h1");
    if (h) {
      h.tabIndex = -1;
      h.style.outline = "none";
      h.focus({ preventScroll: true });
    }
  }, [view]);

  const live = useRoom(room);
  const menu = live.menu;
  const byId = useMemo(() => new Map(menu.map((m) => [m.id, m])), [menu]);
  const off = (id: string) => {
    const m = byId.get(id);
    return !m || !!m.soldOut || !!m.hidden;
  };
  const t = (x: Text) => pick(x, lang);

  useEffect(() => {
    if (live.status !== "live") return;
    const check = () => setShut(!isOpen(live.settings, Date.now()));
    check();
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, [live.settings, live.status]);

  // A reset can take away an item the owner added; drop it from the cart rather than fail to price it.
  useEffect(() => {
    if (live.status === "live" && cart.some((l) => !byId.has(l.itemId))) setCart((c) => c.filter((l) => byId.has(l.itemId)));
  }, [byId, cart, live.status]);

  const priced = useMemo(() => {
    const lines = cart.filter((l) => byId.has(l.itemId));
    try {
      return lines.length ? priceOrder(lines, menu) : { lines: [], total: 0 };
    } catch {
      return { lines: [], total: 0 };
    }
  }, [cart, byId, menu]);
  const blocked = priced.lines.some((l) => off(l.itemId));
  const count = cart.reduce((s, l) => s + l.qty, 0);
  const qtyOf = (id: string) => cart.filter((l) => l.itemId === id).reduce((s, l) => s + l.qty, 0);

  const add = (line: CartLine) => {
    setCart((c) => (c.some((l) => sameLine(l, line)) ? c.map((l) => (sameLine(l, line) ? { ...l, qty: Math.min(20, l.qty + line.qty) } : l)) : [...c, line]));
    setSheet(null);
    setNewTotal(null);
  };
  const setQty = (i: number, qty: number) => {
    setNewTotal(null);
    changeQty(i, qty);
  };
  const changeQty = (i: number, qty: number) => setCart((c) => (qty <= 0 ? c.filter((_, j) => j !== i) : c.map((l, j) => (j === i ? { ...l, qty: Math.min(20, qty) } : l))));
  const pay = async () => {
    if (!room) return;
    setBusy(true);
    setError(null);
    const r = await placeOrder(room, table, cart, newTotal ?? priced.total);
    setBusy(false);
    if (r.ok) {
      setPlaced(r.order);
      setCart([]);
      setNewTotal(null);
      setView("status");
    } else if (r.error === "not_found") setClosed(true);
    else if (r.error === "price_changed") {
      setNewTotal(r.total);
      setView("cart");
    } else if (r.error === "sold_out") {
      setError(T.ui.soldOutError);
      setView("cart");
    } else if (r.error === "closed") {
      setShut(true);
      setView("cart");
    } else setError(r.error === "full" ? T.ui.full : r.error === "bad_table" ? T.ui.badTable : T.ui.failed);
  };

  const order = placed && (live.orders.find((o) => o.id === placed.id) ?? placed);

  return (
    <div ref={phone} lang={lang} className="md:grid md:min-h-[calc(100dvh-36px)] md:place-items-center md:p-6">
      <PhoneFrame className="h-[calc(100dvh-36px)] md:h-[820px] md:max-h-[calc(100dvh-84px)] md:w-[400px]">
        {closed || live.status === "closed" ? (
          <Closed lang={lang} />
        ) : view === "menu" ? (
          <div className="h-full overflow-y-auto pb-24">
            <header className="bg-gradient-to-br from-accent to-[#24311d] px-4 pt-4 pb-5 text-[#f4f1e8]">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-white/16 px-2.5 py-1 text-[12px]">{t(T.table)} {table}</span>
                <LangToggle lang={lang} onChange={setLang} tone="glass" />
              </div>
              <h1 data-cafe-name className="mt-5 text-[24px] font-semibold tracking-[-0.03em]">{live.settings.name}</h1>
              <p className="text-[13px] opacity-80">{t(T.tagline)}</p>
            </header>
            {shut && <ClosedBanner lang={lang} opens={live.settings.open} />}
            <nav className="sticky top-0 z-10 flex gap-1.5 overflow-x-auto bg-surface/95 px-3 py-3 backdrop-blur [scrollbar-width:none]">
              {CATS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={cat === c}
                  onClick={() => setCat(c)}
                  className={`min-h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium ${cat === c ? "border-fg bg-fg text-white" : "border-line"}`}
                >
                  {t(T.cats[c])}
                </button>
              ))}
            </nav>
            <ul className="flex flex-col gap-1 px-3">
              {menu.filter((m) => m.cat === cat && !m.hidden).map((m) => {
                const q = qtyOf(m.id);
                const sold = !!m.soldOut;
                return (
                  <li key={m.id} data-menu-item={m.id} data-sold-out={sold || undefined}>
                    <button type="button" disabled={sold} onClick={() => setSheet(m)} className="flex w-full items-center gap-3 rounded-[16px] p-1.5 text-left transition-colors enabled:hover:bg-paper/60">
                      <span className={`grid size-[60px] shrink-0 place-items-center rounded-[14px] ${sold ? "opacity-45 grayscale" : ""}`} style={{ background: artTile(m.image) }}>
                        <MenuArt image={m.image} className="h-9 w-8" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className={`block text-[14.5px] font-semibold ${sold ? "text-muted" : ""}`}>{t(m.name)}</b>
                        <span className="text-[13px] text-muted">{usd(m.price)}{m.note && ` · ${t(m.note)}`}</span>
                      </span>
                      {sold ? (
                        <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[12px] font-semibold text-muted">{t(T.ui.soldOut)}</span>
                      ) : (
                        <span
                          aria-label={q ? `${q} in cart` : t(T.ui.add)}
                          className={`grid size-9 shrink-0 place-items-center rounded-[11px] text-[13px] font-semibold ${q ? "bg-fg text-white" : "border border-line text-[18px] font-normal"}`}
                        >
                          {q || "+"}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {room && (
              <p className="mt-6 px-4 text-center text-[12.5px] text-muted">
                <a href={`/table-order?room=${room}`} target="_blank" rel="noopener" className="underline underline-offset-2">{t(T.ui.seeKitchen)}</a>
              </p>
            )}
            {count > 0 && (
              <button
                type="button"
                onClick={() => setView("cart")}
                className="absolute inset-x-3 bottom-3 z-10 flex min-h-[52px] items-center justify-between rounded-[16px] bg-fg px-4 text-[14px] text-white shadow-[0_12px_30px_-12px_rgba(20,26,21,0.6)] animate-[fade-in_.2s_ease-out]"
              >
                <span>{count} {t(count === 1 ? T.ui.item : T.ui.items)} · <b className="tabular-nums">{usd(priced.total)}</b></span>
                <b>{t(T.ui.viewCart)} →</b>
              </button>
            )}
            {sheet && <ItemSheet item={byId.get(sheet.id) ?? sheet} lang={lang} closed={shut} onAdd={add} onClose={() => setSheet(null)} />}
          </div>
        ) : view === "cart" ? (
          <div className="flex h-full flex-col px-4 pt-4 pb-4">
            <TopBar lang={lang} onBack={() => setView("menu")} title={t(T.ui.yourOrder)} right={`${t(T.table)} ${table}`} />
            {cart.length === 0 ? (
              <div className="grid flex-1 place-items-center text-center">
                <div>
                  <p className="text-muted">{t(T.ui.emptyCart)}</p>
                  <button type="button" onClick={() => setView("menu")} className="mt-3 underline underline-offset-2">{t(T.ui.browseMenu)}</button>
                </div>
              </div>
            ) : (
              <>
                {newTotal !== null && (
                  <div role="alert" data-price-changed className="mt-3 rounded-[14px] border border-fg/20 bg-paper/60 p-3">
                    <p className="text-[14px] font-semibold">{t(T.ui.pricesChanged)}</p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {t(T.ui.newTotal)} <b className="text-fg tabular-nums">{usd(newTotal)}</b>
                    </p>
                  </div>
                )}
                {shut && (
                  <div className="mt-3">
                    <ClosedBanner lang={lang} opens={live.settings.open} boxed />
                  </div>
                )}
                {error && (
                  <p role="alert" className="mt-3 rounded-[12px] bg-paper/60 px-3 py-2.5 text-[13px] text-khqr">{t(error)}</p>
                )}
                <ul className="mt-4 flex flex-col gap-3.5 overflow-y-auto">
                  {priced.lines.map((l, i) => {
                    const opts = optionSummary(l.options, lang);
                    const gone = off(l.itemId);
                    return (
                      <li key={i} data-cart-line={l.itemId} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <b className={`block text-[14.5px] ${gone ? "text-muted line-through" : ""}`}>{t(l.name)}</b>
                          {opts && <p className="text-[12.5px] text-muted">{opts}</p>}
                          {gone && (
                            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] font-medium text-khqr">
                              {t(T.ui.lineSoldOut)}
                              <button type="button" onClick={() => setQty(i, 0)} className="min-h-8 font-semibold text-fg underline underline-offset-2">{t(T.ui.removeSoldOut)}</button>
                            </p>
                          )}
                          <div className="mt-1.5 inline-flex items-center rounded-[10px] border border-line">
                            <button type="button" aria-label="−" onClick={() => setQty(i, l.qty - 1)} className="grid size-8 place-items-center">−</button>
                            <span className="w-5 text-center text-[13px] tabular-nums">{l.qty}</span>
                            <button type="button" aria-label="+" onClick={() => setQty(i, l.qty + 1)} className="grid size-8 place-items-center">+</button>
                          </div>
                        </div>
                        <b className="tabular-nums">{usd(l.unitPrice * l.qty)}</b>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 flex flex-col gap-1.5 border-t border-line pt-3">
                  <div className="flex justify-between text-muted"><span>{t(T.ui.subtotal)}</span><span className="tabular-nums">{usd(priced.total)}</span></div>
                  <div className="flex items-start justify-between">
                    <b className="text-[16px]">{t(T.ui.total)}</b>
                    <span className="text-right"><b className="text-[16px] tabular-nums">{usd(priced.total)}</b><span className="block text-[11.5px] text-muted tabular-nums">{khr(priced.total)}៛</span></span>
                  </div>
                </div>
                <div className="mt-auto pt-4">
                  <button
                    type="button"
                    disabled={blocked || shut}
                    onClick={() => {
                      setError(null);
                      setView("pay");
                    }}
                    className="min-h-[50px] w-full rounded-[14px] bg-khqr text-[14.5px] font-semibold text-white enabled:hover:opacity-90 disabled:opacity-40"
                  >
                    {t(T.ui.payKhqr)} · {usd(newTotal ?? priced.total)}
                  </button>
                  <p className="mt-2 text-center text-[11.5px] text-muted">{t(T.ui.payNote)}</p>
                </div>
              </>
            )}
          </div>
        ) : view === "pay" ? (
          <div className="flex h-full flex-col overflow-y-auto bg-[#efe9e9] px-4 pt-4 pb-6">
            <TopBar lang={lang} onBack={() => setView("cart")} title={t(T.ui.scanToPay)} />
            <div className="mt-5">
              <KhqrCard amount={newTotal ?? priced.total} merchant={live.settings.name} lang={lang} onPaid={pay} busy={busy} />
            </div>
            {error && <p role="alert" className="mt-3 rounded-[12px] bg-white px-3 py-2.5 text-center text-[13px] text-khqr">{t(error)}</p>}
          </div>
        ) : order ? (
          <Status order={order} lang={lang} room={room!} onMore={() => setView("menu")} />
        ) : null}
      </PhoneFrame>
    </div>
  );
}

function TopBar({ lang, onBack, title, right }: { lang: Lang; onBack: () => void; title: string; right?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label={pick(T.ui.back, lang)} className="-ml-2 grid size-10 place-items-center rounded-full hover:bg-paper">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        </button>
        <h1 className="text-[18px] font-semibold tracking-[-0.02em]">{title}</h1>
      </div>
      {right && <span className="text-[13px] text-muted">{right}</span>}
    </div>
  );
}

function Status({ order, lang, room, onMore }: { order: Order; lang: Lang; room: string; onMore: () => void }) {
  const t = (x: Text) => pick(x, lang);
  // Done (collected) stays on the last step; a cancelled order lights no step. Task 26 designs both screens.
  const step = { new: 1, preparing: 2, ready: 3, done: 3, cancelled: 0 }[order.status];
  const title = { new: T.ui.statusNew, preparing: T.ui.statusPreparing, ready: T.ui.statusReady, done: T.ui.statusReady, cancelled: T.ui.statusCancelled }[order.status];
  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 pt-6 pb-4" data-status={order.status}>
      <span className="grid size-[52px] place-items-center rounded-[16px] bg-accent">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
      </span>
      <h1 aria-live="polite" className="mt-3.5 text-[22px] leading-tight font-semibold tracking-[-0.03em]">{t(title)}</h1>
      <p className="text-[13px] text-muted">{t(T.ui.order)} {order.id} · {t(T.table)} {order.table} · {usd(order.total)}</p>
      <div className="mt-5 flex gap-1.5" aria-hidden="true">
        {[1, 2, 3].map((s) => <i key={s} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${s <= step ? "bg-accent" : "bg-line"}`} />)}
      </div>
      <div className="mt-1.5 flex justify-between text-[11.5px]">
        {[T.ui.received, T.ui.preparing, T.ui.ready].map((s, i) => <span key={i} className={i + 1 === step ? "font-semibold" : "text-muted"}>{t(s)}</span>)}
      </div>
      <ul className="mt-4 rounded-[14px] bg-paper p-3 text-[13.5px] leading-relaxed">
        {order.lines.map((l, i) => <li key={i}>{l.qty}× {t(l.name)}</li>)}
      </ul>
      <button type="button" onClick={onMore} className="mt-4 min-h-11 rounded-[14px] border border-line text-[13.5px] font-medium hover:border-line-strong">{t(T.ui.orderMore)}</button>
      <p className="mt-auto pt-5 text-center text-[12.5px] text-muted">
        {t(T.ui.updatesLive)}{" "}
        <a href={`/table-order?room=${room}`} target="_blank" rel="noopener" className="text-fg underline underline-offset-2">{t(T.ui.openKitchen)}</a>
      </p>
    </div>
  );
}

/** "We're closed · opens 07:00": on the menu under the header, and boxed in the cart. */
function ClosedBanner({ lang, opens, boxed = false }: { lang: Lang; opens: string; boxed?: boolean }) {
  const t = (x: Text) => pick(x, lang);
  return (
    <div role="status" data-shop-closed className={boxed ? "rounded-[14px] border border-line bg-paper/60 p-3" : "border-b border-line bg-paper/70 px-4 py-3"}>
      <p className="text-[14px] font-semibold">
        {t(T.ui.closedNow)} · {t(T.ui.opensAt)} <span className="tabular-nums">{opens}</span>
      </p>
      <p className="mt-0.5 text-[12.5px] text-muted">{t(T.ui.closedNote)}</p>
    </div>
  );
}

function Closed({ lang }: { lang: Lang }) {
  const t = (x: Text) => pick(x, lang);
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em]">{t(T.ui.closedTitle)}</h1>
        <p className="mt-2 text-[13.5px] text-muted">{t(T.ui.closedBody)}</p>
        <a href="/table-order" className="mt-5 inline-flex min-h-11 items-center rounded-[14px] bg-fg px-5 text-[14px] font-semibold text-white">{t(T.ui.startNew)}</a>
      </div>
    </div>
  );
}
