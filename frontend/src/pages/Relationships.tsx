import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, download } from "../api";
import { useAuth } from "../auth";
import { Banner, Bars, Empty, Spinner } from "../components/ui";
import { fmtDate, officeToday } from "../lib/format";
import {
  PR_CATEGORIES, PR_PRIORITIES, PR_STATUSES,
  type PrCategory, type PrPriority, type PrProfile, type PrStatus, type PrSummary, type UpcomingDate
} from "../types";

const PRIORITY_STYLE: Record<PrPriority, string> = {
  "Key relationship": "bg-yellow-100 text-yellow-900",
  Important: "bg-blue-100 text-blue-900",
  Standard: "bg-slate-100 text-slate-600"
};
const STATUS_STYLE: Record<PrStatus, string> = {
  Active: "bg-green-100 text-green-800",
  Inactive: "bg-slate-200 text-slate-600",
  Archived: "bg-slate-200 text-slate-500",
  "Do not contact": "bg-red-100 text-red-800"
};

export default function Relationships() {
  const { can } = useAuth();
  const [rows, setRows] = useState<PrProfile[] | null>(null);
  const [summary, setSummary] = useState<PrSummary | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingDate[]>([]);
  const [filters, setFilters] = useState({ q: "", category: "" as "" | PrCategory, priority: "" as "" | PrPriority, status: "" as "" | PrStatus });
  const [error, setError] = useState("");

  const load = useCallback(async (f: typeof filters) => {
    const query = new URLSearchParams();
    if (f.q.trim()) query.set("q", f.q.trim());
    if (f.category) query.set("category", f.category);
    if (f.priority) query.set("priority", f.priority);
    if (f.status) query.set("status", f.status);
    try {
      setRows(await api.get<PrProfile[]>(`/pr?${query}`));
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { const t = setTimeout(() => void load(filters), 200); return () => clearTimeout(t); }, [filters, load]);
  useEffect(() => {
    api.get<PrSummary>("/pr/summary").then(setSummary).catch(() => {});
    api.get<UpcomingDate[]>("/pr/upcoming?days=30").then(setUpcoming).catch(() => {});
  }, []);

  const tile = (label: string, value: number, hint?: string, warn = false) => (
    <div className="card text-center">
      <p className={`font-head text-3xl tabular-nums ${warn && value > 0 ? "text-brand-orange" : "text-brand-blue"}`}>{value}</p>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-head text-2xl">Relationships</h1>
          <p className="text-sm text-slate-600">
            The same people as the visitor register, with the relationship kept alongside. Nobody is entered twice.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-ghost" to="/relationships/tasks">Follow-ups</Link>
          <Link className="btn-ghost" to="/relationships/gifts">Gifts</Link>
          {can("pr.export") && (
            <button className="btn-primary" onClick={() =>
              download("/pr/export/directory.csv", `archpoint-pr-${officeToday()}.csv`).catch((e) => setError(e.message))}>
              Download directory
            </button>
          )}
        </div>
      </div>

      {error && <Banner kind="error" onDismiss={() => setError("")}>{error}</Banner>}

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {tile("Relationships", summary.relationships)}
            {tile("Key relationships", summary.keyRelationships)}
            {tile("Open follow-ups", summary.openTasks)}
            {tile("Overdue", summary.overdueTasks, "please chase", true)}
            {tile("Gifts to approve", summary.giftsAwaitingApproval, "waiting", true)}
          </div>
          {summary.doNotContact > 0 && (
            <Banner kind="warn">
              {summary.doNotContact} {summary.doNotContact === 1 ? "person is" : "people are"} marked <b>Do not contact</b>.
              They are kept out of any list meant for sending things.
            </Banner>
          )}
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <input className="input sm:col-span-4" aria-label="Search relationships" placeholder="Search name, organisation, mobile, email or code"
                   value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
            <select className="input" aria-label="Category" value={filters.category}
                    onChange={(e) => setFilters({ ...filters, category: e.target.value as PrCategory })}>
              <option value="">Any category</option>
              {PR_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select className="input" aria-label="Priority" value={filters.priority}
                    onChange={(e) => setFilters({ ...filters, priority: e.target.value as PrPriority })}>
              <option value="">Any priority</option>
              {PR_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
            <select className="input" aria-label="Status" value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value as PrStatus })}>
              <option value="">Active and inactive</option>
              {PR_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <button className="btn-ghost" onClick={() => setFilters({ q: "", category: "", priority: "", status: "" })}>Clear</button>
          </div>

          {!rows ? <Spinner /> : rows.length === 0 ? (
            <Empty>No relationships match. Open one from a contact's page.</Empty>
          ) : (
            <ul className="space-y-2">
              {rows.map((p) => (
                <li key={p.contactId}>
                  <Link to={`/relationships/${p.contactId}`}
                        className="card flex flex-wrap items-center gap-x-4 gap-y-2 text-sm transition hover:border-brand-blue hover:bg-blue-50">
                    <div className="min-w-[14rem] flex-1">
                      <p className="font-semibold">{p.fullName}</p>
                      <p className="text-xs text-slate-500">
                        {p.contactCode}{p.organisation ? ` · ${p.organisation}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {p.categories.map((c) => <span key={c} className="chip bg-blue-50 text-brand-blue">{c}</span>)}
                    </div>
                    <span className={`chip ${PRIORITY_STYLE[p.priority]}`}>{p.priority}</span>
                    {p.status !== "Active" && <span className={`chip ${STATUS_STYLE[p.status]}`}>{p.status}</span>}
                    {p.overdueTasks > 0 && (
                      <span className="chip bg-orange-100 text-orange-900">{p.overdueTasks} overdue</span>
                    )}
                    <div className="min-w-[9rem] text-xs text-slate-500">
                      <p>Owner: {p.ownerName ?? "nobody yet"}</p>
                      <p>{p.lastInteraction ? `Last contact ${fmtDate(p.lastInteraction)}` : "No contact recorded"}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="mb-2 font-semibold">Coming up in the next 30 days</h3>
            {upcoming.length === 0 ? <Empty>Nothing in the next month.</Empty> : (
              <ul className="text-sm">
                {upcoming.slice(0, 12).map((d, i) => (
                  <li key={i} className="flex items-center justify-between border-t border-slate-100 py-1.5 first:border-0">
                    <Link className="link" to={`/relationships/${d.contact_id}`}>{d.full_name}</Link>
                    <span className="text-slate-500">
                      {d.occasion} · {fmtDate(`${d.on_day}T00:00:00+05:30`)}
                      {d.days_away === 0 ? " (today)" : ` (${d.days_away}d)`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-400">Birth years are never shown here.</p>
          </div>
          {summary && <Bars title="By category" rows={summary.categories} />}
        </div>
      </div>
    </div>
  );
}
