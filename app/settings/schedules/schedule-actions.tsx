"use client";

import { Pause, Play, PlayCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

export function ScheduleActions({
  id,
  title,
  enabled,
  canResume,
}: {
  id: string;
  title: string;
  enabled: boolean;
  /** False for a one-off that already ran: there is nothing left to enable. */
  canResume: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const call = (path: string, init: RequestInit) =>
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/schedules/${id}${path}`, {
        ...init,
        headers: init.body ? { "content-type": "application/json" } : undefined,
      });
      if (!res.ok) setError(t.schedule.genericError);
      router.refresh();
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        {(enabled || canResume) && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => call("", { method: "PATCH", body: JSON.stringify({ enabled: !enabled }) })}
          >
            {enabled ? <Pause /> : <Play />}
            {enabled ? t.schedule.disable : t.schedule.enable}
          </Button>
        )}
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t.schedule.runNowLabel(title)}
          title={t.schedule.runNow}
          disabled={pending}
          onClick={() => call("/run", { method: "POST" })}
        >
          <PlayCircle />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t.schedule.deleteLabel(title)}
          title={t.schedule.delete}
          disabled={pending}
          onClick={() => {
            if (confirm(t.schedule.confirmDelete(title))) call("", { method: "DELETE" });
          }}
        >
          <Trash2 />
        </Button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
