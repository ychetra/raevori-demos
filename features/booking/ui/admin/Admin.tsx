"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminChecking, AdminGone, AdminLayout, AdminMain, PinScreen, useAdminAuth } from "@/components/admin/AdminShell";
import type { Lang } from "@/lib/i18n";
import { adminLogin, adminLogout, adminSession } from "../../admin-api";
import { T } from "../../km";
import { useBooking } from "../../useBooking";
import { BookingsTab } from "./BookingsTab";
import { ServicesTab } from "./ServicesTab";
import { SettingsTab } from "./SettingsTab";
import { StaffTab } from "./StaffTab";

type Tab = keyof typeof T.admin.tabs;
const TABS = (["bookings", "services", "staff", "settings"] as const).map((id) => ({ id, label: T.admin.tabs[id] }));

/** The salon owner's admin for one demo room: PIN first, then Bookings · Services · Staff · Settings. */
export function Admin() {
  const params = useSearchParams();
  const room = params.get("room");
  const [lang, setLang] = useState<Lang>("en");
  const [tab, setTab] = useState<Tab>("bookings");
  const { auth, setAuth, notice, onFail, logout, signedIn } = useAdminAuth(room, adminSession, adminLogout, T.admin.sessionEnded);

  const live = useBooking(auth === "in" ? room : null);
  useEffect(() => {
    if (live.status === "closed") setAuth("gone");
  }, [live.status, setAuth]);
  const ready = live.status === "live";

  return (
    <AdminMain lang={lang}>
      {auth === "gone" ? (
        <AdminGone copy={T.admin} lang={lang} setLang={setLang} startHref="/booking" />
      ) : auth === "checking" ? (
        <AdminChecking />
      ) : auth === "out" ? (
        <PinScreen room={room!} copy={T.admin} login={adminLogin} lang={lang} setLang={setLang} notice={notice} onIn={signedIn} onGone={() => setAuth("gone")} />
      ) : (
        <AdminLayout copy={T.admin} lang={lang} setLang={setLang} name={ready ? live.config.settings.name : null} tabs={TABS} tab={tab} onTab={setTab} onLogout={logout} loading={!ready}>
          {!ready ? null : tab === "bookings" ? (
            <BookingsTab room={room!} bookings={live.bookings} config={live.config} lang={lang} onFail={onFail} />
          ) : tab === "services" ? (
            <ServicesTab room={room!} services={live.config.services} lang={lang} onFail={onFail} />
          ) : tab === "staff" ? (
            <StaffTab room={room!} stylists={live.config.stylists} settings={live.config.settings} lang={lang} onFail={onFail} />
          ) : (
            <SettingsTab room={room!} settings={live.config.settings} lang={lang} onFail={onFail} />
          )}
        </AdminLayout>
      )}
    </AdminMain>
  );
}
