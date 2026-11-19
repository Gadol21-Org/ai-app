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
  /** The call costs money or credits, or changes what is live: the card is drawn with a warning and says so. */
  caution?: string;
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
type Tailored = Pick<ApprovalView, "highlights" | "caution"> & { omit: string[]; note?: string };

/** Pulls the first present key of each group into a labeled highlight and hides those keys from the field list. */
type Names = Record<string, string>;

/** Argument keys whose value is an id that the card shows as a name when one is known. */
const NAMED_ID_KEYS = new Set([
  "entity_id", "entityId", "id", "campaign_id", "campaignId", "adset_id", "ad_set_id", "adSetId", "pageId", "page_id", "mediaId",
]);

/** The ids of a tailored call that a person would rather see as names (the card asks the server for them). */
export function nameLookupIds(toolName: string, args: unknown): { meta: string[]; media: string[] } {
  const none = { meta: [], media: [] };
  if (!Object.hasOwn(tailored, toolName) || !args || typeof args !== "object") return none;
  const meta: string[] = [];
  const media: string[] = [];
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (!NAMED_ID_KEYS.has(key) || (typeof value !== "string" && typeof value !== "number")) continue;
    (key === "mediaId" ? media : meta).push(String(value));
  }
  return { meta, media };
}

function pickHighlights(args: Record<string, unknown>, groups: Array<[label: string, ...keys: string[]]>, names: Names = {}) {
  const highlights: ApprovalView["highlights"] = [];
  const omit: string[] = [];
  for (const [label, ...keys] of groups) {
    for (const key of keys) {
      const named = NAMED_ID_KEYS.has(key) ? names[String(args[key])] : undefined;
      const value: FieldValue | null = named ? { kind: "text", text: named } : toFieldValue(key, args[key]);
      if (!value) continue;
      highlights.push({ label, value });
      omit.push(...keys);
      break;
    }
  }
  return { highlights, omit };
}

const spends = (args: Record<string, unknown>) =>
  ["budget", "daily_budget", "dailyBudget", "lifetime_budget", "lifetimeBudget", "bid_amount", "bidAmount"].some((k) => args[k] != null);
const goesLive = (args: Record<string, unknown>) =>
  [args.status, args.effective_status, args.state].some((v) => typeof v === "string" && /^active$/i.test(v.trim()));

const m = t.approvalCard.meta;
const BUDGET: [string, ...string[]] = [m.budget, "daily_budget", "dailyBudget", "budget", "lifetime_budget", "lifetimeBudget"];
const DATES: Array<[string, ...string[]]> = [
  [m.starts, "start_time", "startTime", "start_date", "startDate"],
  [m.ends, "end_time", "endTime", "end_date", "endDate"],
];

const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
const text = (label: string, value: string, extra: { long?: boolean; ltr?: boolean } = {}) => ({
  label,
  value: { kind: "text" as const, text: value, ...extra },
});

const tailored: Record<string, (args: Record<string, unknown>, names: Names) => Tailored> = {
  ads_create_campaign: (a, n) => ({
    ...pickHighlights(a, [[m.name, "name"], [m.objective, "objective"], BUDGET, ...DATES], n),
    note: m.createdPaused,
  }),
  ads_create_ad_set: (a, n) => ({
    ...pickHighlights(a, [[m.name, "name"], [m.campaign, "campaign_id", "campaignId"], BUDGET, [m.audience, "targeting", "audience"], ...DATES, [m.goal, "optimization_goal", "optimizationGoal"]], n),
    note: m.createdPaused,
  }),
  ads_create_ad: (a, n) => ({
    ...pickHighlights(a, [[m.name, "name"], [m.adSet, "adset_id", "ad_set_id", "adSetId"], [m.headline, "headline", "title"], [m.text, "message", "body", "primary_text"], [m.destination, "link", "link_url", "url", "website_url"]], n),
    note: m.createdPaused,
  }),
  ads_update_entity: (a, n) => ({
    ...pickHighlights(a, [[m.entity, "entity_id", "entityId", "id"], [m.name, "name"], BUDGET, [m.status, "status"], ...DATES], n),
    caution: spends(a) || goesLive(a) ? m.changeCaution : undefined,
  }),
  ads_activate_entity: (a, n) => ({
    ...pickHighlights(a, [[m.entity, "entity_id", "entityId", "id"], [m.entityType, "entity_type", "entityType", "type"]], n),
    caution: m.activateCaution,
  }),
  ads_catalog_create: (a, n) => pickHighlights(a, [[m.name, "name"]], n),
  upload_ad_video: (a, n) => ({
    ...pickHighlights(a, [[m.title, "title"], [m.mediaId, "mediaId"]], n),
    note: m.uploadNote,
  }),
  create_video_ad: (a, n) => ({
    ...pickHighlights(a, [
      [m.name, "name"],
      [m.adSet, "adSetId"],
      [m.page, "pageId"],
      [m.text, "message"],
      [m.headline, "headline"],
      [m.destination, "linkUrl"],
      [m.button, "callToAction"],
    ], n),
    note: m.createdPaused,
  }),
  generate_speech: (args) => {
    const m = t.approvalCard.media;
    const script = str(args.script);
    const highlights: ApprovalView["highlights"] = [];
    if (script) highlights.push(text(m.script, script, { long: true }));
    const voice = str(args.voiceId);
    highlights.push(text(m.voice, voice ?? m.defaultVoice, voice ? { ltr: true } : {}));
    const lang = str(args.languageCode);
    if (lang) highlights.push(text(m.language, lang, { ltr: true }));
    if (script) highlights.push(text(m.characters, formatNumber(script.length)));
    return { highlights, omit: ["script", "voiceId", "languageCode"], caution: m.speechCost };
  },
  generate_talking_video: (args) => {
    const m = t.approvalCard.media;
    const script = str(args.script);
    const highlights: ApprovalView["highlights"] = [];
    if (script) highlights.push(text(m.script, script, { long: true }));
    const image = str(args.imageMediaId);
    highlights.push(text(m.presenter, image ? m.presenterChosen : m.presenterDefault));
    const resolution = str(args.resolution);
    if (resolution) highlights.push(text(m.resolution, resolution, { ltr: true }));
    return { highlights, omit: ["script", "imageMediaId", "audioMediaId", "resolution"], caution: m.videoCost };
  },
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

export function describeToolCall(toolName: string, args: unknown, names: Names = {}): ApprovalView {
  const record = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  const custom = Object.hasOwn(tailored, toolName) ? tailored[toolName]!(record, names) : undefined;
  if (custom?.note) custom.highlights.push({ label: "", value: { kind: "text", text: custom.note } });
  const rest = custom ? Object.fromEntries(Object.entries(record).filter(([k]) => !custom.omit.includes(k))) : record;
  return {
    tool: toolName,
    title: toolDisplayName(toolName),
    destructive: isDestructiveTool(toolName),
    caution: custom?.caution,
    highlights: custom?.highlights ?? [],
    fields: fieldsOf(rest),
  };
}
