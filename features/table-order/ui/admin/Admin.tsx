"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LangToggle } from "@/components/shared/LangToggle";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { adminLogin, adminLogout, adminSession, type AdminFail } from "../../admin-api";
import { T } from "../../km";
import { useRoom } from "../../useRoom";
import { MenuTab } from "./MenuTab";
import { OrdersTab } from "./OrdersTab";
import { card } from "./parts";
import { SettingsTab } from "./SettingsTab";

type Auth = "checking" | "in" | "out" | "gone";
type Tab = "menu" | "orders" | "settings";
const TABS: Tab[] = ["menu", "orders", "settings"];

/** The café owner's admin for one demo room: PIN first, then Menu · Orders · Settings. */
export function Admin() {
  const params = useSearchParams();
  const room = params.get("room");
  const [lang, setLang] = useState<Lang>("en");
  const [auth, setAuth] = useState<Auth>(room ? "checking" : "gone");
  const [notice, setNotice] = useState<Text | null>(null);
  const [tab, setTab] = useState<Tab>("menu");
  const t = (x: Text) => pick(x, lang);

  useEffect(() => {
    if (!room) return;
    adminSession(room)
      .then((s) => setAuth(s === "in" ? "in" : s === "not_found" ? "gone" : "out"))
      .catch(() => setAuth("out"));
  }, [room]);

  const live = useRoom(auth === "in" ? room : null);
  useEffect(() => {
    if (live.status === "closed") setAuth("gone");
  }, [live.status]);

  /** Handles the failures every tab shares: 401 back to the PIN, 404 the shop is gone. True when handled. */
  const onFail = useCallback((f: AdminFail) => {
    if (f.status === 401) {
      setNotice(T.admin.sessionEnded);
      setAuth("out");
      return true;
    }
    if (f.status === 404 && f.error === "not_found") {
      setAuth("gone");
      return true;
    }
    return false;
  }, []);

  const logout = async () => {
    if (room) await adminLogout(room);
    setNotice(null);
    setAuth("out");
  };

  return (
    <main lang={lang} className="mx-auto max-w-[1240px] px-[18px] pt-4 pb-10 sm:px-[22px] sm:pt-6">
      {auth === "gone" ? (
        <Gone lang={lang} setLang={setLang} />
      ) : auth === "checking" ? (
        <div className="mx-auto mt-10 h-[420px] max-w-[380px] animate-pulse rounded-[24px] bg-paper" aria-hidden="true" />
      ) : auth === "out" ? (
        <PinScreen room={room!} lang={lang} setLang={setLang} notice={notice} onIn={() => { setNotice(null); setAuth("in"); }} onGone={() => setAuth("gone")} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6">
          <header className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-accent">{t(T.admin.title)}</p>
                <h1 data-cafe-name className="mt-0.5 truncate text-[22px] leading-tight font-semibold tracking-[-0.03em]">{live.status === "live" ? live.settings.name : " "}</h1>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
                <LangToggle lang={lang} onChange={setLang} />
              </div>
            </div>
            <nav role="tablist" aria-label={t(T.admin.title)} className="grid grid-cols-3 gap-1 rounded-[14px] bg-paper p-1 lg:grid-cols-1 lg:rounded-[16px]">
              {TABS.map((x) => (
                <button
                  key={x}
                  type="button"
                  role="tab"
                  id={`tab-${x}`}
                  aria-selected={tab === x}
                  aria-controls={`panel-${x}`}
                  onClick={() => setTab(x)}
                  className={`min-h-10 rounded-[11px] px-2 text-[14px] font-semibold transition-colors lg:px-3 lg:text-left ${tab === x ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}
                >
                  {t(T.admin.tabs[x])}
                </button>
              ))}
            </nav>
            <div className="hidden flex-col items-start gap-3 lg:flex">
              <LangToggle lang={lang} onChange={setLang} />
              <button type="button" onClick={logout} className="min-h-10 text-[13px] text-muted underline underline-offset-2 hover:text-fg">{t(T.admin.logout)}</button>
            </div>
          </header>

          <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-w-0">
            {live.status !== "live" ? (
              <div className={`${card} h-[360px] animate-pulse bg-paper/60`} aria-hidden="true" />
            ) : tab === "menu" ? (
              <MenuTab room={room!} menu={live.menu} lang={lang} onFail={onFail} />
            ) : tab === "orders" ? (
              <OrdersTab room={room!} orders={live.orders} lang={lang} onFail={onFail} />
            ) : (
              <SettingsTab room={room!} settings={live.settings} lang={lang} onFail={onFail} />
            )}
            <p className="mt-8 text-center lg:hidden">
              <button type="button" onClick={logout} className="min-h-10 text-[13px] text-muted underline underline-offset-2 hover:text-fg">{t(T.admin.logout)}</button>
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "erase"];

function PinScreen({ room, lang, setLang, notice, onIn, onGone }: { room: string; lang: Lang; setLang: (l: Lang) => void; notice: Text | null; onIn: () => void; onGone: () => void }) {
  const t = (x: Text) => pick(x, lang);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Text | null>(null);

  const submit = useCallback(
    async (value: string) => {
      setBusy(true);
      const r = await adminLogin(room, value);
      setBusy(false);
      if (r.ok) return onIn();
      if (r.error === "not_found") return onGone();
      setPin("");
      setError(r.error === "wrong_pin" ? T.admin.wrongPin : r.error === "too_many_tries" ? T.admin.tooManyTries : T.admin.loginFailed);
    },
    [room, onIn, onGone],
  );

  const press = useCallback(
    (k: string) => {
      if (busy) return;
      if (k === "erase") return setPin(pin.slice(0, -1));
      if (pin.length >= 4) return;
      setError(null);
      const next = pin + k;
      setPin(next);
      if (next.length === 4) void submit(next);
    },
    [busy, pin, submit],
  );

  // A keyboard works too: digits type, Backspace erases.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("erase");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  return (
    <section className={`${card} mx-auto mt-2 max-w-[380px] p-5 sm:mt-8 sm:p-6`} aria-labelledby="pin-title">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-semibold text-accent">{t(T.admin.title)}</p>
        <LangToggle lang={lang} onChange={setLang} />
      </div>
      <h1 id="pin-title" className="mt-2 text-[22px] leading-tight font-semibold tracking-[-0.03em]">{t(T.admin.pinTitle)}</h1>
      <p className="mt-1 text-[13px] text-muted">{t(T.admin.pinHint)}</p>

      <div className="mt-5 grid grid-cols-4 gap-2.5" role="group" aria-label={`${t(T.admin.pinLabel)}: ${pin.length} / 4`} data-pin-boxes>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className={`grid h-[60px] place-items-center rounded-[14px] border-[1.5px] text-[26px] font-semibold tabular-nums transition-colors ${
              error ? "border-khqr" : i === pin.length && !busy ? "border-fg" : "border-line"
            } ${pin[i] ? "bg-surface" : "bg-paper/50"}`}
          >
            {pin[i] ?? ""}
          </span>
        ))}
      </div>
      <p role="alert" className="mt-2.5 min-h-[20px] text-[13px] font-medium text-khqr">{error ? t(error) : notice && !pin ? <span className="text-muted">{t(notice)}</span> : busy ? <span className="text-muted">{t(T.admin.checking)}</span> : null}</p>

      <div className="mt-2 grid grid-cols-3 gap-2">
        {KEYS.map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              disabled={busy}
              aria-label={k === "erase" ? t(T.admin.erase) : k}
              className="grid h-14 place-items-center rounded-[14px] border border-line bg-surface text-[20px] font-semibold tabular-nums transition-colors hover:border-line-strong active:bg-paper disabled:opacity-60"
            >
              {k === "erase" ? (
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5h11v14H9l-6-7z" /><path d="m12 9 5 6M17 9l-5 6" /></svg>
              ) : (
                k
              )}
            </button>
          ),
        )}
      </div>
    </section>
  );
}

function Gone({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const t = (x: Text) => pick(x, lang);
  return (
    <section className={`${card} mx-auto mt-2 max-w-[420px] p-6 text-center sm:mt-8`}>
      <div className="flex justify-end"><LangToggle lang={lang} onChange={setLang} /></div>
      <h1 className="mt-2 text-[20px] font-semibold tracking-[-0.02em]">{t(T.admin.goneTitle)}</h1>
      <p className="mt-2 text-[13.5px] text-muted">{t(T.admin.goneBody)}</p>
      <a href="/table-order" className="mt-5 inline-flex min-h-11 items-center rounded-[14px] bg-fg px-5 text-[14px] font-semibold text-white">{t(T.ui.startNew)}</a>
    </section>
  );
}
