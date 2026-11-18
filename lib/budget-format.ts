/**
 * Shorter text for the budget tracker's big list results. A transaction comes back as a JSON object
 * of about 450 characters (ids, change-log timestamps, sync state, a sentence explaining where it
 * came from, ...), and the model is sent every page again on every later step. One line per row keeps
 * what it needs to answer questions: when, how much, what, and how to page on.
 *
 * Anything that doesn't look as expected is left as it was (`undefined`), so a change in the budget
 * app's output can't break the tool, only make it bigger again.
 */

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";

/** One table cell: no line breaks and no column separator inside it. */
const cell = (v: unknown) =>
  str(v)
    .replace(/[\r\n]+/g, " ")
    .replace(/\|/g, "/")
    .trim();

function transactionRow(t: Json): string | undefined {
  if (!("id" in t) || !("date" in t) || !("amount" in t)) return undefined;
  const category = isObject(t.category)
    ? `${cell(t.category.id)} ${cell(t.category.path ?? t.category.name)}`.trim()
    : "";
  const payment = isObject(t.payment_method) ? cell(t.payment_method.name) : "";
  const extras: string[] = [];
  if (isObject(t.foreign_currency)) {
    const f = t.foreign_currency;
    const minor =
      typeof f.original_minor === "number"
        ? (f.original_minor / 100).toFixed(2)
        : cell(f.original_minor);
    extras.push(
      `foreign ${minor} ${cell(f.currency)}${f.rate_is_estimate ? " (estimated rate)" : ""}`,
    );
  }
  if (isObject(t.business) && t.business.name)
    extras.push(`business ${cell(t.business.name)}`);
  if (t.recurring_series_id != null) extras.push("recurring");
  return [
    cell(t.id),
    cell(t.date),
    cell(t.amount),
    category,
    payment,
    cell(t.note),
    extras.join("; "),
  ]
    .join("|")
    .replace(/\|+$/, "");
}

function listTransactions(data: Json): string | undefined {
  if (!Array.isArray(data.transactions)) return undefined;
  const rows: string[] = [];
  for (const t of data.transactions) {
    const row = isObject(t) ? transactionRow(t) : undefined;
    if (row === undefined) return undefined;
    rows.push(row);
  }
  return [
    `Transactions, newest first: returned ${str(data.returned) || rows.length} of ${str(data.total_matching)} matching. next_cursor: ${data.next_cursor ? str(data.next_cursor) : "none (no more)"}`,
    "Columns: id|date|amount in shekels (expenses negative)|category id and path|payment method|note|extras",
    ...rows,
  ].join("\n");
}

function listCategories(data: Json): string | undefined {
  if (!Array.isArray(data.categories)) return undefined;
  const rows: string[] = [];
  for (const c of data.categories) {
    if (!isObject(c) || !("id" in c)) return undefined;
    const business =
      isObject(c.business) && c.business.name
        ? `business ${cell(c.business.name)}`
        : "";
    rows.push(
      [cell(c.id), cell(c.path ?? c.name), cell(c.type), business]
        .join("|")
        .replace(/\|+$/, ""),
    );
  }
  return [
    "Categories. Columns: id|path (parent › child)|income or expense|extras",
    ...rows,
  ].join("\n");
}

const formatters: Record<string, (data: Json) => string | undefined> = {
  list_transactions: listTransactions,
  list_categories: listCategories,
};

/** The shorter text for a budget tool's JSON result, or `undefined` to keep the result as it is. */
export function compactBudgetResult(
  toolName: string,
  text: string,
): string | undefined {
  const format = formatters[toolName];
  if (!format) return undefined;
  try {
    const data: unknown = JSON.parse(text);
    return isObject(data) ? format(data) : undefined;
  } catch {
    return undefined;
  }
}
