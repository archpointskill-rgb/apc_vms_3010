import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { Banner, Empty, Spinner, StatusChip } from "../components/ui";
import { supabase } from "../lib/supabase";
import { fmtDate, fmtDateTime, officeToday } from "../lib/format";
import {
  CHANNELS, GIFT_DIRECTIONS, GIFT_TIERS, INTERACTION_KINDS, PR_CATEGORIES,
  PR_PRIORITIES, PR_SOURCES, PR_STATUSES,
  type Channel, type GiftDirection, type GiftTier, type InteractionKind,
  type PrCategory, type PrDetail, type PrGift, type PrPriority, type PrSource, type PrStatus, type StaffAccount
} from "../types";

type Tab = "timeline" | "tasks" | "gifts" | "details" | "permission" | "files";

export default function RelationshipDetail() {
  const { contactId } = useParams();
  const id = Number(contactId);
  const { user, can } = useAuth();
  const [data, setData] = useState<PrDetail | null>(null);
  const [tab, setTab] = useState<Tab>("timeline");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try { setData(await api.get<PrDetail>(`/pr/${id}`)); }
    catch (e) { setError((e as Error).message); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const run = async (work: () => Promise<unknown>) => {
    setError("");
    try { await work(); await load(); } catch (e) { setError((e as Error).message); }
  };

  if (error && !data) return <Banner kind="error">{error}</Banner>;
  if (!data) return <Spinner />;

  const tabs: Array<[Tab, string, number?]> = [
    ["timeline", "Timeline", data.interactions.length],
    ["tasks", "Follow-ups", data.tasks.filter((t) => t.status === "Open" || t.status === "In progress").length],
    ["gifts", "Gifts", data.gifts.length],
    ["details", "Details"],
    ["permission", "Permission"],
    ["files", "Files", data.attachments.length]
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="text-sm link" to="/relationships">← All relationships</Link>
          <h1 className="font-head text-2xl">{data.fullName}</h1>
          <p className="text-sm text-slate-600">
            <span className="font-mono text-xs">{data.contactCode}</span>
            {data.organisation ? ` · ${data.organisation}` : ""}
            {data.designation ? ` · ${data.designation}` : ""}
          </p>
          <p className="text-sm text-slate-600">{data.mobile}{data.email ? ` · ${data.email}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {data.categories.map((c) => <span key={c} className="chip bg-blue-50 text-brand-blue">{c}</span>)}
          <span className="chip bg-yellow-100 text-yellow-900">{data.priority}</span>
          {data.status !== "Active" && <span className="chip bg-red-100 text-red-800">{data.status}</span>}
        </div>
      </div>

      {data.status === "Do not contact" && (
        <Banner kind="warn">
          This person has asked not to be contacted. They stay out of every list meant for sending things.
        </Banner>
      )}
      {error && <Banner kind="error" onDismiss={() => setError("")}>{error}</Banner>}

      <div className="grid gap-4 text-sm sm:grid-cols-4">
        <div className="card"><p className="text-xs uppercase text-slate-500">Relationship owner</p><p className="font-semibold">{data.ownerName ?? "Nobody yet"}</p></div>
        <div className="card"><p className="text-xs uppercase text-slate-500">Last contact</p><p className="font-semibold">{data.lastInteraction ? fmtDate(data.lastInteraction) : "None recorded"}</p></div>
        <div className="card"><p className="text-xs uppercase text-slate-500">Next action</p><p className="font-semibold">{data.nextAction ? fmtDate(`${data.nextAction}T00:00:00+05:30`) : "Nothing planned"}</p></div>
        <div className="card"><p className="text-xs uppercase text-slate-500">Gift tier</p><p className="font-semibold">{data.giftTier}</p></div>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        {tabs.map(([key, label, count]) => (
          <button key={key} onClick={() => setTab(key)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === key ? "bg-brand-blue text-white" : "text-slate-700 hover:bg-slate-100"}`}>
            {label}{count !== undefined && count > 0 ? ` (${count})` : ""}
          </button>
        ))}
      </nav>

      {tab === "timeline" && <Timeline data={data} onDone={load} setError={setError} />}
      {tab === "tasks" && <Tasks data={data} onDone={load} setError={setError} />}
      {tab === "gifts" && <Gifts data={data} onDone={load} setError={setError} />}
      {tab === "details" && <Details data={data} onDone={load} setError={setError} />}
      {tab === "permission" && <Permission data={data} onDone={load} setError={setError} />}
      {tab === "files" && <Files data={data} onDone={load} setError={setError} />}

      {/* Notes sit under every tab: they are the running record of the relationship. */}
      <section className="card space-y-3">
        <h2 className="font-head text-lg">Notes</h2>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => {
          e.preventDefault();
          if (!note.trim()) return;
          void run(async () => { await api.post(`/pr/${id}/notes`, { body: note }); setNote(""); });
        }}>
          <input className="input flex-1" aria-label="Add a note" placeholder="Add a dated note"
                 value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary" disabled={!note.trim()}>Add note</button>
          {can("pr.notesRestricted") && (
            <button type="button" className="btn-ghost" disabled={!note.trim()}
                    onClick={() => void run(async () => { await api.post(`/pr/${id}/notes`, { body: note, restricted: true }); setNote(""); })}>
              Add as restricted
            </button>
          )}
        </form>
        {data.notes.length === 0 ? <Empty>No notes yet.</Empty> : (
          <ul className="space-y-2 text-sm">
            {data.notes.map((n) => (
              <li key={n.id} className={`rounded-lg border p-2 ${n.restricted ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
                <p>{n.body}</p>
                <p className="text-xs text-slate-500">
                  {n.authorName ?? "Somebody"} · {fmtDateTime(n.createdAt)}
                  {n.restricted && <span className="ml-1 font-semibold text-amber-800">· management only</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-slate-400">Signed in as {user!.fullName}.</p>
    </div>
  );
}

type PartProps = { data: PrDetail; onDone: () => Promise<void> | void; setError: (m: string) => void };

/** Everything that has actually happened with this person. */
function Timeline({ data, onDone, setError }: PartProps) {
  const [form, setForm] = useState({ kind: "Meeting" as InteractionKind, summary: "", outcome: "", project: "" });
  const [withFollowUp, setWithFollowUp] = useState(false);
  const [followUp, setFollowUp] = useState({ description: "", dueOn: officeToday(7) });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post(`/pr/${data.contactId}/interactions`, {
        ...form,
        outcome: form.outcome || null,
        project: form.project || null,
        nextAction: withFollowUp && followUp.description.trim() ? followUp : null
      });
      setForm({ kind: "Meeting", summary: "", outcome: "", project: "" });
      setWithFollowUp(false);
      await onDone();
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form className="card space-y-3" onSubmit={submit}>
        <h2 className="font-head text-lg">Record what happened</h2>
        <p className="text-xs text-slate-500">This only writes it down. Nothing is sent to anybody.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="i-kind">What was it</label>
            <select id="i-kind" className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as InteractionKind })}>
              {INTERACTION_KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="i-project">Project (optional)</label>
            <input id="i-project" className="input" value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="i-summary">What was discussed *</label>
          <input id="i-summary" className="input" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="i-outcome">Outcome</label>
          <input id="i-outcome" className="input" value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={withFollowUp} onChange={(e) => setWithFollowUp(e.target.checked)} />
          Add a follow-up so it is not forgotten
        </label>
        {withFollowUp && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="f-desc">What needs doing</label>
              <input id="f-desc" className="input" value={followUp.description} onChange={(e) => setFollowUp({ ...followUp, description: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="f-due">By when</label>
              <input id="f-due" type="date" className="input" value={followUp.dueOn} onChange={(e) => setFollowUp({ ...followUp, dueOn: e.target.value })} />
            </div>
          </div>
        )}
        <button className="btn-primary" disabled={!form.summary.trim()}>Save to the timeline</button>
      </form>

      <section className="space-y-2">
        {data.interactions.length === 0 ? <Empty>Nothing recorded yet.</Empty> : data.interactions.map((i) => (
          <article key={i.id} className="card text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="chip bg-blue-50 text-brand-blue">{i.kind}</span>
              <span className="text-xs text-slate-500">{fmtDateTime(i.happenedAt)}</span>
            </div>
            <p className="mt-1">{i.summary}</p>
            {i.outcome && <p className="text-slate-600">Outcome: {i.outcome}</p>}
            <p className="mt-1 text-xs text-slate-500">
              {i.staffName ?? "Somebody"}{i.project ? ` · ${i.project}` : ""}
              {i.visitId ? " · from an office visit" : ""}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}

function Tasks({ data, onDone, setError }: PartProps) {
  const [form, setForm] = useState({ description: "", dueOn: officeToday(7) });
  const run = async (work: () => Promise<unknown>) => {
    setError("");
    try { await work(); await onDone(); } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form className="card space-y-3" onSubmit={(e) => {
        e.preventDefault();
        void run(async () => { await api.post(`/pr/${data.contactId}/tasks`, form); setForm({ description: "", dueOn: officeToday(7) }); });
      }}>
        <h2 className="font-head text-lg">Add a follow-up</h2>
        <div>
          <label className="label" htmlFor="t-desc">What needs doing *</label>
          <input id="t-desc" className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="t-due">By when *</label>
          <input id="t-due" type="date" className="input" value={form.dueOn} onChange={(e) => setForm({ ...form, dueOn: e.target.value })} required />
        </div>
        <p className="text-xs text-slate-500">It becomes yours unless somebody else is chosen on the follow-ups page.</p>
        <button className="btn-primary" disabled={!form.description.trim()}>Add follow-up</button>
      </form>

      <section className="space-y-2">
        {data.tasks.length === 0 ? <Empty>Nothing to chase.</Empty> : data.tasks.map((t) => (
          <article key={t.id} className={`card text-sm ${t.overdue ? "border-brand-orange" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{t.description}</p>
              <StatusChip status={t.status === "Open" ? "Waiting" : t.status === "Completed" ? "Checked out" : "In meeting"} />
            </div>
            <p className="text-xs text-slate-500">
              Due {fmtDate(`${t.dueOn}T00:00:00+05:30`)} · {t.ownerName ?? "nobody"}
              {t.overdue && <span className="ml-1 font-semibold text-orange-700">overdue</span>}
            </p>
            {(t.status === "Open" || t.status === "In progress") && (
              <div className="mt-2 flex flex-wrap gap-2">
                {t.status === "Open" && (
                  <button className="btn-ghost" onClick={() => run(() => api.patch(`/pr/tasks/${t.id}`, { status: "In progress" }))}>Start</button>
                )}
                <button className="btn-primary" onClick={() => run(() => api.patch(`/pr/tasks/${t.id}`, { status: "Completed" }))}>Done</button>
                <button className="btn-danger" onClick={() => run(() => api.patch(`/pr/tasks/${t.id}`, { status: "Cancelled" }))}>Drop</button>
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

function Gifts({ data, onDone, setError }: PartProps) {
  const [form, setForm] = useState({
    direction: "Given" as GiftDirection, occasion: "", item: "",
    plannedOn: officeToday(7), plannedValue: "", zeroValueReason: "", overrideReason: ""
  });
  const [duplicates, setDuplicates] = useState<any[]>([]);

  const run = async (work: () => Promise<unknown>) => {
    setError("");
    try { await work(); await onDone(); } catch (e) { setError((e as Error).message); }
  };

  async function propose(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post(`/pr/${data.contactId}/gifts`, {
        ...form,
        plannedValue: Number(form.plannedValue),
        zeroValueReason: form.zeroValueReason || null,
        overrideReason: form.overrideReason || null
      });
      setForm({ ...form, occasion: "", item: "", plannedValue: "", zeroValueReason: "", overrideReason: "" });
      setDuplicates([]);
      await onDone();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.body?.duplicates) setDuplicates(err.body.duplicates);
      setError((err as Error).message);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form className="card space-y-3" onSubmit={propose}>
        <h2 className="font-head text-lg">Record a gift</h2>
        {data.giftTier === "No gifts" && (
          <Banner kind="warn">This person is marked as receiving no gifts. You will have to say why if you go ahead.</Banner>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="g-direction">Direction</label>
            <select id="g-direction" className="input" value={form.direction}
                    onChange={(e) => setForm({ ...form, direction: e.target.value as GiftDirection })}>
              {GIFT_DIRECTIONS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="g-occasion">Occasion *</label>
            <input id="g-occasion" className="input" value={form.occasion} placeholder="Diwali, anniversary, meeting…"
                   onChange={(e) => setForm({ ...form, occasion: e.target.value })} required />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="g-item">What it is *</label>
            <input id="g-item" className="input" value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="g-date">Planned date *</label>
            <input id="g-date" type="date" className="input" value={form.plannedOn}
                   onChange={(e) => setForm({ ...form, plannedOn: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="g-value">Estimated value (₹) *</label>
            <input id="g-value" type="number" min={0} step="0.01" className="input" value={form.plannedValue}
                   onChange={(e) => setForm({ ...form, plannedValue: e.target.value })} required />
          </div>
          {form.plannedValue !== "" && Number(form.plannedValue) === 0 && (
            <div className="sm:col-span-2">
              <label className="label" htmlFor="g-zero">Why is it worth nothing? *</label>
              <input id="g-zero" className="input" value={form.zeroValueReason}
                     onChange={(e) => setForm({ ...form, zeroValueReason: e.target.value })} />
            </div>
          )}
        </div>

        {duplicates.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <p className="font-semibold text-amber-900">Already recorded this year:</p>
            <ul className="my-1">
              {duplicates.map((d) => <li key={d.id}>{d.item} · {fmtDate(`${d.planned_on}T00:00:00+05:30`)} · {d.status}</li>)}
            </ul>
            <label className="label" htmlFor="g-override">Say why you are going ahead anyway</label>
            <input id="g-override" className="input" value={form.overrideReason}
                   onChange={(e) => setForm({ ...form, overrideReason: e.target.value })} />
          </div>
        )}

        <p className="text-xs text-slate-500">
          An outgoing gift waits for a manager to approve it. You cannot approve your own.
        </p>
        <button className="btn-primary" disabled={!form.occasion.trim() || !form.item.trim()}>
          {form.direction === "Given" ? "Send for approval" : "Record it"}
        </button>
      </form>

      <section className="space-y-2">
        {data.gifts.length === 0 ? <Empty>No gifts recorded.</Empty> : data.gifts.map((g) => (
          <GiftCard key={g.id} gift={g} onAction={run} />
        ))}
      </section>
    </div>
  );
}

export function GiftCard({ gift, onAction, showContact = false }: {
  gift: PrGift; onAction: (work: () => Promise<unknown>) => void; showContact?: boolean;
}) {
  const { user, can } = useAuth();
  const mine = gift.createdById === user!.id;
  const open = !["Delivered", "Received", "Cancelled", "Returned"].includes(gift.status);
  const [actual, setActual] = useState(String(gift.plannedValue));

  return (
    <article className="card space-y-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {showContact && <p className="font-semibold">{gift.contactName} <span className="font-mono text-xs text-slate-500">{gift.contactCode}</span></p>}
          <p className="font-semibold">{gift.item}</p>
          <p className="text-xs text-slate-500">
            {gift.direction} · {gift.occasion} · {fmtDate(`${gift.plannedOn}T00:00:00+05:30`)} · {gift.tier}
          </p>
        </div>
        <span className={`chip ${
          gift.status === "Pending approval" ? "bg-amber-100 text-amber-900"
          : gift.status === "Cancelled" || gift.status === "Returned" ? "bg-red-100 text-red-800"
          : gift.status === "Delivered" || gift.status === "Received" ? "bg-green-100 text-green-800"
          : "bg-blue-100 text-blue-900"}`}>{gift.status}</span>
      </div>

      <p>
        Planned <b>₹{Number(gift.plannedValue).toLocaleString("en-IN")}</b>
        {gift.actualValue !== null && <> · actually cost <b>₹{Number(gift.actualValue).toLocaleString("en-IN")}</b></>}
      </p>
      {gift.zeroValueReason && <p className="text-xs text-slate-500">No value because: {gift.zeroValueReason}</p>}
      {gift.overrideReason && <p className="text-xs text-amber-800">Override: {gift.overrideReason}</p>}
      <p className="text-xs text-slate-500">
        Proposed by {gift.createdByName ?? "somebody"}
        {gift.approvedByName && ` · decided by ${gift.approvedByName}`}
      </p>
      {gift.decisionNote && <p className="text-xs text-slate-600">“{gift.decisionNote}”</p>}

      {open && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
          {gift.status === "Pending approval" && can("gift.decide") && !mine && (
            <>
              <button className="btn-primary" onClick={() => onAction(() => api.post(`/pr/gifts/${gift.id}/approve`))}>Approve</button>
              <button className="btn-danger" onClick={() => {
                const reason = window.prompt("Why is it declined?");
                if (reason) onAction(() => api.post(`/pr/gifts/${gift.id}/decline`, { reason }));
              }}>Decline</button>
            </>
          )}
          {gift.status === "Pending approval" && mine && (
            <p className="text-xs text-slate-500">You proposed this, so somebody else has to approve it.</p>
          )}
          {gift.status === "Approved" && (
            <button className="btn-ghost" onClick={() => onAction(() => api.post(`/pr/gifts/${gift.id}/dispatch`))}>Mark sent</button>
          )}
          {(gift.status === "Approved" || gift.status === "Dispatched") && (
            <>
              <input className="input w-32" aria-label="What it actually cost" value={actual} onChange={(e) => setActual(e.target.value)} />
              <button className="btn-primary" onClick={() =>
                onAction(() => api.post(`/pr/gifts/${gift.id}/complete`, { actualValue: Number(actual), completedOn: officeToday() }))}>
                Delivered
              </button>
            </>
          )}
          {gift.direction === "Received" && gift.status === "Planned" && can("gift.decide") && (
            <>
              <input className="input w-32" aria-label="What it was worth" value={actual} onChange={(e) => setActual(e.target.value)} />
              <button className="btn-primary" onClick={() =>
                onAction(() => api.post(`/pr/gifts/${gift.id}/acknowledge`, { actualValue: Number(actual), completedOn: officeToday() }))}>
                Acknowledge
              </button>
            </>
          )}
          <button className="btn-danger" onClick={() => {
            const reason = window.prompt("Why is it cancelled?");
            if (reason) onAction(() => api.post(`/pr/gifts/${gift.id}/cancel`, { reason }));
          }}>Cancel</button>
        </div>
      )}
    </article>
  );
}

function Details({ data, onDone, setError }: PartProps) {
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [form, setForm] = useState({
    categories: data.categories, priority: data.priority, giftTier: data.giftTier,
    status: data.status, source: data.source ?? "", ownerId: data.ownerId ?? "",
    introduction: data.introduction ?? "", industry: data.industry ?? "",
    interests: data.interests ?? "", preferredChannel: data.preferredChannel ?? "",
    preferredLanguage: data.preferredLanguage ?? "", bestTime: data.bestTime ?? "",
    tags: data.tags.join(", ")
  });
  const { can } = useAuth();

  useEffect(() => { if (can("staff.manage")) api.get<StaffAccount[]>("/staff").then(setStaff).catch(() => {}); }, [can]);

  const toggle = (c: PrCategory) =>
    setForm({ ...form, categories: form.categories.includes(c) ? form.categories.filter((x) => x !== c) : [...form.categories, c] });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.patch(`/pr/${data.contactId}`, {
        categories: form.categories,
        priority: form.priority, giftTier: form.giftTier, status: form.status,
        source: form.source || null, ownerId: form.ownerId || null,
        introduction: form.introduction || null, industry: form.industry || null,
        interests: form.interests || null, preferredChannel: form.preferredChannel || null,
        preferredLanguage: form.preferredLanguage || null, bestTime: form.bestTime || null,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean)
      });
      await onDone();
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <form className="card space-y-4" onSubmit={save}>
      <h2 className="font-head text-lg">Relationship details</h2>

      <div>
        <span className="label">Categories — one person can be several things at once</span>
        <div className="flex flex-wrap gap-1.5">
          {PR_CATEGORIES.map((c) => (
            <button type="button" key={c} onClick={() => toggle(c)}
                    className={`chip border ${form.categories.includes(c) ? "border-brand-blue bg-brand-blue text-white" : "border-slate-300 bg-white text-slate-600"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="d-priority">Priority</label>
          <select id="d-priority" className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as PrPriority })}>
            {PR_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="d-tier">Gift tier</label>
          <select id="d-tier" className="input" value={form.giftTier} onChange={(e) => setForm({ ...form, giftTier: e.target.value as GiftTier })}>
            {GIFT_TIERS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="d-status">Status</label>
          <select id="d-status" className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PrStatus })}>
            {PR_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="d-source">How we met</label>
          <select id="d-source" className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as PrSource })}>
            <option value="">Not recorded</option>
            {PR_SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="d-owner">Relationship owner</label>
          <select id="d-owner" className="input" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
            <option value="">Nobody</option>
            {staff.length === 0 && data.ownerId && <option value={data.ownerId}>{data.ownerName}</option>}
            {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="d-channel">Preferred channel</label>
          <select id="d-channel" className="input" value={form.preferredChannel} onChange={(e) => setForm({ ...form, preferredChannel: e.target.value as Channel })}>
            <option value="">Not recorded</option>
            {CHANNELS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="d-industry">Industry</label>
          <input id="d-industry" className="input" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="d-language">Language</label>
          <input id="d-language" className="input" value={form.preferredLanguage} onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="d-time">Best time to reach them</label>
          <input id="d-time" className="input" value={form.bestTime} onChange={(e) => setForm({ ...form, bestTime: e.target.value })} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="d-intro">Background</label>
        <textarea id="d-intro" rows={3} className="input" value={form.introduction} onChange={(e) => setForm({ ...form, introduction: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="d-interests">Interests and project areas</label>
          <input id="d-interests" className="input" value={form.interests} onChange={(e) => setForm({ ...form, interests: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="d-tags">Tags, separated by commas</label>
          <input id="d-tags" className="input" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
        </div>
      </div>

      <button className="btn-primary">Save details</button>
    </form>
  );
}

function Permission({ data, onDone, setError }: PartProps) {
  const [form, setForm] = useState({ channel: "WhatsApp" as Channel, optedIn: true, source: "" });

  async function record(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post(`/pr/${data.contactId}/consent`, form);
      setForm({ ...form, source: "" });
      await onDone();
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form className="card space-y-3" onSubmit={record}>
        <h2 className="font-head text-lg">Permission to contact</h2>
        <Banner kind="info">
          A visit, a birthday on file or a relationship record is never permission by itself.
          Only what is recorded here counts, and it is kept per channel.
        </Banner>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="c-channel">Channel</label>
            <select id="c-channel" className="input" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as Channel })}>
              {CHANNELS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="c-state">They have</label>
            <select id="c-state" className="input" value={form.optedIn ? "in" : "out"} onChange={(e) => setForm({ ...form, optedIn: e.target.value === "in" })}>
              <option value="in">agreed to be contacted</option>
              <option value="out">asked not to be contacted</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="c-source">How do we know? *</label>
          <input id="c-source" className="input" placeholder="Signed the form at reception, replied by email…"
                 value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} required />
        </div>
        <button className="btn-primary" disabled={!form.source.trim()}>Record it</button>
      </form>

      <section className="card">
        <h3 className="mb-2 font-semibold">Where things stand</h3>
        {data.consent.length === 0 ? (
          <Empty>Nothing recorded, so nothing may be sent.</Empty>
        ) : (
          <ul className="text-sm">
            {data.consent.map((c) => (
              <li key={c.channel} className="flex items-center justify-between border-t border-slate-100 py-2 first:border-0">
                <span className="font-semibold">{c.channel}</span>
                <span className={`chip ${c.mayContact ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                  {c.mayContact ? "May contact" : "Must not contact"}
                </span>
                <span className="text-xs text-slate-500">{c.source} · {fmtDate(c.recordedAt)}</span>
              </li>
            ))}
          </ul>
        )}
        {data.status === "Do not contact" && (
          <p className="mt-2 text-xs text-red-700">
            This person is marked Do not contact, which overrules anything agreed earlier.
          </p>
        )}
      </section>
    </div>
  );
}

function Files({ data, onDone, setError }: PartProps) {
  const { can } = useAuth();
  const [busy, setBusy] = useState(false);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      if (!supabase) throw new Error("File storage needs the Supabase connection. Check frontend/.env.");
      if (file.size > 10 * 1024 * 1024) throw new Error("That file is over the 10 MB limit.");
      const path = `pr/${data.contactId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error: uploadError } = await supabase.storage.from("pr-attachments").upload(path, file);
      if (uploadError) throw new Error(uploadError.message);
      await api.post(`/pr/${data.contactId}/attachments`, {
        storagePath: path, fileName: file.name, contentType: file.type || null, sizeBytes: file.size
      });
      await onDone();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); e.target.value = ""; }
  }

  async function open(storagePath: string) {
    setError("");
    try {
      if (!supabase) throw new Error("File storage needs the Supabase connection.");
      const { data: signed, error: signError } = await supabase.storage.from("pr-attachments").createSignedUrl(storagePath, 120);
      if (signError || !signed) throw new Error(signError?.message ?? "That file could not be opened.");
      window.open(signed.signedUrl, "_blank", "noopener");
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-head text-lg">Business cards and files</h2>
      <div>
        <label className="label" htmlFor="file">Add a file (image or PDF, up to 10 MB)</label>
        <input id="file" type="file" className="input" accept="image/png,image/jpeg,image/webp,application/pdf"
               onChange={upload} disabled={busy} />
        <p className="mt-1 text-xs text-slate-500">Files are private and only people at the desk can open them.</p>
      </div>
      {data.attachments.length === 0 ? <Empty>No files yet.</Empty> : (
        <ul className="space-y-2 text-sm">
          {data.attachments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2">
              <div>
                <button className="link" onClick={() => open(a.storagePath)}>{a.fileName}</button>
                <p className="text-xs text-slate-500">
                  {a.uploadedByName ?? "Somebody"} · {fmtDate(a.createdAt)}
                  {a.sizeBytes ? ` · ${Math.round(a.sizeBytes / 1024)} KB` : ""}
                </p>
              </div>
              {can("pr.notesRestricted") && (
                <button className="btn-danger" onClick={async () => {
                  setError("");
                  try { await api.del(`/pr/attachments/${a.id}`); await onDone(); }
                  catch (err) { setError((err as Error).message); }
                }}>Remove</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
