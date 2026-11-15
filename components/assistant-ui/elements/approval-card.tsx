"use client";

import { Fragment } from "react";
import { ShieldAlertIcon, ShieldQuestionIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { describeToolCall, fieldsOf, type Field, type FieldValue } from "@/lib/approval-view";

function Value({ value }: { value: FieldValue }) {
  switch (value.kind) {
    case "text":
      return value.long ? (
        <div className="bg-muted/50 max-h-48 overflow-y-auto rounded-md p-2.5 break-words whitespace-pre-wrap">{value.text}</div>
      ) : (
        <span dir={value.ltr ? "ltr" : undefined} className={cn("break-words", value.ltr && "font-mono text-xs")}>
          {value.text}
        </span>
      );
    case "link":
      return (
        <a
          href={value.href}
          target="_blank"
          rel="noopener noreferrer"
          dir="ltr"
          className="text-primary inline-block max-w-full text-start break-all underline underline-offset-2"
        >
          {value.text}
        </a>
      );
    case "list": {
      const simple = value.items.every((item) => item.kind === "text" && !item.long);
      return simple ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.items.map((item, i) => (
            <li key={i} className="bg-muted rounded-full px-2.5 py-0.5 text-xs">
              <Value value={item} />
            </li>
          ))}
        </ul>
      ) : (
        <ol className="flex flex-col gap-2">
          {value.items.map((item, i) => (
            <li key={i} className="border-s-2 ps-3">
              {value.items.length > 1 && <p className="text-muted-foreground mb-1 text-xs">{t.approvalCard.item(i + 1)}</p>}
              <Value value={item} />
            </li>
          ))}
        </ol>
      );
    }
    case "group":
      return <FieldList fields={value.fields} nested />;
  }
}

/** Labeled fields: a small label above its value, so Hebrew and English values both read well. */
export function FieldList({ fields, nested }: { fields: Field[]; nested?: boolean }) {
  return (
    <dl data-slot="field-list" className={cn("flex flex-col gap-2.5", nested && "border-s-2 ps-3")}>
      {fields.map((field) => (
        <div key={field.key} className="min-w-0">
          <dt className="text-muted-foreground text-xs">{field.label}</dt>
          <dd className="min-w-0">
            <Value value={field.value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** What a tool call is about to do (or did), as labeled fields; the raw JSON stays one tap away. */
export function ToolCallDetails({ toolName, args, argsText }: { toolName: string; args?: unknown; argsText?: string }) {
  let parsed = args;
  if ((parsed == null || (typeof parsed === "object" && Object.keys(parsed).length === 0)) && argsText) {
    try {
      parsed = JSON.parse(argsText);
    } catch {}
  }
  const view = describeToolCall(toolName, parsed);
  const hasContent = view.highlights.length > 0 || view.fields.length > 0;
  return (
    <div data-slot="tool-call-details" className="flex flex-col gap-2.5">
      {view.highlights.map((h, i) => (
        <Fragment key={i}>
          {h.label ? (
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">{h.label}</p>
              <div className="font-medium">
                <Value value={h.value} />
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">
              <Value value={h.value} />
            </p>
          )}
        </Fragment>
      ))}
      {view.fields.length > 0 && <FieldList fields={view.fields} />}
      {!hasContent && <p className="text-muted-foreground text-xs">{t.approvalCard.empty}</p>}
      {argsText ? (
        <details className="text-xs">
          <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer select-none">
            {t.approvalCard.technical}
          </summary>
          <pre dir="ltr" className="bg-muted/50 mt-1.5 max-h-48 overflow-auto rounded-md p-2.5 text-start break-words whitespace-pre-wrap">
            {argsText}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

/** The frame of a pending approval: what is being asked, the details, then the Allow/Deny controls (children). */
export function ApprovalCard({
  toolName,
  args,
  argsText,
  children,
}: {
  toolName: string;
  args?: unknown;
  argsText?: string;
  children: React.ReactNode;
}) {
  const view = describeToolCall(toolName, args);
  const Icon = view.destructive ? ShieldAlertIcon : ShieldQuestionIcon;
  return (
    <div
      data-slot="approval-card"
      data-tool={toolName}
      className={cn(
        "bg-card my-2 flex flex-col gap-3 rounded-xl border p-3 text-sm",
        view.destructive && "border-destructive/40",
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        <Icon className={cn("size-4 shrink-0", view.destructive ? "text-destructive" : "text-muted-foreground")} />
        <span className="min-w-0 wrap-anywhere">{t.approvalCard.heading(view.title)}</span>
      </div>
      {view.destructive && <p className="text-destructive text-xs">{t.approvalCard.destructive}</p>}
      <ToolCallDetails toolName={toolName} args={args} argsText={argsText} />
      {children}
    </div>
  );
}

export { fieldsOf };
