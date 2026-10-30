import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Banner, Empty, Spinner, StatusChip } from "../components/ui";
import { fmtDayLabel, fmtTime, officeToday } from "../lib/format";
import { PURPOSES, VISITOR_TYPES, type Appointment, type Clash, type Host, type Purpose, type Room, type VisitorType } from "../types";

export default function Appointments() {
  const { user, can } = useAuth();
  const [date, setDate] = useState(officeToday());
  const [items, setItems] = useState<Appointment[] | null>(null);
  const [clashes, setClashes] = useState<Clash[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState("");
  const [booking, setBooking] = useState(false);

  const load = useCallback(async (on: string) => {
    try {
      const res = await api.get<{ items: Appointment[]; clashes: Clash[] }>(`/appointments/day/${on}`);
      setItems(res.items);
      setClashes(res.clashes);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(date); }, [date, load]);
  useEffect(() => {
    api.get<Host[]>("/hosts").then(setHosts).catch(() => {});
    api.get<Room[]>("/rooms").then(setRooms).catch(() => {});
  }, []);

  async function decide(id: number, what: "approve" | "decline") {
    setError("");
    try {
      await api.post(`/appointments/${id}/${what}`);
      await load(date);
    } catch (e) { setError((e as Error).message); }
  }

  const shift = (days: number) => setDate(officeToday(
    Math.round((new Date(`${date}T00:00:00+05:30`).getTime() - new Date(`${officeToday()}T00:00:00+05:30`).getTime()) / 86_400_000) + days
  ));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-head text-2xl">Meeting day</h1>
          <p className="text-sm text-slate-600">Booked visitors for one day, in order, with a warning if a room is double booked.</p>
        </div>
        {can("appointment.book") && (
          <button className="btn-primary" onClick={() => setBooking((b) => !b)}>{booking ? "Close" : "Book a visitor"}</button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={() => shift(-1)}>Previous day</button>
        <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Day to show" />
        <button className="btn-ghost" onClick={() => shift(1)}>Next day</button>
        <button className="btn-ghost" onClick={() => setDate(officeToday())}>Today</button>
        <span className="ml-1 text-sm font-semibold text-slate-600">{fmtDayLabel(`${date}T00:00:00+05:30`)}</span>
      </div>

      {error && <Banner kind="error" onDismiss={() => setError("")}>{error}</Banner>}

      {clashes.map((c, i) => (
        <Banner kind="warn" key={i}>
          <b>{c.roomName} is booked twice:</b> {c.first.label} and {c.second.label} overlap. Move one, or decline it.
        </Banner>
      ))}

      {booking && can("appointment.book") && (
        <BookingForm
          hosts={hosts}
          rooms={rooms}
          date={date}
          lockHostId={user!.role === "host" ? user!.hostId : null}
          onBooked={() => { setBooking(false); void load(date); }}
        />
      )}

      {!items ? <Spinner /> : items.length === 0 ? (
        <Empty>Nothing booked for this day.</Empty>
      ) : (
        <ol className="space-y-2">
          {items.map((a) => (
            <li key={a.id} className="card flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <div className="w-20 shrink-0">
                <p className="font-head text-base">{fmtTime(a.startsAt)}</p>
                <p className="text-xs text-slate-500">{a.durationMinutes} min</p>
              </div>
              <div className="min-w-[12rem] flex-1">
                <p className="font-semibold">{a.guestName}</p>
                <p className="text-xs text-slate-500">{a.guestMobile} · {a.visitorType} · {a.purpose}</p>
              </div>
              <div className="min-w-[10rem]">
                <p>With <b>{a.hostName}</b></p>
                <p className="text-xs text-slate-500">{a.roomName ? `${a.roomName}, ${a.roomFloor} floor` : "No room"}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusChip status={a.status} />
                {a.visitId && <span className="chip bg-green-50 text-green-800">Arrived</span>}
              </div>
              {a.status === "Pending approval" && (can("appointment.decide") || user!.hostId === a.hostId) && (
                <div className="flex gap-2">
                  <button className="btn-primary" onClick={() => decide(a.id, "approve")}>Approve</button>
                  <button className="btn-danger" onClick={() => decide(a.id, "decline")}>Decline</button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function BookingForm({ hosts, rooms, date, lockHostId, onBooked }: {
  hosts: Host[]; rooms: Room[]; date: string; lockHostId: number | null; onBooked: () => void;
}) {
  const [form, setForm] = useState({
    guestName: "", guestMobile: "", hostId: lockHostId ? String(lockHostId) : "",
    visitorType: "Client" as VisitorType, purpose: "Project discussion" as Purpose,
    date, time: "11:00", durationMinutes: 60, roomId: ""
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm((f) => ({ ...f, date })), [date]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/appointments", {
        ...form,
        hostId: Number(form.hostId),
        roomId: form.roomId ? Number(form.roomId) : null,
        durationMinutes: Number(form.durationMinutes)
      });
      onBooked();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card space-y-3" onSubmit={submit}>
      <h2 className="font-head text-lg">Book a visitor</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="b-name">Guest name *</label>
          <input id="b-name" className="input" value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="b-mobile">Mobile *</label>
          <input id="b-mobile" className="input" value={form.guestMobile} onChange={(e) => setForm({ ...form, guestMobile: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="b-host">Host *</label>
          <select id="b-host" className="input" value={form.hostId} disabled={!!lockHostId}
                  onChange={(e) => setForm({ ...form, hostId: e.target.value })} required>
            <option value="">Choose…</option>
            {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="b-type">Visitor type</label>
          <select id="b-type" className="input" value={form.visitorType}
                  onChange={(e) => setForm({ ...form, visitorType: e.target.value as VisitorType })}>
            {VISITOR_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="b-purpose">Purpose</label>
          <select id="b-purpose" className="input" value={form.purpose}
                  onChange={(e) => setForm({ ...form, purpose: e.target.value as Purpose })}>
            {PURPOSES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="b-room">Room</label>
          <select id="b-room" className="input" value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
            <option value="">Let the rules choose</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.floor})</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="b-date">Date</label>
          <input id="b-date" type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="b-time">Time</label>
          <input id="b-time" type="time" className="input" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="b-duration">Minutes</label>
          <input id="b-duration" type="number" min={5} max={600} step={5} className="input"
                 value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} />
        </div>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      <button className="btn-primary" disabled={saving}>{saving ? "Booking…" : "Book"}</button>
    </form>
  );
}
