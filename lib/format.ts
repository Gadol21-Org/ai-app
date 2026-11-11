/** Small amounts keep enough digits to be meaningful: $0.0042, $0.31, $12.40. */
export function formatUsd(value: number) {
  const digits = value !== 0 && Math.abs(value) < 0.1 ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export const formatCount = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export const formatDay = (value: Date) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(value);
