"use client";

import { createContext, useContext } from "react";
import { CalendarClock } from "lucide-react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { ToolFallback } from "@/components/assistant-ui/elements/tool-fallback.aui";
import { describeTiming } from "@/lib/schedules/timing";

type Args = { title?: string; prompt?: string; runAt?: string; cron?: string };

/** The zone schedules run in (set on the server), so the card shows the same times Settings will. */
export const ScheduleTimezoneContext = createContext("UTC");

/**
 * Approval card for `add_schedule`: shows the person exactly what will be saved (the title,
 * when it runs and the full prompt) before they allow it. Everything else is the stock tool UI.
 */
export const AddScheduleTool: ToolCallMessagePartComponent = (props) => {
  const { args, result, status, approval, respondToApproval, addResult, resume, interrupt } = props;
  const tz = useContext(ScheduleTimezoneContext);
  const a = (args ?? {}) as Args;
  const when = a.cron
    ? describeTiming({ kind: "cron", cron: a.cron, timezone: tz }, tz)
    : a.runAt
      ? describeTiming({ kind: "once", runAt: a.runAt }, tz)
      : null;
  const failed = status?.type === "incomplete" && status.reason !== "cancelled";

  return (
    <div
      data-slot="add-schedule-card"
      className="bg-card my-2 flex flex-col gap-3 rounded-xl border p-3 text-sm"
    >
      <div className="flex items-center gap-2 font-medium">
        <CalendarClock className="text-muted-foreground size-4" />
        Add a scheduled prompt
      </div>
      <dl className="flex flex-col gap-2">
        <div>
          <dt className="text-muted-foreground text-xs">Title</dt>
          <dd className="font-medium">{a.title ?? "…"}</dd>
        </div>
        {when && (
          <div>
            <dt className="text-muted-foreground text-xs">Runs</dt>
            <dd>{when}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted-foreground text-xs">Prompt</dt>
          <dd className="bg-muted/50 max-h-48 overflow-y-auto rounded-md p-2.5 whitespace-pre-wrap">
            {a.prompt ?? "…"}
          </dd>
        </div>
      </dl>
      {(approval != null || status?.type === "requires-action") && (
        <ToolFallback.Approval
          approval={approval}
          respondToApproval={respondToApproval}
          addResult={addResult}
          resume={resume}
          interrupt={interrupt}
          status={status}
        />
      )}
      {failed && <ToolFallback.Error status={status} />}
      {result !== undefined && !failed && (
        <p className="text-muted-foreground text-xs">
          Saved. Manage it in Settings → Scheduled prompts.
        </p>
      )}
    </div>
  );
};

/** Custom UI for specific tools; every other tool keeps the default collapsible card. */
export const ToolRenderer: ToolCallMessagePartComponent = (props) =>
  props.toolName === "add_schedule" ? <AddScheduleTool {...props} /> : <ToolFallback {...props} />;
