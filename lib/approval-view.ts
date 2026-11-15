import { LOCALE, formatNumber, t, toolDisplayName } from "@/lib/i18n";

/**
 * Turns a tool call's arguments into something a person can read: labeled fields instead of JSON.
 * Pure and client-safe, so the approval card can use it for any tool, including ones this app has
 * never heard of (a new MCP server), and tailor the few tools that deserve it.
 */

export type FieldValue =
  | { kind: "text"; text: string; long?: boolean; ltr?: boolean }
  | { kind: "link"; href: string; text: string }
  | { kind: "list"; items: FieldValue[] }
  | { kind: "group"; fields: Field[] };

export type Field = { key: string; label: string; value: FieldValue };

export type ApprovalView = {
  tool: string;
  /** Hebrew name of the tool, e.g. "הוספת מקום". */
  title: string;
  /** The call removes or deletes something, so the card is drawn more cautiously. */
  destructive: boolean;
  /** Short lines shown above the fields (what exactly will happen). */
  highlights: { label: string; value: FieldValue }[];
  fields: Field[];
};

const MAX_DEPTH = 3;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID_KEY = /(^id$|Id$|_id$|Key$|_key$)/;

/** "dailyBudget" / "daily_budget" -> "daily budget" for keys that have no Hebrew label. */
export function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

export const fieldLabel = (key: string) =>
  Object.hasOwn(t.argLabels, key) ? t.argLabels[key]! : humanizeKey(key);

export function isDestructiveTool(toolName: string) {
  return /(^|_)(delete|remove|cancel|revoke|archive)(_|$)/i.test(toolName);
}

function formatDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return ISO_DATE.test(value)
    ? new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeZone: "UTC" }).format(date)
    : new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function asUrl(value: string): URL | null {
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function toFieldValue(key: string, value: unknown, depth = 0): FieldValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return { kind: "text", text: value ? t.approvalCard.yes : t.approvalCard.no };
  if (typeof value === "number")
    return ID_KEY.test(key) ? { kind: "text", text: String(value), ltr: true } : { kind: "text", text: formatNumber(value) };
  if (typeof value === "string") {
    const text = value.trim();
    if (text === "") return null;
    const url = asUrl(text);
    if (url) return { kind: "link", href: url.href, text };
    if (ISO_DATE.test(text) || ISO_DATE_TIME.test(text)) {
      const formatted = formatDate(text);
      if (formatted) return { kind: "text", text: formatted };
    }
    if (text === "all" && /recipient|users?/i.test(key)) return { kind: "text", text: t.approvalCard.all };
    return {
      kind: "text",
      text,
      long: text.length > 80 || text.includes("\n"),
      ltr: ID_KEY.test(key) || /^[\w.-]{20,}$/.test(text),
    };
  }
  if (Array.isArray(value)) {
    const items = value.flatMap((item) => toFieldValue(key, item, depth + 1) ?? []);
    return items.length ? { kind: "list", items } : null;
  }
  if (typeof value === "object") {
    if (depth >= MAX_DEPTH) return { kind: "text", text: JSON.stringify(value), long: true, ltr: true };
    const fields = fieldsOf(value as Record<string, unknown>, depth + 1);
    return fields.length ? { kind: "group", fields } : null;
  }
  return { kind: "text", text: String(value) };
}

export function fieldsOf(args: Record<string, unknown>, depth = 0): Field[] {
  return Object.entries(args).flatMap(([key, raw]) => {
    const value = toFieldValue(key, raw, depth);
    return value ? [{ key, label: fieldLabel(key), value }] : [];
  });
}

/** Plain-text form of a value, for tests and accessible labels. */
export function valueText(value: FieldValue): string {
  switch (value.kind) {
    case "text":
      return value.text;
    case "link":
      return value.text;
    case "list":
      return value.items.map(valueText).join(", ");
    case "group":
      return value.fields.map((f) => `${f.label}: ${valueText(f.value)}`).join("; ");
  }
}

/**
 * Tool-specific views. They pull the one or two fields that decide whether to allow the call into
 * `highlights` and leave the rest to the generic field list.
 */
const tailored: Record<string, (args: Record<string, unknown>) => Pick<ApprovalView, "highlights"> & { omit: string[] }> = {
  fetch_url: (args) => {
    const url = typeof args.url === "string" ? asUrl(args.url.trim()) : null;
    const highlights: ApprovalView["highlights"] = [];
    if (url) {
      highlights.push({ label: t.approvalCard.siteLabel, value: { kind: "text", text: url.hostname, ltr: true } });
      highlights.push({ label: t.approvalCard.addressLabel, value: { kind: "link", href: url.href, text: url.href } });
    }
    const omit = ["url"];
    const start = typeof args.startIndex === "number" ? args.startIndex : 0;
    if (start > 0) {
      highlights.push({ label: "", value: { kind: "text", text: t.approvalCard.continueFrom(formatNumber(start)) } });
      omit.push("startIndex");
    }
    return { highlights, omit };
  },
};

export function describeToolCall(toolName: string, args: unknown): ApprovalView {
  const record = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  const custom = tailored[toolName]?.(record);
  const rest = custom ? Object.fromEntries(Object.entries(record).filter(([k]) => !custom.omit.includes(k))) : record;
  return {
    tool: toolName,
    title: toolDisplayName(toolName),
    destructive: isDestructiveTool(toolName),
    highlights: custom?.highlights ?? [],
    fields: fieldsOf(rest),
  };
}
