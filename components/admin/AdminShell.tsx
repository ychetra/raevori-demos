"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { LangToggle } from "@/components/shared/LangToggle";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { card } from "./parts";

/**
 * The frame every owner admin shares: the PIN keypad, the "this demo has closed" card, and the signed-in layout
 * (eyebrow + shop name, tabs that become a side nav on desktop, language, log out). Each demo passes its own copy.
 */

/** The copy the frame needs, from the demo's km.ts. */
export type AdminCopy = {
  title: Text;
  pinTitle: Text;
  pinHint: Text;
  pinLabel: Text;
  erase: Text;
  wrongPin: Text;
  tooManyTries: Text;
  loginFailed: Text;
  checking: Text;
  goneTitle: Text;
  goneBody: Text;
  startNew: Text;
  sessionEnded: Text;
  logout: Text;
};

export type Auth = "checking" | "in" | "out" | "gone";
type Fail = { status: number; error: string };
type Login = (room: string, pin: string) => Promise<{ ok: true } | { ok: false; error: string }>;

/**
 * Sign-in state for a room's admin: checks the session once, then `onFail` handles what every tab shares
 * (401 back to the PIN with a note, 404 the shop is gone; true when handled).
 */
export function useAdminAuth(room: string | null, session: (room: string) => Promise<"in" | "out" | "not_found">, logoutCall: (room: string) => Promise<void>, sessionEnded: Text) {
  const [auth, setAuth] = useState<Auth>(room ? "checking" : "gone");
  const [notice, setNotice] = useState<Text | null>(null);

  useEffect(() => {
    if (!room) return;
    session(room)
      .then((s) => setAuth(s === "in" ? "in" : s === "not_found" ? "gone" : "out"))
      .catch(() => setAuth("out"));
  }, [room, session]);

  const onFail = useCallback(
    (f: Fail) => {
      if (f.status === 401) {
        setNotice(sessionEnded);
        setAuth("out");
        return true;
      }
      if (f.status === 404 && f.error === "not_found") {
        setAuth("gone");
        return true;
      }
      return false;
    },
    [sessionEnded],
  );

  const logout = async () => {
    if (room) await logoutCall(room);
    setNotice(null);
    setAuth("out");
  };
  const signedIn = () => {
    setNotice(null);
    setAuth("in");
  };

  return { auth, setAuth, notice, onFail, logout, signedIn };
}

/** Before the session check answers: a quiet placeholder the size of the keypad. */
export function AdminChecking() {
  return <div className="mx-auto mt-10 h-[420px] max-w-[380px] animate-pulse rounded-[24px] bg-paper" aria-hidden="true" />;
}

/** The page's outer box, the same for every admin. */
export function AdminMain({ lang, children }: { lang: Lang; children: ReactNode }) {
  return (
    <main lang={lang} className="mx-auto max-w-[1240px] px-[18px] pt-4 pb-10 sm:px-[22px] sm:pt-6">
      {children}
    </main>
  );
}

/**
 * Signed in: header with the shop name, tabs (3 or 4; a side nav from lg), language and log out.
 * `loading` shows a placeholder card instead of the panel until the room's live data arrives.
 */
export function AdminLayout<K extends string>({
  copy,
  lang,
  setLang,
  name,
  tabs,
  tab,
  onTab,
  onLogout,
  loading,
  children,
}: {
  copy: AdminCopy;
  lang: Lang;
  setLang: (l: Lang) => void;
  name: string | null;
  tabs: { id: K; label: Text }[];
  tab: K;
  onTab: (k: K) => void;
  onLogout: () => void;
  loading: boolean;
  children: ReactNode;
}) {
  const t = (x: Text) => pick(x, lang);
  const cols = tabs.length === 4 ? "grid-cols-4" : "grid-cols-3";
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6">
      <header className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-accent">{t(copy.title)}</p>
            <h1 data-admin-name className="mt-0.5 truncate text-[22px] leading-tight font-semibold tracking-[-0.03em]">{name ?? " "}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
            <LangToggle lang={lang} onChange={setLang} />
          </div>
        </div>
        <nav role="tablist" aria-label={t(copy.title)} className={`grid ${cols} gap-1 rounded-[14px] bg-paper p-1 lg:grid-cols-1 lg:rounded-[16px]`}>
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              id={`tab-${x.id}`}
              aria-selected={tab === x.id}
              aria-controls={`panel-${x.id}`}
              onClick={() => onTab(x.id)}
              className={`min-h-10 rounded-[11px] px-2 text-[14px] font-semibold transition-colors lg:px-3 lg:text-left ${tab === x.id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"} ${tabs.length === 4 ? "max-lg:px-1 max-lg:text-[13px] max-lg:leading-tight" : ""}`}
            >
              {t(x.label)}
            </button>
          ))}
        </nav>
        <div className="hidden flex-col items-start gap-3 lg:flex">
          <LangToggle lang={lang} onChange={setLang} />
          <button type="button" onClick={onLogout} className="min-h-10 text-[13px] text-muted underline underline-offset-2 hover:text-fg">{t(copy.logout)}</button>
        </div>
      </header>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-w-0">
        {loading ? <div className={`${card} h-[360px] animate-pulse bg-paper/60`} aria-hidden="true" /> : children}
        <p className="mt-8 text-center lg:hidden">
          <button type="button" onClick={onLogout} className="min-h-10 text-[13px] text-muted underline underline-offset-2 hover:text-fg">{t(copy.logout)}</button>
        </p>
      </div>
    </div>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "erase"];

/** The 4-digit staff PIN keypad. Digits and Backspace on a keyboard work too; the fourth digit submits. */
export function PinScreen({ room, copy, login, lang, setLang, notice, onIn, onGone }: { room: string; copy: AdminCopy; login: Login; lang: Lang; setLang: (l: Lang) => void; notice: Text | null; onIn: () => void; onGone: () => void }) {
  const t = (x: Text) => pick(x, lang);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Text | null>(null);

  const submit = useCallback(
    async (value: string) => {
      setBusy(true);
      const r = await login(room, value);
      setBusy(false);
      if (r.ok) return onIn();
      if (r.error === "not_found") return onGone();
      setPin("");
      setError(r.error === "wrong_pin" ? copy.wrongPin : r.error === "too_many_tries" ? copy.tooManyTries : copy.loginFailed);
    },
    [room, login, copy, onIn, onGone],
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
        <p className="text-[12px] font-semibold text-accent">{t(copy.title)}</p>
        <LangToggle lang={lang} onChange={setLang} />
      </div>
      <h1 id="pin-title" className="mt-2 text-[22px] leading-tight font-semibold tracking-[-0.03em]">{t(copy.pinTitle)}</h1>
      <p className="mt-1 text-[13px] text-muted">{t(copy.pinHint)}</p>

      <div className="mt-5 grid grid-cols-4 gap-2.5" role="group" aria-label={`${t(copy.pinLabel)}: ${pin.length} / 4`} data-pin-boxes>
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
      <p role="alert" className="mt-2.5 min-h-[20px] text-[13px] font-medium text-khqr">{error ? t(error) : notice && !pin ? <span className="text-muted">{t(notice)}</span> : busy ? <span className="text-muted">{t(copy.checking)}</span> : null}</p>

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
              aria-label={k === "erase" ? t(copy.erase) : k}
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

/** The room has expired (or never existed): say so, and offer a fresh demo at `startHref`. */
export function AdminGone({ copy, lang, setLang, startHref }: { copy: AdminCopy; lang: Lang; setLang: (l: Lang) => void; startHref: string }) {
  const t = (x: Text) => pick(x, lang);
  return (
    <section className={`${card} mx-auto mt-2 max-w-[420px] p-6 text-center sm:mt-8`}>
      <div className="flex justify-end"><LangToggle lang={lang} onChange={setLang} /></div>
      <h1 className="mt-2 text-[20px] font-semibold tracking-[-0.02em]">{t(copy.goneTitle)}</h1>
      <p className="mt-2 text-[13.5px] text-muted">{t(copy.goneBody)}</p>
      <a href={startHref} className="mt-5 inline-flex min-h-11 items-center rounded-[14px] bg-fg px-5 text-[14px] font-semibold text-white">{t(copy.startNew)}</a>
    </section>
  );
}
