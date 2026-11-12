import { LOCALE } from "@/lib/i18n";

const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

/** "לפני 5 דקות", "אתמול"… for a past date. */
export function formatRelative(value: Date | string, now = Date.now()) {
  const diff = (new Date(value).getTime() - now) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secs] of steps) {
    if (Math.abs(diff) >= secs)
      return rtf.format(Math.round(diff / secs), unit);
  }
  return rtf.format(0, "second");
}
