import { useEffect, useRef, useState, type ReactNode } from "react";
import type { VisitStatus, AppointmentStatus } from "../types";

export function Logo({ className = "h-10" }: { className?: string }) {
  return <img src="/archpoint-logo.png" alt="Arch Point — your dream is our mission" className={className} />;
}

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-500">
      connect@archpointgp.com · @archpoint_architecture · archpoint.in
    </footer>
  );
}

export function Banner({ kind, children, onDismiss }: { kind: "error" | "success" | "warn" | "info"; children: ReactNode; onDismiss?: () => void }) {
  const styles = {
    error: "border-red-300 bg-red-50 text-red-800",
    success: "border-green-300 bg-green-50 text-green-800",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    info: "border-blue-200 bg-blue-50 text-blue-900"
  }[kind];
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${styles}`} role={kind === "error" ? "alert" : "status"}>
      <div className="flex-1">{children}</div>
      {onDismiss && <button onClick={onDismiss} className="text-xs font-semibold opacity-70 hover:opacity-100" aria-label="Dismiss">Close</button>}
    </div>
  );
}

export function StatusChip({ status }: { status: VisitStatus | AppointmentStatus }) {
  const styles: Record<string, string> = {
    Waiting: "bg-amber-100 text-amber-900",
    "In meeting": "bg-blue-100 text-blue-900",
    "Checked out": "bg-slate-200 text-slate-700",
    Cancelled: "bg-slate-200 text-slate-600",
    Denied: "bg-red-100 text-red-800",
    "Pending approval": "bg-amber-100 text-amber-900",
    Approved: "bg-green-100 text-green-800",
    Declined: "bg-slate-200 text-slate-600"
  };
  return <span className={`chip ${styles[status] ?? "bg-slate-200 text-slate-700"}`}>{status}</span>;
}

/** Asks for the reason that cancelling or denying a visit requires. */
export function ReasonDialog({ title, confirmLabel, onConfirm, onClose }: {
  title: string; confirmLabel: string; onConfirm: (reason: string) => void; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <form
        className="card w-full max-w-sm space-y-3"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (reason.trim()) onConfirm(reason.trim()); }}
      >
        <h3 className="font-head text-lg">{title}</h3>
        <div>
          <label className="label" htmlFor="reason">Reason (required)</label>
          <input id="reason" ref={ref} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">This is kept with the visit and shown in the register.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Back</button>
          <button type="submit" className="btn-danger" disabled={!reason.trim()}>{confirmLabel}</button>
        </div>
      </form>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">{children}</p>;
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <p className="p-6 text-sm text-slate-500">{label}</p>;
}

/** A small horizontal bar chart. Values are shown as numbers too, never colour alone. */
export function Bars({ title, rows, formatLabel }: { title: string; rows: { label: string; n: number }[]; formatLabel?: (l: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="card">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {rows.length === 0 && <Empty>Nothing recorded yet.</Empty>}
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-sm">
            <span className="w-32 shrink-0 truncate text-slate-600" title={r.label}>{formatLabel ? formatLabel(r.label) : r.label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand-blue" style={{ width: `${Math.round((r.n / max) * 100)}%` }} />
            </div>
            <span className="w-10 text-right font-semibold tabular-nums">{r.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
