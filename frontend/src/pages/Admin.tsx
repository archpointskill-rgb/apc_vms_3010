import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Banner, Spinner } from "../components/ui";
import type { Host, Role, Room, StaffAccount } from "../types";

const ROLES: Role[] = ["reception", "host", "manager", "admin"];
const ROLE_HELP: Record<Role, string> = {
  reception: "Checks visitors in and out, keeps the contacts.",
  host: "Sees only their own visitors and answers them.",
  manager: "Everything reception does, plus reports and the audit trail.",
  admin: "Everything, plus accounts, hosts and settings."
};

export default function Admin() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffAccount[] | null>(null);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [webhook, setWebhook] = useState({ makeWebhookUrl: "", whatsappEnabled: false });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const load = async () => {
    const [s, h, r] = await Promise.all([
      api.get<StaffAccount[]>("/staff"),
      api.get<Host[]>("/hosts"),
      api.get<Room[]>("/rooms")
    ]);
    setStaff(s); setHosts(h); setRooms(r);
    const alerts = await api.get<{ makeWebhookUrl: string | null; whatsappEnabled: boolean } | null>("/settings/alerts");
    if (alerts) setWebhook({ makeWebhookUrl: alerts.makeWebhookUrl ?? "", whatsappEnabled: alerts.whatsappEnabled });
  };

  useEffect(() => { void load().catch((e) => setError(e.message)); }, []);

  async function run(work: () => Promise<unknown>, message = "Saved.") {
    setError(""); setSaved("");
    try { await work(); await load(); setSaved(message); }
    catch (e) { setError((e as Error).message); }
  }

  if (!staff) return <Spinner />;

  return (
    <div className="space-y-8">
      <h1 className="font-head text-2xl">Admin</h1>
      {error && <Banner kind="error" onDismiss={() => setError("")}>{error}</Banner>}
      {saved && <Banner kind="success" onDismiss={() => setSaved("")}>{saved}</Banner>}

      <section className="space-y-3">
        <div>
          <h2 className="font-head text-xl">Who can sign in</h2>
          <p className="text-sm text-slate-600">
            Create the account in Supabase under Authentication → Users. It appears here, switched off,
            until you give it a role.
          </p>
        </div>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="p-2.5">Name</th><th className="p-2.5">Email</th>
                <th className="p-2.5">Role</th><th className="p-2.5">Host</th><th className="p-2.5">Active</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((account) => {
                const self = account.id === user!.id;
                return (
                  <tr key={account.id} className={`border-t border-slate-100 ${account.active ? "" : "bg-amber-50"}`}>
                    <td className="p-2.5 font-semibold">
                      {account.fullName}
                      {self && <span className="ml-1 chip bg-blue-50 text-brand-blue">you</span>}
                    </td>
                    <td className="p-2.5 text-slate-600">{account.email}</td>
                    <td className="p-2.5">
                      <select className="input" aria-label={`Role for ${account.fullName}`} value={account.role} disabled={self}
                              onChange={(e) => run(() => api.patch(`/staff/${account.id}`, { role: e.target.value }))}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="p-2.5">
                      <select className="input" aria-label={`Host for ${account.fullName}`} value={account.hostId ?? ""}
                              onChange={(e) => run(() => api.patch(`/staff/${account.id}`, { hostId: e.target.value ? Number(e.target.value) : null }))}>
                        <option value="">Not a host</option>
                        {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                      </select>
                    </td>
                    <td className="p-2.5">
                      <input type="checkbox" className="h-4 w-4" checked={account.active} disabled={self}
                             aria-label={`Let ${account.fullName} sign in`}
                             onChange={(e) => run(() => api.patch(`/staff/${account.id}`, { active: e.target.checked }))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul className="text-xs text-slate-500">
          {ROLES.map((r) => <li key={r}><b>{r}</b> — {ROLE_HELP[r]}</li>)}
          <li>You cannot change your own role or switch yourself off, so the office is never left without an Admin.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-head text-xl">Hosts</h2>
          <p className="text-sm text-slate-600">
            The mobile number is used for the WhatsApp alert. The in-app alert works with or without it.
          </p>
        </div>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="p-2.5">Host</th><th className="p-2.5">Floor</th>
                <th className="p-2.5">Default room</th><th className="p-2.5">WhatsApp number</th>
              </tr>
            </thead>
            <tbody>
              {hosts.map((h) => <HostRow key={h.id} host={h} rooms={rooms} onSave={run} />)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-head text-xl">WhatsApp alerts through Make.com</h2>
          <p className="text-sm text-slate-600">
            Create a scenario in Make starting with a <b>Custom webhook</b>, paste its address here, and it will
            receive the visitor and host details each time somebody checks in or a host is reminded.
          </p>
        </div>
        <form
          className="card space-y-3"
          onSubmit={(e) => { e.preventDefault(); void run(() => api.put("/settings/alerts", webhook), "Alert settings saved."); }}
        >
          <div>
            <label className="label" htmlFor="hook">Make.com webhook address</label>
            <input id="hook" className="input" value={webhook.makeWebhookUrl} placeholder="https://hook.eu2.make.com/…"
                   onChange={(e) => setWebhook({ ...webhook, makeWebhookUrl: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={webhook.whatsappEnabled}
                   onChange={(e) => setWebhook({ ...webhook, whatsappEnabled: e.target.checked })} />
            Send the WhatsApp alert as well as the in-app one
          </label>
          <button className="btn-primary">Save alert settings</button>
        </form>
      </section>
    </div>
  );
}

function HostRow({ host, rooms, onSave }: {
  host: Host; rooms: Room[]; onSave: (work: () => Promise<unknown>, message?: string) => void;
}) {
  const [mobile, setMobile] = useState(host.mobile ?? "");
  useEffect(() => setMobile(host.mobile ?? ""), [host.mobile]);

  return (
    <tr className="border-t border-slate-100">
      <td className="p-2.5">
        <p className="font-semibold">{host.name}</p>
        <p className="text-xs text-slate-500">{host.designation}</p>
      </td>
      <td className="p-2.5">
        <select className="input" aria-label={`Floor for ${host.name}`} value={host.floor}
                onChange={(e) => onSave(() => api.patch(`/hosts/${host.id}`, { floor: e.target.value }))}>
          {["Ground", "2nd", "3rd"].map((f) => <option key={f}>{f}</option>)}
        </select>
      </td>
      <td className="p-2.5">
        <select className="input" aria-label={`Default room for ${host.name}`} value={host.defaultRoomId ?? ""}
                onChange={(e) => onSave(() => api.patch(`/hosts/${host.id}`, { defaultRoomId: Number(e.target.value) }))}>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.floor})</option>)}
        </select>
      </td>
      <td className="p-2.5">
        <div className="flex gap-2">
          <input className="input" aria-label={`WhatsApp number for ${host.name}`} value={mobile}
                 placeholder="+91…" onChange={(e) => setMobile(e.target.value)} />
          <button className="btn-ghost" onClick={() => onSave(() => api.patch(`/hosts/${host.id}`, { mobile }), `Saved ${host.name}'s number.`)}>
            Save
          </button>
        </div>
      </td>
    </tr>
  );
}
