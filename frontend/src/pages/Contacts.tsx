import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import ContactForm from "../components/ContactForm";
import { Banner, Empty, StatusChip } from "../components/ui";
import { fmtDateTime } from "../lib/format";
import type { Contact } from "../types";

export default function Contacts() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<Contact[]>([]);
  const [open, setOpen] = useState<Contact | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const load = (q = term) => api.get<Contact[]>(`/contacts?q=${encodeURIComponent(q)}`).then(setRows).catch((e) => setError(e.message));

  useEffect(() => {
    const t = setTimeout(() => void load(term), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const show = async (id: number) => {
    setAdding(false);
    setOpen(await api.get<Contact>(`/contacts/${id}`));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-head text-2xl">Contacts</h1>
          {can("contact.create") && (
            <button className="btn-primary" onClick={() => { setAdding(true); setOpen(null); }}>New contact</button>
          )}
        </div>

        <input className="input" aria-label="Search contacts" value={term} onChange={(e) => setTerm(e.target.value)}
               placeholder="Search by name, mobile, email, organisation or code" />

        {error && <Banner kind="error" onDismiss={() => setError("")}>{error}</Banner>}

        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="p-2.5">Code</th><th className="p-2.5">Name</th>
                <th className="p-2.5">Mobile</th><th className="p-2.5">Visits</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="cursor-pointer border-t border-slate-100 hover:bg-blue-50" onClick={() => void show(c.id)}>
                  <td className="p-2.5 font-mono text-xs">{c.code}</td>
                  <td className="p-2.5 font-semibold">
                    {c.fullName}
                    {c.isPrContact && <span className="ml-1 chip bg-yellow-100 text-yellow-900">PR</span>}
                  </td>
                  <td className="p-2.5">{c.mobile}</td>
                  <td className="p-2.5 tabular-nums">{c.visitCount ?? 0}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="p-4 text-center text-slate-400">No contacts found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        {adding && (
          <ContactForm
            onCancel={() => setAdding(false)}
            onCreated={(c) => { void load(); void show(c.id); }}
            onUseExisting={show}
          />
        )}

        {open && (
          <div className="card space-y-3">
            <div>
              <h2 className="font-head text-xl">{open.fullName}</h2>
              <p className="font-mono text-xs text-slate-500">{open.code}</p>
            </div>
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-500">Mobile</dt><dd>{open.mobile}</dd>
              {open.email && <><dt className="text-slate-500">Email</dt><dd>{open.email}</dd></>}
              {open.organisation && <><dt className="text-slate-500">Organisation</dt><dd>{open.organisation}</dd></>}
              {open.designation && <><dt className="text-slate-500">Designation</dt><dd>{open.designation}</dd></>}
              {open.dateOfBirth
                ? <><dt className="text-slate-500">Date of birth</dt><dd>{open.dateOfBirth}</dd></>
                : open.birthday
                  ? <><dt className="text-slate-500">Birthday</dt><dd>{open.birthday} <span className="text-xs text-slate-400">(year hidden)</span></dd></>
                  : null}
            </dl>

            {can("pr.manage") && (
              open.isPrContact ? (
                <button className="btn-ghost" onClick={() => navigate(`/relationships/${open.id}`)}>
                  Open the relationship record
                </button>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold">Keep a relationship with this person?</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    It uses this same record and code — they are never entered twice.
                    An email address and a date of birth are needed first.
                  </p>
                  <button
                    className="btn-primary mt-2"
                    onClick={async () => {
                      setError("");
                      try {
                        await api.post(`/pr/${open.id}`, {});
                        navigate(`/relationships/${open.id}`);
                      } catch (e) {
                        setError(e instanceof ApiError ? e.message : (e as Error).message);
                      }
                    }}
                  >
                    Start a relationship record
                  </button>
                </div>
              )
            )}

            <div>
              <h3 className="mb-1 font-semibold">Visit history</h3>
              {open.visits && open.visits.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {open.visits.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center gap-2 border-t border-slate-100 py-1.5">
                      <span className="text-slate-600">{fmtDateTime(v.checkIn)}</span>
                      <span>· {v.hostName ?? "Unassigned"}</span>
                      <span className="text-slate-500">· {v.visitorType}</span>
                      <StatusChip status={v.status} />
                    </li>
                  ))}
                </ul>
              ) : <Empty>No visits yet.</Empty>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
