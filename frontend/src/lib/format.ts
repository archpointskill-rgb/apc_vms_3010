const TZ = "Asia/Kolkata";

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TZ });

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });

export const fmtDateTime = (iso: string) => `${fmtDate(iso)}, ${fmtTime(iso)}`;

export const fmtDayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: TZ });

/** "today" in the office's own time zone, as yyyy-mm-dd. */
export const officeToday = (offsetDays = 0) => {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
};

/** "18 min" or "2 h 05 min" */
export function elapsed(sinceIso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(sinceIso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

export const minutesLabel = (m: number | null) => (m === null ? "" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);
