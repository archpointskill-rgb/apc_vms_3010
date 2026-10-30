import { config } from "../config";

const TZ = config.office.timezone;

/** "28 Oct 2026" */
export const formatDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });

/** "02:45 pm" */
export const formatTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TZ });

/** Midnight in the office's own time zone, as an instant. */
export function startOfOfficeDay(on: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(on);
  return offsetAwareMidnight(parts);
}

export function officeDateString(on: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(on);
}

/** Midnight of a yyyy-mm-dd office date, as an instant. */
export function officeDayStart(isoDate: string): Date {
  return offsetAwareMidnight(isoDate);
}

function offsetAwareMidnight(isoDate: string): Date {
  // Asia/Kolkata has no daylight saving, so a fixed +05:30 is exact.
  return new Date(`${isoDate}T00:00:00+05:30`);
}

export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);
