import { LOCALE } from "@/lib/i18n";

/** Keeps Latin-script values like "$0.31" or "12.4 KB" reading left-to-right inside Hebrew text. */
const ltr = (text: string) => `\u2066${text}\u2069`;

/** Small amounts keep enough digits to be meaningful: $0.0042, $0.31, $12.40. */
export function formatUsd(value: number) {
  const digits = value !== 0 && Math.abs(value) < 0.1 ? 4 : 2;
  return ltr(new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value));
}

export const formatCount = (value: number) =>
  new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 }).format(value);

export const formatDay = (value: Date) =>
  new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric" }).format(value);

/** Exact size with a unit (1 KB = 1024 bytes, as database tools report it). */
export function formatBytes(bytes: number) {
  if (bytes < 1024) return ltr(`${bytes} B`);
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return ltr(`${value.toFixed(value < 10 ? 2 : 1)} ${units[i]}`);
}

export const formatDateTime = (value: Date, timeZone?: string) =>
  new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(timeZone && { timeZone }),
  }).format(value);
