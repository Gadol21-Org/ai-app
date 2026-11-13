"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { CalendarClock, Trash2 } from "lucide-react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { PresentTool } from "@/components/assistant-ui/elements/present-tool.aui";
import { RenderChartTool } from "@/components/assistant-ui/elements/chart-tool.aui";
import { ToolFallback } from "@/components/assistant-ui/elements/tool-fallback.aui";
import { describeTiming } from "@/lib/schedules/timing";
import { t } from "@/lib/i18n";

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
        {t.schedule.addTitle}
      </div>
      <dl className="flex flex-col gap-2">
        <div>
          <dt className="text-muted-foreground text-xs">{t.schedule.title}</dt>
          <dd className="font-medium">{a.title ?? "…"}</dd>
        </div>
        {when && (
          <div>
            <dt className="text-muted-foreground text-xs">{t.schedule.runs}</dt>
            <dd>{when}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted-foreground text-xs">{t.schedule.prompt}</dt>
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
          {t.schedule.saved}
        </p>
      )}
    </div>
  );
};

type StoredSchedule = {
  title: string;
  prompt: string;
  kind: "once" | "cron";
  cron: string | null;
  runAt: string | null;
  timezone: string;
};

/**
 * Approval card for `delete_schedule`. It looks the schedule up by id instead of trusting what the
 * model wrote, so the person sees the real title and prompt they are about to lose.
 */
export const DeleteScheduleTool: ToolCallMessagePartComponent = (props) => {
  const { args, result, status, approval, respondToApproval, addResult, resume, interrupt } = props;
  const id = (args as { id?: string } | undefined)?.id;
  const [schedule, setSchedule] = useState<StoredSchedule | null | undefined>(undefined);
  const done = result !== undefined;

  useEffect(() => {
    if (!id || done) return;
    let cancelled = false;
    fetch(`/api/schedules/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => !cancelled && setSchedule(s))
      .catch(() => !cancelled && setSchedule(null));
    return () => {
      cancelled = true;
    };
  }, [id, done]);

  const failed = status?.type === "incomplete" && status.reason !== "cancelled";
  const deletedTitle = (result as { title?: string } | undefined)?.title;
  return (
    <div data-slot="delete-schedule-card" className="bg-card my-2 flex flex-col gap-3 rounded-xl border p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <Trash2 className="text-muted-foreground size-4" />
        {t.schedule.deleteTitle}
      </div>
      {schedule === undefined && !done && <p className="text-muted-foreground">{t.schedule.loading}</p>}
      {schedule === null && !done && (
        <p className="text-muted-foreground">{t.schedule.gone}</p>
      )}
      {schedule && (
        <dl className="flex flex-col gap-2">
          <div>
            <dt className="text-muted-foreground text-xs">{t.schedule.title}</dt>
            <dd className="font-medium">{schedule.title}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">{t.schedule.runs}</dt>
            <dd>
              {describeTiming(
                schedule.kind === "cron"
                  ? { kind: "cron", cron: schedule.cron, timezone: schedule.timezone }
                  : { kind: "once", runAt: schedule.runAt },
                schedule.timezone,
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">{t.schedule.prompt}</dt>
            <dd className="bg-muted/50 max-h-48 overflow-y-auto rounded-md p-2.5 whitespace-pre-wrap">
              {schedule.prompt}
            </dd>
          </div>
        </dl>
      )}
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
      {done && !failed && <p className="text-muted-foreground text-xs">{t.schedule.deleted(deletedTitle)}</p>}
    </div>
  );
};

/** Custom UI for specific tools; every other tool keeps the default collapsible card. */
const renderTool: ToolCallMessagePartComponent = (props) =>
  props.toolName === "present" ? (
    <PresentTool {...props} />
  ) : props.toolName === "render_chart" ? (
    <RenderChartTool {...props} />
  ) : props.toolName === "add_schedule" ? (
    <AddScheduleTool {...props} />
  ) : props.toolName === "delete_schedule" ? (
    <DeleteScheduleTool {...props} />
  ) : (
    <ToolFallback {...props} />
  );

/** Marks each tool call with its id so a notification link can scroll to it. */
export const ToolRenderer: ToolCallMessagePartComponent = (props) => {
  const Tool = renderTool;
  return (
    <div data-tool-call-id={props.toolCallId} className="rounded-lg">
      <Tool {...props} />
    </div>
  );
};
