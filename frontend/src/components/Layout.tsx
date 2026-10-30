import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { fmtTime } from "../lib/format";
import type { Notification } from "../types";
import { Footer, Logo } from "./ui";

const ROLE_LABEL = { reception: "Reception", host: "Host", manager: "Manager", admin: "Admin" } as const;

export default function Layout({ children }: { children: ReactNode }) {
  const { user, can, signOut } = useAuth();
  if (!user) return null;

  const links: Array<[string, string, boolean]> = [
    ["/check-in", "Check in", can("visit.checkIn")],
    ["/board", user.role === "host" ? "My visitors" : "Live board", true],
    ["/appointments", "Appointments", can("appointment.read")],
    ["/contacts", "Contacts", can("contact.read")],
    ["/relationships", "Relationships", can("pr.read")],
    ["/reports", can("report.view") ? "Reports" : "Export", true],
    ["/admin", "Admin", can("staff.manage")]
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="font-head text-lg text-brand-blue">Visitors</span>
          </div>
          <nav className="flex flex-wrap gap-1" aria-label="Main">
            {links.filter(([, , show]) => show).map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    isActive ? "bg-brand-blue text-white" : "text-slate-700 hover:bg-slate-100"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            {user.role === "host" && <AlertBell />}
            <span className="hidden rounded-full bg-blue-50 px-3 py-1 font-semibold text-brand-blue sm:inline">
              {user.fullName} · {ROLE_LABEL[user.role]}
            </span>
            <button className="btn-ghost" onClick={() => void signOut()}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <Footer />
    </div>
  );
}

/** The host's in-app alerts. This is the alert that must always work; WhatsApp is the extra. */
function AlertBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const load = () => api.get<Notification[]>("/notifications").then(setItems).catch(() => {});
  useEffect(() => {
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, []);

  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="relative">
      <button
        className={unread ? "btn-warm" : "btn-ghost"}
        aria-label={`Alerts${unread ? `, ${unread} unread` : ""}`}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && unread) api.post("/notifications/read").then(load).catch(() => {});
        }}
      >
        Alerts{unread > 0 && <span className="ml-1 rounded-full bg-white/90 px-1.5 text-xs text-brand-orange">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 max-h-96 w-80 overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {items.length === 0 && <p className="p-4 text-sm text-slate-500">No alerts yet.</p>}
          {items.map((n) => (
            <div key={n.id} className="border-b border-slate-100 p-3 last:border-0">
              <p className={n.readAt ? "text-sm text-slate-600" : "text-sm font-semibold"}>{n.body}</p>
              <p className="text-xs text-slate-400">{fmtTime(n.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
