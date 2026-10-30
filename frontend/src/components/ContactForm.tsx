import { useState } from "react";
import { ApiError, api } from "../api";
import type { Contact, Duplicate } from "../types";
import { Banner } from "./ui";

const REASON_TEXT: Record<Duplicate["reason"], string> = {
  mobile: "same mobile number",
  email: "same email address",
  name: "almost the same name"
};

/**
 * Creates a contact. If somebody who looks like the same person already exists,
 * reception is shown the match and chooses: use that person, or confirm this is
 * a different one. Records are never merged automatically.
 */
export default function ContactForm({ onCreated, onUseExisting, onCancel }: {
  onCreated: (contact: Contact) => void;
  onUseExisting: (id: number) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    fullName: "", mobile: "", organisation: "", email: "", designation: "", dateOfBirth: ""
  });
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function save(confirmNew: boolean) {
    setSaving(true);
    setError("");
    try {
      onCreated(await api.post<Contact>("/contacts", { ...form, confirmNew }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.body?.duplicates) setDuplicates(e.body.duplicates);
      else setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); void save(false); }}>
      <h3 className="font-head text-lg">New contact</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="nc-name">Full name *</label>
          <input id="nc-name" className="input" value={form.fullName} onChange={set("fullName")} autoFocus required />
        </div>
        <div>
          <label className="label" htmlFor="nc-mobile">Mobile *</label>
          <input id="nc-mobile" className="input" value={form.mobile} onChange={set("mobile")} placeholder="98290 00000" required />
          <p className="mt-1 text-xs text-slate-500">India (+91) unless you type a country code.</p>
        </div>
        <div>
          <label className="label" htmlFor="nc-org">Organisation</label>
          <input id="nc-org" className="input" value={form.organisation} onChange={set("organisation")} />
        </div>
        <div>
          <label className="label" htmlFor="nc-designation">Designation</label>
          <input id="nc-designation" className="input" value={form.designation} onChange={set("designation")} />
        </div>
        <div>
          <label className="label" htmlFor="nc-email">Email</label>
          <input id="nc-email" type="email" className="input" value={form.email} onChange={set("email")} />
        </div>
        <div>
          <label className="label" htmlFor="nc-dob">Date of birth</label>
          <input id="nc-dob" type="date" max={new Date().toISOString().slice(0, 10)} className="input" value={form.dateOfBirth} onChange={set("dateOfBirth")} />
        </div>
      </div>
      <p className="text-xs text-slate-500">Only the name and mobile number are needed for a visitor.</p>

      {error && <Banner kind="error">{error}</Banner>}

      {duplicates.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="mb-2 font-semibold text-amber-900">Somebody like this is already in the list:</p>
          <ul className="space-y-2">
            {duplicates.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-3 py-2">
                <span>
                  <b>{d.fullName}</b> · {d.code} · {d.mobile}
                  {d.organisation ? ` · ${d.organisation}` : ""}
                  <em className="ml-1 text-slate-500">({REASON_TEXT[d.reason]})</em>
                </span>
                <button type="button" className="btn-primary" onClick={() => onUseExisting(d.id)}>Use this person</button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-ghost mt-3" disabled={saving} onClick={() => void save(true)}>
            This is someone different — create a new contact
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving || !form.fullName.trim() || !form.mobile.trim()}>
          {saving ? "Saving…" : "Save contact"}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
