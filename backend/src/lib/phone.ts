import { config } from "../config";

/**
 * Normalises what reception types into E.164 ("+919829000000"), or null when it
 * cannot be a real mobile number. India is assumed unless a country code is given.
 */
export function normaliseMobile(raw: string, countryCode = config.office.defaultCountryCode): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const international = trimmed.startsWith("+") || trimmed.startsWith("00");
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("00")) digits = digits.slice(2);

  if (!international) {
    digits = digits.replace(/^0+/, "");
    if (digits.length === 10) digits = countryCode + digits;
    else if (!(digits.length === 12 && digits.startsWith(countryCode))) return null;
  }
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  // Indian mobile numbers start 6 to 9.
  if (countryCode === "91" && digits.startsWith("91") && digits.length === 12 && !/^[6-9]/.test(digits.slice(2))) return null;
  return "+" + digits;
}

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
