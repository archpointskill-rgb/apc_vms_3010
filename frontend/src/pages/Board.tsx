import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Banner, Empty, ReasonDialog, Spinner, StatusChip } from "../components/ui";
import { elapsed, fmtTime, minutesLabel } from "../lib/format";
import { HOST_REPLIES, type Host, type Visit } from "../types";

type Pending = { visit: Visit; kind: "cancel" | "deny" } | null;

export default function Board() {
  const { user, can } = useAuth();
  const isHost = user!.role === "host";

  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState("");
  const [, forceTick] = useState(0);

  const load = useCallback(
    () => api.get<Visit[]>("/visits").then(setVisits).catch((e) => setError(e.message)),
    []
  );

  useEffect(() => {
    void load();
    if (can("visit.manage")) api.get<Host[]>("/hosts").then(setHosts).catch(() => {});
    // The board refreshes on its own so reception sees a host's reply without touching anything.
    const timer = setInterval(() => { void load(); forceTick((n) => n + 1); }, 8000);
    return () => clearInterval(timer);
  }, [load, can]);

  async function act(path: string, body?: unknown) {
    setError("");
    try {
      await api.post(path, body);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!visits) return <Spinner label="Loading the board…" />;

  const waiting = visits.filter((v) => v.status === "Waiting");
  const inMeeting = visits.filter((v) => v.status === "In meeting");
  const finished = visits.filter((v) => !["Waiting", "In meeting"].includes(v.status)).reverse();
  const unassigned = waiting.filter((v) => v.unassigned).length;

  function Card({ visit }: { visit: Visit }) {
    const canReply = isHost || can("visit.reply");
    const open = visit.status === "Waiting" || visit.status === "In meeting";
    return (
      <article className={`card space-y-2 text-sm ${visit.needsReview ? "border-brand-orange ring-1 ring-orange-200" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{visit.contact.name}</p>
            <p className="text-xs text-slate-500">
              {visit.contact.code}
              {visit.contact.organisation ? ` · ${visit.contact.organisation}` : ""}
            </p>
          </div>
          <span className="chip bg-blue-50 text-brand-blue">{visit.visitorType}</span>
        </div>

        <p>Host: <b>{visit.host?.name ?? "Unassigned"}</b></p>
        <p className="text-slate-600">
          {visit.room ? `${visit.room.name}, ${visit.room.floor} floor` : "No room chosen"} · {visit.purpose}
        </p>
        {visit.remarks && <p className="text-slate-500">“{visit.remarks}”</p>}

        <p className="text-xs text-slate-500">
          In {fmtTime(visit.checkIn)}
          {visit.checkOut
            ? ` · out ${fmtTime(visit.checkOut)} · ${minutesLabel(visit.durationMinutes)}`
            : ` · ${visit.status === "Waiting" ? "waiting" : "inside"} ${elapsed(visit.checkIn)}`}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <StatusChip status={visit.status} />
          {visit.reply && <span className="chip bg-green-50 text-green-800">Host said: {visit.reply}</span>}
          {visit.needsReview && <span className="chip bg-orange-100 text-orange-900">Open over 3 hours — please check</span>}
          {visit.reminders > 0 && <span className="chip bg-slate-100 text-slate-600">{visit.reminders} reminder{visit.reminders > 1 ? "s" : ""}</span>}
        </div>

        {visit.waitUntil && visit.status === "Waiting" && (
          <p className="text-xs text-slate-500">The host asked them to wait until {fmtTime(visit.waitUntil)}.</p>
        )}
        {visit.reason && <p className="text-xs text-red-700">Reason: {visit.reason}</p>}

        {visit.unassigned && visit.status === "Waiting" && can("visit.manage") && (
          <select
            className="input"
            defaultValue=""
            aria-label={`Give ${visit.contact.name} a host`}
            onChange={(e) => e.target.value && act(`/visits/${visit.id}/assign`, { hostId: Number(e.target.value) })}
          >
            <option value="">Give them a host…</option>
            {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {canReply && open && HOST_REPLIES.map((reply) => (
            <button
              key={reply}
              className={reply === "Can't meet today" ? "btn-danger" : "btn-ghost"}
              onClick={() => act(`/visits/${visit.id}/reply`, { reply })}
            >
              {reply}
            </button>
          ))}
          {can("visit.manage") && visit.status === "Waiting" && (
            <>
              <button className="btn-primary" onClick={() => act(`/visits/${visit.id}/start`)}>Start meeting</button>
              {visit.host && <button className="btn-ghost" onClick={() => act(`/visits/${visit.id}/remind`)}>Remind host</button>}
              <button className="btn-danger" onClick={() => setPending({ visit, kind: "cancel" })}>Cancel</button>
              <button className="btn-danger" onClick={() => setPending({ visit, kind: "deny" })}>Deny</button>
            </>
          )}
          {can("visit.manage") && visit.status === "In meeting" && (
            <button className="btn-primary" onClick={() => act(`/visits/${visit.id}/check-out`)}>Check out</button>
          )}
        </div>
      </article>
    );
  }

  function Column({ title, items, note }: { title: string; items: Visit[]; note?: string }) {
    return (
      <section className="space-y-3">
        <h2 className="flex flex-wrap items-baseline gap-2 font-head text-lg">
          {title}
          <span className="chip bg-slate-200 text-slate-700">{items.length}</span>
          {note && <span className="text-xs font-normal text-orange-700">{note}</span>}
        </h2>
        {items.map((v) => <Card key={v.id} visit={v} />)}
        {items.length === 0 && <Empty>Nobody here.</Empty>}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-head text-2xl">{isHost ? "My visitors" : "Live board"}</h1>
        <p className="text-xs text-slate-500">Refreshes by itself every few seconds.</p>
      </div>

      {error && <Banner kind="error" onDismiss={() => setError("")}>{error}</Banner>}

      <div className="grid gap-6 md:grid-cols-3">
        <Column title="Waiting" items={waiting} note={unassigned ? `${unassigned} with no host` : undefined} />
        <Column title="In meeting" items={inMeeting} />
        <Column title="Finished today" items={finished} />
      </div>

      {pending && (
        <ReasonDialog
          title={`${pending.kind === "cancel" ? "Cancel" : "Deny"} the visit for ${pending.visit.contact.name}`}
          confirmLabel={pending.kind === "cancel" ? "Cancel visit" : "Deny entry"}
          onClose={() => setPending(null)}
          onConfirm={(reason) => {
            const p = pending;
            setPending(null);
            void act(`/visits/${p.visit.id}/${p.kind}`, { reason });
          }}
        />
      )}
    </div>
  );
}
