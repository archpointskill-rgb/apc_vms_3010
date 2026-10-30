import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Banner, Empty, Spinner } from "../components/ui";
import { fmtDate } from "../lib/format";
import type { PrTask, StaffAccount } from "../types";

export default function PrTasks() {
  const { can } = useAuth();
  const [tasks, setTasks] = useState<PrTask[] | null>(null);
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [scope, setScope] = useState<"all" | "mine" | "overdue">("all");
  const [error, setError] = useState("");

  const load = useCallback(async (which: typeof scope) => {
    const query = which === "mine" ? "?mine=1" : which === "overdue" ? "?overdue=1" : "";
    try { setTasks(await api.get<PrTask[]>(`/pr/tasks${query}`)); }
    catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void load(scope); }, [scope, load]);
  useEffect(() => { if (can("staff.manage")) api.get<StaffAccount[]>("/staff").then(setStaff).catch(() => {}); }, [can]);

  const run = async (work: () => Promise<unknown>) => {
    setError("");
    try { await work(); await load(scope); } catch (e) { setError((e as Error).message); }
  };

  const overdue = tasks?.filter((t) => t.overdue).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link className="text-sm link" to="/relationships">← All relationships</Link>
          <h1 className="font-head text-2xl">Follow-ups</h1>
        </div>
        <div className="flex gap-1">
          {([["all", "Everything open"], ["mine", "Mine"], ["overdue", "Overdue"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setScope(key)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${scope === key ? "bg-brand-blue text-white" : "text-slate-700 hover:bg-slate-100"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <Banner kind="error" onDismiss={() => setError("")}>{error}</Banner>}
      {overdue > 0 && scope !== "overdue" && (
        <Banner kind="warn">{overdue} of these are past their date.</Banner>
      )}

      {!tasks ? <Spinner /> : tasks.length === 0 ? <Empty>Nothing to chase.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="p-2.5">Due</th><th className="p-2.5">Who it is about</th>
                <th className="p-2.5">What needs doing</th><th className="p-2.5">Owner</th><th className="p-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} className={`border-t border-slate-100 ${t.overdue ? "bg-orange-50" : ""}`}>
                  <td className="whitespace-nowrap p-2.5">
                    {fmtDate(`${t.dueOn}T00:00:00+05:30`)}
                    {t.overdue && <span className="ml-1 chip bg-orange-100 text-orange-900">overdue</span>}
                  </td>
                  <td className="p-2.5">
                    <Link className="link" to={`/relationships/${t.contactId}`}>{t.contactName}</Link>
                    <span className="block font-mono text-xs text-slate-500">{t.contactCode}</span>
                  </td>
                  <td className="p-2.5">{t.description}</td>
                  <td className="p-2.5">
                    {staff.length > 0 ? (
                      <select className="input" aria-label={`Owner of ${t.description}`} value={t.ownerId ?? ""}
                              onChange={(e) => run(() => api.patch(`/pr/tasks/${t.id}`, { ownerId: e.target.value }))}>
                        {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                      </select>
                    ) : (t.ownerName ?? "nobody")}
                  </td>
                  <td className="whitespace-nowrap p-2.5">
                    <div className="flex gap-1.5">
                      <button className="btn-primary" onClick={() => run(() => api.patch(`/pr/tasks/${t.id}`, { status: "Completed" }))}>Done</button>
                      <button className="btn-ghost" onClick={() => run(() => api.patch(`/pr/tasks/${t.id}`, { status: "Cancelled" }))}>Drop</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
