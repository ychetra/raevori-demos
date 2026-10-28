"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminChecking, AdminGone, AdminLayout, AdminMain, PinScreen, useAdminAuth, type AdminCopy } from "@/components/admin/AdminShell";
import type { Lang } from "@/lib/i18n";
import { adminLogin, adminLogout, adminSession } from "../../admin-api";
import { T } from "../../km";
import { useRoom } from "../../useRoom";
import { MenuTab } from "./MenuTab";
import { OrdersTab } from "./OrdersTab";
import { SettingsTab } from "./SettingsTab";

type Tab = "menu" | "orders" | "settings";
const TABS: { id: Tab; label: (typeof T.admin.tabs)[Tab] }[] = (["menu", "orders", "settings"] as const).map((id) => ({ id, label: T.admin.tabs[id] }));
const COPY: AdminCopy = { ...T.admin, startNew: T.ui.startNew };

/** The café owner's admin for one demo room: PIN first, then Menu · Orders · Settings. */
export function Admin() {
  const params = useSearchParams();
  const room = params.get("room");
  const [lang, setLang] = useState<Lang>("en");
  const [tab, setTab] = useState<Tab>("menu");
  const { auth, setAuth, notice, onFail, logout, signedIn } = useAdminAuth(room, adminSession, adminLogout, T.admin.sessionEnded);

  const live = useRoom(auth === "in" ? room : null);
  useEffect(() => {
    if (live.status === "closed") setAuth("gone");
  }, [live.status, setAuth]);

  return (
    <AdminMain lang={lang}>
      {auth === "gone" ? (
        <AdminGone copy={COPY} lang={lang} setLang={setLang} startHref="/table-order" />
      ) : auth === "checking" ? (
        <AdminChecking />
      ) : auth === "out" ? (
        <PinScreen room={room!} copy={COPY} login={adminLogin} lang={lang} setLang={setLang} notice={notice} onIn={signedIn} onGone={() => setAuth("gone")} />
      ) : (
        <AdminLayout copy={COPY} lang={lang} setLang={setLang} name={live.status === "live" ? live.settings.name : null} tabs={TABS} tab={tab} onTab={setTab} onLogout={logout} loading={live.status !== "live"}>
          {live.status !== "live" ? null : tab === "menu" ? (
            <MenuTab room={room!} menu={live.menu} lang={lang} onFail={onFail} />
          ) : tab === "orders" ? (
            <OrdersTab room={room!} orders={live.orders} lang={lang} onFail={onFail} />
          ) : (
            <SettingsTab room={room!} settings={live.settings} lang={lang} onFail={onFail} />
          )}
        </AdminLayout>
      )}
    </AdminMain>
  );
}
