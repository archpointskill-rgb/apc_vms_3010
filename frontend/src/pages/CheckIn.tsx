import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import ContactForm from "../components/ContactForm";
import { Banner, Empty } from "../components/ui";
import { PURPOSES, VISITOR_TYPES, type Contact, type Host, type Room, type Visit, type VisitorType, type Purpose } from "../types";

export default function CheckIn() {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [adding, setAdding] = useState(false);

  const [hosts, setHosts] = useState<Host[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [notice, setNotice] = useState<{ version: string; text: string } | null>(null);

  const [hostId, setHostId] = useState("");
  const [visitorType, setVisitorType] = useState<VisitorType>("Client");
  const [purpose, setPurpose] = useState<Purpose>("Project discussion");
  const [remarks, setRemarks] = useState("");
  const [roomId, setRoomId] = useState("");
  const [suggested, setSuggested] = useState<Room | null>(null);

  const [done, setDone] = useState<Visit | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Host[]>("/hosts").then(setHosts).catch(() => {});
    api.get<Room[]>("/rooms").then(setRooms).catch(() => {});
    api.get<{ version: string; text: string }>("/notice").then(setNotice).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      api.get<Contact[]>(`/contacts?q=${encodeURIComponent(term)}`).then(setResults).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [term]);

  // A wellness visit records only "Wellness session".
  useEffect(() => {
    if (visitorType === "Wellness session") setPurpose("Wellness session");
    else if (purpose === "Wellness session") setPurpose("Project discussion");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitorType]);

  // Ask the rules where this visitor should be taken.
  useEffect(() => {
    const query = `/suggest-room?visitorType=${encodeURIComponent(visitorType)}${hostId ? `&hostId=${hostId}` : ""}`;
    api.get<Room | null>(query).then((room) => { setSuggested(room); setRoomId(""); }).catch(() => setSuggested(null));
  }, [hostId, visitorType]);

  const chosenRoom = useMemo(
    () => (roomId ? rooms.find((r) => String(r.id) === roomId) ?? null : suggested),
    [roomId, rooms, suggested]
  );

  async function choose(id: number) {
    setAdding(false);
    setError("");
    setDone(null);
    setContact(await api.get<Contact>(`/contacts/${id}`));
  }

  async function checkIn(e: React.FormEvent) {
    e.preventDefault();
    if (!contact) return;
    setSaving(true);
    setError("");
    try {
      const visit = await api.post<Visit>("/visits", {
        contactId: contact.id,
        hostId: hostId ? Number(hostId) : null,
        visitorType,
        purpose,
        remarks: remarks.trim() || null,
        roomId: roomId ? Number(roomId) : null
      });
      setDone(visit);
      setContact(null);
      setTerm("");
      setRemarks("");
      setHostId("");
      setVisitorType("Client");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3">
        <div>
          <h1 className="font-head text-2xl">Check in a visitor</h1>
          <p className="text-sm text-slate-600">Search first, so a returning visitor keeps the same contact code.</p>
        </div>

        {done && (
          <Banner kind="success" onDismiss={() => setDone(null)}>
            <b>{done.contact.name}</b> is checked in
            {done.host ? ` for ${done.host.name}` : " with no host yet, so they are in the Unassigned queue"}.
            {done.room && <> Take them to <b>{done.room.name}</b>, {done.room.floor} floor.</>}
          </Banner>
        )}

        <div>
          <label className="label" htmlFor="search">Find a contact</label>
          <input id="search" className="input" value={term} onChange={(e) => setTerm(e.target.value)}
                 placeholder="Name, mobile, organisation or code" />
        </div>

        <div className="max-h-80 space-y-1 overflow-auto">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => void choose(c.id)}
              className={`block w-full rounded-lg border p-2.5 text-left text-sm transition hover:border-brand-blue hover:bg-blue-50 ${
                contact?.id === c.id ? "border-brand-blue bg-blue-50" : "border-slate-200 bg-white"
              }`}
            >
              <span className="font-semibold">{c.fullName}</span>
              <span className="text-slate-500"> · {c.code} · {c.mobile}</span>
              {c.organisation && <span className="text-slate-500"> · {c.organisation}</span>}
              <span className="block text-xs text-slate-500">
                {c.visitCount ?? 0} {c.visitCount === 1 ? "visit" : "visits"} so far
              </span>
            </button>
          ))}
          {results.length === 0 && <Empty>No match. Create a new contact below.</Empty>}
        </div>

        {adding
          ? <ContactForm onCancel={() => setAdding(false)} onCreated={(c) => { setContact(c); setAdding(false); }} onUseExisting={choose} />
          : <button className="btn-ghost" onClick={() => setAdding(true)}>New contact</button>}
      </section>

      <section>
        <form className="card space-y-4" onSubmit={checkIn}>
          <h2 className="font-head text-lg">Visit details</h2>

          {!contact ? (
            <Empty>Choose or create a contact first.</Empty>
          ) : (
            <>
              <div className="rounded-lg bg-blue-50 p-3 text-sm">
                <b>{contact.fullName}</b> · {contact.code} · {contact.mobile}
                {contact.organisation && <> · {contact.organisation}</>}
                {(contact.visitCount ?? 0) > 0 && (
                  <span className="ml-2 chip bg-white text-brand-blue">Returning visitor</span>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="host">Host</label>
                  <select id="host" className="input" value={hostId} onChange={(e) => setHostId(e.target.value)}>
                    <option value="">No host yet (Unassigned)</option>
                    {hosts.map((h) => (
                      <option key={h.id} value={h.id}>{h.name}{h.designation ? ` — ${h.designation}` : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="type">Visitor type</label>
                  <select id="type" className="input" value={visitorType} onChange={(e) => setVisitorType(e.target.value as VisitorType)}>
                    {VISITOR_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="purpose">Purpose</label>
                  <select id="purpose" className="input" value={purpose} disabled={visitorType === "Wellness session"}
                          onChange={(e) => setPurpose(e.target.value as Purpose)}>
                    {PURPOSES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                  {visitorType === "Wellness session" && (
                    <p className="mt-1 text-xs text-slate-500">A wellness visit is always recorded as "Wellness session".</p>
                  )}
                </div>
                <div>
                  <label className="label" htmlFor="room">Meeting location</label>
                  <select id="room" className="input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                    <option value="">{suggested ? `Suggested: ${suggested.name} (${suggested.floor})` : "No suggestion"}</option>
                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.floor})</option>)}
                  </select>
                  {chosenRoom && (
                    <p className="mt-1 text-xs text-slate-500">
                      Take them to {chosenRoom.name}, {chosenRoom.floor} floor.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="label" htmlFor="remarks">Remarks</label>
                <input id="remarks" className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)}
                       placeholder="Anything the host should know" />
              </div>

              {notice && (
                <p className="rounded-lg bg-slate-100 p-2 text-xs text-slate-600">
                  {notice.text} <span className="text-slate-400">(notice {notice.version})</span>
                </p>
              )}

              {error && <Banner kind="error">{error}</Banner>}

              <button className="btn-primary w-full" disabled={saving}>
                {saving ? "Checking in…" : "Save and check in"}
              </button>
            </>
          )}
        </form>
      </section>
    </div>
  );
}
