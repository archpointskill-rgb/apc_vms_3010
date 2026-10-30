import { useEffect, useState } from "react";
import { api, download } from "../api";
import { useAuth } from "../auth";
import { Banner, Bars, Empty, Spinner } from "../components/ui";
import { fmtDate, fmtDateTime, officeToday } from "../lib/format";
import type { AuditEntry, Summary } from "../types";

export default function Reports() {
  const { user, can } = useAuth();
  const full = can("report.view");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState("");
  const [range, setRange] = useState({ from: officeToday(-30), to: officeToday() });

  useEffect(() => {
    if (!full) return;
    api.get<Summary>("/reports/summary").then(setSummary).catch((e) => setError(e.message));
    if (can("audit.view")) api.get<AuditEntry[]>("/audit").then(setAudit).catch(() => {});
  }, [full, can]);

  const exportScope = can("export.everything")
    ? "every visit"
    : can("export.ownOnly")
      ? "your own visitors"
      : "today's visitors, without email or date of birth";

  async function exportCsv() {
    setError("");
    try {
      const query = can("export.everything") ? `?from=${range.from}&to=${range.to}` : "";
      await download(`/export/visits.csv${query}`, `archpoint-visitors-${officeToday()}.csv`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
    return (
      <div className="card text-center">
        <p className="font-head text-3xl text-brand-blue tabular-nums">{value}</p>
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-head text-2xl">{full ? "Reports" : "Export the register"}</h1>
          <p className="text-sm text-slate-600">Your role can export {exportScope}.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {can("export.everything") && (
            <>
              <div>
                <label className="label" htmlFor="from">From</label>
                <input id="from" type="date" className="input w-auto" value={range.from}
                       onChange={(e) => setRange({ ...range, from: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="to">To</label>
                <input id="to" type="date" className="input w-auto" value={range.to}
                       onChange={(e) => setRange({ ...range, to: e.target.value })} />
              </div>
            </>
          )}
          <button className="btn-primary" onClick={exportCsv}>Download spreadsheet</button>
        </div>
      </div>

      {error && <Banner kind="error" onDismiss={() => setError("")}>{error}</Banner>}

      {!full && (
        <Banner kind="info">
          The full reports are for the Manager and the Admin. You can still download the register above.
        </Banner>
      )}

      {full && !summary && <Spinner label="Working out the numbers…" />}

      {full && summary && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <Tile label="Inside now" value={summary.insideNow} />
            <Tile label="Waiting now" value={summary.waitingNow} />
            <Tile label="Visits today" value={summary.visitsToday} />
            <Tile label="Average stay" value={summary.avgStayMinutes === null ? "—" : `${summary.avgStayMinutes} min`} hint="today" />
            <Tile label="Open over 3 h" value={summary.flagged} hint="please check" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Bars title="Footfall by day (last 30 days)" rows={summary.byDay} formatLabel={(l) => fmtDate(`${l}T00:00:00+05:30`)} />
            <Bars title="Busiest hours" rows={summary.byHour} formatLabel={(l) => `${l}:00`} />
            <Bars title="By visitor type" rows={summary.byType} />
            <Bars title="By host" rows={summary.byHost} />
          </div>

          <div className="card">
            <h3 className="mb-2 font-semibold">Repeat visitors</h3>
            {summary.repeatVisitors.length === 0 ? <Empty>Nobody has visited twice yet.</Empty> : (
              <ul className="text-sm">
                {summary.repeatVisitors.map((r) => (
                  <li key={r.code} className="flex items-center justify-between border-t border-slate-100 py-1.5">
                    <span>{r.name} <span className="font-mono text-xs text-slate-500">{r.code}</span></span>
                    <span className="text-slate-500">
                      last on {fmtDate(r.lastVisit)} · <b className="text-slate-800">{r.visits} visits</b>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {can("audit.view") && (
            <div className="card overflow-x-auto p-0">
              <h3 className="p-4 font-semibold">Audit trail <span className="text-xs font-normal text-slate-500">— the last 200 changes. Nobody can edit this.</span></h3>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 uppercase tracking-wide text-slate-500">
                  <tr><th className="p-2">When</th><th className="p-2">Who</th><th className="p-2">Did what</th><th className="p-2">To</th></tr>
                </thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id} className="border-t border-slate-100">
                      <td className="p-2 whitespace-nowrap">{fmtDateTime(a.at)}</td>
                      <td className="p-2">{a.actorName ?? "System"}</td>
                      <td className="p-2">{a.action}</td>
                      <td className="p-2">{a.entity}{a.entityId ? ` #${a.entityId}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <p className="text-xs text-slate-400">Signed in as {user!.email}.</p>
    </div>
  );
}
