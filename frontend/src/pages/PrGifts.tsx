import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Banner, Empty, Spinner } from "../components/ui";
import { GiftCard } from "./RelationshipDetail";
import type { PrGift } from "../types";

export default function PrGifts() {
  const { can } = useAuth();
  const [gifts, setGifts] = useState<PrGift[] | null>(null);
  const [spend, setSpend] = useState<{ plannedTotal: number; actualTotal: number; count: number } | null>(null);
  const [onlyPending, setOnlyPending] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (pending: boolean) => {
    try { setGifts(await api.get<PrGift[]>(`/pr/gifts${pending ? "?pending=1" : ""}`)); }
    catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void load(onlyPending); }, [onlyPending, load]);
  useEffect(() => {
    if (can("pr.export")) api.get<typeof spend>("/pr/gifts/spend").then(setSpend).catch(() => {});
  }, [can]);

  const run = async (work: () => Promise<unknown>) => {
    setError("");
    try { await work(); await load(onlyPending); } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link className="text-sm link" to="/relationships">← All relationships</Link>
          <h1 className="font-head text-2xl">Gifts</h1>
          <p className="text-sm text-slate-600">
            Every outgoing gift waits for a manager, and nobody can approve one they proposed.
          </p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setOnlyPending(true)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${onlyPending ? "bg-brand-blue text-white" : "text-slate-700 hover:bg-slate-100"}`}>
            Waiting for approval
          </button>
          <button onClick={() => setOnlyPending(false)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${!onlyPending ? "bg-brand-blue text-white" : "text-slate-700 hover:bg-slate-100"}`}>
            Everything
          </button>
        </div>
      </div>

      {error && <Banner kind="error" onDismiss={() => setError("")}>{error}</Banner>}

      {spend && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card text-center">
            <p className="font-head text-2xl text-brand-blue tabular-nums">₹{spend.plannedTotal.toLocaleString("en-IN")}</p>
            <p className="text-xs uppercase tracking-wide text-slate-500">Planned this year</p>
          </div>
          <div className="card text-center">
            <p className="font-head text-2xl text-brand-blue tabular-nums">₹{spend.actualTotal.toLocaleString("en-IN")}</p>
            <p className="text-xs uppercase tracking-wide text-slate-500">Actually spent</p>
          </div>
          <div className="card text-center">
            <p className="font-head text-2xl text-brand-blue tabular-nums">{spend.count}</p>
            <p className="text-xs uppercase tracking-wide text-slate-500">Gifts given</p>
          </div>
          <p className="col-span-3 text-xs text-slate-400">
            Planned and actual are shown separately on purpose, so the same spending is never counted twice.
          </p>
        </div>
      )}

      {!gifts ? <Spinner /> : gifts.length === 0 ? (
        <Empty>{onlyPending ? "Nothing is waiting for approval." : "No gifts recorded yet."}</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {gifts.map((g) => <GiftCard key={g.id} gift={g} onAction={run} showContact />)}
        </div>
      )}
    </div>
  );
}
